import { useMemo } from 'react';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import {
  getEmails,
  getEmailDetails,
  getEmailCounts,
  getThreadDetails,
  searchEmails,
  markEmailRead,
  markEmailUnread,
  archiveEmail as archiveEmailApi,
  deleteEmail as deleteEmailApi,
  restoreEmail as restoreEmailApi,
  deleteDraft as deleteDraftApi,
  syncEmails as syncEmailsApi,
  sendEmail,
  type Email,
  type EmailCounts,
  type ThreadResponse,
  type SearchEmailsResponse,
  type SendEmailRequest,
} from '../../api/client';
import { emailKeys } from './keys';
import { useEmailStore } from '../../stores/emailStore';

// TTL for read overrides - must match emailStore.ts
const READ_OVERRIDE_TTL_MS = 5 * 60 * 1000;

// Types
export type EmailFolder = 'INBOX' | 'SENT' | 'DRAFT' | 'TRASH' | 'STARRED' | 'ARCHIVE';

const FOLDER_LABEL_MAP: Record<EmailFolder, string[]> = {
  INBOX: ['INBOX'],
  SENT: ['SENT'],
  DRAFT: ['DRAFT'],
  TRASH: ['TRASH'],
  STARRED: ['STARRED'],
  ARCHIVE: [], // Archive has no specific label
};

const PAGE_SIZE = 50;
const STALE_TIME = 5 * 60 * 1000; // 5 minutes

// ============================================================================
// Query Hooks
// ============================================================================

/**
 * Fetch emails for a folder with infinite scroll pagination
 * Applies readOverrides from Zustand to fix stale is_read status in cached data
 */
