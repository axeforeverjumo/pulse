import { create } from "zustand";

export interface EmailContext {
  id: string;
  subject: string;
  from: string;
  to: string[];
  date: string;
  body: string;
}

export interface ProjectContext {
  id: string;
  name: string;
  boardId: string;
}

export interface TaskContext {
  id: string;
  title: string;
  description: string;
  state: string;
  assignee: string;
}

export type ViewType = "email" | "projects" | "files" | "messages" | "calendar" | "agents" | "dashboard" | null;

interface ViewContextState {
  currentView: ViewType;
  currentEmail: EmailContext | null;
  currentProject: ProjectContext | null;
  currentTask: TaskContext | null;
  setCurrentView: (view: ViewType) => void;
  setCurrentEmail: (email: EmailContext | null) => void;
  setCurrentProject: (project: ProjectContext | null) => void;
  setCurrentTask: (task: TaskContext | null) => void;
  clearContext: () => void;
}

export const useViewContextStore = create<ViewContextState>()((set) => ({
  currentView: null,
  currentEmail: null,
  currentProject: null,
  currentTask: null,
  setCurrentView: (view) => set({ currentView: view }),
  setCurrentEmail: (email) => set({ currentEmail: email }),
  setCurrentProject: (project) => set({ currentProject: project }),
  setCurrentTask: (task) => set({ currentTask: task }),
  clearContext: () =>
    set({
      currentView: null,
      currentEmail: null,
      currentProject: null,
      currentTask: null,
    }),
}));
