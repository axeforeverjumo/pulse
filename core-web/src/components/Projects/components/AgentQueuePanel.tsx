import { useMemo, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import * as Tabs from '@radix-ui/react-tabs';
import * as Tooltip from '@radix-ui/react-tooltip';
import { Loader2, RefreshCw, Sparkles, Timer, XCircle, CheckCircle2, AlertCircle } from 'lucide-react';
import { Icon } from '../../ui/Icon';
import { useProjectAgentQueue, useProcessProjectAgentQueue, useProjectBoard, useWorkspaceAgents } from '../../../hooks/queries/useProjects';
import type { ProjectAgentQueueJob } from '../../../api/client';

const ACTIVE_STATUSES: ProjectAgentQueueJob['status'][] = ['queued', 'running', 'blocked'];

const statusClassMap: Record<ProjectAgentQueueJob['status'], string> = {
  queued: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  running: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200',
  completed: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  failed: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200',
  blocked: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200',
  cancelled: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
};

const statusIcon = (status: ProjectAgentQueueJob['status']) => {
  if (status === 'running') return <Icon icon={Loader2} size={14} className="animate-spin" />;
  if (status === 'queued') return <Icon icon={Timer} size={14} />;
  if (status === 'completed') return <Icon icon={CheckCircle2} size={14} />;
  if (status === 'failed') return <Icon icon={XCircle} size={14} />;
  return <Icon icon={AlertCircle} size={14} />;
};

const formatAgo = (iso?: string) => {
  if (!iso) return 'sin fecha';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'sin fecha';
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.max(1, Math.round(diffMs / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  return `${days}d`;
};

interface AgentQueuePanelProps {
  workspaceId: string | undefined;
  workspaceAppId: string | null;
  boardId: string | null;
}

export default function AgentQueuePanel({ workspaceId, workspaceAppId, boardId }: AgentQueuePanelProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'active' | 'history'>('active');
  const { data: jobs = [], isFetching, refetch, dataUpdatedAt } = useProjectAgentQueue(
    workspaceAppId,
    boardId,
    { limit: 80, enabled: open }
  );
  const { data: boardData } = useProjectBoard(boardId);
  const { data: workspaceAgents = [] } = useWorkspaceAgents(workspaceId ?? null);
  const processMutation = useProcessProjectAgentQueue(workspaceAppId, boardId);

  const issueTitleById = useMemo(() => {
    const map = new Map<string, string>();
    (boardData?.issues || []).forEach((issue) => map.set(issue.id, issue.title));
    return map;
  }, [boardData?.issues]);

  const agentNameById = useMemo(() => {
    const map = new Map<string, string>();
    (workspaceAgents || []).forEach((agent) => map.set(agent.id, agent.name));
    return map;
  }, [workspaceAgents]);

  const counts = useMemo(() => {
    const result = {
      queued: 0,
      running: 0,
      blocked: 0,
      failed: 0,
      completed: 0,
      cancelled: 0,
      active: 0,
    };
    jobs.forEach((job) => {
      result[job.status] += 1;
      if (ACTIVE_STATUSES.includes(job.status)) result.active += 1;
    });
    return result;
  }, [jobs]);

  const activeJobs = useMemo(() => jobs.filter((job) => ACTIVE_STATUSES.includes(job.status)), [jobs]);
  const historyJobs = useMemo(
    () => jobs.filter((job) => !ACTIVE_STATUSES.includes(job.status)),
    [jobs]
  );

  if (!workspaceAppId || !boardId) return null;

  return (
    <Tooltip.Provider delayDuration={120}>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-[#d7e4f2] bg-white/75 px-2.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-white"
            title="Cola de agentes"
          >
            <Icon icon={Sparkles} size={14} />
            Cola IA
            <span className="rounded-full bg-slate-900 px-1.5 py-0.5 text-[10px] font-bold text-white">
              {counts.active}
            </span>
          </button>
        </Popover.Trigger>

        <Popover.Portal>
          <Popover.Content
            sideOffset={8}
            align="end"
            className="z-50 w-[min(92vw,430px)] overflow-hidden rounded-2xl border border-[#d8e4f2] bg-white shadow-[0_28px_70px_-26px_rgba(15,23,42,0.45)]"
          >
            <div className="flex items-center justify-between border-b border-[#e5edf7] bg-gradient-to-r from-[#f8fbff] to-[#f2f8ff] px-3 py-2.5">
              <div className="text-sm font-semibold text-slate-900">Cola de agentes</div>
              <div className="flex items-center gap-1.5">
                <Tooltip.Root>
                  <Tooltip.Trigger asChild>
                    <button
                      type="button"
                      onClick={() => refetch()}
                      className="inline-flex h-7 items-center justify-center rounded-lg border border-[#d7e4f2] bg-white px-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <Icon icon={RefreshCw} size={13} className={isFetching ? 'animate-spin' : ''} />
                    </button>
                  </Tooltip.Trigger>
                  <Tooltip.Portal>
                    <Tooltip.Content sideOffset={6} className="rounded-md bg-slate-900 px-2 py-1 text-[11px] text-white">
                      Refrescar
                    </Tooltip.Content>
                  </Tooltip.Portal>
                </Tooltip.Root>
                <button
                  type="button"
                  onClick={() => processMutation.mutate(16)}
                  disabled={processMutation.isPending}
                  className="inline-flex h-7 items-center gap-1 rounded-lg border border-[#d7e4f2] bg-white px-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {processMutation.isPending ? (
                    <>
                      <Icon icon={Loader2} size={13} className="animate-spin" />
                      Procesando
                    </>
                  ) : (
                    'Procesar ahora'
                  )}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 border-b border-[#e5edf7] px-3 py-2 text-[11px] text-slate-600">
              <div className="rounded-lg bg-slate-50 px-2 py-1">En cola: <span className="font-semibold text-slate-800">{counts.queued}</span></div>
              <div className="rounded-lg bg-slate-50 px-2 py-1">Corriendo: <span className="font-semibold text-slate-800">{counts.running}</span></div>
              <div className="rounded-lg bg-slate-50 px-2 py-1">Bloqueadas: <span className="font-semibold text-slate-800">{counts.blocked}</span></div>
            </div>

            <Tabs.Root value={tab} onValueChange={(value) => setTab(value as 'active' | 'history')}>
              <Tabs.List className="grid grid-cols-2 gap-1 border-b border-[#e5edf7] bg-[#fbfdff] p-1.5">
                <Tabs.Trigger
                  value="active"
                  className="rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-600 transition data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm"
                >
                  Activas ({activeJobs.length})
                </Tabs.Trigger>
                <Tabs.Trigger
                  value="history"
                  className="rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-600 transition data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm"
                >
                  Historial ({historyJobs.length})
                </Tabs.Trigger>
              </Tabs.List>

              <Tabs.Content value="active" className="max-h-[56vh] overflow-y-auto p-2">
                {activeJobs.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[#d7e4f2] bg-[#f8fbff] px-3 py-5 text-center text-xs text-slate-500">
                    Sin trabajos activos en este tablero.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {activeJobs.map((job) => (
                      <div key={job.id} className="rounded-xl border border-[#e4ecf7] bg-white p-2.5">
                        <div className="mb-1.5 flex items-center justify-between gap-2">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusClassMap[job.status]}`}>
                            {statusIcon(job.status)}
                            {job.status}
                          </span>
                          <span className="text-[10px] text-slate-500">hace {formatAgo(job.updated_at || job.created_at)}</span>
                        </div>
                        <div className="text-xs font-medium text-slate-800 line-clamp-2">
                          {issueTitleById.get(job.issue_id) || `Issue ${job.issue_id.slice(0, 8)}`}
                        </div>
                        <div className="mt-1 text-[11px] text-slate-500">
                          {agentNameById.get(job.agent_id) || `Agente ${job.agent_id.slice(0, 8)}`} · intento {job.attempts}/{job.max_attempts}
                        </div>
                        {job.last_error && (
                          <div className="mt-1.5 rounded-lg bg-rose-50 px-2 py-1 text-[11px] text-rose-700 line-clamp-2">
                            {job.last_error}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Tabs.Content>

              <Tabs.Content value="history" className="max-h-[56vh] overflow-y-auto p-2">
                {historyJobs.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[#d7e4f2] bg-[#f8fbff] px-3 py-5 text-center text-xs text-slate-500">
                    Todavía no hay historial para este tablero.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {historyJobs.map((job) => (
                      <div key={job.id} className="rounded-xl border border-[#e4ecf7] bg-white p-2.5">
                        <div className="mb-1.5 flex items-center justify-between gap-2">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusClassMap[job.status]}`}>
                            {statusIcon(job.status)}
                            {job.status}
                          </span>
                          <span className="text-[10px] text-slate-500">hace {formatAgo(job.updated_at || job.created_at)}</span>
                        </div>
                        <div className="text-xs font-medium text-slate-800 line-clamp-2">
                          {issueTitleById.get(job.issue_id) || `Issue ${job.issue_id.slice(0, 8)}`}
                        </div>
                        <div className="mt-1 text-[11px] text-slate-500">
                          {agentNameById.get(job.agent_id) || `Agente ${job.agent_id.slice(0, 8)}`} · intento {job.attempts}/{job.max_attempts}
                        </div>
                        {job.last_error && (
                          <div className="mt-1.5 rounded-lg bg-rose-50 px-2 py-1 text-[11px] text-rose-700 line-clamp-2">
                            {job.last_error}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Tabs.Content>
            </Tabs.Root>

            <div className="border-t border-[#e5edf7] px-3 py-2 text-[10px] text-slate-500">
              Última actualización: {dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : '—'}
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </Tooltip.Provider>
  );
}
