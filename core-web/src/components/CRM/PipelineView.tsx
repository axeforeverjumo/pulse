import { useEffect, useState, useCallback } from 'react';
import { CurrencyDollarIcon, CalendarIcon, BuildingOfficeIcon } from '@heroicons/react/24/outline';
import { toast } from 'sonner';
import { useCrmStore } from '../../stores/crmStore';
import { updateCrmOpportunity } from '../../api/client';

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

export default function PipelineView({ workspaceId }: PipelineViewProps) {
  const { opportunities, isLoading, fetchOpportunities, setSelectedOpportunity } = useCrmStore();
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  const loadOpportunities = useCallback(() => {
    fetchOpportunities(workspaceId);
  }, [workspaceId, fetchOpportunities]);

  useEffect(() => {
    loadOpportunities();
  }, [loadOpportunities]);

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
                  className={`rounded-lg border border-white/80 bg-white p-3 shadow-sm cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow ${
                    draggedId === opp.id ? 'opacity-40' : ''
                  }`}
                >
                  <p className="text-sm font-medium text-slate-800 truncate mb-1.5">{opp.name || 'Sin nombre'}</p>
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
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