export function useEmailFolder(folder: EmailFolder, accountIds: string[] = []) {
  const readOverrides = useEmailStore((s) => s.readOverrides);

  const query = useInfiniteQuery({
    queryKey: emailKeys.folder(folder, accountIds),
    queryFn: async ({ pageParam = 0 }) => {
      const labelIds = FOLDER_LABEL_MAP[folder];
      const result = await getEmails({
        maxResults: PAGE_SIZE,
        offset: pageParam,
        labelIds: labelIds.length > 0 ? labelIds : undefined,
        accountIds: accountIds.length > 0 ? accountIds : undefined,
      });
      return {
        emails: result.emails,
        count: result.count,
        hasMore: result.hasMore,
        accountsStatus: result.accountsStatus,
        nextOffset: pageParam + result.emails.length,
      };
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.nextOffset : undefined,
    staleTime: STALE_TIME,
    refetchOnWindowFocus: folder === 'INBOX', // Only auto-refetch inbox
    // Show cached data immediately, only refetch if data is stale (past staleTime)
    // This eliminates spinners when navigating back to a recently-viewed folder
    refetchOnMount: true,
    placeholderData: keepPreviousData, // Keep showing previous data while loading to avoid spinners
  });

  // Apply readOverrides to fix stale is_read status from cached data
  const dataWithOverrides = useMemo(() => {
    if (!query.data?.pages) return query.data;

    const hasOverrides = Object.keys(readOverrides).length > 0;
    if (!hasOverrides) return query.data;

    const now = Date.now();
    return {
      ...query.data,
      pages: query.data.pages.map((page) => ({
        ...page,
        emails: page.emails.map((email) => {
          const overrideAt = readOverrides[email.id];
          if (overrideAt && now - overrideAt <= READ_OVERRIDE_TTL_MS && !email.is_read) {
            return { ...email, is_read: true };
          }
          return email;
        }),
      })),
    };
  }, [query.data, readOverrides]);

  return {
    ...query,
    data: dataWithOverrides,
  };
}

/**
 * Fetch email counts (unread, drafts) for badge display
 */
export function useEmailCounts(accountIds: string[] = []) {
  return useQuery({
    queryKey: emailKeys.counts(accountIds),
    queryFn: () => getEmailCounts(accountIds.length > 0 ? accountIds : undefined),
    staleTime: 60 * 1000, // 1 minute - counts change frequently
    refetchOnWindowFocus: true,
  });
}

/**
 * Fetch full email details (body content)
 */
export function useEmailDetail(emailId: string | null) {
  return useQuery({
    queryKey: emailKeys.detail(emailId ?? ''),
    queryFn: async () => {
      if (!emailId) throw new Error('No email ID');
      const result = await getEmailDetails(emailId);
      return result.email;
    },
    enabled: !!emailId,
    staleTime: Infinity, // Email content doesn't change
  });
}

/**
 * Fetch thread with all emails and attachments
 */
export function useEmailThread(threadId: string | null) {
  return useQuery({
    queryKey: emailKeys.thread(threadId ?? ''),
    queryFn: async (): Promise<ThreadResponse> => {
      if (!threadId) throw new Error('No thread ID');
      return getThreadDetails(threadId);
    },
    enabled: !!threadId,
    staleTime: STALE_TIME,
  });
}

/**
 * Search emails with debouncing handled by the caller
 */
export function useEmailSearch(
  query: string,
  accountIds: string[] = [],
  enabled = true
) {
  return useQuery({
    queryKey: ['emails', 'search', query, [...accountIds].sort().join(',')],
    queryFn: async (): Promise<SearchEmailsResponse> => {
      return searchEmails({
        query,
        account_ids: accountIds.length > 0 ? accountIds : undefined,
        provider_search: true,
        max_results: 25,
      });
    },
    enabled: enabled && query.length > 0,
    staleTime: 30 * 1000, // 30 seconds for search results
  });
}

// ============================================================================
// Mutation Hooks with Optimistic Updates
// ============================================================================

/**
 * Mark emails as read with optimistic update
 */
export function useMarkEmailsRead(folder: EmailFolder, accountIds: string[] = []) {
  const queryClient = useQueryClient();
  const folderKey = emailKeys.folder(folder, accountIds);
  const countsKey = emailKeys.counts(accountIds);

  return useMutation({
    mutationFn: async (emailIds: string[]) => {
      // Mark each email as read
      await Promise.all(emailIds.map((id) => markEmailRead(id)));
    },

    onMutate: async (emailIds) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: folderKey });
      await queryClient.cancelQueries({ queryKey: countsKey });

      // Snapshot previous values
      const previousFolder = queryClient.getQueryData(folderKey);
      const previousCounts = queryClient.getQueryData<EmailCounts>(countsKey);

      // Track which emails we actually mark as read (for readOverrides)
      const actuallyMarkedIds: string[] = [];
      const emailIdSet = new Set(emailIds);

      // Optimistically update folder emails and count unread
      queryClient.setQueryData(folderKey, (old: any) => {
        if (!old?.pages) return old;
        return {
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            emails: page.emails.map((email: Email) => {
              if (emailIdSet.has(email.id)) {
                // Only count if it was actually unread
                if (!email.is_read) {
                  actuallyMarkedIds.push(email.id);
                }
                return { ...email, is_read: true };
              }
              return email;
            }),
          })),
        };
      });

      // Only decrement count by emails that were actually unread
      if (previousCounts && actuallyMarkedIds.length > 0) {
        queryClient.setQueryData<EmailCounts>(countsKey, {
          ...previousCounts,
          inbox_unread: Math.max(0, previousCounts.inbox_unread - actuallyMarkedIds.length),
        });
      }

      // Update Zustand's readOverrides for persistence across reloads
      // This ensures emails marked as read locally don't flash as unread on reload
      if (actuallyMarkedIds.length > 0) {
        useEmailStore.getState().addReadOverrides(actuallyMarkedIds);
      }

      return { previousFolder, previousCounts, actuallyMarkedIds };
    },

    onError: (_err, _emailIds, context) => {
      // Rollback on error
      if (context?.previousFolder) {
        queryClient.setQueryData(folderKey, context.previousFolder);
      }
      if (context?.previousCounts) {
        queryClient.setQueryData(countsKey, context.previousCounts);
      }
      // Rollback readOverrides
      if (context?.actuallyMarkedIds && context.actuallyMarkedIds.length > 0) {
        useEmailStore.getState().removeReadOverrides(context.actuallyMarkedIds);
      }
    },

    onSettled: () => {
      // Invalidate ALL folder queries to sync read status across all account views
      queryClient.invalidateQueries({ queryKey: emailKeys.folders() });
      // Also invalidate all counts
      queryClient.invalidateQueries({ queryKey: [...emailKeys.all, 'counts'] });
    },
  });
}

