import { useState, useEffect } from 'react';
import { api } from '../../../api/client';

interface BoardStats {
  total: number;
  completed: number;
  completion_rate: number;
  overdue_count: number;
  blocked_count: number;
  by_state: { name: string; count: number; is_done: boolean }[];
  by_priority: { priority: number; count: number }[];
  by_assignee: { id: string; count: number }[];
}

const PRIORITY_LABELS: Record<number, { label: string; color: string }> = {
  0: { label: 'Sin prioridad', color: 'bg-gray-200' },
  1: { label: 'Urgente', color: 'bg-rose-500' },
  2: { label: 'Alta', color: 'bg-orange-500' },
  3: { label: 'Media', color: 'bg-amber-400' },
  4: { label: 'Baja', color: 'bg-slate-300' },
};

async function fetchBoardStats(boardId: string): Promise<BoardStats> {
  return api(`/projects/boards/${boardId}/stats`);
}

export default function ProgressView({ boardId }: { boardId: string }) {
  const [stats, setStats] = useState<BoardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchBoardStats(boardId).then(setStats).catch(() => {}).finally(() => setLoading(false));
  }, [boardId]);

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-[13px] text-gray-400">Cargando estadisticas...</div>;
  }
  if (!stats) {
    return <div className="flex items-center justify-center h-64 text-[13px] text-gray-400">Sin datos disponibles</div>;
  }

  const maxStateCount = Math.max(...stats.by_state.map(s => s.count), 1);

  return (
    <div className="p-6 space-y-8 max-w-4xl">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KPI label="Total" value={stats.total} />
        <KPI label="Completadas" value={stats.completed} accent="text-green-600" />
        <KPI label="Progreso" value={`${Math.round(stats.completion_rate * 100)}%`} accent="text-indigo-600" />
        <KPI label="Vencidas" value={stats.overdue_count} accent={stats.overdue_count > 0 ? 'text-rose-600' : undefined} />
        <KPI label="Bloqueadas" value={stats.blocked_count} accent={stats.blocked_count > 0 ? 'text-amber-600' : undefined} />
      </div>

      {/* Completion bar */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[12px] font-medium text-gray-600">Progreso general</span>
          <span className="text-[12px] text-gray-400">{stats.completed}/{stats.total}</span>
        </div>
        <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-indigo-400 rounded-full transition-all duration-500"
            style={{ width: `${stats.completion_rate * 100}%` }}
          />
        </div>
      </div>

      {/* By State */}
      <div>
        <h3 className="text-[13px] font-semibold text-gray-800 mb-3">Por estado</h3>
        <div className="space-y-2">
          {stats.by_state.map((s) => (
            <div key={s.name} className="flex items-center gap-3">
              <span className="text-[12px] text-gray-600 w-32 truncate">{s.name}</span>
              <div className="flex-1 h-6 bg-gray-50 rounded-lg overflow-hidden">
                <div
                  className={`h-full rounded-lg transition-all duration-500 ${s.is_done ? 'bg-green-400' : 'bg-indigo-400'}`}
                  style={{ width: `${(s.count / maxStateCount) * 100}%`, minWidth: s.count > 0 ? '24px' : '0' }}
                />
              </div>
              <span className="text-[12px] text-gray-500 w-8 text-right font-mono">{s.count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* By Priority */}
      <div>
        <h3 className="text-[13px] font-semibold text-gray-800 mb-3">Por prioridad</h3>
        <div className="flex gap-3 flex-wrap">
          {stats.by_priority.filter(p => p.count > 0).map((p) => {
            const cfg = PRIORITY_LABELS[p.priority] || PRIORITY_LABELS[0];
            return (
              <div key={p.priority} className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg">
                <div className={`w-3 h-3 rounded-full ${cfg.color}`} />
                <span className="text-[12px] text-gray-700">{cfg.label}</span>
                <span className="text-[12px] font-semibold text-gray-900">{p.count}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function KPI({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="px-4 py-3 bg-white border border-gray-100 rounded-xl">
      <span className="block text-[10px] font-medium text-gray-400 uppercase tracking-wide">{label}</span>
      <span className={`block text-[22px] font-bold mt-1 ${accent || 'text-gray-900'}`}>{value}</span>
    </div>
  );
}
