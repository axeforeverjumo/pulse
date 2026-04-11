import { useState, useEffect, useMemo } from "react";
import { getMarketingTasks, getMarketingProjectMembers } from "../../../api/client";

interface Props {
  project: any;
  workspaceId: string;
}

export default function CargaTab({ project, workspaceId }: Props) {
  const [tasks, setTasks] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [project.id]);

  async function loadData() {
    try {
      const [tasksData, membersData] = await Promise.all([
        getMarketingTasks(project.site_id || project.id, {}),
        getMarketingProjectMembers(project.id),
      ]);
      setTasks(tasksData.tasks || []);
      setMembers(membersData || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  const activeTasks = tasks.filter((t) => t.status !== "done");
  const totalActive = activeTasks.length;
  const inProgress = tasks.filter((t) => t.status === "in_progress").length;
  const urgent = tasks.filter((t) => t.priority === 4).length;

  // Build member workload — if no members, group by assigned_agent
  const workload = useMemo(() => {
    const map: Record<string, { name: string; color: string; tasks: any[]; maxTasks: number }> = {};

    if (members.length > 0) {
      members.forEach((m) => {
        const key = m.user_id || m.agent_slug || m.id;
        map[key] = {
          name: m.display_name || m.agent_slug || "Miembro",
          color: m.avatar_color || "#5b7fff",
          tasks: [],
          maxTasks: m.max_tasks || 10,
        };
      });
    }

    // Also add from task assignments
    tasks.forEach((t) => {
      const key = t.assigned_agent || t.assigned_to || "unassigned";
      if (!map[key]) {
        map[key] = {
          name: t.assigned_agent || "Sin asignar",
          color: "#94a3b8",
          tasks: [],
          maxTasks: 10,
        };
      }
      map[key].tasks.push(t);
    });

    return Object.values(map).sort((a, b) => {
      const capA = (a.tasks.filter((t) => t.status !== "done").length / a.maxTasks) * 100;
      const capB = (b.tasks.filter((t) => t.status !== "done").length / b.maxTasks) * 100;
      return capB - capA;
    });
  }, [tasks, members]);

  const avgCapacity = workload.length > 0
    ? Math.round(
        workload.reduce((acc, w) => {
          return acc + (w.tasks.filter((t) => t.status !== "done").length / w.maxTasks) * 100;
        }, 0) / workload.length
      )
    : 0;

  if (loading) {
    return <div className="flex items-center justify-center h-full text-slate-400 text-sm">Cargando capacidad...</div>;
  }

  return (
    <div className="flex flex-col h-full overflow-auto p-5">
      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        <KpiCard label="Tareas activas" value={totalActive} color="text-blue-600" sub="sin contar hecho" />
        <KpiCard label="En curso" value={inProgress} color="text-amber-500" sub="esta semana" />
        <KpiCard label="Urgentes" value={urgent} color="text-red-500" sub="requieren accion" />
        <KpiCard label="Cap. media" value={`${avgCapacity}%`} color={avgCapacity > 75 ? "text-red-500" : "text-green-500"} sub="del equipo" />
      </div>

      {/* Team cards */}
      <h4 className="text-[9px] font-bold tracking-[0.12em] uppercase text-slate-400 mb-3">
        Carga por persona
      </h4>
      <div className="grid grid-cols-2 gap-3">
        {workload.map((member) => {
          const activeMemberTasks = member.tasks.filter((t) => t.status !== "done");
          const capacity = Math.round((activeMemberTasks.length / member.maxTasks) * 100);
          const capColor = capacity > 80 ? "#ef4444" : capacity > 60 ? "#f5a623" : "#1ec97e";

          return (
            <div key={member.name} className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold text-white"
                  style={{ backgroundColor: member.color }}
                >
                  {member.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1">
                  <div className="text-[12px] font-bold text-slate-700">{member.name}</div>
                  <div className="text-[10px] text-slate-400">
                    {activeMemberTasks.length} tareas activas
                  </div>
                </div>
                <div className="text-base font-bold" style={{ color: capColor }}>
                  {capacity}%
                </div>
              </div>

              {/* Capacity bar */}
              <div className="h-1 bg-slate-100 rounded-full overflow-hidden mb-3">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(capacity, 100)}%`, backgroundColor: capColor }}
                />
              </div>

              {/* Task list */}
              <div className="space-y-1.5">
                {member.tasks.slice(0, 4).map((t) => {
                  const isDone = t.status === "done";
                  const isUrgent = t.priority === 4;
                  return (
                    <div
                      key={t.id}
                      className="flex items-center gap-2 text-[11px] px-2 py-1.5 rounded-md border border-slate-100 bg-slate-50/50"
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: isUrgent ? "#ef4444" : isDone ? "#1ec97e" : "#5b7fff" }}
                      />
                      <span className="flex-1 truncate text-slate-600">{t.title}</span>
                      <span className={`text-[9px] ${isDone ? "text-green-500" : isUrgent ? "text-red-500" : "text-slate-400"}`}>
                        {isDone ? "✓" : t.status}
                      </span>
                    </div>
                  );
                })}
                {member.tasks.length > 4 && (
                  <div className="text-[9px] text-slate-300 px-2">+{member.tasks.length - 4} mas</div>
                )}
              </div>
            </div>
          );
        })}

        {workload.length === 0 && (
          <div className="col-span-2 text-center text-slate-400 py-10 text-sm">
            Sin miembros asignados al proyecto
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({ label, value, color, sub }: { label: string; value: string | number; color: string; sub: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3.5">
      <div className="text-[9.5px] text-slate-400 mb-1.5">{label}</div>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      <div className="text-[9px] text-slate-300 mt-1">{sub}</div>
    </div>
  );
}
