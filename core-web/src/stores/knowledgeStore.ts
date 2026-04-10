import { create } from 'zustand';
import {
  getKnowledgeEntities,
  getKnowledgeEntity,
  getKnowledgeGraph,
  searchKnowledge,
  triggerKnowledgeBuild,
  getKnowledgeBuildStatus,
  createKnowledgeEntity,
  deleteKnowledgeEntity,
  createKnowledgeFact,
} from '../api/client';

interface KnowledgeState {
  entities: any[];
  totalCount: number;
  selectedEntity: any | null;
  graphData: { nodes: any[]; links: any[] };
  searchResults: any[];
  buildStates: any[];
  isLoading: boolean;
  isBuilding: boolean;
  activeView: 'graph' | 'people' | 'organizations' | 'projects' | 'topics' | 'search' | 'live-notes' | 'meeting-prep';
  searchQuery: string;

  setActiveView: (view: KnowledgeState['activeView']) => void;
  setSearchQuery: (query: string) => void;
  fetchEntities: (workspaceId: string, type?: string, search?: string) => Promise<void>;
  fetchEntity: (entityId: string, workspaceId: string) => Promise<void>;
  fetchGraph: (workspaceId: string, type?: string) => Promise<void>;
  search: (workspaceId: string, query: string, type?: string) => Promise<void>;
  triggerBuild: (workspaceId: string) => Promise<void>;
  fetchBuildStatus: (workspaceId: string) => Promise<void>;
  createEntity: (data: any) => Promise<any>;
  removeEntity: (entityId: string, workspaceId: string) => Promise<void>;
  addFact: (data: any) => Promise<any>;
  setSelectedEntity: (entity: any | null) => void;
}

export const useKnowledgeStore = create<KnowledgeState>()((set, get) => ({
  entities: [],
  totalCount: 0,
  selectedEntity: null,
  graphData: { nodes: [], links: [] },
  searchResults: [],
  buildStates: [],
  isLoading: false,
  isBuilding: false,
  activeView: 'graph',
  searchQuery: '',

  setActiveView: (view) => set({ activeView: view }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setSelectedEntity: (entity) => set({ selectedEntity: entity }),

  fetchEntities: async (workspaceId, type, search) => {
    set({ isLoading: true });
    try {
      const data = await getKnowledgeEntities(workspaceId, type, search);
      set({ entities: data.entities || [], totalCount: data.count || 0, isLoading: false });
    } catch { set({ isLoading: false }); }
  },

  fetchEntity: async (entityId, workspaceId) => {
    set({ isLoading: true });
    try {
      const entity = await getKnowledgeEntity(entityId, workspaceId);
      set({ selectedEntity: entity, isLoading: false });
    } catch { set({ isLoading: false }); }
  },

  fetchGraph: async (workspaceId, type) => {
    set({ isLoading: true });
    try {
      const data = await getKnowledgeGraph(workspaceId, type);
      set({ graphData: data, isLoading: false });
    } catch { set({ isLoading: false }); }
  },

  search: async (workspaceId, query, type) => {
    set({ isLoading: true });
    try {
      const data = await searchKnowledge(workspaceId, query, type);
      set({ searchResults: data.results || [], isLoading: false });
    } catch { set({ isLoading: false }); }
  },

  triggerBuild: async (workspaceId) => {
    set({ isBuilding: true });
    try {
      await triggerKnowledgeBuild(workspaceId);
      // Poll status after a delay
      setTimeout(() => get().fetchBuildStatus(workspaceId), 3000);
    } catch { set({ isBuilding: false }); }
  },

  fetchBuildStatus: async (workspaceId) => {
    try {
      const data = await getKnowledgeBuildStatus(workspaceId);
      set({ buildStates: data.states || [], isBuilding: false });
    } catch { set({ isBuilding: false }); }
  },

  createEntity: async (data) => {
    try {
      const entity = await createKnowledgeEntity(data);
      set((state) => ({ entities: [entity, ...state.entities] }));
      return entity;
    } catch { return null; }
  },

  removeEntity: async (entityId, workspaceId) => {
    try {
      await deleteKnowledgeEntity(entityId, workspaceId);
      set((state) => ({
        entities: state.entities.filter((e: any) => e.id !== entityId),
        selectedEntity: state.selectedEntity?.id === entityId ? null : state.selectedEntity,
      }));
    } catch {}
  },

  addFact: async (data) => {
    try {
      const fact = await createKnowledgeFact(data);
      return fact;
    } catch { return null; }
  },
}));
