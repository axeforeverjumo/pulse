import { create } from 'zustand';
import type { WorkspacePresenceSnapshot, WorkspacePresenceState } from '../lib/presence';
import { getOnlineUserIds } from '../lib/presence';

interface TypingUser {
  userId: string;
  userName: string;
  channelId: string;
  timestamp: number;
}

interface PresenceState {
  workspacePresence: WorkspacePresenceState;
  onlineUserIds: Set<string>;
  typingUsers: Record<string, TypingUser[]>;

  setWorkspacePresenceSnapshot: (
    workspaceId: string,
    snapshot: WorkspacePresenceSnapshot,
  ) => void;
  clearWorkspacePresence: (workspaceId: string) => void;
  addTypingUser: (user: TypingUser) => void;
  removeTypingUser: (channelId: string, userId: string) => void;
  clearAll: () => void;
}

export const usePresenceStore = create<PresenceState>()((set) => ({
  workspacePresence: {},
  onlineUserIds: new Set(),
  typingUsers: {},

  setWorkspacePresenceSnapshot: (workspaceId, snapshot) => {
    set((state) => {
      const next = { ...state.workspacePresence, [workspaceId]: snapshot };
      return { workspacePresence: next, onlineUserIds: getOnlineUserIds(next) };
    });
  },

  clearWorkspacePresence: (workspaceId) => {
    set((state) => {
      if (!state.workspacePresence[workspaceId]) return state;
      const next = { ...state.workspacePresence };
      delete next[workspaceId];
      return { workspacePresence: next, onlineUserIds: getOnlineUserIds(next) };
    });
  },

  addTypingUser: (user) => {
    set((state) => {
      const channelTyping = state.typingUsers[user.channelId] || [];
      const filtered = channelTyping.filter((t) => t.userId !== user.userId);
      return {
        typingUsers: {
          ...state.typingUsers,
          [user.channelId]: [...filtered, user],
        },
      };
    });
  },

  removeTypingUser: (channelId, userId) => {
    set((state) => {
      const channelTyping = state.typingUsers[channelId] || [];
      return {
        typingUsers: {
          ...state.typingUsers,
          [channelId]: channelTyping.filter((t) => t.userId !== userId),
        },
      };
    });
  },

  clearAll: () => {
    set({ workspacePresence: {}, onlineUserIds: new Set(), typingUsers: {} });
  },
}));