/**
 * Mark emails as unread with optimistic update
 */
export function useMarkEmailsUnread(folder: EmailFolder, accountIds: string[] = []) {
  const queryClient = useQueryClient();
  const folderKey = emailKeys.folder(folder, accountIds);
  const countsKey = emailKeys.counts(accountIds);

  return useMutation({
    mutationFn: async (emailIds: string[]) => {
      await Promise.all(emailIds.map((id) => markEmailUnread(id)));
    },

    onMutate: async (emailIds) => {
      await queryClient.cancelQueries({ queryKey: folderKey });
      await queryClient.cancelQueries({ queryKey: countsKey });

      const previousFolder = queryClient.getQueryData(folderKey);
      const previousCounts = queryClient.getQueryData<EmailCounts>(countsKey);

      const actuallyMarkedIds: string[] = [];

      // Optimistically update folder emails
      queryClient.setQueryData(folderKey, (old: any) => {
        if (!old?.pages) return old;
        return {
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            emails: page.emails.map((email: Email) => {
              if (emailIds.includes(email.id)) {
                if (email.is_read) {
                  actuallyMarkedIds.push(email.id);
                }
                return { ...email, is_read: false };
              }
              return email;
            }),
          })),
        };
      });

      // Only increment for emails that were previously read
      if (previousCounts && actuallyMarkedIds.length > 0) {
        queryClient.setQueryData<EmailCounts>(countsKey, {
          ...previousCounts,
          inbox_unread: previousCounts.inbox_unread + actuallyMarkedIds.length,
        });
      }

      return { previousFolder, previousCounts };
    },

    onError: (_err, _emailIds, context) => {
      if (context?.previousFolder) {
        queryClient.setQueryData(folderKey, context.previousFolder);
      }
      if (context?.previousCounts) {
        queryClient.setQueryData(countsKey, context.previousCounts);
      }
    },

    onSettled: () => {
      // Invalidate ALL folder queries to sync read status across all account views
      queryClient.invalidateQueries({ queryKey: emailKeys.folders() });
      // Also invalidate all counts
      queryClient.invalidateQueries({ queryKey: [...emailKeys.all, 'counts'] });
    },
  });
}

/**
 * Archive email with optimistic update
 */
export function useArchiveEmail(folder: EmailFolder, accountIds: string[] = []) {
  const queryClient = useQueryClient();
  const folderKey = emailKeys.folder(folder, accountIds);
  const countsKey = emailKeys.counts(accountIds);

  return useMutation({
    mutationFn: (emailId: string) => archiveEmailApi(emailId),

    onMutate: async (emailId) => {
      await queryClient.cancelQueries({ queryKey: folderKey });

      const previousFolder = queryClient.getQueryData(folderKey);

      // Optimistically remove from current folder
      queryClient.setQueryData(folderKey, (old: any) => {
        if (!old?.pages) return old;
        return {
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            emails: page.emails.filter((email: Email) => email.id !== emailId),
          })),
        };
      });

      return { previousFolder, emailId };
    },

    onError: (_err, _emailId, context) => {
      // Rollback - restore email to list
      if (context?.previousFolder) {
        queryClient.setQueryData(folderKey, context.previousFolder);
      }
    },

    onSettled: () => {
      // Invalidate related folders
      queryClient.invalidateQueries({ queryKey: emailKeys.folders() });
      queryClient.invalidateQueries({ queryKey: countsKey });
    },
  });
}

/**
 * Delete email with optimistic update
 */
