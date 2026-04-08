import { useState, useEffect } from "react";
import {
  PlusIcon,
  CheckCircleIcon,
  ArrowPathIcon,
  ClockIcon,
  FlagIcon,
} from "@heroicons/react/24/outline";
import { CheckCircleIcon as CheckCircleSolid } from "@heroicons/react/24/solid";
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

const CATEGORIES = [
  { id: "seo", label: "SEO", color: "bg-green-100 text-green-700" },
  { id: "analytics", label: "Analytics", color: "bg-blue-100 text-blue-700" },
  { id: "content", label: "Contenido", color: "bg-purple-100 text-purple-700" },
  { id: "ads", label: "Ads", color: "bg-orange-100 text-orange-700" },
  { id: "social", label: "Social", color: "bg-pink-100 text-pink-700" },
  { id: "technical", label: "Tecnico", color: "bg-slate-100 text-slate-700" },
];

const PRIORITIES = [
  { value: 0, label: "Sin prioridad", color: "text-slate-300" },
  { value: 1, label: "Baja", color: "text-blue-400" },
  { value: 2, label: "Media", color: "text-yellow-500" },
  { value: 3, label: "Alta", color: "text-orange-500" },
  { value: 4, label: "Urgente", color: "text-red-500" },
];

const STATUSES = ["todo", "in_progress", "review", "done"] as const;
const STATUS_LABELS: Record<string, string> = {
  todo: "Por hacer",
  in_progress: "En progreso",
  review: "En revision",
  done: "Hecho",
};

