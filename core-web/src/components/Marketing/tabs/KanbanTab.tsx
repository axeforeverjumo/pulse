import { useState, useEffect, useCallback } from "react";
import {
  PlusIcon,
  FlagIcon,
  ClockIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import {
  getMarketingTasks,
  createMarketingTask,
  updateMarketingTask,
} from "../../../api/client";
import { toast } from "sonner";
import Modal from "../../Modal/Modal";

const CATEGORIES: Record<string, { label: string; bg: string; text: string }> = {
  seo: { label: "SEO", bg: "bg-[#5b7fff]/10", text: "text-[#5b7fff]" },
  ads: { label: "Ads", bg: "bg-[#f5a623]/10", text: "text-[#f5a623]" },
  content: { label: "Content", bg: "bg-[#e879a0]/10", text: "text-[#e879a0]" },
  links: { label: "Links", bg: "bg-[#1ec97e]/10", text: "text-[#1ec97e]" },
  social: { label: "Social", bg: "bg-pink-100", text: "text-pink-600" },
  technical: { label: "Tecnico", bg: "bg-slate-100", text: "text-slate-600" },
};

const PRIORITIES = [
  { value: 0, label: "Sin", color: "text-slate-300" },
  { value: 1, label: "Baja", color: "text-blue-400" },
  { value: 2, label: "Media", color: "text-yellow-500" },
  { value: 3, label: "Alta", color: "text-orange-500" },
  { value: 4, label: "Urgente", color: "text-red-500" },
];

interface Props {
  project: any;
  workspaceId: string;
  columns: any[];
  onColumnsChanged: () => void;
}

export default function KanbanTab({ project, workspaceId, columns, onColumnsChanged: _onColumnsChanged }: Props) {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragTask, setDragTask] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForColumn, setCreateForColumn] = useState<string>("");
  const [newTask, setNewTask] = useState({ title: "", description: "", category: project.project_type || "seo", priority: 2 });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, 10000);
    return () => clearInterval(interval);
  }, [project.id]);

  async function fetchTasks() {
    try {
      const data = await getMarketingTasks(project.site_id || project.id, {});
      setTasks(data.tasks || []);
    } catch (e) {
      console.error("Failed to load tasks", e);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!newTask.title) return;
    setCreating(true);
    try {
      const task = await createMarketingTask(project.site_id || project.id, workspaceId, {
        ...newTask,
        task_type: "concrete",
        status: createForColumn || "todo",
      });
      setTasks((prev) => [...prev, task]);
      setShowCreate(false);
      setNewTask({ title: "", description: "", category: project.project_type || "seo", priority: 2 });
      toast.success("Tarea creada");
    } catch (e: any) {
      toast.error("Error: " + (e.message || ""));
    } finally {
      setCreating(false);
    }
  }

  async function moveTask(taskId: string, newStatus: string) {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)));
    try {
      await updateMarketingTask(taskId, { status: newStatus });
    } catch {
      fetchTasks();
    }
  }

  const handleDragStart = useCallback((taskId: string) => setDragTask(taskId), []);
  const handleDragOver = useCallback((e: React.DragEvent, colId: string) => {
    e.preventDefault();
    setDragOverCol(colId);
  }, []);
  const handleDrop = useCallback((colSlug: string) => {
    if (dragTask) {
      const task = tasks.find((t) => t.id === dragTask);
      if (task && task.status !== colSlug) moveTask(dragTask, colSlug);
    }
    setDragTask(null);
    setDragOverCol(null);
  }, [dragTask, tasks]);
  const handleDragEnd = useCallback(() => {
    setDragTask(null);
    setDragOverCol(null);
  }, []);

  // Use project columns or fallback to default 4
  const displayColumns = columns.length > 0
    ? columns.sort((a, b) => a.position - b.position)
    : [
        { slug: "todo", name: "Backlog", color: "#94a3b8", is_done_column: false },
        { slug: "in_progress", name: "En curso", color: "#5b7fff", is_done_column: false },
        { slug: "review", name: "Revision", color: "#f5a623", is_done_column: false },
        { slug: "done", name: "Hecho", color: "#1ec97e", is_done_column: true },
      ];

  const tasksByColumn = (slug: string) =>
    tasks.filter((t) => t.status === slug).sort((a, b) => (b.priority || 0) - (a.priority || 0));

  if (loading) {
    return (
      <div className="flex gap-3 p-4 h-full">
        {displayColumns.map((_, i) => (
          <div key={i} className="flex-1 bg-slate-50 rounded-xl animate-pulse min-h-[300px]" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-[#e4edf8] flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-400">{tasks.length} tareas · {displayColumns.length} columnas</span>
        </div>
        <button
          onClick={() => { setCreateForColumn("todo"); setShowCreate(true); }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
        >
          <PlusIcon className="w-3.5 h-3.5" />
          Nueva tarea
        </button>
      </div>

      {/* Board */}
      <div className="flex gap-3 flex-1 overflow-x-auto px-4 py-3">
        {displayColumns.map((col) => {
          const colTasks = tasksByColumn(col.slug);
          const isOver = dragOverCol === col.slug;
          return (
            <div
              key={col.slug}
              className={`flex flex-col w-64 min-w-[248px] flex-shrink-0 rounded-xl transition-all ${
                isOver ? "bg-blue-50/50 ring-2 ring-blue-200" : "bg-slate-50/80"
              }`}
              style={{ borderTop: `3px solid ${col.color}` }}
              onDragOver={(e) => handleDragOver(e, col.slug)}
              onDrop={() => handleDrop(col.slug)}
              onDragLeave={() => setDragOverCol(null)}
            >
              {/* Column header */}
              <div className="flex items-center justify-between px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: col.color }} />
                  <h3 className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                    {col.name}
                  </h3>
                  <span className="text-[9px] bg-white border border-slate-200 text-slate-400 px-1.5 py-0.5 rounded-full font-bold">
                    {colTasks.length}
                  </span>
                </div>
                <button
                  onClick={() => { setCreateForColumn(col.slug); setShowCreate(true); }}
                  className="w-5 h-5 flex items-center justify-center rounded text-slate-300 hover:text-blue-500 hover:bg-blue-50 transition-colors"
                >
                  <PlusIcon className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Cards */}
              <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-2">
                {colTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    isDragging={dragTask === task.id}
                    isDoneColumn={col.is_done_column}
                    onDragStart={() => handleDragStart(task.id)}
                    onDragEnd={handleDragEnd}
                  />
                ))}
                {colTasks.length === 0 && (
                  <div className="text-[10px] text-slate-300 text-center py-6">
                    Vacio
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Create task modal */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Nueva tarea" size="md">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Titulo</label>
            <input
              type="text"
              placeholder="Nombre de la tarea"
              value={newTask.title}
              onChange={(e) => setNewTask((p) => ({ ...p, title: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descripcion</label>
            <textarea
              placeholder="Detalles..."
              value={newTask.description}
              onChange={(e) => setNewTask((p) => ({ ...p, description: e.target.value }))}
              rows={2}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
              <select
                value={newTask.category}
                onChange={(e) => setNewTask((p) => ({ ...p, category: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                {Object.entries(CATEGORIES).map(([id, c]) => (
                  <option key={id} value={id}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Prioridad</label>
              <select
                value={newTask.priority}
                onChange={(e) => setNewTask((p) => ({ ...p, priority: parseInt(e.target.value) }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
              Cancelar
            </button>
            <button onClick={handleCreate} disabled={creating || !newTask.title} className="px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 transition-colors">
              {creating ? "Creando..." : "Crear tarea"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}


// ============================================================================
// Task Card — enriched with subtasks, progress, category badges
// ============================================================================

function TaskCard({
  task,
  isDragging,
  isDoneColumn,
  onDragStart,
  onDragEnd,
}: {
  task: any;
  isDragging: boolean;
  isDoneColumn: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const cat = CATEGORIES[task.category];
  const pri = PRIORITIES[task.priority] || PRIORITIES[0];
  const progress = task.progress || 0;
  const isUrgent = task.priority === 4;
  const isOverdue = task.due_at && new Date(task.due_at) <= new Date();

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`bg-white rounded-xl border p-3 cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md transition-all ${
        isDragging ? "opacity-40 scale-95" : ""
      } ${isUrgent || isOverdue ? "border-red-200" : "border-slate-200"} ${isDoneColumn ? "opacity-60" : ""}`}
    >
      {/* Category tag */}
      <div className="flex items-center justify-between mb-1.5">
        {cat && (
          <span className={`text-[8.5px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded ${cat.bg} ${cat.text}`}>
            {cat.label}
          </span>
        )}
        {task.task_type === "routine" && (
          <span className="text-[9px] text-slate-400 flex items-center gap-0.5">
            <ArrowPathIcon className="w-2.5 h-2.5" />
          </span>
        )}
      </div>

      {/* Title */}
      <p className="text-[11.5px] font-medium text-slate-800 leading-snug mb-1">
        {isUrgent && <span className="text-red-500 mr-1">⚠</span>}
        {task.title}
      </p>

      {/* Description */}
      {task.description && (
        <p className="text-[10px] text-slate-400 line-clamp-2 mb-2">{task.description}</p>
      )}

      {/* Progress bar (if has subtasks or progress) */}
      {progress > 0 && (
        <div className="mb-2">
          <div className="h-[3px] bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${progress}%`,
                backgroundColor: progress === 100 ? "#1ec97e" : "#5b7fff",
              }}
            />
          </div>
        </div>
      )}

      {/* Bottom row */}
      <div className="flex items-center justify-between pt-1.5 border-t border-slate-100">
        <div className="flex items-center gap-1.5">
          <FlagIcon className={`w-3 h-3 ${pri.color}`} />
          {task.assigned_agent && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-600 font-medium">
              {task.assigned_agent}
            </span>
          )}
        </div>
        {(task.due_at || task.next_due_at) && (
          <span className={`text-[9px] flex items-center gap-0.5 ${isOverdue ? "text-red-500 font-semibold" : "text-slate-400"}`}>
            <ClockIcon className="w-3 h-3" />
            {isOverdue ? "Vence hoy" : new Date(task.due_at || task.next_due_at).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
          </span>
        )}
      </div>
    </div>
  );
}
