import { useState, useEffect, useCallback } from "react";
import {
  PlusIcon,
  ArrowPathIcon,
  ClockIcon,
  FlagIcon,
  ChatBubbleLeftIcon,
} from "@heroicons/react/24/outline";
import {
  getMarketingTasks,
  createMarketingTask,
  updateMarketingTask,
  completeMarketingRoutine,
} from "../../../api/client";
import Modal from "../../Modal/Modal";
import { toast } from "sonner";

interface Props {
  site: any;
  workspaceId: string;
}

const COLUMNS = [
  { id: "todo", label: "Por hacer", color: "border-slate-300", bg: "bg-slate-50" },
  { id: "in_progress", label: "En progreso", color: "border-blue-400", bg: "bg-blue-50" },
  { id: "review", label: "QA / Revision", color: "border-yellow-400", bg: "bg-yellow-50" },
  { id: "done", label: "Hecho", color: "border-green-400", bg: "bg-green-50" },
];

const CATEGORIES = [
  { id: "seo", label: "SEO", color: "bg-green-100 text-green-700" },
  { id: "analytics", label: "Analytics", color: "bg-blue-100 text-blue-700" },
  { id: "content", label: "Contenido", color: "bg-purple-100 text-purple-700" },
  { id: "ads", label: "Ads", color: "bg-orange-100 text-orange-700" },
  { id: "social", label: "Social", color: "bg-pink-100 text-pink-700" },
  { id: "technical", label: "Tecnico", color: "bg-slate-200 text-slate-700" },
];

const PRIORITIES = [
  { value: 0, label: "Sin", color: "text-slate-300" },
  { value: 1, label: "Baja", color: "text-blue-400" },
  { value: 2, label: "Media", color: "text-yellow-500" },
  { value: 3, label: "Alta", color: "text-orange-500" },
  { value: 4, label: "Urgente", color: "text-red-500" },
];

