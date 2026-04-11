import { useState, useEffect, useMemo } from "react";
import { getMarketingTasks } from "../../../api/client";

const TYPE_COLORS: Record<string, string> = {
  seo: "rgba(91,127,255,.7)",
  ads: "rgba(245,166,35,.7)",
  content: "rgba(232,121,160,.7)",
  links: "rgba(30,201,126,.7)",
  social: "rgba(236,72,153,.7)",
  technical: "rgba(148,163,184,.7)",
};

interface Props {
  project: any;
  workspaceId: string;
}

export default function GanttTab({ project, workspaceId }: Props) {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTasks();
  }, [project.id]);

  async function loadTasks() {
    try {
      const data = await getMarketingTasks(project.site_id || project.id, {});
      setTasks(data.tasks || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  // Generate 21 days centered on today
  const today = new Date();
  const days = useMemo(() => {
    const result = [];
    for (let i = -5; i < 16; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      result.push(d);
    }
    return result;
  }, []);

  const dayWidth = 44;
  const rowHeight = 44;

  // Only tasks with dates
  const ganttTasks = tasks.filter((t) => t.due_at || t.start_date || t.end_date);
  const allTasks = ganttTasks.length > 0 ? ganttTasks : tasks.slice(0, 8); // show all if none have dates

  if (loading) {
    return <div className="flex items-center justify-center h-full text-slate-400 text-sm">Cargando Gantt...</div>;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex flex-1 overflow-hidden">
        {/* Labels */}
        <div className="w-44 flex-shrink-0 border-r border-[#e4edf8]">
          <div className="h-9 border-b border-[#e4edf8] flex items-center px-3">
            <span className="text-[8.5px] font-bold tracking-[0.1em] uppercase text-slate-400">Tarea</span>
          </div>
          <div className="overflow-y-auto">
            {allTasks.map((task) => {
              const cat = task.category || "seo";
              return (
                <div key={task.id} className="h-11 flex flex-col justify-center px-3 border-b border-[#e4edf8] hover:bg-slate-50/50">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="text-[8px] font-bold uppercase px-1 py-0.5 rounded"
                      style={{
                        backgroundColor: `${TYPE_COLORS[cat] || "rgba(148,163,184,.2)"}`.replace(/[\d.]+\)$/, "0.15)"),
                        color: TYPE_COLORS[cat]?.replace(/[\d.]+\)$/, "1)") || "#94a3b8",
                      }}
                    >
                      {cat}
                    </span>
                    <span className="text-[11px] font-medium text-slate-600 truncate">{task.title}</span>
                  </div>
                  <div className="text-[9px] text-slate-400 mt-0.5 truncate">
                    {task.assigned_agent || "Sin asignar"} · {task.status}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Chart */}
        <div className="flex-1 overflow-x-auto overflow-y-auto">
          <div style={{ width: days.length * dayWidth, position: "relative" }}>
            {/* Header */}
            <div className="flex h-9 border-b border-[#e4edf8] sticky top-0 bg-white z-10">
              {days.map((d, i) => {
                const isToday = d.toDateString() === today.toDateString();
                const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                return (
                  <div
                    key={i}
                    className={`flex flex-col items-center justify-center border-r border-slate-100 ${
                      isToday ? "bg-blue-50" : isWeekend ? "opacity-40" : ""
                    }`}
                    style={{ width: dayWidth }}
                  >
                    <span className={`text-[11px] font-bold ${isToday ? "text-blue-500" : "text-slate-400"}`}>
                      {d.getDate()}
                    </span>
                    <span className="text-[7.5px] uppercase text-slate-300 tracking-wider">
                      {d.toLocaleDateString("es-ES", { weekday: "short" }).slice(0, 2)}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Today line */}
            {(() => {
              const todayIdx = days.findIndex((d) => d.toDateString() === today.toDateString());
              if (todayIdx < 0) return null;
              return (
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-blue-500/50 z-20 pointer-events-none"
                  style={{ left: todayIdx * dayWidth + dayWidth / 2 }}
                />
              );
            })()}

            {/* Rows */}
            {allTasks.map((task, ri) => {
              const cat = task.category || "seo";
              const barColor = TYPE_COLORS[cat] || "rgba(148,163,184,.6)";

              // Calculate bar position
              let startIdx = 2; // default
              let barWidth = 5; // default 5 days
              if (task.start_date || task.due_at) {
                const start = new Date(task.start_date || task.due_at);
                start.setDate(start.getDate() - (task.start_date ? 0 : 3));
                const end = new Date(task.due_at || task.end_date || task.start_date);
                startIdx = Math.max(0, days.findIndex((d) => d.toDateString() === start.toDateString()));
                if (startIdx === -1) startIdx = 0;
                const endIdx = days.findIndex((d) => d.toDateString() === end.toDateString());
                barWidth = endIdx >= startIdx ? endIdx - startIdx + 1 : 5;
              } else {
                // Distribute without dates
                startIdx = (ri * 3) % (days.length - 5);
                barWidth = 4 + (ri % 3);
              }

              return (
                <div key={task.id} className="flex relative border-b border-slate-100" style={{ height: rowHeight }}>
                  {days.map((d, di) => {
                    const isToday = d.toDateString() === today.toDateString();
                    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                    return (
                      <div
                        key={di}
                        className={`border-r border-slate-50 ${isToday ? "bg-blue-50/30" : isWeekend ? "bg-black/[.03]" : ""}`}
                        style={{ width: dayWidth, height: rowHeight }}
                      />
                    );
                  })}
                  {/* Bar */}
                  <div
                    className="absolute top-1/2 -translate-y-1/2 rounded-[5px] flex items-center px-2 text-[9.5px] font-semibold text-white truncate cursor-pointer hover:brightness-110 transition-all"
                    style={{
                      left: startIdx * dayWidth + 2,
                      width: barWidth * dayWidth - 4,
                      height: 22,
                      backgroundColor: barColor,
                    }}
                    title={task.title}
                  >
                    {task.title}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="px-4 py-2 border-t border-[#e4edf8] flex items-center gap-4 flex-shrink-0">
        <span className="text-[9px] font-bold tracking-[0.1em] uppercase text-slate-400">Leyenda</span>
        {Object.entries(TYPE_COLORS).slice(0, 4).map(([type, color]) => (
          <span key={type} className="flex items-center gap-1.5 text-[10px] text-slate-400">
            <span className="w-3 h-2 rounded-sm inline-block" style={{ backgroundColor: color }} />
            {type.charAt(0).toUpperCase() + type.slice(1)}
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-[10px] text-blue-500 ml-auto">
          <span className="w-0.5 h-3 bg-blue-500/50 inline-block" />
          Hoy
        </span>
      </div>
    </div>
  );
}
