import { create } from 'zustand';

export type TabState = 'temporary' | 'pinned' | 'draft';

export interface ViewTab {
  id: string;
  title: string;
  state: TabState;
  /** Template type for rendering */
  template: 'list' | 'detail' | 'document' | 'chart' | 'kanban';
  /** JSON data for the template */
  data: Record<string, unknown>;
  /** Module that created this tab */
  module: string;
  createdAt: number;
}

interface ViewTabsState {
  tabs: ViewTab[];
  activeTabId: string | null;
  addTab: (tab: Omit<ViewTab, 'id' | 'createdAt'>) => string;
  removeTab: (id: string) => void;
  setActiveTab: (id: string | null) => void;
  pinTab: (id: string) => void;
  unpinTab: (id: string) => void;
  updateTabData: (id: string, data: Record<string, unknown>) => void;
}

export const useViewTabsStore = create<ViewTabsState>((set) => ({
  tabs: [],
  activeTabId: null,

  addTab: (tab) => {
    const id = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    set((s) => ({
      tabs: [...s.tabs, { ...tab, id, createdAt: Date.now() }],
      activeTabId: id,
    }));
    return id;
  },

  removeTab: (id) =>
    set((s) => ({
      tabs: s.tabs.filter((t) => t.id !== id),
      activeTabId: s.activeTabId === id
        ? s.tabs.find((t) => t.id !== id && t.state === 'pinned')?.id || null
        : s.activeTabId,
    })),

  setActiveTab: (id) => set({ activeTabId: id }),

  pinTab: (id) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, state: 'pinned' as TabState } : t)),
    })),

  unpinTab: (id) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, state: 'temporary' as TabState } : t)),
    })),

  updateTabData: (id, data) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, data: { ...t.data, ...data } } : t)),
    })),
}));