export default function TasksTab({ site, workspaceId }: Props) {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [dragTask, setDragTask] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [newTask, setNewTask] = useState({
    title: "",
    description: "",
    task_type: "concrete" as "concrete" | "routine",
    category: "",
    priority: 2,
    routine_label: "",
  });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchTasks();
    // Poll every 10s for agent task updates
    const interval = setInterval(fetchTasks, 10000);
    return () => clearInterval(interval);
  }, [site.id]);

  async function fetchTasks() {
    try {
      const data = await getMarketingTasks(site.id, {});
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
      const task = await createMarketingTask(site.id, workspaceId, newTask);
      setTasks((prev) => [...prev, task]);
      setShowCreate(false);
      setNewTask({ title: "", description: "", task_type: "concrete", category: "", priority: 2, routine_label: "" });
      toast.success("Tarea creada");
    } catch (e: any) {
      toast.error("Error: " + (e.message || ""));
    } finally {
      setCreating(false);
    }
  }

  async function moveTask(taskId: string, newStatus: string) {
    // Optimistic update
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t))
    );
    try {
      const task = tasks.find((t) => t.id === taskId);
      if (task?.task_type === "routine" && newStatus === "done") {
        const updated = await completeMarketingRoutine(taskId);
        setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
        toast.success("Rutina completada y reprogramada");
      } else {
        await updateMarketingTask(taskId, { status: newStatus });
      }
    } catch (e: any) {
      toast.error("Error: " + (e.message || ""));
      fetchTasks(); // revert
    }
  }

  // Simple drag & drop handlers (no library needed)
  const handleDragStart = useCallback((taskId: string) => {
    setDragTask(taskId);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, colId: string) => {
    e.preventDefault();
    setDragOverCol(colId);
  }, []);

  const handleDrop = useCallback((colId: string) => {
    if (dragTask) {
      const task = tasks.find((t) => t.id === dragTask);
      if (task && task.status !== colId) {
        moveTask(dragTask, colId);
      }
    }
    setDragTask(null);
    setDragOverCol(null);
  }, [dragTask, tasks]);

  const handleDragEnd = useCallback(() => {
    setDragTask(null);
    setDragOverCol(null);
  }, []);

  const tasksByStatus = (status: string) =>
    tasks.filter((t) => t.status === status).sort((a, b) => b.priority - a.priority);

  if (loading) {
    return (
      <div className="flex gap-4 h-full">
        {COLUMNS.map((col) => (
          <div key={col.id} className="flex-1 bg-slate-50 rounded-xl animate-pulse min-h-[300px]" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full -m-6">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-[#e4edf8]">
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500">{tasks.length} tareas</span>
          <span className="text-slate-200">|</span>
          <span className="text-xs text-slate-400">
            {tasks.filter((t) => t.assigned_agent === "pulsemark").length} asignadas a PulseMark
          </span>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-xl border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
        >
          <PlusIcon className="w-4 h-4" />
          Nueva tarea
        </button>
      </div>

      {/* Kanban board */}
      <div className="flex gap-3 flex-1 overflow-x-auto px-4 py-4">
        {COLUMNS.map((col) => {
          const colTasks = tasksByStatus(col.id);
          const isOver = dragOverCol === col.id;
          return (
            <div
              key={col.id}
              className={`flex flex-col w-72 min-w-[280px] flex-shrink-0 rounded-xl border-t-[3px] ${col.color} ${
                isOver ? "bg-blue-50/50 ring-2 ring-blue-200" : col.bg
              } transition-all`}
              onDragOver={(e) => handleDragOver(e, col.id)}
              onDrop={() => handleDrop(col.id)}
              onDragLeave={() => setDragOverCol(null)}
            >
              {/* Column header */}
              <div className="flex items-center justify-between px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-slate-700">{col.label}</h3>
                  <span className="text-xs bg-white border border-slate-200 text-slate-500 px-1.5 py-0.5 rounded-full font-medium">
                    {colTasks.length}
                  </span>
                </div>
              </div>

              {/* Cards */}
              <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-2">
                {colTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    isDragging={dragTask === task.id}
                    onDragStart={() => handleDragStart(task.id)}
                    onDragEnd={handleDragEnd}
                  />
                ))}
                {colTasks.length === 0 && (
                  <div className="text-xs text-slate-300 text-center py-6">
                    {col.id === "todo" ? "Sin tareas pendientes" : "Vacio"}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Create task modal */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Nueva tarea de marketing" size="md">
        <div className="space-y-4">
          <div className="flex gap-2">
            {(["concrete", "routine"] as const).map((t) => (
              <button key={t} onClick={() => setNewTask((p) => ({ ...p, task_type: t }))}
                className={`flex-1 px-3 py-2 text-sm rounded-xl border transition-colors ${
                  newTask.task_type === t ? "bg-blue-50 border-blue-200 text-blue-600" : "border-slate-200 text-slate-500 hover:bg-slate-50"
                }`}>
                {t === "concrete" ? "Tarea concreta" : "Rutina recurrente"}
              </button>
            ))}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Titulo</label>
            <input type="text"
              placeholder={newTask.task_type === "routine" ? "Auditoria SEO semanal" : "Optimizar meta tags"}
              value={newTask.title} onChange={(e) => setNewTask((p) => ({ ...p, title: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
              autoFocus />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descripcion</label>
            <textarea placeholder="Detalles..." value={newTask.description}
              onChange={(e) => setNewTask((p) => ({ ...p, description: e.target.value }))}
              rows={2} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
              <select value={newTask.category} onChange={(e) => setNewTask((p) => ({ ...p, category: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200">
                <option value="">Sin categoria</option>
                {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Prioridad</label>
              <select value={newTask.priority} onChange={(e) => setNewTask((p) => ({ ...p, priority: parseInt(e.target.value) }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200">
                {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
          </div>
          {newTask.task_type === "routine" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Frecuencia</label>
              <select value={newTask.routine_label} onChange={(e) => setNewTask((p) => ({ ...p, routine_label: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200">
                <option value="">Seleccionar...</option>
                <option value="Diario">Diario</option>
                <option value="Semanal">Semanal</option>
                <option value="Mensual">Mensual</option>
              </select>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setShowCreate(false)}
              className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
              Cancelar
            </button>
            <button onClick={handleCreate} disabled={creating || !newTask.title}
              className="px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 transition-colors">
              {creating ? "Creando..." : "Crear tarea"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ============================================================================
// Task Card component
// ============================================================================

function TaskCard({
  task,
  isDragging,
  onDragStart,
  onDragEnd,
}: {
  task: any;
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const cat = CATEGORIES.find((c) => c.id === task.category);
  const pri = PRIORITIES[task.priority] || PRIORITIES[0];

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`bg-white rounded-xl border border-slate-200 p-3 cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md transition-all ${
        isDragging ? "opacity-40 scale-95" : ""
      }`}
    >
      {/* Title */}
      <p className="text-sm font-medium text-slate-800 leading-snug mb-1.5">
        {task.title}
      </p>

      {/* Description preview */}
      {task.description && (
        <p className="text-xs text-slate-400 line-clamp-2 mb-2">
          {task.description}
        </p>
      )}

      {/* Tags row */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {cat && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${cat.color}`}>
            {cat.label}
          </span>
        )}
        {task.task_type === "routine" && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 flex items-center gap-0.5">
            <ArrowPathIcon className="w-2.5 h-2.5" />
            {task.routine_label || "Rutina"}
          </span>
        )}
        {task.assigned_agent && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-600">
            {task.assigned_agent}
          </span>
        )}
      </div>

      {/* Bottom row */}
      <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-slate-100">
        <FlagIcon className={`w-3.5 h-3.5 ${pri.color}`} />
        <div className="flex items-center gap-2">
          {(task.due_at || task.next_due_at) && (
            <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
              <ClockIcon className="w-3 h-3" />
              {new Date(task.due_at || task.next_due_at).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
