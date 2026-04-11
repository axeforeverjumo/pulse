import { useState, useEffect } from "react";
import {
  PlusIcon,
  ArrowPathIcon,
  PlayIcon,
  PauseIcon,
} from "@heroicons/react/24/outline";
import {
  getMarketingTasks,
  createMarketingTask,
  updateMarketingTask,
} from "../../../api/client";
import { toast } from "sonner";
import Modal from "../../Modal/Modal";

interface Props {
  project: any;
  workspaceId: string;
}

export default function RutinasTab({ project, workspaceId }: Props) {
  const [routines, setRoutines] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newRoutine, setNewRoutine] = useState({
    title: "",
    description: "",
    routine_label: "Semanal",
    category: project.project_type || "seo",
    routine_action: "create_task",
  });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadRoutines();
  }, [project.id]);

  async function loadRoutines() {
    try {
      const data = await getMarketingTasks(project.site_id || project.id, {});
      setRoutines((data.tasks || []).filter((t: any) => t.task_type === "routine"));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!newRoutine.title) return;
    setCreating(true);
    try {
      const task = await createMarketingTask(project.site_id || project.id, workspaceId, {
        ...newRoutine,
        task_type: "routine",
        status: "todo",
        routine_active: true,
      });
      setRoutines((prev) => [...prev, task]);
      setShowCreate(false);
      setNewRoutine({ title: "", description: "", routine_label: "Semanal", category: project.project_type || "seo", routine_action: "create_task" });
      toast.success("Rutina creada");
    } catch (e: any) {
      toast.error("Error: " + (e.message || ""));
    } finally {
      setCreating(false);
    }
  }

  async function toggleRoutine(routine: any) {
    const newActive = !routine.routine_active;
    try {
      await updateMarketingTask(routine.id, { routine_active: newActive });
      setRoutines((prev) =>
        prev.map((r) => (r.id === routine.id ? { ...r, routine_active: newActive } : r))
      );
      toast.success(newActive ? "Rutina activada" : "Rutina pausada");
    } catch (e: any) {
      toast.error("Error: " + (e.message || ""));
    }
  }

  const activeCount = routines.filter((r) => r.routine_active !== false).length;
  const pausedCount = routines.filter((r) => r.routine_active === false).length;

  if (loading) {
    return <div className="flex items-center justify-center h-full text-slate-400 text-sm">Cargando rutinas...</div>;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-5 py-2.5 border-b border-[#e4edf8] flex-shrink-0">
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
        >
          <PlusIcon className="w-3.5 h-3.5" />
          Nueva rutina
        </button>
        <span className="text-[10px] text-slate-400 ml-auto">
          {activeCount} activas · {pausedCount} pausadas
        </span>
      </div>

      {/* Routines list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {routines.map((routine) => {
          const isActive = routine.routine_active !== false;
          const iconBg = isActive ? "bg-blue-100" : "bg-slate-100";
          const freqLabel = routine.routine_label || routine.cron_expression || "Sin frecuencia";
          const actionLabel = routine.routine_action === "create_task" ? "Genera tarea en Backlog"
            : routine.routine_action === "notify" ? "Envia notificacion"
            : routine.routine_action === "report" ? "Genera informe"
            : "Alerta directa";

          return (
            <div
              key={routine.id}
              className={`bg-white border border-slate-200 rounded-xl p-4 transition-all ${
                !isActive ? "opacity-55" : ""
              }`}
            >
              {/* Header */}
              <div className="flex items-start gap-3 mb-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-base flex-shrink-0 ${iconBg}`}>
                  <ArrowPathIcon className="w-5 h-5 text-blue-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-[12.5px] font-bold text-slate-700">{routine.title}</h4>
                  {routine.description && (
                    <p className="text-[11px] text-slate-400 leading-relaxed mt-1 line-clamp-2">
                      {routine.description}
                    </p>
                  )}
                </div>
                {/* Toggle */}
                <button
                  onClick={() => toggleRoutine(routine)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all ${
                    isActive
                      ? "text-green-600 bg-green-50 border-green-200 hover:bg-red-50 hover:text-red-500 hover:border-red-200"
                      : "text-slate-400 bg-slate-50 border-slate-200 hover:bg-green-50 hover:text-green-600 hover:border-green-200"
                  }`}
                >
                  {isActive ? (
                    <>
                      <PlayIcon className="w-3 h-3" />
                      Activa
                    </>
                  ) : (
                    <>
                      <PauseIcon className="w-3 h-3" />
                      Pausada
                    </>
                  )}
                </button>
              </div>

              {/* Meta */}
              <div className="flex items-center gap-3 flex-wrap">
                <span className="flex items-center gap-1.5 text-[10.5px] text-slate-500 bg-slate-50 border border-slate-200 rounded-full px-2.5 py-1">
                  <ArrowPathIcon className="w-3 h-3" />
                  {freqLabel}
                </span>
                <span className="text-[10.5px] text-slate-400">
                  {actionLabel}
                </span>
                {routine.last_completed_at && (
                  <span className="text-[10px] text-slate-300 ml-auto">
                    Ultima: {new Date(routine.last_completed_at).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
                  </span>
                )}
              </div>

              {/* Next execution */}
              {routine.next_due_at && isActive && (
                <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-2.5 pt-2.5 border-t border-slate-100">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                  Proxima: {new Date(routine.next_due_at).toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" })}
                </div>
              )}
            </div>
          );
        })}

        {routines.length === 0 && (
          <div className="text-center py-12">
            <ArrowPathIcon className="w-10 h-10 text-slate-200 mx-auto mb-3" />
            <p className="text-sm text-slate-400 mb-1">Sin rutinas configuradas</p>
            <p className="text-xs text-slate-300">Crea rutinas para automatizar tareas recurrentes</p>
          </div>
        )}
      </div>

      {/* Create routine modal */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Nueva rutina" size="md">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
            <input
              type="text"
              placeholder="ej. Revision de posiciones SEO"
              value={newRoutine.title}
              onChange={(e) => setNewRoutine((p) => ({ ...p, title: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descripcion</label>
            <textarea
              placeholder="Que hace esta rutina..."
              value={newRoutine.description}
              onChange={(e) => setNewRoutine((p) => ({ ...p, description: e.target.value }))}
              rows={2}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Frecuencia</label>
              <select
                value={newRoutine.routine_label}
                onChange={(e) => setNewRoutine((p) => ({ ...p, routine_label: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                <option value="Diario">Diario</option>
                <option value="Semanal">Semanal</option>
                <option value="Mensual">Mensual</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Accion al ejecutar</label>
              <select
                value={newRoutine.routine_action}
                onChange={(e) => setNewRoutine((p) => ({ ...p, routine_action: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                <option value="create_task">Genera tarea en Backlog</option>
                <option value="notify">Notificacion</option>
                <option value="report">Genera informe</option>
                <option value="alert">Solo alerta</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
              Cancelar
            </button>
            <button onClick={handleCreate} disabled={creating || !newRoutine.title} className="px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 transition-colors">
              {creating ? "Creando..." : "Crear rutina"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
