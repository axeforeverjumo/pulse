import { useEffect, useState, useCallback, useRef } from 'react';
import { CurrencyDollarIcon, CalendarIcon, BuildingOfficeIcon } from '@heroicons/react/24/outline';
import { toast } from 'sonner';
import { useCrmStore } from '../../stores/crmStore';
import { updateCrmOpportunity, createCrmAgentTask, getWorkspaceOpenClawAgents, type OpenClawAgent } from '../../api/client';

const PIPELINE_STAGES = [
  { id: 'lead', label: 'Lead', color: 'bg-slate-100 border-slate-200' },
  { id: 'qualified', label: 'Calificado', color: 'bg-blue-50 border-blue-200' },
  { id: 'proposal', label: 'Propuesta', color: 'bg-amber-50 border-amber-200' },
  { id: 'negotiation', label: 'Negociacion', color: 'bg-purple-50 border-purple-200' },
  { id: 'won', label: 'Ganado', color: 'bg-green-50 border-green-200' },
  { id: 'lost', label: 'Perdido', color: 'bg-red-50 border-red-200' },
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

export default function PipelineView({ workspaceId }: PipelineViewProps) {
  const { opportunities, isLoading, fetchOpportunities, setSelectedOpportunity } = useCrmStore();
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [agentMenuOppId, setAgentMenuOppId] = useState<string | null>(null);
  const [agents, setAgents] = useState<OpenClawAgent[]>([]);

  const loadOpportunities = useCallback(() => {
    fetchOpportunities(workspaceId);
  }, [workspaceId, fetchOpportunities]);

  useEffect(() => {
    loadOpportunities();
  }, [loadOpportunities]);

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
      <div className="flex gap-3 p-4 overflow-x-auto h-full">
        {PIPELINE_STAGES.map((stage) => (
          <div key={stage.id} className="w-64 shrink-0 rounded-xl border border-slate-200 bg-slate-50/50 p-3 animate-pulse">
            <div className="h-4 w-20 bg-slate-200 rounded mb-3" />
            <div className="space-y-2">
              <div className="h-20 bg-slate-200/60 rounded-lg" />
              <div className="h-20 bg-slate-200/40 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-3 p-4 overflow-x-auto h-full">
      {PIPELINE_STAGES.map((stage) => {
        const stageOpps = getOpportunitiesForStage(stage.id);
        const total = getStageTotal(stage.id);
        const isDragOver = dragOverStage === stage.id;

        return (
          <div
            key={stage.id}
            onDragOver={(e) => handleDragOver(e, stage.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, stage.id)}
            className={`w-64 shrink-0 rounded-xl border p-3 transition-colors flex flex-col ${stage.color} ${
              isDragOver ? 'ring-2 ring-blue-400 ring-offset-1' : ''
            }`}
          >
            {/* Column header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5">
                <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">{stage.label}</h4>
                <span className="text-xs text-slate-400 bg-white/80 px-1.5 py-0.5 rounded-full">{stageOpps.length}</span>
              </div>
              {total > 0 && (
                <span className="text-xs font-medium text-slate-600">
                  ${total.toLocaleString()}
                </span>
              )}
            </div>

            {/* Cards */}
            <div className="flex-1 space-y-2 min-h-[100px]">
              {stageOpps.map((opp: any) => (
                <div
                  key={opp.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, opp.id)}
                  onClick={() => setSelectedOpportunity(opp)}
                  className={`relative rounded-lg border border-white/80 bg-white p-3 shadow-sm cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow ${
                    draggedId === opp.id ? 'opacity-40' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-1">
                    <p className="text-sm font-medium text-slate-800 truncate mb-1.5 flex-1">{opp.name || 'Sin nombre'}</p>
                    {/* Agent assign button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setAgentMenuOppId(agentMenuOppId === opp.id ? null : opp.id);
                      }}
                      title="Asignar agente IA"
                      className={`shrink-0 p-0.5 rounded-md transition-colors ${
                        opp.assigned_agent_id
                          ? 'text-violet-600 bg-violet-50 hover:bg-violet-100'
                          : 'text-slate-400 hover:text-violet-600 hover:bg-violet-50'
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
                    <div className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium mb-1 ${
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

                  <div className="space-y-1">
                    {opp.amount && (
                      <div className="flex items-center gap-1.5 text-xs text-slate-600">
                        <CurrencyDollarIcon className="w-3.5 h-3.5 text-slate-400" />
                        ${Number(opp.amount).toLocaleString()}
                      </div>
                    )}
                    {opp.company_name && (
                      <div className="flex items-center gap-1.5 text-xs text-slate-500">
                        <BuildingOfficeIcon className="w-3.5 h-3.5 text-slate-400" />
                        <span className="truncate">{opp.company_name}</span>
                      </div>
                    )}
                    {opp.close_date && (
                      <div className="flex items-center gap-1.5 text-xs text-slate-500">
                        <CalendarIcon className="w-3.5 h-3.5 text-slate-400" />
                        {new Date(opp.close_date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                      </div>
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
          </div>
        );
      })}
    </div>
  );
}
