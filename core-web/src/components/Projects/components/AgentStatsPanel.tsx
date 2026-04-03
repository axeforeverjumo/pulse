import { useBoardAgentStats } from '../../../hooks/queries/useProjects';

interface AgentStatsPanelProps {
  boardId: string | null;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function formatJobDuration(ms: number | undefined): string {
  if (!ms) return '-';
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
}

const statusIcon: Record<string, string> = {
  completed: '\u2705',
  running: '\u23F3',
  failed: '\u274C',
  queued: '\u23F8\uFE0F',
  blocked: '\u26D4',
  cancelled: '\u23F9\uFE0F',
};

export default function AgentStatsPanel({ boardId }: AgentStatsPanelProps) {
  const { data, isLoading, isError } = useBoardAgentStats(boardId);

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-gray-50 rounded-lg p-4 h-[72px]" />
          ))}
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-gray-50 rounded-lg h-10" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="text-center py-8 text-sm text-gray-400">
        No se pudieron cargar las estadísticas de agentes.
      </div>
    );
  }

  if (data.total_tasks === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-gray-400">
          No hay tareas de agentes registradas todavía.
        </p>
      </div>
    );
  }

  const stats = [
    { label: 'Tareas', value: data.total_tasks },
    { label: 'Turnos', value: data.total_turns },
    { label: 'Tiempo total', value: formatDuration(data.total_duration_ms) },
  ];

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-3 text-center"
          >
            <div className="text-xl font-semibold text-gray-900 leading-tight">
              {stat.value}
            </div>
            <div className="text-[11px] text-gray-500 mt-0.5">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Cost badge */}
      {data.total_cost_usd > 0 && (
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" />
          Coste total: ${data.total_cost_usd.toFixed(2)} USD
        </div>
      )}

      {/* Recent Jobs */}
      {data.jobs.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-gray-500 mb-2">
            Historial reciente
          </h4>
          <div className="space-y-1">
            {data.jobs.map((job, i) => (
              <div
                key={`${job.created_at}-${i}`}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-gray-50 transition-colors text-[13px]"
              >
                <span className="flex-shrink-0 text-sm">
                  {statusIcon[job.status] || '\u2753'}
                </span>
                <span className="flex-1 truncate text-gray-700">
                  {job.issue_title || 'Tarea sin título'}
                </span>
                {job.payload?.turns != null && (
                  <span className="flex-shrink-0 text-xs text-gray-400">
                    {String(job.payload.turns)} turnos
                  </span>
                )}
                {job.payload?.duration_ms != null && (
                  <span className="flex-shrink-0 text-xs text-gray-400 w-14 text-right">
                    {formatJobDuration(job.payload.duration_ms as number)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