export default function TasksTab({ site, workspaceId }: Props) {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "concrete" | "routine">("all");
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [showCreate, setShowCreate] = useState(false);
  const [newTask, setNewTask] = useState({
    title: "",
    description: "",
    task_type: "concrete" as "concrete" | "routine",
    category: "",
    priority: 2,
    routine_label: "",
    due_at: "",
    assigned_agent: "",
  });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchTasks();
  }, [site.id, filter, statusFilter]);

  async function fetchTasks() {
    setLoading(true);
    try {
      const params: any = {};
      if (filter !== "all") params.task_type = filter;
      if (statusFilter === "active") params.status = undefined; // all active
      else if (statusFilter !== "all") params.status = statusFilter;

      const data = await getMarketingTasks(site.id, params);
      let filtered = data.tasks || [];
      if (statusFilter === "active") {
        filtered = filtered.filter((t: any) => t.status !== "done");
      }
      setTasks(filtered);
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
      setTasks((prev) => [task, ...prev]);
      setShowCreate(false);
      setNewTask({ title: "", description: "", task_type: "concrete", category: "", priority: 2, routine_label: "", due_at: "", assigned_agent: "" });
      toast.success("Tarea creada");
    } catch (e: any) {
      toast.error("Error: " + (e.message || ""));
    } finally {
      setCreating(false);
    }
  }

  async function handleToggleStatus(task: any) {
    const nextStatus = task.status === "done" ? "todo" : "done";

    if (task.task_type === "routine" && nextStatus === "done") {
      try {
        const updated = await completeMarketingRoutine(task.id);
        setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
        toast.success("Rutina completada, reprogramada");
      } catch (e: any) {
        toast.error("Error: " + (e.message || ""));
      }
      return;
    }

    try {
      const updated = await updateMarketingTask(task.id, { status: nextStatus });
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    } catch (e: any) {
      toast.error("Error: " + (e.message || ""));
    }
  }

  async function handleStatusChange(taskId: string, newStatus: string) {
    try {
      const updated = await updateMarketingTask(taskId, { status: newStatus });
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    } catch (e: any) {
      toast.error("Error: " + (e.message || ""));
    }
  }

  const routineCount = tasks.filter((t) => t.task_type === "routine").length;
  const concreteCount = tasks.filter((t) => t.task_type === "concrete").length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {([
            { id: "all", label: `Todas (${tasks.length})` },
            { id: "concrete", label: `Concretas (${concreteCount})` },
            { id: "routine", label: `Rutinas (${routineCount})` },
          ] as const).map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 text-sm rounded-xl border transition-colors ${
                filter === f.id
                  ? "bg-blue-50 border-blue-200 text-blue-600"
                  : "border-slate-200 text-slate-500 hover:bg-slate-50"
              }`}
            >
              {f.label}
            </button>
          ))}
          <span className="border-l border-slate-200 mx-1" />
          {([
            { id: "active", label: "Activas" },
            { id: "all", label: "Todas" },
            { id: "done", label: "Hechas" },
          ] as const).map((f) => (
            <button
              key={f.id}
              onClick={() => setStatusFilter(f.id)}
              className={`px-2.5 py-1.5 text-xs rounded-lg transition-colors ${
                statusFilter === f.id
                  ? "bg-slate-200 text-slate-700"
                  : "text-slate-400 hover:bg-slate-100"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-xl border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
        >
          <PlusIcon className="w-4 h-4" />
          Nueva tarea
        </button>
      </div>

      {/* Task list */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <p className="text-lg font-medium mb-1 text-slate-500">Sin tareas</p>
          <p className="text-sm">Crea tareas concretas o rutinas de marketing</p>
        </div>
      ) : (
        <div className="space-y-1">
          {tasks.map((task) => (
            <div
              key={task.id}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
                task.status === "done"
                  ? "bg-slate-50 border-slate-100 opacity-60"
                  : "bg-white border-slate-200 hover:border-blue-200"
              }`}
            >
              {/* Complete toggle */}
              <button
                onClick={() => handleToggleStatus(task)}
                className="flex-shrink-0"
              >
                {task.status === "done" ? (
                  <CheckCircleSolid className="w-5 h-5 text-green-500" />
                ) : (
                  <CheckCircleIcon className="w-5 h-5 text-slate-300 hover:text-green-400" />
                )}
              </button>

              {/* Task info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className={`text-sm font-medium ${task.status === "done" ? "line-through text-slate-400" : "text-slate-800"}`}>
                    {task.title}
                  </p>
                  {task.task_type === "routine" && (
                    <ArrowPathIcon className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" title="Rutina" />
                  )}
                </div>
                {task.description && (
                  <p className="text-xs text-slate-400 truncate">{task.description}</p>
                )}
              </div>

              {/* Category badge */}
              {task.category && (
                <span className={`text-xs px-2 py-0.5 rounded-lg flex-shrink-0 ${
                  CATEGORIES.find((c) => c.id === task.category)?.color || "bg-slate-100 text-slate-500"
                }`}>
                  {CATEGORIES.find((c) => c.id === task.category)?.label || task.category}
                </span>
              )}

              {/* Priority */}
              <FlagIcon className={`w-4 h-4 flex-shrink-0 ${PRIORITIES[task.priority]?.color || "text-slate-300"}`} />

              {/* Agent badge */}
              {task.assigned_agent && (
                <span className="text-xs px-2 py-0.5 rounded-lg bg-violet-50 text-violet-600 flex-shrink-0">
                  {task.assigned_agent}
                </span>
              )}

              {/* Due date */}
              {(task.due_at || task.next_due_at) && (
                <span className="text-xs text-slate-400 flex-shrink-0 flex items-center gap-1">
                  <ClockIcon className="w-3 h-3" />
                  {new Date(task.due_at || task.next_due_at).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
                </span>
              )}

              {/* Status select */}
              <select
                value={task.status}
                onChange={(e) => handleStatusChange(task.id, e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-200"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}

      {/* Create task modal */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Nueva tarea de marketing" size="md">
        <div className="space-y-4">
          {/* Type toggle */}
          <div className="flex gap-2">
            {(["concrete", "routine"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setNewTask((p) => ({ ...p, task_type: t }))}
                className={`flex-1 px-3 py-2 text-sm rounded-xl border transition-colors ${
                  newTask.task_type === t
                    ? "bg-blue-50 border-blue-200 text-blue-600"
                    : "border-slate-200 text-slate-500 hover:bg-slate-50"
                }`}
              >
                {t === "concrete" ? "Tarea concreta" : "Rutina recurrente"}
              </button>
            ))}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Titulo</label>
            <input
              type="text"
              placeholder={newTask.task_type === "routine" ? "Auditoria SEO semanal" : "Optimizar meta tags de la landing"}
              value={newTask.title}
              onChange={(e) => setNewTask((p) => ({ ...p, title: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descripcion</label>
            <textarea
              placeholder="Detalles de la tarea..."
              value={newTask.description}
              onChange={(e) => setNewTask((p) => ({ ...p, description: e.target.value }))}
              rows={2}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
              <select
                value={newTask.category}
                onChange={(e) => setNewTask((p) => ({ ...p, category: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                <option value="">Sin categoria</option>
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Prioridad</label>
              <select
                value={newTask.priority}
                onChange={(e) => setNewTask((p) => ({ ...p, priority: parseInt(e.target.value) }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
          </div>

          {newTask.task_type === "routine" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Frecuencia</label>
              <select
                value={newTask.routine_label}
                onChange={(e) => setNewTask((p) => ({ ...p, routine_label: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                <option value="">Seleccionar...</option>
                <option value="Diario">Diario</option>
                <option value="Semanal">Semanal</option>
                <option value="Quincenal">Quincenal</option>
                <option value="Mensual">Mensual</option>
              </select>
            </div>
          )}

          {newTask.task_type === "concrete" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fecha limite</label>
              <input
                type="date"
                value={newTask.due_at}
                onChange={(e) => setNewTask((p) => ({ ...p, due_at: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Asignar a agente</label>
            <select
              value={newTask.assigned_agent}
              onChange={(e) => setNewTask((p) => ({ ...p, assigned_agent: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              <option value="">Sin asignar</option>
              <option value="pulsemark">PulseMark (IA)</option>
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => setShowCreate(false)}
              className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleCreate}
              disabled={creating || !newTask.title}
              className="px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 transition-colors"
            >
              {creating ? "Creando..." : "Crear tarea"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