export function useDeleteEmail(folder: EmailFolder, accountIds: string[] = []) {
  const queryClient = useQueryClient();
  const folderKey = emailKeys.folder(folder, accountIds);
  const countsKey = emailKeys.counts(accountIds);

  return useMutation({
    mutationFn: (emailId: string) => deleteEmailApi(emailId),

    onMutate: async (emailId) => {
      await queryClient.cancelQueries({ queryKey: folderKey });

      const previousFolder = queryClient.getQueryData(folderKey);

      // Optimistically remove from current folder
      queryClient.setQueryData(folderKey, (old: any) => {
        if (!old?.pages) return old;
        return {
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            emails: page.emails.filter((email: Email) => email.id !== emailId),
          })),
        };
      });

      return { previousFolder, emailId };
    },

    onError: (_err, _emailId, context) => {
      if (context?.previousFolder) {
        queryClient.setQueryData(folderKey, context.previousFolder);
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: emailKeys.folders() });
      queryClient.invalidateQueries({ queryKey: countsKey });
    },
  });
}

/**
 * Restore email from trash with optimistic update
 */
export function useRestoreEmail(folder: EmailFolder, accountIds: string[] = []) {
  const queryClient = useQueryClient();
  const folderKey = emailKeys.folder(folder, accountIds);
  const countsKey = emailKeys.counts(accountIds);

  return useMutation({
    mutationFn: (emailId: string) => restoreEmailApi(emailId),

    onMutate: async (emailId) => {
      await queryClient.cancelQueries({ queryKey: folderKey });

      const previousFolder = queryClient.getQueryData(folderKey);

      // Optimistically remove from current folder (trash)
      queryClient.setQueryData(folderKey, (old: any) => {
        if (!old?.pages) return old;
        return {
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            emails: page.emails.filter((email: Email) => email.id !== emailId),
          })),
        };
      });

      return { previousFolder };
    },

    onError: (_err, _emailId, context) => {
      if (context?.previousFolder) {
        queryClient.setQueryData(folderKey, context.previousFolder);
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: emailKeys.folders() });
      queryClient.invalidateQueries({ queryKey: countsKey });
    },
  });
}

/**
 * Delete draft with optimistic removal from DRAFT folder cache
 */
export function useDeleteDraft(accountIds: string[] = []) {
  const queryClient = useQueryClient();
  const folderKey = emailKeys.folder('DRAFT', accountIds);
  const countsKey = emailKeys.counts(accountIds);

  return useMutation({
    mutationFn: (draftId: string) => deleteDraftApi(draftId),

    onMutate: async (draftId) => {
      await queryClient.cancelQueries({ queryKey: folderKey });
      const previousFolder = queryClient.getQueryData(folderKey);

      queryClient.setQueryData(folderKey, (old: any) => {
        if (!old?.pages) return old;
        return {
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            emails: page.emails.filter((email: Email) =>
              email.gmail_draft_id !== draftId && email.id !== draftId
            ),
          })),
        };
      });

      return { previousFolder };
    },

    onError: (_err, _draftId, context) => {
      if (context?.previousFolder) {
        queryClient.setQueryData(folderKey, context.previousFolder);
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: folderKey });
      queryClient.invalidateQueries({ queryKey: countsKey });
    },
  });
}

/**
 * Send email mutation
 */
export function useSendEmail(accountIds: string[] = []) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: SendEmailRequest) => sendEmail(data),

    onSuccess: () => {
      // Invalidate SENT folder and counts
      queryClient.invalidateQueries({ queryKey: emailKeys.folder('SENT', accountIds) });
      queryClient.invalidateQueries({ queryKey: emailKeys.folder('DRAFT', accountIds) });
      queryClient.invalidateQueries({ queryKey: emailKeys.counts(accountIds) });
    },
  });
}

/**
 * Send reply mutation (for inline replies)
 */
export function useSendReply(folder: EmailFolder, accountIds: string[] = []) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: SendEmailRequest) => sendEmail(data),

    onSuccess: (_result, variables) => {
      // Invalidate the thread to show the new reply
      if (variables.thread_id) {
        queryClient.invalidateQueries({
          queryKey: emailKeys.thread(variables.thread_id)
        });
      }
      // Invalidate SENT folder
      queryClient.invalidateQueries({ queryKey: emailKeys.folder('SENT', accountIds) });
      // Invalidate current folder to update thread preview
      queryClient.invalidateQueries({ queryKey: emailKeys.folder(folder, accountIds) });
    },
  });
}

