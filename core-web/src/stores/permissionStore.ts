import { create } from 'zustand';
import {
  shareResource,
  batchShare,
  revokeShare,
  updateShare,
  getResourceShares,
  getResourceLinks,
  createShareLink,
  updateShareLinkSlug,
  revokeShareLink,
  getSharedWithMe,
  requestAccess,
  getPendingAccessRequests,
  resolveAccessRequest,
  type Permission,
  type PermissionLevel,
  type ShareLink,
  type SharedResource,
  type WorkspaceMember,
  type ShareRequest,
  type BatchShareRequest,
  type UserSearchResult,
  type AccessRequest,
} from '../api/client';

interface ShareModalResource {
  type: string;
  id: string;
  title: string;
}

interface PermissionState {
  shareModalOpen: boolean;
  shareModalResource: ShareModalResource | null;
  resourceShares: Permission[];
  resourceMembers: WorkspaceMember[];
  resourceLinks: ShareLink[];
  isLoadingShares: boolean;
  isLoadingLinks: boolean;
  sharedWithMe: SharedResource[];
  isLoadingSharedWithMe: boolean;
  pendingRequests: AccessRequest[];
  isLoadingPendingRequests: boolean;
  pendingRequestsError: string | null;
  accessRequestStatus: 'idle' | 'sending' | 'sent' | 'error';
  accessRequestError: string | null;
  error: string | null;
  linksError: string | null;

  openShareModal: (resource: ShareModalResource) => void;
  closeShareModal: () => void;
  fetchResourceShares: (resourceType: string, resourceId: string) => Promise<void>;
  fetchResourceLinks: (resourceType: string, resourceId: string) => Promise<void>;
  shareWithUser: (
    resourceType: string,
    resourceId: string,
    email: string,
    permission: PermissionLevel,
    grantee?: UserSearchResult | null,
  ) => Promise<Permission | null>;
  batchShareWithUsers: (resourceType: string, resourceId: string, grants: BatchShareRequest['grants']) => Promise<void>;
  revokePermission: (permissionId: string) => Promise<void>;
  updatePermission: (permissionId: string, permission: PermissionLevel) => Promise<void>;
  createLink: (
    resourceType: string,
    resourceId: string,
    permission: PermissionLevel,
    slug?: string | null,
  ) => Promise<ShareLink | null>;
  revokeLink: (token: string) => Promise<void>;
  updateLinkPermission: (linkId: string, permission: PermissionLevel) => Promise<void>;
  updateLinkSlug: (linkId: string, slug: string | null) => Promise<void>;
  fetchSharedWithMe: (params?: { workspace_id?: string; resource_type?: string; limit?: number; offset?: number }) => Promise<void>;
  fetchPendingRequests: () => Promise<void>;
  submitAccessRequest: (resourceType: string, resourceId: string, message?: string) => Promise<void>;
  approveRequest: (requestId: string, permission: PermissionLevel) => Promise<AccessRequest | null>;
  denyRequest: (requestId: string) => Promise<AccessRequest | null>;
  resetAccessRequestStatus: () => void;
}

