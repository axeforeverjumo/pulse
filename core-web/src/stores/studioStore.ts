import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ComponentNode {
  _id: string;
  _component: string;
  _children?: ComponentNode[];
  _styles?: Record<string, unknown>;
  _className?: string;
  [key: string]: unknown;
}

interface StudioState {
  // Context
  workspaceAppId: string | null;
  workspaceId: string | null;

  // App/Page navigation
  activeAppId: string | null;
  activePageId: string | null;

  // Editor state
  componentTree: ComponentNode | null;
  selectedComponentId: string | null;
  hoveredComponentId: string | null;
  clipboardNode: ComponentNode | null;

  // Undo/Redo
  undoStack: ComponentNode[];
  redoStack: ComponentNode[];

  // UI
  leftPanelTab: 'components' | 'pages' | 'tree';
  rightPanelTab: 'properties' | 'styles' | 'events';
  isPreviewMode: boolean;
  isDirty: boolean;
  zoom: number;

  // Actions
  setWorkspaceAppId: (id: string | null) => void;
  setWorkspaceId: (id: string | null) => void;
  setActiveApp: (appId: string | null) => void;
  setActivePage: (pageId: string | null) => void;
  setComponentTree: (tree: ComponentNode | null) => void;
  updateTree: (newTree: ComponentNode) => void;
  selectComponent: (id: string | null) => void;
  hoverComponent: (id: string | null) => void;
  setClipboard: (node: ComponentNode | null) => void;
  setLeftPanelTab: (tab: 'components' | 'pages' | 'tree') => void;
  setRightPanelTab: (tab: 'properties' | 'styles' | 'events') => void;
  setPreviewMode: (on: boolean) => void;
  setDirty: (dirty: boolean) => void;
  undo: () => void;
  redo: () => void;
}

const MAX_UNDO = 50;

export const useStudioStore = create<StudioState>()(
  persist(
    (set, get) => ({
      workspaceAppId: null,
      workspaceId: null,
      activeAppId: null,
      activePageId: null,
      componentTree: null,
      selectedComponentId: null,
      hoveredComponentId: null,
      clipboardNode: null,
      undoStack: [],
      redoStack: [],
      leftPanelTab: 'components',
      rightPanelTab: 'properties',
      isPreviewMode: false,
      isDirty: false,
      zoom: 100,

      setWorkspaceAppId: (id) => {
        set((s) => {
          if (id === s.workspaceAppId) return s;
          return { workspaceAppId: id, activeAppId: null, activePageId: null };
        });
      },

      setWorkspaceId: (id) => set({ workspaceId: id }),

      setActiveApp: (appId) => set({
        activeAppId: appId,
        activePageId: null,
        componentTree: null,
        selectedComponentId: null,
        undoStack: [],
        redoStack: [],
        isDirty: false,
      }),

      setActivePage: (pageId) => set({
        activePageId: pageId,
        selectedComponentId: null,
        undoStack: [],
        redoStack: [],
        isDirty: false,
      }),

      setComponentTree: (tree) => set({
        componentTree: tree,
        undoStack: [],
        redoStack: [],
        isDirty: false,
      }),

      updateTree: (newTree) => {
        const { componentTree, undoStack } = get();
        const newUndoStack = componentTree
          ? [...undoStack.slice(-MAX_UNDO + 1), componentTree]
          : undoStack;
        set({
          componentTree: newTree,
          undoStack: newUndoStack,
          redoStack: [],
          isDirty: true,
        });
      },

      selectComponent: (id) => set({ selectedComponentId: id }),
      hoverComponent: (id) => set({ hoveredComponentId: id }),
      setClipboard: (node) => set({ clipboardNode: node }),
      setLeftPanelTab: (tab) => set({ leftPanelTab: tab }),
      setRightPanelTab: (tab) => set({ rightPanelTab: tab }),
      setPreviewMode: (on) => set({ isPreviewMode: on, selectedComponentId: null }),
      setDirty: (dirty) => set({ isDirty: dirty }),

      undo: () => {
        const { undoStack, componentTree, redoStack } = get();
        if (undoStack.length === 0) return;
        const prev = undoStack[undoStack.length - 1];
        set({
          componentTree: prev,
          undoStack: undoStack.slice(0, -1),
          redoStack: componentTree ? [...redoStack, componentTree] : redoStack,
          isDirty: true,
        });
      },

      redo: () => {
        const { redoStack, componentTree, undoStack } = get();
        if (redoStack.length === 0) return;
        const next = redoStack[redoStack.length - 1];
        set({
          componentTree: next,
          redoStack: redoStack.slice(0, -1),
          undoStack: componentTree ? [...undoStack, componentTree] : undoStack,
          isDirty: true,
        });
      },
    }),
    {
      name: 'core-studio-storage-v1',
      partialize: (state) => ({
        activeAppId: state.activeAppId,
        activePageId: state.activePageId,
        leftPanelTab: state.leftPanelTab,
        zoom: state.zoom,
      }),
    }
  )
);