/**
 * Sync emails mutation
 */
export function useSyncEmails() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: syncEmailsApi,

    onSuccess: () => {
      // Invalidate all email queries
      queryClient.invalidateQueries({ queryKey: emailKeys.all });
    },
  });
}

// ============================================================================
// Prefetch Helpers
// ============================================================================

/**
 * Prefetch a single folder - use for hover prefetching
 */
export function usePrefetchFolder() {
  const queryClient = useQueryClient();

  return (folder: EmailFolder, accountIds: string[] = []) => {
    queryClient.prefetchInfiniteQuery({
      queryKey: emailKeys.folder(folder, accountIds),
      queryFn: async () => {
        const labelIds = FOLDER_LABEL_MAP[folder];
        const result = await getEmails({
          maxResults: PAGE_SIZE,
          offset: 0,
          labelIds: labelIds.length > 0 ? labelIds : undefined,
          accountIds: accountIds.length > 0 ? accountIds : undefined,
        });
        return {
          emails: result.emails,
          count: result.count,
          hasMore: result.hasMore,
          accountsStatus: result.accountsStatus,
          nextOffset: result.emails.length,
        };
      },
      initialPageParam: 0,
      staleTime: STALE_TIME,
    });
  };
}

/**
 * Prefetch email details for faster navigation
 * Call this when hovering over emails or when selecting an email to prefetch adjacent ones
 */
export function usePrefetchEmailDetails() {
  const queryClient = useQueryClient();

  return (emailIds: string[]) => {
    emailIds.forEach((emailId) => {
      if (!emailId) return;
      queryClient.prefetchQuery({
        queryKey: emailKeys.detail(emailId),
        queryFn: async () => {
          const result = await getEmailDetails(emailId);
          return result.email;
        },
        staleTime: Infinity, // Email content doesn't change
      });
    });
  };
}

// ============================================================================
// Helper: Flatten paginated emails
// ============================================================================

/**
 * Flatten infinite query pages into a single email array
 */
export function flattenEmailPages(
  data: ReturnType<typeof useEmailFolder>['data']
): Email[] {
  if (!data?.pages) return [];
  return data.pages.flatMap((page) => page.emails);
}

// ============================================================================
// Standalone Prefetch Functions (for use outside React components)
// ============================================================================

import { queryClient } from '../../lib/queryClient';

/**
 * Prefetch inbox emails - call from app initialization or sidebar hover
 * Uses the provided accountIds to ensure cache key matches what EmailView will use
 */
export function prefetchInboxEmails(accountIds: string[] = []) {
  queryClient.prefetchInfiniteQuery({
    queryKey: emailKeys.folder('INBOX', accountIds),
    queryFn: async () => {
      const result = await getEmails({
        maxResults: PAGE_SIZE,
        offset: 0,
        labelIds: ['INBOX'],
        accountIds: accountIds.length > 0 ? accountIds : undefined,
      });
      return {
        emails: result.emails,
        count: result.count,
        hasMore: result.hasMore,
        accountsStatus: result.accountsStatus,
        nextOffset: result.emails.length,
      };
    },
    initialPageParam: 0,
    staleTime: STALE_TIME,
  });
}

/**
 * Prefetch email counts
 */
export function prefetchEmailCounts(accountIds: string[] = []) {
  queryClient.prefetchQuery({
    queryKey: emailKeys.counts(accountIds),
    queryFn: () => getEmailCounts(accountIds.length > 0 ? accountIds : undefined),
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Get total count from infinite query
 */
export function getEmailCount(
  data: ReturnType<typeof useEmailFolder>['data']
): number {
  return data?.pages?.[0]?.count ?? 0;
}

/**
 * Get accounts status from infinite query
 */
export function getAccountsStatus(
  data: ReturnType<typeof useEmailFolder>['data']
) {
  return data?.pages?.[0]?.accountsStatus;
}