export const usePermissionStore = create<PermissionState>((set, get) => ({
  shareModalOpen: false,
  shareModalResource: null,
  resourceShares: [],
  resourceMembers: [],
  resourceLinks: [],
  isLoadingShares: false,
  isLoadingLinks: false,
  sharedWithMe: [],
  isLoadingSharedWithMe: false,
  pendingRequests: [],
  isLoadingPendingRequests: false,
  pendingRequestsError: null,
  accessRequestStatus: 'idle',
  accessRequestError: null,
  error: null,
  linksError: null,

  openShareModal: (resource) => {
    set({
      shareModalOpen: true,
      shareModalResource: resource,
      resourceShares: [],
      resourceMembers: [],
      resourceLinks: [],
      error: null,
      linksError: null,
    });
  },

  closeShareModal: () => {
    set({
      shareModalOpen: false,
      shareModalResource: null,
      resourceShares: [],
      resourceMembers: [],
      resourceLinks: [],
      error: null,
      linksError: null,
    });
  },

  fetchResourceShares: async (resourceType, resourceId) => {
    set({ isLoadingShares: true, error: null });
    try {
      const result = await getResourceShares(resourceType, resourceId);
      set({ resourceShares: result.shares, resourceMembers: result.members, isLoadingShares: false });
    } catch (err) {
      set({
        isLoadingShares: false,
        error: err instanceof Error ? err.message : 'Failed to load shares',
      });
    }
  },

  fetchResourceLinks: async (resourceType, resourceId) => {
    set({ isLoadingLinks: true, linksError: null });
    try {
      const result = await getResourceLinks(resourceType, resourceId);
      set({ resourceLinks: result.links, isLoadingLinks: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load links';
      // Hide link UI for non-managers without surfacing an error
      if (message.toLowerCase().includes('not authorized')) {
        set({ resourceLinks: [], isLoadingLinks: false, linksError: null });
        return;
      }
      set({ isLoadingLinks: false, linksError: message });
    }
  },

  shareWithUser: async (resourceType, resourceId, email, permission, grantee) => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return null;

    set({ error: null });

    const { resourceShares } = get();
    const existing = resourceShares.find((share) => (
      (share.grantee?.email || '').toLowerCase() === normalizedEmail
    ));

    let optimisticId: string | null = null;
    let previous: Permission | null = null;
    let optimistic: Permission | null = null;

    if (existing) {
      previous = existing;
      set((state) => ({
        resourceShares: state.resourceShares.map((share) => (
          share.id === existing.id ? { ...share, permission } : share
        )),
      }));
    } else {
      optimisticId = `temp-share-${Date.now()}`;
      optimistic = {
        id: optimisticId,
        workspace_id: undefined,
        resource_type: resourceType,
        resource_id: resourceId,
        grantee_type: 'user',
        grantee_id: grantee?.id,
        permission,
        created_at: new Date().toISOString(),
        grantee: {
          id: grantee?.id || optimisticId,
          email: normalizedEmail,
          name: grantee?.name,
          avatar_url: grantee?.avatar_url,
        },
      };
      set((state) => ({
        resourceShares: [optimistic!, ...state.resourceShares],
      }));
    }

    try {
      const payload: ShareRequest = {
        resource_type: resourceType,
        resource_id: resourceId,
        grantee_email: normalizedEmail,
        permission,
      };
      const created = await shareResource(payload);
      const enriched = {
        ...created,
        grantee: optimistic?.grantee || previous?.grantee,
      };

      set((state) => {
        const next = state.resourceShares.slice();
        let replaced = false;
        for (let i = 0; i < next.length; i += 1) {
          const share = next[i];
          if (optimisticId && share.id === optimisticId) {
            next[i] = enriched;
            replaced = true;
            break;
          }
          if (!optimisticId && previous && share.id === previous.id) {
            next[i] = enriched;
            replaced = true;
            break;
          }
        }
        if (!replaced) {
          next.unshift(enriched);
        }
        return { resourceShares: next };
      });

      return enriched;
    } catch (err) {
      set((state) => {
        let updatedShares = state.resourceShares;
        if (optimisticId) {
          updatedShares = updatedShares.filter((share) => share.id !== optimisticId);
        } else if (previous) {
          updatedShares = updatedShares.map((share) => (
            share.id === previous!.id ? previous! : share
          ));
        }
        return {
          resourceShares: updatedShares,
          error: err instanceof Error ? err.message : 'Failed to share resource',
        };
      });
      return null;
    }
  },

  batchShareWithUsers: async (resourceType, resourceId, grants) => {
    set({ isLoadingShares: true, error: null });
    try {
      const payload: BatchShareRequest = {
        resource_type: resourceType,
        resource_id: resourceId,
        grants,
      };
      await batchShare(payload);
      await get().fetchResourceShares(resourceType, resourceId);
    } catch (err) {
      set({
        isLoadingShares: false,
        error: err instanceof Error ? err.message : 'Failed to share resource',
      });
    }
  },

  revokePermission: async (permissionId) => {
    set({ error: null });
    const previous = get().resourceShares.find((share) => share.id === permissionId);
    if (!previous) return;

    set((state) => ({
      resourceShares: state.resourceShares.filter((share) => share.id !== permissionId),
    }));

    try {
      await revokeShare(permissionId);
    } catch (err) {
      set((state) => ({
        resourceShares: [previous, ...state.resourceShares],
        error: err instanceof Error ? err.message : 'Failed to revoke share',
      }));
    }
  },

  updatePermission: async (permissionId, permission) => {
    set({ error: null });
    const previous = get().resourceShares.find((share) => share.id === permissionId);
    if (!previous) return;

    set((state) => ({
      resourceShares: state.resourceShares.map((share) => (
        share.id === permissionId ? { ...share, permission } : share
      )),
    }));

    try {
      const updated = await updateShare(permissionId, permission);
      set((state) => ({
        resourceShares: state.resourceShares.map((share) => (
          share.id === permissionId ? { ...updated, grantee: share.grantee } : share
        )),
      }));
    } catch (err) {
      set((state) => ({
        resourceShares: state.resourceShares.map((share) => (
          share.id === permissionId ? previous : share
        )),
        error: err instanceof Error ? err.message : 'Failed to update share',
      }));
    }
  },

  createLink: async (resourceType, resourceId, permission, slug) => {
    set({ linksError: null });
    try {
      const created = await createShareLink(resourceType, resourceId, permission, slug);
      set((state) => ({
        resourceLinks: [created, ...state.resourceLinks],
      }));
      return created;
    } catch (err) {
      set({ linksError: err instanceof Error ? err.message : 'Failed to create link' });
      return null;
    }
  },

  revokeLink: async (token) => {
    set({ linksError: null });
    const previous = get().resourceLinks;
    set((state) => ({
      resourceLinks: state.resourceLinks.filter((link) => link.link_token !== token),
    }));
    try {
      await revokeShareLink(token);
    } catch (err) {
      set({
        resourceLinks: previous,
        linksError: err instanceof Error ? err.message : 'Failed to revoke link',
      });
    }
  },

  updateLinkPermission: async (linkId, permission) => {
    set({ linksError: null });
    const previous = get().resourceLinks.find((link) => link.id === linkId);
    if (!previous) return;

    set((state) => ({
      resourceLinks: state.resourceLinks.map((link) => (
        link.id === linkId ? { ...link, permission } : link
      )),
    }));

    try {
      const updated = await updateShare(linkId, permission);
      set((state) => ({
        resourceLinks: state.resourceLinks.map((link) => (
          link.id === linkId ? { ...link, permission: updated.permission } : link
        )),
      }));
    } catch (err) {
      set((state) => ({
        resourceLinks: state.resourceLinks.map((link) => (
          link.id === linkId ? previous : link
        )),
        linksError: err instanceof Error ? err.message : 'Failed to update link',
      }));
    }
  },

  updateLinkSlug: async (linkId, slug) => {
    set({ linksError: null });
    const previous = get().resourceLinks.find((link) => link.id === linkId);
    if (!previous) return;

    const normalizedSlug = slug?.trim().toLowerCase() || null;
    const marker = '/s/';
    const markerIndex = previous.url.indexOf(marker);
    const urlPrefix = markerIndex >= 0 ? previous.url.slice(0, markerIndex + marker.length) : '/s/';
    const nextIdentifier = normalizedSlug || previous.link_token;

    set((state) => ({
      resourceLinks: state.resourceLinks.map((link) => (
        link.id === linkId
          ? {
              ...link,
              link_slug: normalizedSlug,
              url: `${urlPrefix}${nextIdentifier}`,
            }
          : link
      )),
    }));

    try {
      const updated = await updateShareLinkSlug(linkId, normalizedSlug);
      set((state) => ({
        resourceLinks: state.resourceLinks.map((link) => (
          link.id === linkId ? updated : link
        )),
      }));
    } catch (err) {
      set((state) => ({
        resourceLinks: state.resourceLinks.map((link) => (
          link.id === linkId ? previous : link
        )),
      }));
      throw err;
    }
  },

  fetchSharedWithMe: async (params) => {
    set({ isLoadingSharedWithMe: true, error: null });
    try {
      const result = await getSharedWithMe(params || {});
      set({ sharedWithMe: result.items, isLoadingSharedWithMe: false });
    } catch (err) {
      set({
        isLoadingSharedWithMe: false,
        error: err instanceof Error ? err.message : 'Failed to load shared resources',
      });
    }
  },

  fetchPendingRequests: async () => {
    set({ isLoadingPendingRequests: true, pendingRequestsError: null });
    try {
      const result = await getPendingAccessRequests();
      set({ pendingRequests: result, isLoadingPendingRequests: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load access requests';
      if (message.toLowerCase().includes('not authorized')) {
        set({ pendingRequests: [], isLoadingPendingRequests: false, pendingRequestsError: null });
        return;
      }
      set({
        isLoadingPendingRequests: false,
        pendingRequestsError: message,
      });
    }
  },

  submitAccessRequest: async (resourceType, resourceId, message) => {
    set({ accessRequestStatus: 'sending', accessRequestError: null });
    try {
      await requestAccess({
        resource_type: resourceType,
        resource_id: resourceId,
        message,
      });
      set({ accessRequestStatus: 'sent' });
    } catch (err) {
      set({
        accessRequestStatus: 'error',
        accessRequestError: err instanceof Error ? err.message : 'Failed to request access',
      });
    }
  },

  approveRequest: async (requestId, permission) => {
    set({ pendingRequestsError: null });
    try {
      const updated = await resolveAccessRequest(requestId, {
        status: 'approved',
        permission,
      });
      set((state) => ({
        pendingRequests: state.pendingRequests.filter((request) => request.id !== requestId),
      }));
      return updated;
    } catch (err) {
      set({
        pendingRequestsError: err instanceof Error ? err.message : 'Failed to approve request',
      });
      return null;
    }
  },

  denyRequest: async (requestId) => {
    set({ pendingRequestsError: null });
    try {
      const updated = await resolveAccessRequest(requestId, { status: 'denied' });
      set((state) => ({
        pendingRequests: state.pendingRequests.filter((request) => request.id !== requestId),
      }));
      return updated;
    } catch (err) {
      set({
        pendingRequestsError: err instanceof Error ? err.message : 'Failed to deny request',
      });
      return null;
    }
  },

  resetAccessRequestStatus: () => {
    set({ accessRequestStatus: 'idle', accessRequestError: null });
  },
}));
