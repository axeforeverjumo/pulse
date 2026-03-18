import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useMessagesStore } from '../stores/messagesStore';
import { useAuthStore } from '../stores/authStore';
import { getChannelMessage } from '../api/client';
import { playMessageNotification } from '../lib/notificationSound';
import { showMessageNotification } from '../lib/messageNotification';
import { mergeBlocksPreservingFileUrls } from '../lib/blockMerge';
import type { RealtimeChannel } from '@supabase/supabase-js';

/**
 * Hook to subscribe to realtime updates for messages in a channel.
 * Automatically handles new messages, updates, and deletes.
 */
export function useMessagesRealtime(channelId: string | null) {
  const subscriptionRef = useRef<RealtimeChannel | null>(null);
  const notifiedMessageIds = useRef<Set<string>>(new Set());

  useMessagesStore();

  useEffect(() => {
    if (!channelId) {
      // Cleanup if no channel
      if (subscriptionRef.current) {
        subscriptionRef.current.unsubscribe();
        subscriptionRef.current = null;
      }
      return;
    }

    // Create a unique channel name for this subscription
    const realtimeChannelName = `messages:${channelId}`;

    // Subscribe to realtime changes
    const channel = supabase
      .channel(realtimeChannelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'channel_messages',
          filter: `channel_id=eq.${channelId}`,
        },
        async (payload) => {
          console.log('[Realtime] New message:', payload.new);
          const newMessage = payload.new as any;

          // Only handle main messages (not thread replies)
          if (newMessage.thread_parent_id) return;

          const { messages: currentMessages } = useMessagesStore.getState();

          // Check if message already exists (from our own send or optimistic update)
          if (currentMessages.some((m) => m.id === newMessage.id)) {
            console.log('[Realtime] Message already exists, skipping:', newMessage.id);
            return;
          }

          // Skip if this is our own message (optimistic update handles it)
          const currentUserId = useAuthStore.getState().user?.id;
          if (newMessage.user_id === currentUserId) {
            console.log('[Realtime] Own message (handled by optimistic update), skipping:', newMessage.id);
            return;
          }

          // Fetch full message with user info BEFORE adding to state
          console.log('[Realtime] Fetching full message data:', newMessage.id);
          try {
            const result = await getChannelMessage(newMessage.id);

            // Double-check it wasn't added while we were fetching
            useMessagesStore.setState((state) => {
              if (state.messages.some((m) => m.id === newMessage.id)) {
                return state; // Already added, skip
              }
              // Update both messages and cache
              const updatedCache = state.messagesCache[channelId]
                ? {
                    ...state.messagesCache,
                    [channelId]: [...state.messagesCache[channelId], result.message],
                  }
                : state.messagesCache;

              return {
                ...state,
                messages: [...state.messages, result.message],
                messagesCache: updatedCache,
              };
            });

            // Note: Notifications are handled by useGlobalMessagesNotification hook
          } catch (err) {
            console.error('[Realtime] Failed to fetch message:', err);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'channel_messages',
          filter: `channel_id=eq.${channelId}`,
        },
        (payload) => {
          console.log('[Realtime] Message updated:', payload.new);
          const updatedMessage = payload.new as any;

          useMessagesStore.setState((state) => {
            const updateMessage = (m: typeof state.messages[0]) => {
              if (m.id !== updatedMessage.id) return m;
              const mergedBlocks = mergeBlocksPreservingFileUrls(
                m.blocks,
                updatedMessage.blocks,
              );
              return {
                ...m,
                ...updatedMessage,
                blocks: Array.isArray(mergedBlocks) ? mergedBlocks : m.blocks,
              };
            };

            const updatedCache = state.messagesCache[channelId]
              ? {
                  ...state.messagesCache,
                  [channelId]: state.messagesCache[channelId].map(updateMessage),
                }
              : state.messagesCache;

            return {
              messages: state.messages.map(updateMessage),
              threadReplies: state.threadReplies.map(updateMessage),
              messagesCache: updatedCache,
            };
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'channel_messages',
          filter: `channel_id=eq.${channelId}`,
        },
        (payload) => {
          console.log('[Realtime] Message deleted:', payload.old);
          const deletedMessage = payload.old as any;

          useMessagesStore.setState((state) => {
            const updatedCache = state.messagesCache[channelId]
              ? {
                  ...state.messagesCache,
                  [channelId]: state.messagesCache[channelId].filter((m) => m.id !== deletedMessage.id),
                }
              : state.messagesCache;

            return {
              messages: state.messages.filter((m) => m.id !== deletedMessage.id),
              threadReplies: state.threadReplies.filter((m) => m.id !== deletedMessage.id),
              messagesCache: updatedCache,
            };
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'channel_messages',
          filter: `channel_id=eq.${channelId}`,
        },
        async (payload) => {
          console.log('[Realtime] New thread reply:', payload.new);
          const newMessage = payload.new as any;

          // Only handle thread replies (not main messages)
          if (!newMessage.thread_parent_id) return;

          // Skip if this is our own message (optimistic update handles it)
          const currentUserId = useAuthStore.getState().user?.id;
          if (newMessage.user_id === currentUserId) {
            console.log('[Realtime] Own thread reply (handled by optimistic update), skipping:', newMessage.id);
            return;
          }

          // Fetch full message with user info
          try {
            const result = await getChannelMessage(newMessage.id);
            const message = result.message;

            // Add thread reply to store and update cache
            useMessagesStore.setState((state) => {
              const updateReplyCount = (m: typeof state.messages[0]) =>
                m.id === newMessage.thread_parent_id
                  ? { ...m, reply_count: (m.reply_count || 0) + 1 }
                  : m;

              // Update messagesCache for the channel
              const updatedCache = state.messagesCache[channelId]
                ? {
                    ...state.messagesCache,
                    [channelId]: state.messagesCache[channelId].map(updateReplyCount),
                  }
                : state.messagesCache;

              return {
                threadReplies: [...state.threadReplies, message],
                messages: state.messages.map(updateReplyCount),
                messagesCache: updatedCache,
              };
            });

            // Play notification sound and show toast for thread replies from other users
            const currentUserId = useAuthStore.getState().user?.id;
            if (newMessage.user_id !== currentUserId && !notifiedMessageIds.current.has(newMessage.id)) {
              notifiedMessageIds.current.add(newMessage.id);
              setTimeout(() => notifiedMessageIds.current.delete(newMessage.id), 30000);

              playMessageNotification();
              showMessageNotification({
                senderName: message.user?.name || message.user?.email || 'Someone',
                senderAvatar: message.user?.avatar_url,
                content: message.content || '',
                isThreadReply: true,
              });
            }

            // Update thread participants cache
            if (message.user) {
              const messageUser = message.user;
              useMessagesStore.setState((state) => {
                const currentParticipants = state.threadParticipants[newMessage.thread_parent_id] || [];
                const userExists = currentParticipants.some((p) => p.id === messageUser.id);

                if (!userExists) {
                  const updatedParticipants = [
                    ...currentParticipants,
                    {
                      id: messageUser.id,
                      avatar_url: messageUser.avatar_url,
                      name: messageUser.name,
                      email: messageUser.email,
                    },
                  ].slice(0, 4); // Keep only first 4

                  return {
                    threadParticipants: {
                      ...state.threadParticipants,
                      [newMessage.thread_parent_id]: updatedParticipants,
                    },
                  };
                }
                return state;
              });
            }
          } catch (err) {
            console.error('[Realtime] Failed to fetch thread reply:', err);
          }
        }
      )
      .subscribe((status) => {
        console.log(`[Realtime] Subscription status for ${realtimeChannelName}:`, status);
      });

    subscriptionRef.current = channel;

    // Cleanup on unmount or channel change
    return () => {
      console.log(`[Realtime] Unsubscribing from ${realtimeChannelName}`);
      channel.unsubscribe();
      subscriptionRef.current = null;
    };
  }, [channelId]);

  return {
    isSubscribed: !!subscriptionRef.current,
  };
}

/**
 * Hook to subscribe to realtime updates for reactions.
 */
export function useReactionsRealtime(channelId: string | null) {
  useEffect(() => {
    if (!channelId) return;

    const realtimeChannelName = `reactions:${channelId}`;

    const channel = supabase
      .channel(realtimeChannelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'message_reactions',
        },
        (payload) => {
          console.log('[Realtime] New reaction:', payload.new);
          const newReaction = payload.new as any;

          // Skip own reactions - the store's addReaction already handles them
          const currentUserId = useAuthStore.getState().user?.id;
          if (newReaction.user_id === currentUserId) return;

          useMessagesStore.setState((state) => {
            // Check if the message is in our current view
            const messageInView = state.messages.some((m) => m.id === newReaction.message_id);
            if (!messageInView) return state;

            return {
              messages: state.messages.map((m) => {
                if (m.id !== newReaction.message_id) return m;
                // Check if reaction already exists (dedup with optimistic updates)
                const exists = (m.reactions || []).some(
                  (r) => r.id === newReaction.id || (r.emoji === newReaction.emoji && r.user_id === newReaction.user_id)
                );
                if (exists) return m;
                return { ...m, reactions: [...(m.reactions || []), newReaction] };
              }),
            };
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'message_reactions',
        },
        (payload) => {
          console.log('[Realtime] Reaction removed:', payload.old);
          const deletedReaction = payload.old as any;

          useMessagesStore.setState((state) => ({
            messages: state.messages.map((m) =>
              m.id === deletedReaction.message_id
                ? {
                    ...m,
                    reactions: (m.reactions || []).filter(
                      (r) => r.id !== deletedReaction.id
                    )
                  }
                : m
            ),
          }));
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [channelId]);
}

/**
 * Hook to subscribe to channel list changes.
 */
export function useChannelsRealtime(workspaceAppId: string | null) {
  useEffect(() => {
    if (!workspaceAppId) return;

    const realtimeChannelName = `channels:${workspaceAppId}`;

    const channel = supabase
      .channel(realtimeChannelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'channels',
          filter: `workspace_app_id=eq.${workspaceAppId}`,
        },
        (payload) => {
          console.log('[Realtime] New channel:', payload.new);
          const newChannel = payload.new as any;

          useMessagesStore.setState((state) => {
            if (state.channels.some((c) => c.id === newChannel.id)) {
              return state;
            }
            return {
              channels: [...state.channels, newChannel],
            };
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'channels',
          filter: `workspace_app_id=eq.${workspaceAppId}`,
        },
        (payload) => {
          console.log('[Realtime] Channel updated:', payload.new);
          const updatedChannel = payload.new as any;

          useMessagesStore.setState((state) => ({
            channels: state.channels.map((c) =>
              c.id === updatedChannel.id ? { ...c, ...updatedChannel } : c
            ),
          }));
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'channels',
          filter: `workspace_app_id=eq.${workspaceAppId}`,
        },
        (payload) => {
          console.log('[Realtime] Channel deleted:', payload.old);
          const deletedChannel = payload.old as any;

          useMessagesStore.setState((state) => ({
            channels: state.channels.filter((c) => c.id !== deletedChannel.id),
          }));
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [workspaceAppId]);
}
