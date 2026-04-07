import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
  MagnifyingGlassIcon,
  UserGroupIcon,
  BuildingOfficeIcon,
  ChartBarIcon,
  DocumentTextIcon,
  CubeIcon,
  BoltIcon,
  XMarkIcon,
  CurrencyDollarIcon,
  EnvelopeIcon,
  MegaphoneIcon,
  ClipboardDocumentListIcon,
  UsersIcon,
} from '@heroicons/react/24/outline';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useCrmStore } from '../../stores/crmStore';
import { useViewContextStore } from '../../stores/viewContextStore';
import ContactsList from './ContactsList';
import ContactDetail from './ContactDetail';
import CompaniesList from './CompaniesList';
import CompanyDetail from './CompanyDetail';
import PipelineView from './PipelineView';
import OpportunityDetail from './OpportunityDetail';
import NotesView from './NotesView';
import ProductsView from './ProductsView';
import WorkflowsView from './WorkflowsView';
import DashboardView from './DashboardView';
import SequenceBuilder from './SequenceBuilder';
import CampaignBuilder from './CampaignBuilder';
import FormBuilder from './FormBuilder';
import TeamActivityView from './TeamActivityView';
import { HeaderButtons } from '../MiniAppHeader';
import { toast } from 'sonner';
import { createCrmContact, createCrmCompany } from '../../api/client';

const tabs = [
  { id: 'dashboard' as const, label: 'Dashboard', icon: ChartBarIcon },
  { id: 'pipeline' as const, label: 'Pipeline', icon: CurrencyDollarIcon },
  { id: 'products' as const, label: 'Productos', icon: CubeIcon },
  { id: 'contacts' as const, label: 'Contactos', icon: UserGroupIcon },
  { id: 'companies' as const, label: 'Empresas', icon: BuildingOfficeIcon },
  { id: 'notes' as const, label: 'Notas', icon: DocumentTextIcon },
  { id: 'sequences' as const, label: 'Secuencias', icon: EnvelopeIcon },
  { id: 'campaigns' as const, label: 'Campañas', icon: MegaphoneIcon },
  { id: 'forms' as const, label: 'Formularios', icon: ClipboardDocumentListIcon },
  { id: 'workflows' as const, label: 'Automatizaciones', icon: BoltIcon },
  { id: 'team' as const, label: 'Equipo', icon: UsersIcon },
];

