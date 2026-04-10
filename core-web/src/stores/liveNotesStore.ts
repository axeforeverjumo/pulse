import { create } from 'zustand';
import { api } from '../api/client';

interface LiveNotesState {
  notes: any[];
  selectedNote: any | null;
  isLoading: boolean;

  fetchNotes: (workspaceId: string, type?: string) => Promise<void>;
  fetchNote: (noteId: string, workspaceId: string) => Promise<void>;
  createNote: (data: any) => Promise<any>;
  updateNote: (noteId: string, workspaceId: string, data: any) => Promise<void>;
  deleteNote: (noteId: string, workspaceId: string) => Promise<void>;
  refreshNote: (noteId: string, workspaceId: string) => Promise<any>;
  setSelectedNote: (note: any | null) => void;
}

export const useLiveNotesStore = create<LiveNotesState>()((set) => ({
  notes: [],
  selectedNote: null,
  isLoading: false,

  setSelectedNote: (note) => set({ selectedNote: note }),

  fetchNotes: async (workspaceId, type) => {
    set({ isLoading: true });
    try {
      const params = new URLSearchParams({ workspace_id: workspaceId });
      if (type) params.set('note_type', type);
      const data = await api<{ notes: any[] }>(`/live-notes?${params}`);
      set({ notes: data.notes || [], isLoading: false });
    } catch { set({ isLoading: false }); }
  },

  fetchNote: async (noteId, workspaceId) => {
    set({ isLoading: true });
    try {
      const note = await api<any>(`/live-notes/${noteId}?workspace_id=${workspaceId}`);
      set({ selectedNote: note, isLoading: false });
    } catch { set({ isLoading: false }); }
  },

  createNote: async (data) => {
    try {
      const note = await api<any>('/live-notes', { method: 'POST', body: JSON.stringify(data) });
      set((state) => ({ notes: [note, ...state.notes] }));
      return note;
    } catch { return null; }
  },

  updateNote: async (noteId, workspaceId, data) => {
    try {
      const updated = await api<any>(`/live-notes/${noteId}?workspace_id=${workspaceId}`, { method: 'PATCH', body: JSON.stringify(data) });
      set((state) => ({ notes: state.notes.map((n: any) => n.id === noteId ? updated : n) }));
    } catch {}
  },

  deleteNote: async (noteId, workspaceId) => {
    try {
      await api<any>(`/live-notes/${noteId}?workspace_id=${workspaceId}`, { method: 'DELETE' });
      set((state) => ({
        notes: state.notes.filter((n: any) => n.id !== noteId),
        selectedNote: state.selectedNote?.id === noteId ? null : state.selectedNote,
      }));
    } catch {}
  },

  refreshNote: async (noteId, workspaceId) => {
    try {
      const result = await api<any>(`/live-notes/${noteId}/refresh?workspace_id=${workspaceId}`, { method: 'POST' });
      return result;
    } catch { return null; }
  },
}));
