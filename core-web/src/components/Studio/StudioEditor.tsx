import { useEffect, useCallback, useRef } from 'react';
import { useStudioStore } from '../../stores/studioStore';
import { useStudioPages, useSaveStudioPageTree } from '../../hooks/queries/useStudio';
import { getStudioPage } from '../../api/client';
import { registerAllWidgets } from './widgets';
import StudioToolbar from './StudioToolbar';

// Register widgets once on module load
registerAllWidgets();
import StudioSidebar from './StudioSidebar';
import StudioCanvas from './StudioCanvas';
import StudioPropertiesPanel from './StudioPropertiesPanel';

export default function StudioEditor() {
  const {
    activeAppId,
    activePageId,
    setActivePage,
    setComponentTree,
    componentTree,
    isDirty,
    setDirty,
    isPreviewMode,
    undo,
    redo,
  } = useStudioStore();

  const { data: pages } = useStudioPages(activeAppId);
  const saveTree = useSaveStudioPageTree();
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-select first page if none selected
  useEffect(() => {
    if (!activePageId && pages && pages.length > 0) {
      setActivePage(pages[0].id);
    }
  }, [activePageId, pages, setActivePage]);

  // Load page tree when page changes
  useEffect(() => {
    if (!activePageId) return;
    let cancelled = false;
    getStudioPage(activePageId).then((page) => {
      if (cancelled) return;
      setComponentTree(page.component_tree as any);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [activePageId, setComponentTree]);

  // Auto-save with debounce
  useEffect(() => {
    if (!isDirty || !activePageId || !componentTree) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTree.mutate(
        { pageId: activePageId, tree: componentTree as any },
        { onSuccess: () => setDirty(false) }
      );
    }, 2000);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [isDirty, activePageId, componentTree, saveTree, setDirty]);

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey) {
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        e.preventDefault();
        redo();
      }
    }
  }, [undo, redo]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="flex flex-col h-full">
      <StudioToolbar />
      <div className="flex flex-1 overflow-hidden">
        {!isPreviewMode && (
          <StudioSidebar />
        )}
        <StudioCanvas />
        {!isPreviewMode && (
          <StudioPropertiesPanel />
        )}
      </div>
    </div>
  );
}
