import { useEffect, useRef, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useUIStore } from '../../stores/uiStore';
import {
  getDocumentVersions,
  getDocumentVersion,
  restoreDocumentVersion,
  type DocumentVersion,
} from '../../api/client';

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const seconds = Math.floor((now - then) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function VersionHistoryPanel({
  documentId,
  onRestore,
  saveStatus,
}: {
  documentId: string | null;
  onRestore?: (content: string, title: string) => void;
  saveStatus?: 'saved' | 'saving' | 'unsaved' | 'error';
}) {
  const isOpen = useUIStore((s) => s.isVersionHistoryOpen);
  const setOpen = useUIStore((s) => s.setVersionHistoryOpen);
  const wasOpenOnMount = useRef(isOpen);

  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<DocumentVersion | null>(null);
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  // Fetch version list when panel opens or document changes
  useEffect(() => {
    if (!isOpen || !documentId) {
      setVersions([]);
      setSelectedVersion(null);
      return;
    }

    // Clear stale data immediately so we never show file X's versions in file Y
    setVersions([]);
    setSelectedVersion(null);

    let cancelled = false;
    setIsLoading(true);
    getDocumentVersions(documentId)
      .then((res) => {
        if (!cancelled) setVersions(res.versions);
      })
      .catch(() => {
        if (!cancelled) setVersions([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [isOpen, documentId]);

  // Silently refresh version list after a save completes (a new version may have been created)
  const prevSaveStatus = useRef(saveStatus);
  useEffect(() => {
    const wasSaving = prevSaveStatus.current === 'saving';
    prevSaveStatus.current = saveStatus;

    if (!wasSaving || saveStatus !== 'saved') return;
    if (!isOpen || !documentId) return;

    // Background refresh — no loading spinner, no clearing existing list
    getDocumentVersions(documentId)
      .then((res) => setVersions(res.versions))
      .catch(() => {});
  }, [saveStatus, isOpen, documentId]);

  // Load full content when a version is selected
  const handleSelectVersion = useCallback(
    (version: DocumentVersion) => {
      if (!documentId) return;
      if (selectedVersion?.id === version.id) {
        setSelectedVersion(null);
        return;
      }

      setIsLoadingContent(true);
      setSelectedVersion(version);

      getDocumentVersion(documentId, version.id)
        .then((full) => setSelectedVersion(full))
        .catch(() => {})
        .finally(() => setIsLoadingContent(false));
    },
    [documentId, selectedVersion?.id]
  );

  const handleRestore = useCallback(async () => {
    if (!documentId || !selectedVersion) return;

    const confirmed = window.confirm(
      `Restore to Version ${selectedVersion.version_number}?\n\nYour current content will be saved as a new version before restoring.`
    );
    if (!confirmed) return;

    setIsRestoring(true);
    try {
      const updated = await restoreDocumentVersion(documentId, selectedVersion.id);
      onRestore?.(updated.content || '', updated.title || '');
      setOpen(false);
    } catch {
      // Silently fail — the user will see the note didn't change
    } finally {
      setIsRestoring(false);
    }
  }, [documentId, selectedVersion, onRestore, setOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={wasOpenOnMount.current ? false : { width: 0, opacity: 0 }}
          animate={{ width: 340, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
          className="h-full flex flex-col overflow-hidden shrink-0 border-l border-border-gray bg-white"
        >
          {/* Header */}
          <div className="h-12 flex items-center justify-between px-4 shrink-0">
            <h2 className="text-sm font-medium text-text-body">Version history</h2>
            <button
              onClick={() => setOpen(false)}
              className="p-1.5 text-text-tertiary hover:text-text-body hover:bg-bg-gray rounded-lg transition-colors"
              title="Cerrar"
            >
              <XMarkIcon className="w-4 h-4 stroke-2" />
            </button>
          </div>

          {/* Version list */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12 text-text-tertiary text-sm">
                Loading...
              </div>
            ) : versions.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
                <div className="w-12 h-12 rounded-full bg-bg-gray flex items-center justify-center mb-4">
                  <svg
                    className="w-6 h-6 text-text-tertiary"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <h3 className="text-sm font-medium text-text-body mb-1">Sin versiones a�n</h3>
                <p className="text-xs text-text-tertiary">
                  Versions are saved automatically every few minutes when you make significant edits
                </p>
              </div>
            ) : (
              <div className="px-2 pb-2">
                {versions.map((version) => {
                  const isSelected = selectedVersion?.id === version.id;
                  return (
                    <button
                      key={version.id}
                      onClick={() => handleSelectVersion(version)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors mb-0.5 ${
                        isSelected
                          ? 'bg-brand-primary/10 border border-brand-primary/20'
                          : 'hover:bg-bg-gray border border-transparent'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-text-body">
                          Version {version.version_number}
                        </span>
                        <span className="text-xs text-text-tertiary">
                          {version.created_at ? timeAgo(version.created_at) : ''}
                        </span>
                      </div>
                      {version.title && (
                        <p className="text-xs text-text-secondary mt-0.5 truncate">
                          {version.title}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Preview + Restore */}
          {selectedVersion && (
            <div className="border-t border-border-gray flex flex-col shrink-0 max-h-[50%]">
              <div className="px-4 py-2 flex items-center justify-between shrink-0">
                <span className="text-xs font-medium text-text-secondary">
                  Preview — Version {selectedVersion.version_number}
                </span>
                <button
                  onClick={handleRestore}
                  disabled={isRestoring}
                  className="px-3 py-1 text-xs font-medium text-white bg-brand-primary hover:bg-brand-primary/90 rounded-md transition-colors disabled:opacity-50"
                >
                  {isRestoring ? 'Restoring...' : 'Restore'}
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-4 pb-3 min-h-0">
                {isLoadingContent ? (
                  <div className="text-xs text-text-tertiary py-4 text-center">Loading...</div>
                ) : (
                  <pre className="text-xs text-text-secondary whitespace-pre-wrap font-sans leading-relaxed">
                    {selectedVersion.content || '(empty)'}
                  </pre>
                )}
              </div>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
