import { useState, useEffect, useMemo } from "react";
import { getMarketingTasks } from "../../../api/client";

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  seo: { bg: "bg-blue-500/80", text: "text-white" },
  ads: { bg: "bg-amber-500/80", text: "text-white" },
  content: { bg: "bg-pink-400/80", text: "text-white" },
  links: { bg: "bg-green-500/80", text: "text-white" },
  social: { bg: "bg-pink-500/80", text: "text-white" },
  technical: { bg: "bg-slate-400/80", text: "text-white" },
};

const DAYS_OF_WEEK = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"];

interface Props {
  project: any;
  workspaceId: string;
}

export default function CalendarTab({ project, workspaceId }: Props) {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());

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

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    // Monday-based week
    let startOffset = firstDay.getDay() - 1;
    if (startOffset < 0) startOffset = 6;

    const days: { date: Date; isCurrentMonth: boolean }[] = [];

    // Previous month padding
    for (let i = startOffset - 1; i >= 0; i--) {
      const d = new Date(year, month, -i);
      days.push({ date: d, isCurrentMonth: false });
    }

    // Current month
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push({ date: new Date(year, month, i), isCurrentMonth: true });
    }

    // Next month padding to fill 6 rows
    while (days.length < 42) {
      const d = new Date(year, month + 1, days.length - lastDay.getDate() - startOffset + 1);
      days.push({ date: d, isCurrentMonth: false });
    }

    return days;
  }, [year, month]);

  const today = new Date();
  const todayStr = today.toDateString();

  // Map tasks to dates
  const tasksByDate = useMemo(() => {
    const map: Record<string, any[]> = {};
    tasks.forEach((t) => {
      const dateStr = t.due_at || t.next_due_at || t.end_date;
      if (dateStr) {
        const key = new Date(dateStr).toDateString();
        if (!map[key]) map[key] = [];
        map[key].push(t);
      }
    });
    return map;
  }, [tasks]);

  function prevMonth() {
    setCurrentMonth(new Date(year, month - 1, 1));
  }
  function nextMonth() {
    setCurrentMonth(new Date(year, month + 1, 1));
  }

  const monthLabel = currentMonth.toLocaleDateString("es-ES", { month: "long", year: "numeric" });

  if (loading) {
    return <div className="flex items-center justify-center h-full text-slate-400 text-sm">Cargando calendario...</div>;
  }

  return (
    <div className="flex flex-col h-full p-4 overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-slate-700 capitalize">{monthLabel}</h3>
        <div className="flex gap-1.5">
          <button onClick={prevMonth} className="px-2.5 py-1 text-[10px] rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors">
            ← Ant
          </button>
          <button onClick={nextMonth} className="px-2.5 py-1 text-[10px] rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors">
            Sig →
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 gap-px bg-slate-200 border border-slate-200 rounded-lg overflow-hidden flex-1">
        {/* Day headers */}
        {DAYS_OF_WEEK.map((d) => (
          <div key={d} className="bg-slate-50 py-2 text-center text-[8.5px] font-bold tracking-[0.1em] uppercase text-slate-400">
            {d}
          </div>
        ))}

        {/* Day cells */}
        {calendarDays.map(({ date, isCurrentMonth }, i) => {
          const isToday = date.toDateString() === todayStr;
          const isWeekend = date.getDay() === 0 || date.getDay() === 6;
          const dayTasks = tasksByDate[date.toDateString()] || [];

          return (
            <div
              key={i}
              className={`min-h-[82px] p-1.5 ${
                !isCurrentMonth ? "bg-slate-50/60 opacity-40" : isToday ? "bg-blue-50/50" : isWeekend ? "bg-black/[.02]" : "bg-white"
              }`}
            >
              <div
                className={`text-[11px] font-bold w-5 h-5 flex items-center justify-center rounded-full mb-1 ${
                  isToday ? "bg-blue-500 text-white" : "text-slate-500"
                }`}
              >
                {date.getDate()}
              </div>
              {dayTasks.slice(0, 3).map((t) => {
                const tc = TYPE_COLORS[t.category] || TYPE_COLORS.technical;
                return (
                  <div
                    key={t.id}
                    className={`text-[8px] font-semibold px-1.5 py-0.5 rounded mb-0.5 truncate cursor-pointer ${tc.bg} ${tc.text}`}
                    title={t.title}
                  >
                    {t.title}
                  </div>
                );
              })}
              {dayTasks.length > 3 && (
                <div className="text-[8px] text-slate-400 pl-1">+{dayTasks.length - 3} mas</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
