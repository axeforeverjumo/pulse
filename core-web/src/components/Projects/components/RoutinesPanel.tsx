import { useState } from "react";
import {
  PlusIcon,
  TrashIcon,
  ClockIcon,
} from "@heroicons/react/24/outline";
import {
  useBoardRoutines,
  useCreateRoutine,
  useUpdateRoutine,
  useDeleteRoutine,
  useWorkspaceAgents,
} from "../../../hooks/queries/useProjects";
import type { Routine, CreateRoutineRequest, OpenClawAgent } from "../../../hooks/queries/useProjects";

interface RoutinesPanelProps {
  boardId: string | null;
  workspaceId: string | null;
}

const SCHEDULE_PRESETS = [
  { label: "Cada hora", cron: "0 * * * *" },
  { label: "Cada dia (9AM)", cron: "0 9 * * *" },
  { label: "Cada lunes (10AM)", cron: "0 10 * * 1" },
  { label: "Cada lunes a viernes (9AM)", cron: "0 9 * * 1-5" },
  { label: "Cada primer dia del mes", cron: "0 9 1 * *" },
  { label: "Custom", cron: "" },
];

function describeCron(cron: string): string {
  const parts = cron.split(" ");
  if (parts.length !== 5) return cron;
  const [min, hour, dom, , dow] = parts;

  if (cron === "0 * * * *") return "Cada hora";
  if (cron === "0 9 * * *") return "Cada dia a las 9:00";
  if (cron === "0 10 * * 1") return "Cada lunes a las 10:00";
  if (cron === "0 9 * * 1-5") return "Lun-Vie a las 9:00";
  if (dom !== "*" && dow === "*") return `Dia ${dom} de cada mes a las ${hour}:${min.padStart(2, "0")}`;
  if (dow !== "*" && dom === "*") {
    const days: Record<string, string> = {
      "0": "Dom", "1": "Lun", "2": "Mar", "3": "Mie", "4": "Jue", "5": "Vie", "6": "Sab",
      "1-5": "Lun-Vie",
    };
    return `${days[dow] || `Dia ${dow}`} a las ${hour}:${min.padStart(2, "0")}`;
  }
  if (hour !== "*" && min !== "*") return `Cada dia a las ${hour}:${min.padStart(2, "0")}`;
  return cron;
}

