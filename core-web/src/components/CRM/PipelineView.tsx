import { useEffect, useState, useCallback, useRef } from 'react';
import {
  CurrencyDollarIcon,
  CalendarIcon,
  BuildingOfficeIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';
import { toast } from 'sonner';
import { useCrmStore } from '../../stores/crmStore';
import {
  updateCrmOpportunity,
  createCrmOpportunity,
  createCrmAgentTask,
  getWorkspaceOpenClawAgents,
  type OpenClawAgent,
} from '../../api/client';

const PIPELINE_STAGES = [
  { id: 'lead', label: 'Lead', dotColor: '#EF4444' },
  { id: 'qualified', label: 'Calificado', dotColor: '#3B82F6' },
  { id: 'proposal', label: 'Propuesta', dotColor: '#F59E0B' },
  { id: 'negotiation', label: 'Negociacion', dotColor: '#8B5CF6' },
  { id: 'won', label: 'Ganado', dotColor: '#10B981' },
  { id: 'lost', label: 'Perdido', dotColor: '#64748B' },
];

interface PipelineViewProps {
  workspaceId: string;
}

const CRM_TASK_TYPES = [
  { id: 'research_contact', label: 'Investigar contacto' },
  { id: 'draft_email', label: 'Redactar email' },
  { id: 'update_deal', label: 'Actualizar trato' },
  { id: 'summarize_relationship', label: 'Resumir relacion' },
  { id: 'custom', label: 'Tarea personalizada' },
];

function AgentAssignMenu({
  opportunityId,
  workspaceId,
  agents,
  onClose,
  onAssigned,
}: {
  opportunityId: string;
  workspaceId: string;
  agents: OpenClawAgent[];
  onClose: () => void;
  onAssigned: () => void;
}) {
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState('research_contact');
  const [instructions, setInstructions] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const handleSubmit = async () => {
    if (!selectedAgent) return;
    setIsSubmitting(true);
    try {
      await createCrmAgentTask({
        workspace_id: workspaceId,
        agent_id: selectedAgent,
        task_type: selectedTask,
        opportunity_id: opportunityId,
        instructions: instructions || undefined,
      });
      toast.success('Tarea de agente creada');
      onAssigned();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Error al asignar agente');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      ref={menuRef}
      onClick={(e) => e.stopPropagation()}
      className="absolute right-0 top-full mt-1 z-50 w-64 bg-white rounded-xl shadow-lg border border-gray-100 p-3 space-y-2.5"
    >
      <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Asignar agente</p>

      {/* Agent select */}
      <div className="space-y-1">
        {agents.map((agent) => (
          <button
            key={agent.id}
            type="button"
            onClick={() => setSelectedAgent(agent.id)}
            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[12px] transition-colors ${
              selectedAgent === agent.id ? 'bg-violet-50 text-violet-700' : 'hover:bg-gray-50 text-gray-700'
            }`}
          >
            <div className="w-5 h-5 rounded-full flex items-center justify-center bg-gradient-to-br from-violet-500 to-indigo-600 shrink-0">
              {agent.avatar_url ? (
                <img src={agent.avatar_url} alt={agent.name} className="w-full h-full rounded-full object-cover" />
              ) : (
                <span className="text-[9px] font-medium text-white">{agent.name.slice(0, 2).toUpperCase()}</span>
              )}
            </div>
            <span className="truncate">{agent.name}</span>
          </button>
        ))}
        {agents.length === 0 && (
          <p className="text-[11px] text-gray-400 text-center py-2">No hay agentes disponibles</p>
        )}
      </div>

      {/* Task type */}
      {selectedAgent && (
        <>
          <select
            value={selectedTask}
            onChange={(e) => setSelectedTask(e.target.value)}
            className="w-full text-[12px] border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-300"
          >
            {CRM_TASK_TYPES.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>

          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Instrucciones (opcional)..."
            rows={2}
            className="w-full text-[12px] border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-300 resize-none"
          />

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="w-full text-[12px] font-medium text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50 rounded-lg px-3 py-1.5 transition-colors"
          >
            {isSubmitting ? 'Creando...' : 'Crear tarea'}
          </button>
        </>
      )}
    </div>
  );
}

/** Inline form to add a new opportunity card to a pipeline column */
function AddCardForm({
  stageId,
  workspaceId,
  companies,
  contacts,
  onCreated,
  onCancel,
}: {
  stageId: string;
  workspaceId: string;
  companies: any[];
  contacts: any[];
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [contactId, setContactId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setIsSubmitting(true);
    try {
      await createCrmOpportunity({
        workspace_id: workspaceId,
        name: name.trim(),
        stage: stageId,
        ...(amount && { amount: Number(amount) }),
        ...(companyId && { company_id: companyId }),
        ...(contactId && { contact_id: contactId }),
      });
      toast.success('Oportunidad creada');
      onCreated();
    } catch (err: any) {
      toast.error(err.message || 'Error al crear oportunidad');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <div className="mt-2 p-4 bg-white rounded-lg border border-gray-100 shadow-sm">
      <input
        type="text"
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Nombre de la oportunidad..."
        className="w-full px-0 py-1 font-medium text-[13px] text-gray-900 placeholder:text-gray-400 placeholder:font-normal bg-transparent border-0 focus:outline-none focus:ring-0"
      />
      <input
        type="number"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="Monto (opcional)"
        className="w-full mt-2 px-0 py-1 text-[12px] text-gray-700 placeholder:text-gray-400 bg-transparent border-0 focus:outline-none focus:ring-0"
      />

      <div className="flex flex-col gap-2 mt-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {companies.length > 0 && (
            <select
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              className="text-[11px] text-gray-500 bg-gray-50 border border-gray-200 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-gray-300"
            >
              <option value="">Empresa</option>
              {companies.map((c: any) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}
          {contacts.length > 0 && (
            <select
              value={contactId}
              onChange={(e) => setContactId(e.target.value)}
              className="text-[11px] text-gray-500 bg-gray-50 border border-gray-200 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-gray-300"
            >
              <option value="">Contacto</option>
              {contacts.map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.first_name} {c.last_name}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-[12px] text-gray-500 hover:text-gray-700 font-medium transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!name.trim() || isSubmitting}
            className="px-3 py-1.5 text-[12px] bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {isSubmitting ? 'Creando...' : 'Crear'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PipelineView({ workspaceId }: PipelineViewProps) {
  const { opportunities, companies, contacts, isLoading, fetchOpportunities, fetchCompanies, fetchContacts, setSelectedOpportunity } = useCrmStore();
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [agentMenuOppId, setAgentMenuOppId] = useState<string | null>(null);
  const [addingCardStage, setAddingCardStage] = useState<string | null>(null);
  const [agents, setAgents] = useState<OpenClawAgent[]>([]);

  const loadOpportunities = useCallback(() => {
    fetchOpportunities(workspaceId);
  }, [workspaceId, fetchOpportunities]);

  useEffect(() => {
    loadOpportunities();
  }, [loadOpportunities]);

  // Fetch companies and contacts for the add-card dropdowns
  useEffect(() => {
    if (!workspaceId) return;
    fetchCompanies(workspaceId);
    fetchContacts(workspaceId);
  }, [workspaceId, fetchCompanies, fetchContacts]);

  // Fetch workspace agents
  useEffect(() => {
    if (!workspaceId) return;
    getWorkspaceOpenClawAgents(workspaceId)
      .then((res) => setAgents(res.agents || []))
      .catch(() => {});
  }, [workspaceId]);

  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
    setDraggedId(id);
  };

  const handleDragOver = (e: React.DragEvent, stageId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverStage(stageId);
  };

  const handleDragLeave = () => {
    setDragOverStage(null);
  };

  const handleDrop = async (e: React.DragEvent, stageId: string) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    setDraggedId(null);
    setDragOverStage(null);

    const opp = opportunities.find((o: any) => o.id === id);
    if (!opp || opp.stage === stageId) return;

    try {
      await updateCrmOpportunity(id, { stage: stageId });
      toast.success(`Movido a ${PIPELINE_STAGES.find((s) => s.id === stageId)?.label || stageId}`);
      fetchOpportunities(workspaceId);
    } catch (err: any) {
      toast.error(err.message || 'Error al mover oportunidad');
    }
  };

  const getOpportunitiesForStage = (stageId: string) =>
    opportunities.filter((o: any) => o.stage === stageId);

  const getStageTotal = (stageId: string) =>
    getOpportunitiesForStage(stageId).reduce((sum: number, o: any) => sum + (Number(o.amount) || 0), 0);

  if (isLoading && opportunities.length === 0) {
    return (
      <div className="flex gap-2 p-2 overflow-x-auto h-full">
        {PIPELINE_STAGES.map((stage) => (
          <div key={stage.id} className="w-80 shrink-0 rounded-md bg-[#F9F9F9] p-2 animate-pulse">
            <div className="h-4 w-20 bg-slate-200 rounded mb-3 mx-2 mt-2" />
            <div className="space-y-2 px-2">
              <div className="h-20 bg-slate-200/60 rounded-lg" />
              <div className="h-20 bg-slate-200/40 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 h-full overflow-auto px-2 pt-2 pb-8">
      <div className="grid grid-flow-col auto-cols-max gap-2">
        {PIPELINE_STAGES.map((stage) => {
          const stageOpps = getOpportunitiesForStage(stage.id);
          const total = getStageTotal(stage.id);
          const isDragOver = dragOverStage === stage.id;

          return (
            <div
              key={stage.id}
              className="w-80 h-full flex-shrink-0 flex flex-col"
            >
              {/* Column wrapper with background - matching Projects KanbanColumn */}
              <div
                onDragOver={(e) => handleDragOver(e, stage.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, stage.id)}
                className={`flex-1 flex flex-col rounded-md px-2 pt-2 pb-2 transition-colors duration-200 ${
                  isDragOver ? 'bg-[#F0F1F3] ring-2 ring-blue-300 ring-offset-1' : 'bg-[#F9F9F9]'
                }`}
              >
                {/* Column Header - matching Projects style with colored dot */}
                <div className="shrink-0 pb-4 flex items-center justify-between px-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: stage.dotColor }}
                    />
                    <h3 className="font-medium text-[13px] text-gray-900 truncate">
                      {stage.label}
                    </h3>
                    <span className="text-[12px] text-gray-400 font-normal shrink-0">
                      {stageOpps.length}
                    </span>
                  </div>
                  {total > 0 && (
                    <span className="text-[11px] font-medium text-gray-500 tabular-nums shrink-0">
                      ${total.toLocaleString()}
                    </span>
                  )}
                </div>

                {/* Cards */}
                <div className="flex-1 min-h-[100px]">
                  {stageOpps.map((opp: any) => (
                    <div
                      key={opp.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, opp.id)}
                      onClick={() => setSelectedOpportunity(opp)}
                      className={`group relative bg-white px-4 py-3 rounded-lg mb-2 cursor-default active:cursor-grabbing hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)] border border-gray-100/60 transition-[box-shadow,opacity] duration-200 ease-out ${
                        draggedId === opp.id ? 'opacity-30' : ''
                      }`}
                    >
                      {/* Title + Score + Agent button */}
                      <div className="flex items-start justify-between gap-1 mb-3">
                        <div className="flex items-center gap-1.5 flex-1 min-w-0">
                          <h4 className="font-medium text-[13px] text-gray-900 leading-snug line-clamp-2 flex-1">
                            {opp.name || 'Sin nombre'}
                          </h4>
                          {opp.lead_score > 0 && (
                            <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                              opp.lead_score >= 70 ? 'bg-emerald-100 text-emerald-700' :
                              opp.lead_score >= 40 ? 'bg-amber-100 text-amber-700' :
                              'bg-red-100 text-red-700'
                            }`}>{opp.lead_score}</span>
                          )}
                        </div>
                        {/* Agent assign button */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setAgentMenuOppId(agentMenuOppId === opp.id ? null : opp.id);
                          }}
                          title="Asignar agente IA"
                          className={`shrink-0 p-1 rounded-md transition-colors ${
                            opp.assigned_agent_id
                              ? 'text-violet-600 bg-violet-50 hover:bg-violet-100'
                              : 'text-gray-300 hover:text-violet-600 hover:bg-violet-50 opacity-0 group-hover:opacity-100'
                          }`}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="11" width="18" height="10" rx="2" />
                            <circle cx="12" cy="5" r="4" />
                          </svg>
                        </button>
                      </div>

                      {/* Agent status badge */}
                      {opp.agent_status && (
                        <div className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium mb-2 ${
                          opp.agent_status === 'working' ? 'bg-amber-50 text-amber-700' :
                          opp.agent_status === 'done' ? 'bg-green-50 text-green-700' :
                          opp.agent_status === 'failed' ? 'bg-red-50 text-red-700' :
                          'bg-violet-50 text-violet-700'
                        }`}>
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="11" width="18" height="10" rx="2" />
                            <circle cx="12" cy="5" r="4" />
                          </svg>
                          {opp.agent_status === 'pending' ? 'Pendiente' :
                           opp.agent_status === 'working' ? 'Trabajando' :
                           opp.agent_status === 'done' ? 'Completado' : 'Error'}
                        </div>
                      )}

                      {/* Metadata row - matching Projects card style */}
                      <div className="flex items-center gap-1 -ml-1">
                        {opp.amount && (
                          <span className="flex items-center gap-1 min-h-[28px] px-1.5 rounded-md text-[11px] font-medium text-emerald-600 bg-emerald-50">
                            <CurrencyDollarIcon className="w-3.5 h-3.5" />
                            ${Number(opp.amount).toLocaleString()}
                          </span>
                        )}
                        {opp.company_name && (
                          <span className="flex items-center gap-1 min-h-[28px] px-1.5 rounded-md text-[11px] text-gray-500 hover:bg-gray-50">
                            <BuildingOfficeIcon className="w-3.5 h-3.5 text-gray-400" />
                            <span className="truncate max-w-[80px]">{opp.company_name}</span>
                          </span>
                        )}
                        {opp.close_date && (
                          <span className="flex items-center gap-1 min-h-[28px] px-1.5 rounded-md text-[11px] text-gray-500 hover:bg-gray-50 ml-auto">
                            <CalendarIcon className="w-3.5 h-3.5 text-gray-400" />
                            {new Date(opp.close_date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                          </span>
                        )}
                      </div>

                      {/* Agent assignment menu */}
                      {agentMenuOppId === opp.id && (
                        <AgentAssignMenu
                          opportunityId={opp.id}
                          workspaceId={workspaceId}
                          agents={agents}
                          onClose={() => setAgentMenuOppId(null)}
                          onAssigned={() => fetchOpportunities(workspaceId)}
                        />
                      )}
                    </div>
                  ))}
                </div>

                {/* Add Card Form or Button - matching Projects "Anadir tarjeta" */}
                {addingCardStage === stage.id ? (
                  <AddCardForm
                    stageId={stage.id}
                    workspaceId={workspaceId}
                    companies={companies}
                    contacts={contacts}
                    onCreated={() => {
                      setAddingCardStage(null);
                      fetchOpportunities(workspaceId);
                    }}
                    onCancel={() => setAddingCardStage(null)}
                  />
                ) : (
                  <button
                    onClick={() => setAddingCardStage(stage.id)}
                    className="w-full mt-2 py-3 text-[13px] text-gray-400 hover:text-gray-600 rounded-lg flex items-center justify-center gap-1.5 transition-colors duration-200 hover:bg-white/60"
                  >
                    <PlusIcon className="w-4 h-4 stroke-2" />
                    <span>Anadir tarjeta</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
