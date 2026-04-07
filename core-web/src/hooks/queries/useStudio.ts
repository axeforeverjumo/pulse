import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { studioKeys } from './keys';
import {
  getStudioApps,
  getStudioApp,
  createStudioApp,
  updateStudioApp,
  deleteStudioApp,
  getStudioPages,
  getStudioPage,
  createStudioPage,
  updateStudioPage,
  updateStudioPageTree,
  deleteStudioPage,
  getStudioVersions,
  createStudioVersion,
  restoreStudioVersion,
  type StudioApp,
  type StudioPage,
} from '../../api/client';

// ============================================================================
// Apps
// ============================================================================

export function useStudioApps(workspaceId: string | null) {
  return useQuery({
    queryKey: studioKeys.apps(workspaceId!),
    queryFn: () => getStudioApps(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useStudioApp(appId: string | null) {
  return useQuery({
    queryKey: studioKeys.app(appId!),
    queryFn: () => getStudioApp(appId!),
    enabled: !!appId,
    staleTime: 2 * 60 * 1000,
  });
}

export function useCreateStudioApp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createStudioApp,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: studioKeys.all });
    },
  });
}

export function useUpdateStudioApp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ appId, data }: { appId: string; data: Partial<StudioApp> }) =>
      updateStudioApp(appId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: studioKeys.all });
    },
  });
}

export function useDeleteStudioApp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteStudioApp,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: studioKeys.all });
    },
  });
}

// ============================================================================
// Pages
// ============================================================================

export function useStudioPages(appId: string | null) {
  return useQuery({
    queryKey: studioKeys.pages(appId!),
    queryFn: () => getStudioPages(appId!),
    enabled: !!appId,
    staleTime: 2 * 60 * 1000,
  });
}

export function useStudioPage(pageId: string | null) {
  return useQuery({
    queryKey: studioKeys.page(pageId!),
    queryFn: () => getStudioPage(pageId!),
    enabled: !!pageId,
    staleTime: 30 * 1000,
  });
}

export function useCreateStudioPage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ appId, data }: { appId: string; data: { name: string; slug: string; route?: string; is_home?: boolean } }) =>
      createStudioPage(appId, data),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: studioKeys.pages(vars.appId) });
    },
  });
}

export function useUpdateStudioPage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ pageId, data }: { pageId: string; data: Partial<StudioPage> }) =>
      updateStudioPage(pageId, data),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: studioKeys.page(updated.id) });
    },
  });
}

export function useSaveStudioPageTree() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ pageId, tree }: { pageId: string; tree: Record<string, unknown> }) =>
      updateStudioPageTree(pageId, tree),
    onSuccess: (updated) => {
      qc.setQueryData(studioKeys.page(updated.id), updated);
    },
  });
}

export function useDeleteStudioPage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteStudioPage,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: studioKeys.all });
    },
  });
}

// ============================================================================
// Versions
// ============================================================================

export function useStudioVersions(pageId: string | null) {
  return useQuery({
    queryKey: studioKeys.versions(pageId!),
    queryFn: () => getStudioVersions(pageId!),
    enabled: !!pageId,
    staleTime: 30 * 1000,
  });
}

export function useCreateStudioVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ pageId, description }: { pageId: string; description?: string }) =>
      createStudioVersion(pageId, description),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: studioKeys.versions(vars.pageId) });
    },
  });
}

export function useRestoreStudioVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ pageId, versionId }: { pageId: string; versionId: string }) =>
      restoreStudioVersion(pageId, versionId),
    onSuccess: (updated) => {
      qc.setQueryData(studioKeys.page(updated.id), updated);
      qc.invalidateQueries({ queryKey: studioKeys.all });
    },
  });
}