export default function CrmView() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const workspace = workspaces.find((w) => w.id === workspaceId);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);

  const {
    activeView,
    setActiveView,
    searchQuery,
    setSearchQuery,
    selectedContact,
    setSelectedContact,
    selectedCompany,
    setSelectedCompany,
    selectedOpportunity,
    setSelectedOpportunity,
    fetchContacts,
    fetchCompanies,
  } = useCrmStore();

  const [showCreateContact, setShowCreateContact] = useState(false);
  const [showCreateCompany, setShowCreateCompany] = useState(false);
  const [newContact, setNewContact] = useState({ first_name: '', last_name: '', email: '', phone: '', job_title: '' });
  const [newCompany, setNewCompany] = useState({ name: '', domain: '', industry: '' });
  const [creating, setCreating] = useState(false);

  const effectiveWorkspaceId = workspaceId || workspace?.id || '';

  // Set view context for sidebar chat — updates with sub-view and selected entity
  useEffect(() => {
    const store = useViewContextStore.getState();
    store.setCurrentView("crm");
    store.setCrmContext({
      subView: activeView as any,
      contact: selectedContact ? { id: selectedContact.id, name: `${selectedContact.first_name || ''} ${selectedContact.last_name || ''}`.trim(), email: selectedContact.email || '' } : null,
      company: selectedCompany ? { id: selectedCompany.id, name: selectedCompany.name || '', domain: selectedCompany.domain } : null,
    });
    return () => {
      useViewContextStore.getState().clearContext();
    };
  }, [activeView, selectedContact, selectedCompany]);

  const handleCreateContact = async () => {
    if (!newContact.first_name.trim() && !newContact.email.trim()) {
      toast.error('Nombre o email requerido');
      return;
    }
    setCreating(true);
    try {
      await createCrmContact({ ...newContact, workspace_id: effectiveWorkspaceId });
      toast.success('Contacto creado');
      setShowCreateContact(false);
      setNewContact({ first_name: '', last_name: '', email: '', phone: '', job_title: '' });
      fetchContacts(effectiveWorkspaceId);
    } catch (err: any) {
      toast.error(err.message || 'Error al crear contacto');
    } finally {
      setCreating(false);
    }
  };

  const handleCreateCompany = async () => {
    if (!newCompany.name.trim()) {
      toast.error('Nombre requerido');
      return;
    }
    setCreating(true);
    try {
      await createCrmCompany({ ...newCompany, workspace_id: effectiveWorkspaceId });
      toast.success('Empresa creada');
      setShowCreateCompany(false);
      setNewCompany({ name: '', domain: '', industry: '' });
      fetchCompanies(effectiveWorkspaceId);
    } catch (err: any) {
      toast.error(err.message || 'Error al crear empresa');
    } finally {
      setCreating(false);
    }
  };

  if (!workspace) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-slate-400">Espacio de trabajo no encontrado</p>
      </div>
    );
  }

  const hasDetailOpen = selectedContact || selectedCompany;

  // Full-screen opportunity detail view
  if (selectedOpportunity) {
    return (
      <div className="flex-1 flex h-full min-w-0 overflow-hidden">
        <div className="relative flex-1 flex min-w-0 overflow-hidden rounded-[20px] bg-gradient-to-b from-[#f6fbff] to-[#edf4fb]">
          <OpportunityDetail
            opportunityId={selectedOpportunity.id}
            workspaceId={effectiveWorkspaceId}
            onBack={() => setSelectedOpportunity(null)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex h-full min-w-0 overflow-hidden">
      <div className="relative flex-1 flex min-w-0 overflow-hidden rounded-[20px] bg-gradient-to-b from-[#f6fbff] to-[#edf4fb]">
        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-white/92 md:rounded-[20px]">
          {/* Header toolbar - matching Projects header */}
          <div className="h-14 flex items-center justify-between gap-2 border-b border-[#e4edf8] pl-3 pr-2 sm:pl-5 sm:pr-3">
            <div className="flex min-w-0 items-center gap-2">
              <ChartBarIcon className="w-[18px] h-[18px] text-slate-700 hidden sm:block" />
              <h1 className="text-sm sm:text-base font-semibold text-slate-900 truncate">
                CRM
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <HeaderButtons
                settingsButtonRef={settingsButtonRef}
              />
            </div>
          </div>

          {/* Search + Tabs bar */}
          <div className="px-4 pt-3 pb-2 space-y-3 border-b border-[#e4edf8]">
            {/* Search */}
            <div className="relative max-w-md">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar contactos, empresas..."
                className="w-full pl-9 pr-8 py-2 text-sm rounded-xl border border-slate-200 bg-white/80 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 transition-colors placeholder:text-slate-400"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-slate-100"
                >
                  <XMarkIcon className="w-3.5 h-3.5 text-slate-400" />
                </button>
              )}
            </div>

            {/* Tabs */}
            <div className="flex gap-1 p-0.5 rounded-xl bg-slate-100/80 max-w-lg">
              {tabs.map((tab) => {
                const isActive = activeView === tab.id;
                const TabIcon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveView(tab.id)}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      isActive
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <TabIcon className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* View content */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {activeView === 'dashboard' && (
              <DashboardView workspaceId={effectiveWorkspaceId} />
            )}
            {activeView === 'pipeline' && (
              <PipelineView workspaceId={effectiveWorkspaceId} />
            )}
            {activeView === 'products' && (
              <ProductsView workspaceId={effectiveWorkspaceId} />
            )}
            {activeView === 'contacts' && (
              <ContactsList
                workspaceId={effectiveWorkspaceId}
                onCreateNew={() => setShowCreateContact(true)}
              />
            )}
            {activeView === 'companies' && (
              <CompaniesList
                workspaceId={effectiveWorkspaceId}
                onCreateNew={() => setShowCreateCompany(true)}
              />
            )}
            {activeView === 'notes' && (
              <NotesView workspaceId={effectiveWorkspaceId} />
            )}
            {activeView === 'sequences' && (
              <SequenceBuilder workspaceId={effectiveWorkspaceId} />
            )}
            {activeView === 'campaigns' && (
              <CampaignBuilder workspaceId={effectiveWorkspaceId} />
            )}
            {activeView === 'forms' && (
              <FormBuilder workspaceId={effectiveWorkspaceId} />
            )}
            {activeView === 'workflows' && (
              <WorkflowsView workspaceId={effectiveWorkspaceId} />
            )}
            {activeView === 'team' && (
              <TeamActivityView workspaceId={effectiveWorkspaceId} />
            )}
          </div>
        </div>

        {/* Right panel: detail */}
        {hasDetailOpen && (
          <div className="w-[360px] shrink-0 border-l border-[#e4edf8] hidden lg:flex bg-white">
            {selectedContact && (
              <ContactDetail
                contact={selectedContact}
                workspaceId={effectiveWorkspaceId}
                onClose={() => setSelectedContact(null)}
              />
            )}
            {selectedCompany && !selectedContact && (
              <CompanyDetail
                company={selectedCompany}
                workspaceId={effectiveWorkspaceId}
                onClose={() => setSelectedCompany(null)}
              />
            )}
          </div>
        )}
      </div>

      {/* Create Contact Modal */}
      {showCreateContact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-slate-900">Nuevo contacto</h3>
              <button onClick={() => setShowCreateContact(false)} className="p-1 rounded-lg hover:bg-slate-100">
                <XMarkIcon className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <input value={newContact.first_name} onChange={(e) => setNewContact({ ...newContact, first_name: e.target.value })} placeholder="Nombre" className="px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200" />
                <input value={newContact.last_name} onChange={(e) => setNewContact({ ...newContact, last_name: e.target.value })} placeholder="Apellido" className="px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200" />
              </div>
              <input value={newContact.email} onChange={(e) => setNewContact({ ...newContact, email: e.target.value })} placeholder="Email" type="email" className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200" />
              <input value={newContact.phone} onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })} placeholder="Telefono" className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200" />
              <input value={newContact.job_title} onChange={(e) => setNewContact({ ...newContact, job_title: e.target.value })} placeholder="Cargo" className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200" />
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setShowCreateContact(false)} className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">Cancelar</button>
                <button onClick={handleCreateContact} disabled={creating} className="px-4 py-2 text-sm font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 transition-colors">{creating ? 'Creando...' : 'Crear contacto'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Company Modal */}
      {showCreateCompany && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-slate-900">Nueva empresa</h3>
              <button onClick={() => setShowCreateCompany(false)} className="p-1 rounded-lg hover:bg-slate-100">
                <XMarkIcon className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <div className="space-y-3">
              <input value={newCompany.name} onChange={(e) => setNewCompany({ ...newCompany, name: e.target.value })} placeholder="Nombre de la empresa" className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200" />
              <input value={newCompany.domain} onChange={(e) => setNewCompany({ ...newCompany, domain: e.target.value })} placeholder="Dominio (ej: empresa.com)" className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200" />
              <input value={newCompany.industry} onChange={(e) => setNewCompany({ ...newCompany, industry: e.target.value })} placeholder="Industria" className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200" />
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setShowCreateCompany(false)} className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">Cancelar</button>
                <button onClick={handleCreateCompany} disabled={creating} className="px-4 py-2 text-sm font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 transition-colors">{creating ? 'Creando...' : 'Crear empresa'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
