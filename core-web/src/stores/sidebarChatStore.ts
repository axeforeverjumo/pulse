import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

// Tab ID can be a conversation ID string, or a temp ID for new unsaved chats
export type TabId = string | null;

// Helper to generate a unique temp ID for new tabs
export const createNewTabId = () => `new-${Date.now()}`;

// Helper to check if a tab is a new/unsaved chat
export const isNewTab = (id: TabId): boolean => id === null || id.startsWith('new-');

interface SidebarChatState {
  messages: DisplayMessage[];
  activeConversationId: string | null;
  streamingConversationId: string | null;

  // Tabs state - persisted
  openTabs: TabId[];
  activeTabId: TabId;
  showTabBar: boolean; // True once user has created multiple tabs

  // Actions
  addMessage: (message: DisplayMessage) => void;
  setMessages: (messages: DisplayMessage[]) => void;
  setActiveConversationId: (id: string | null) => void;
  setStreamingConversationId: (id: string | null) => void;
  clearChat: () => void;

  // Tab actions
  addTab: (id: TabId) => void;
  removeTab: (id: TabId) => void;
  setActiveTab: (id: TabId) => void;
  replaceTab: (oldId: TabId, newId: string) => void;
}

export const useSidebarChatStore = create<SidebarChatState>()(
  persist(
    (set) => ({
      messages: [],
      activeConversationId: null,
      streamingConversationId: null,
      openTabs: [null], // Start with one new chat tab (null for backwards compat)
      activeTabId: null,
      showTabBar: false,

      addMessage: (message) =>
        set((state) => ({ messages: [...state.messages, message] })),

      setMessages: (messages) => set({ messages }),

      setActiveConversationId: (id) => set({ activeConversationId: id }),

      setStreamingConversationId: (id) => set({ streamingConversationId: id }),

      clearChat: () =>
        set({
          messages: [],
          activeConversationId: null,
          streamingConversationId: null,
        }),

      addTab: (id) =>
        set((state) => ({
          openTabs: [...state.openTabs, id],
          activeTabId: id,
          // For new tabs, activeConversationId should be null to trigger conversation creation
          activeConversationId: isNewTab(id) ? null : id,
          messages: [], // Clear messages for new tab
          showTabBar: true, // Once user creates a second tab, always show tab bar
        })),

      removeTab: (id) =>
        set((state) => {
          const newTabs = state.openTabs.filter((tabId) => tabId !== id);
          // If no tabs left, add a new empty one
          if (newTabs.length === 0) {
            const newTabId = createNewTabId();
            return {
              openTabs: [newTabId],
              activeTabId: newTabId,
              activeConversationId: null,
              messages: [],
            };
          }
          // If removing active tab, switch to the previous or next tab
          if (state.activeTabId === id) {
            const removedIndex = state.openTabs.indexOf(id);
            const newActiveIndex = Math.min(removedIndex, newTabs.length - 1);
            const newActiveId = newTabs[newActiveIndex];
            return {
              openTabs: newTabs,
              activeTabId: newActiveId,
              activeConversationId: isNewTab(newActiveId) ? null : newActiveId,
              messages: [], // Messages will be loaded by the component
            };
          }
          return { openTabs: newTabs };
        }),

      setActiveTab: (id) =>
        set({
          activeTabId: id,
          // For new tabs, activeConversationId should be null to trigger conversation creation
          activeConversationId: isNewTab(id) ? null : id,
          messages: [], // Clear messages, will be loaded by component
        }),

      replaceTab: (oldId, newId) =>
        set((state) => ({
          openTabs: state.openTabs.map((tabId) => (tabId === oldId ? newId : tabId)),
          activeTabId: state.activeTabId === oldId ? newId : state.activeTabId,
          activeConversationId: state.activeConversationId === oldId ? newId : state.activeConversationId,
        })),
    }),
    {
      name: 'sidebar-chat-tabs',
      partialize: (state) => ({
        openTabs: state.openTabs,
        activeTabId: state.activeTabId,
        showTabBar: state.showTabBar,
      }),
    }
  )
);
