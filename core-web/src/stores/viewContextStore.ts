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

export interface CrmContactContext {
  id: string;
  name: string;
  email: string;
  company?: string;
}

export interface CrmCompanyContext {
  id: string;
  name: string;
  domain?: string;
}

export interface CrmOpportunityContext {
  id: string;
  name: string;
  stage: string;
  amount?: number;
  company?: string;
}

export interface MarketingSiteContext {
  id: string;
  name: string;
  domain: string;
  url: string;
  ga4_property_id?: string;
  gsc_site_url?: string;
  repository_url?: string;
  last_audit_score?: number;
  projectId?: string;
  siteId?: string;
}

export type ViewType = "email" | "projects" | "crm" | "files" | "messages" | "calendar" | "agents" | "dashboard" | "marketing" | null;

interface ViewContextState {
  currentView: ViewType;
  currentEmail: EmailContext | null;
  currentProject: ProjectContext | null;
  currentTask: TaskContext | null;
  currentCrmContact: CrmContactContext | null;
  currentCrmCompany: CrmCompanyContext | null;
  currentCrmOpportunity: CrmOpportunityContext | null;
  crmSubView: 'pipeline' | 'contacts' | 'companies' | 'notes' | null;
  currentMarketingSite: MarketingSiteContext | null;
  setCurrentView: (view: ViewType) => void;
  setCurrentEmail: (email: EmailContext | null) => void;
  setCurrentProject: (project: ProjectContext | null) => void;
  setCurrentTask: (task: TaskContext | null) => void;
  setCrmContext: (data: {
    subView?: 'pipeline' | 'contacts' | 'companies' | 'notes';
    contact?: CrmContactContext | null;
    company?: CrmCompanyContext | null;
    opportunity?: CrmOpportunityContext | null;
  }) => void;
  setMarketingSite: (site: MarketingSiteContext | null) => void;
  clearContext: () => void;
}

export const useViewContextStore = create<ViewContextState>()((set) => ({
  currentView: null,
  currentEmail: null,
  currentProject: null,
  currentTask: null,
  currentCrmContact: null,
  currentCrmCompany: null,
  currentCrmOpportunity: null,
  crmSubView: null,
  currentMarketingSite: null,
  setCurrentView: (view) => set({ currentView: view }),
  setCurrentEmail: (email) => set({ currentEmail: email }),
  setCurrentProject: (project) => set({ currentProject: project }),
  setCurrentTask: (task) => set({ currentTask: task }),
  setCrmContext: (data) => set({
    crmSubView: data.subView ?? null,
    currentCrmContact: data.contact ?? null,
    currentCrmCompany: data.company ?? null,
    currentCrmOpportunity: data.opportunity ?? null,
  }),
  setMarketingSite: (site) => set({ currentMarketingSite: site }),
  clearContext: () =>
    set({
      currentView: null,
      currentEmail: null,
      currentProject: null,
      currentTask: null,
      currentCrmContact: null,
      currentCrmCompany: null,
      currentCrmOpportunity: null,
      crmSubView: null,
      currentMarketingSite: null,
    }),
}));
