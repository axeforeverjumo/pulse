import { useState, useEffect } from "react";
import { FlagIcon } from "@heroicons/react/24/outline";
import { getMarketingTasks } from "../../../api/client";

const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  todo: { bg: "bg-slate-100", text: "text-slate-500", dot: "bg-slate-400" },
  in_progress: { bg: "bg-blue-50", text: "text-blue-600", dot: "bg-blue-500" },
  review: { bg: "bg-amber-50", text: "text-amber-600", dot: "bg-amber-500" },
  done: { bg: "bg-green-50", text: "text-green-600", dot: "bg-green-500" },
  backlog: { bg: "bg-slate-100", text: "text-slate-500", dot: "bg-slate-400" },
};

const CATEGORY_STYLES: Record<string, { bg: string; text: string }> = {
  seo: { bg: "bg-[#5b7fff]/10", text: "text-[#5b7fff]" },
  ads: { bg: "bg-[#f5a623]/10", text: "text-[#f5a623]" },
  content: { bg: "bg-[#e879a0]/10", text: "text-[#e879a0]" },
  links: { bg: "bg-[#1ec97e]/10", text: "text-[#1ec97e]" },
  social: { bg: "bg-pink-100", text: "text-pink-600" },
  technical: { bg: "bg-slate-100", text: "text-slate-500" },
};

const PRIORITY_COLORS = ["text-slate-300", "text-blue-400", "text-yellow-500", "text-orange-500", "text-red-500"];

interface Props {
  project: any;
  workspaceId: string;
}

export default function TablaTab({ project, workspaceId }: Props) {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<string>("priority");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

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

  function toggleSort(field: string) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  }

  const sorted = [...tasks].sort((a, b) => {
    let va = a[sortField] ?? "";
    let vb = b[sortField] ?? "";
    if (typeof va === "string") va = va.toLowerCase();
    if (typeof vb === "string") vb = vb.toLowerCase();
    if (va < vb) return sortDir === "asc" ? -1 : 1;
    if (va > vb) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  if (loading) {
    return <div className="flex items-center justify-center h-full text-slate-400 text-sm">Cargando tabla...</div>;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-5 py-2 border-b border-[#e4edf8] flex-shrink-0">
        <span className="text-[10px] text-slate-400">{tasks.length} tareas</span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-[12px] border-collapse">
          <thead>
            <tr>
              {[
                { key: "title", label: "Tarea" },
                { key: "category", label: "Tipo" },
                { key: "status", label: "Estado" },
                { key: "priority", label: "Prioridad" },
                { key: "assigned_agent", label: "Asignado" },
                { key: "due_at", label: "Fecha" },
              ].map((col) => (
                <th
                  key={col.key}
                  onClick={() => toggleSort(col.key)}
                  className="sticky top-0 bg-slate-50 text-left px-3 py-2.5 text-[8.5px] font-bold tracking-[0.1em] uppercase text-slate-400 border-b border-[#e4edf8] cursor-pointer hover:text-slate-600 whitespace-nowrap select-none z-10"
                >
                  {col.label}
                  {sortField === col.key && (
                    <span className="ml-1 text-blue-500">{sortDir === "asc" ? "↑" : "↓"}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((task) => {
              const ss = STATUS_STYLES[task.status] || STATUS_STYLES.todo;
              const cs = CATEGORY_STYLES[task.category];
              const priColor = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS[0];
              const isUrgent = task.priority === 4;

              return (
                <tr key={task.id} className="hover:bg-slate-50/50 cursor-pointer border-b border-slate-100">
                  <td className="px-3 py-2.5 font-medium text-slate-700">
                    {isUrgent && <span className="text-red-500 mr-1">⚠</span>}
                    {task.title}
                  </td>
                  <td className="px-3 py-2.5">
                    {cs && (
                      <span className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${cs.bg} ${cs.text}`}>
                        {task.category}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${ss.bg} ${ss.text}`}>
                      <span className={`w-[5px] h-[5px] rounded-full ${ss.dot}`} />
                      {task.status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <FlagIcon className={`w-3.5 h-3.5 ${priColor}`} />
                  </td>
                  <td className="px-3 py-2.5 text-slate-500">
                    {task.assigned_agent || task.assigned_to || "—"}
                  </td>
                  <td className="px-3 py-2.5 text-slate-400 text-[11px]">
                    {task.due_at
                      ? new Date(task.due_at).toLocaleDateString("es-ES", { day: "numeric", month: "short" })
                      : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {sorted.length === 0 && (
          <div className="text-center text-slate-400 py-10 text-sm">Sin tareas</div>
        )}
      </div>
    </div>
  );
}
