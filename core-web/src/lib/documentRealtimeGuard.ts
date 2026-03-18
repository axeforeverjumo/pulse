const LOCAL_REORDER_TTL_MS = 2500;

type LocalReorderWindow = {
  expiresAt: number;
  workspaceAppId: string | null;
  documentIds: Set<string>;
};

let localReorderWindow: LocalReorderWindow | null = null;

function clearExpiredWindow(now: number): void {
  if (localReorderWindow && now > localReorderWindow.expiresAt) {
    localReorderWindow = null;
  }
}

export function markLocalDocumentReorder(documentIds: string[], workspaceAppId: string | null): void {
  if (documentIds.length === 0) return;

  const now = Date.now();
  clearExpiredWindow(now);

  if (localReorderWindow && localReorderWindow.workspaceAppId === workspaceAppId) {
    for (const id of documentIds) {
      localReorderWindow.documentIds.add(id);
    }
    localReorderWindow.expiresAt = now + LOCAL_REORDER_TTL_MS;
    return;
  }

  localReorderWindow = {
    expiresAt: now + LOCAL_REORDER_TTL_MS,
    workspaceAppId,
    documentIds: new Set(documentIds),
  };
}

export function shouldSuppressDocumentRealtime(
  documentId: string | undefined,
  workspaceAppId: string | null | undefined
): boolean {
  if (!documentId) return false;

  const now = Date.now();
  clearExpiredWindow(now);
  if (!localReorderWindow) return false;

  if (
    workspaceAppId &&
    localReorderWindow.workspaceAppId &&
    workspaceAppId !== localReorderWindow.workspaceAppId
  ) {
    return false;
  }

  return localReorderWindow.documentIds.has(documentId);
}
