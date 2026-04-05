import { useEffect, useCallback } from 'react';
import { ClockIcon } from '@heroicons/react/24/outline';
import { useCrmStore } from '../../stores/crmStore';

const STATUS_STYLES: Record<string, { label: string; classes: string }> = {
  running: { label: 'Ejecutando', classes: 'bg-blue-50 text-blue-700' },
  waiting: { label: 'Esperando', classes: 'bg-amber-50 text-amber-700' },
  completed: { label: 'Completado', classes: 'bg-green-50 text-green-700' },
  failed: { label: 'Error', classes: 'bg-red-50 text-red-700' },
  cancelled: { label: 'Cancelado', classes: 'bg-slate-100 text-slate-500' },
};

interface WorkflowRunsListProps {
  workspaceId: string;
}

export default function WorkflowRunsList({ workspaceId }: WorkflowRunsListProps) {
  const { workflowRuns, fetchWorkflowRuns } = useCrmStore();

  const load = useCallback(() => {
    fetchWorkflowRuns(workspaceId);
  }, [workspaceId, fetchWorkflowRuns]);

  useEffect(() => {
    load();
  }, [load]);

  if (workflowRuns.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <ClockIcon className="w-8 h-8 text-slate-300 mb-2" />
        <p className="text-[12px] text-slate-400">Sin ejecuciones recientes</p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {workflowRuns.map((run: any) => {
        const statusInfo = STATUS_STYLES[run.status] || STATUS_STYLES.cancelled;
        const workflowName = run.crm_workflows?.name || 'Workflow';

        return (
          <div
            key={run.id}
            className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white border border-slate-100 hover:shadow-sm transition-shadow"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-medium text-slate-800 truncate">
                  {workflowName}
                </span>
                <span className={`inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-medium ${statusInfo.classes}`}>
                  {statusInfo.label}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                {run.started_at && (
                  <span>
                    {new Date(run.started_at).toLocaleDateString('es-ES', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                )}
                {run.current_step !== undefined && (
                  <span>Paso {run.current_step}</span>
                )}
              </div>
            </div>
            {run.error_message && (
              <span className="text-[10px] text-red-500 truncate max-w-[120px]" title={run.error_message}>
                {run.error_message}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