function formatDate(iso: string | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleString("es-ES", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function RoutinesPanel({ boardId, workspaceId }: RoutinesPanelProps) {
  const { data: routines, isLoading } = useBoardRoutines(boardId);
  const { data: agents } = useWorkspaceAgents(workspaceId);
  const createMutation = useCreateRoutine(boardId);
  const updateMutation = useUpdateRoutine(boardId);
  const deleteMutation = useDeleteRoutine(boardId);

  const [showForm, setShowForm] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formAgentId, setFormAgentId] = useState("");
  const [formPreset, setFormPreset] = useState("0 10 * * 1");
  const [formCustomCron, setFormCustomCron] = useState("");
  const [formTimezone, setFormTimezone] = useState("Europe/Madrid");

  const resetForm = () => {
    setFormTitle("");
    setFormDescription("");
    setFormAgentId("");
    setFormPreset("0 10 * * 1");
    setFormCustomCron("");
    setFormTimezone("Europe/Madrid");
    setShowForm(false);
  };

  const handleCreate = async () => {
    if (!formTitle.trim()) return;
    const cronExpr = formPreset || formCustomCron;
    if (!cronExpr.trim()) return;

    const data: CreateRoutineRequest = {
      title: formTitle.trim(),
      cron_expression: cronExpr,
      timezone: formTimezone,
    };
    if (formDescription.trim()) data.description = formDescription.trim();
    if (formAgentId) data.agent_id = formAgentId;

    await createMutation.mutateAsync(data);
    resetForm();
  };

  const handleToggleActive = (routine: Routine) => {
    updateMutation.mutate({
      routineId: routine.id,
      data: { is_active: !routine.is_active },
    });
  };

  const handleDelete = (routineId: string) => {
    if (window.confirm("Eliminar esta rutina?")) {
      deleteMutation.mutate(routineId);
    }
  };

  const agentMap = new Map<string, OpenClawAgent>();
  (agents || []).forEach((a: OpenClawAgent) => agentMap.set(a.id, a));

  if (isLoading) {
    return (
      <div className="space-y-3 animate-pulse">
        {[1, 2].map((i) => (
          <div key={i} className="bg-gray-50 rounded-lg p-4 h-16" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Routine list */}
      {(!routines || routines.length === 0) && !showForm && (
        <div className="text-center py-8 text-gray-400 text-sm">
          No hay rutinas configuradas
        </div>
      )}

      {(routines || []).map((routine: Routine) => {
        const agent = routine.agent_id ? agentMap.get(routine.agent_id) : null;
        return (
          <div
            key={routine.id}
            className={`border rounded-lg p-3 transition-colors ${
              routine.is_active ? "border-gray-200 bg-white" : "border-gray-100 bg-gray-50 opacity-60"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-sm text-gray-900 truncate">
                    {routine.title}
                  </span>
                  {agent && (
                    <span className="text-[11px] bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded-full truncate max-w-[120px]">
                      {agent.name}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <ClockIcon className="w-3 h-3" />
                    {describeCron(routine.cron_expression)}
                  </span>
                  {routine.next_run_at && (
                    <span>Prox: {formatDate(routine.next_run_at)}</span>
                  )}
                  {routine.last_run_at && (
                    <span>Ult: {formatDate(routine.last_run_at)}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {/* Active toggle */}
                <button
                  onClick={() => handleToggleActive(routine)}
                  className={`relative w-9 h-5 rounded-full transition-colors ${
                    routine.is_active ? "bg-green-500" : "bg-gray-300"
                  }`}
                  title={routine.is_active ? "Desactivar" : "Activar"}
                >
                  <span
                    className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                      routine.is_active ? "left-[18px]" : "left-0.5"
                    }`}
                  />
                </button>
                <button
                  onClick={() => handleDelete(routine.id)}
                  className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                  title="Eliminar"
                >
                  <TrashIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        );
      })}

      {/* New routine form */}
      {showForm && (
        <div className="border border-gray-200 rounded-lg p-4 space-y-3 bg-gray-50">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Titulo</label>
            <input
              type="text"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              placeholder="Ej: Auditar sitio web"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white outline-none focus:border-gray-400"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Descripcion <span className="text-gray-400">(opcional)</span>
            </label>
            <textarea
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              placeholder="Instrucciones o contexto para la tarea..."
              rows={2}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white outline-none focus:border-gray-400 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Agente asignado</label>
              <select
                value={formAgentId}
                onChange={(e) => setFormAgentId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white outline-none focus:border-gray-400"
              >
                <option value="">Sin agente</option>
                {(agents || []).map((a: OpenClawAgent) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">Zona horaria</label>
              <select
                value={formTimezone}
                onChange={(e) => setFormTimezone(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white outline-none focus:border-gray-400"
              >
                <option value="Europe/Madrid">Europe/Madrid</option>
                <option value="America/Mexico_City">America/Mexico_City</option>
                <option value="America/New_York">America/New_York</option>
                <option value="America/Los_Angeles">America/Los_Angeles</option>
                <option value="America/Bogota">America/Bogota</option>
                <option value="America/Buenos_Aires">America/Buenos_Aires</option>
                <option value="UTC">UTC</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Schedule</label>
            <select
              value={formPreset}
              onChange={(e) => setFormPreset(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white outline-none focus:border-gray-400"
            >
              {SCHEDULE_PRESETS.map((p) => (
                <option key={p.cron || "custom"} value={p.cron}>
                  {p.label}
                </option>
              ))}
            </select>
            {formPreset === "" && (
              <input
                type="text"
                value={formCustomCron}
                onChange={(e) => setFormCustomCron(e.target.value)}
                placeholder="0 10 * * 1 (min hora dia mes dia_semana)"
                className="w-full mt-2 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white outline-none focus:border-gray-400 font-mono"
              />
            )}
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={resetForm}
              className="px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 rounded-md"
            >
              Cancelar
            </button>
            <button
              onClick={handleCreate}
              disabled={!formTitle.trim() || !(formPreset || formCustomCron.trim()) || createMutation.isPending}
              className="px-3 py-1.5 text-xs bg-black text-white rounded-md disabled:opacity-50"
            >
              {createMutation.isPending ? "Creando..." : "Crear rutina"}
            </button>
          </div>
        </div>
      )}

      {/* Add button */}
      {!showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <PlusIcon className="w-4 h-4" />
          Nueva rutina
        </button>
      )}
    </div>
  );
}
