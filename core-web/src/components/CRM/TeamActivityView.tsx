import { useEffect, useState, useCallback } from 'react';
import { UsersIcon } from '@heroicons/react/24/outline';
import { getCrmTeamActivity } from '../../api/client';

interface TeamActivityViewProps {
  workspaceId: string;
}

export default function TeamActivityView({ workspaceId }: TeamActivityViewProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);

  const fetchData = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const result = await getCrmTeamActivity(workspaceId, days);
      setData(result);
    } catch {}
    setLoading(false);
  }, [workspaceId, days]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!data || !data.team?.length) {
    return (
      <div className="flex flex-col items-center justify-center p-12 gap-3">
        <UsersIcon className="w-8 h-8 text-slate-300" />
        <p className="text-sm text-slate-400">Sin actividad en los últimos {days} días</p>
      </div>
    );
  }

  return (
    <div className="p-5 space-y-4 overflow-y-auto">
      {/* Period selector */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
          <UsersIcon className="w-4 h-4 text-slate-500" />
          Actividad del equipo
        </h3>
        <div className="flex gap-1">
          {[7, 14, 30].map((d) => (
            <button key={d} onClick={() => setDays(d)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-lg transition-colors ${days === d ? 'bg-blue-100 text-blue-700' : 'text-slate-500 hover:bg-slate-100'}`}>
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-3 text-center">
          <div className="text-lg font-bold text-slate-900">{data.team.length}</div>
          <div className="text-[10px] text-slate-400">Miembros activos</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-3 text-center">
          <div className="text-lg font-bold text-slate-900">{data.total_events}</div>
          <div className="text-[10px] text-slate-400">Eventos totales</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-3 text-center">
          <div className="text-lg font-bold text-slate-900">{data.team.reduce((s: number, t: any) => s + (t.deals_touched || 0), 0)}</div>
          <div className="text-[10px] text-slate-400">Deals tocados</div>
        </div>
      </div>

      {/* Leaderboard */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="text-left text-[11px] font-semibold text-slate-500 px-4 py-2.5">#</th>
              <th className="text-left text-[11px] font-semibold text-slate-500 px-4 py-2.5">Usuario</th>
              <th className="text-right text-[11px] font-semibold text-slate-500 px-4 py-2.5">Eventos</th>
              <th className="text-right text-[11px] font-semibold text-slate-500 px-4 py-2.5">Deals</th>
              <th className="text-left text-[11px] font-semibold text-slate-500 px-4 py-2.5">Actividad</th>
            </tr>
          </thead>
          <tbody>
            {data.team.map((member: any, i: number) => {
              const maxEvents = data.team[0]?.total_events || 1;
              const barWidth = (member.total_events / maxEvents) * 100;
              return (
                <tr key={member.user_id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                  <td className="px-4 py-2.5 text-xs text-slate-400 font-medium">{i + 1}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-400 to-violet-500 flex items-center justify-center text-[10px] font-bold text-white">
                        {(member.user_id || '?').substring(0, 2).toUpperCase()}
                      </div>
                      <span className="text-xs font-medium text-slate-700 truncate max-w-[120px]">{member.user_id.substring(0, 8)}...</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span className="text-xs font-semibold text-slate-900">{member.total_events}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span className="text-xs font-medium text-slate-600">{member.deals_touched}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-blue-400 to-violet-500 rounded-full transition-all" style={{ width: `${barWidth}%` }} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
