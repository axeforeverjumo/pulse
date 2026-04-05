import { create } from 'zustand';
import { getCrmContacts, getCrmCompanies, getCrmOpportunities, getCrmPipeline, getCrmWorkflows, getCrmWorkflowRuns } from '../api/client';

interface CrmState {
  contacts: any[];
  companies: any[];
  opportunities: any[];
  pipeline: any;
  workflows: any[];
  workflowRuns: any[];
  selectedContact: any | null;
  selectedCompany: any | null;
  selectedOpportunity: any | null;
  isLoading: boolean;
  activeView: 'contacts' | 'companies' | 'pipeline' | 'products' | 'notes' | 'workflows';
  searchQuery: string;

  setActiveView: (view: CrmState['activeView']) => void;
  setSearchQuery: (query: string) => void;
  fetchContacts: (workspaceId: string, query?: string) => Promise<void>;
  fetchCompanies: (workspaceId: string, query?: string) => Promise<void>;
  fetchOpportunities: (workspaceId: string, stage?: string) => Promise<void>;
  fetchPipeline: (workspaceId: string) => Promise<void>;
  fetchWorkflows: (workspaceId: string) => Promise<void>;
  fetchWorkflowRuns: (workspaceId: string) => Promise<void>;
  setSelectedContact: (contact: any | null) => void;
  setSelectedCompany: (company: any | null) => void;
  setSelectedOpportunity: (opportunity: any | null) => void;
}

export const useCrmStore = create<CrmState>()((set) => ({
  contacts: [],
  companies: [],
  opportunities: [],
  pipeline: null,
  workflows: [],
  workflowRuns: [],
  selectedContact: null,
  selectedCompany: null,
  selectedOpportunity: null,
  isLoading: false,
  activeView: 'pipeline',
  searchQuery: '',

  setActiveView: (view) => set({ activeView: view }),
  setSearchQuery: (query) => set({ searchQuery: query }),

  fetchContacts: async (workspaceId, query) => {
    set({ isLoading: true });
    try {
      const data = await getCrmContacts(workspaceId, query);
      set({ contacts: data.contacts || [], isLoading: false });
    } catch { set({ isLoading: false }); }
  },

  fetchCompanies: async (workspaceId, query) => {
    set({ isLoading: true });
    try {
      const data = await getCrmCompanies(workspaceId, query);
      set({ companies: data.companies || [], isLoading: false });
    } catch { set({ isLoading: false }); }
  },

  fetchOpportunities: async (workspaceId, stage) => {
    set({ isLoading: true });
    try {
      const data = await getCrmOpportunities(workspaceId, stage);
      set({ opportunities: data.opportunities || [], isLoading: false });
    } catch { set({ isLoading: false }); }
  },

  fetchPipeline: async (workspaceId) => {
    try {
      const data = await getCrmPipeline(workspaceId);
      set({ pipeline: data });
    } catch {}
  },

  fetchWorkflows: async (workspaceId) => {
    try {
      const data = await getCrmWorkflows(workspaceId);
      set({ workflows: data.workflows || [] });
    } catch {}
  },

  fetchWorkflowRuns: async (workspaceId) => {
    try {
      const data = await getCrmWorkflowRuns(workspaceId);
      set({ workflowRuns: data.runs || [] });
    } catch {}
  },

  setSelectedContact: (contact) => set({ selectedContact: contact }),
  setSelectedCompany: (company) => set({ selectedCompany: company }),
  setSelectedOpportunity: (opportunity) => set({ selectedOpportunity: opportunity }),
}));
