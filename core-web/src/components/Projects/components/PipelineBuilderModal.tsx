import { useState, useEffect } from "react";
import { X, Plus, ArrowDown, Trash2, Play, Save, ChevronRight } from "lucide-react";
import { Icon } from "../../ui/Icon";
import {
  getWorkspaceAgents,
  listPipelineTemplates,
  createPipelineTemplate,
  runPipeline,
  deletePipelineTemplate,
  type AgentInstance,
  type PipelineTemplate,
  type PipelineStep,
} from "../../../api/client";

interface Props {
  boardId: string;
  workspaceId: string;
  onClose: () => void;
  onCreated: () => void;
}

const PRIORITY_LABELS = [
  { value: 0, label: "Urgente" },
  { value: 1, label: "Alta" },
  { value: 2, label: "Alta" },
  { value: 3, label: "Media" },
  { value: 4, label: "Baja" },
];

export default function PipelineBuilderModal({ boardId, workspaceId, onClose, onCreated }: Props) {
  const [tab, setTab] = useState<"crear" | "plantillas">("crear");
  const [agents, setAgents] = useState<AgentInstance[]>([]);
  const [templates, setTemplates] = useState<PipelineTemplate[]>([]);

  // Builder state
  const [pipelineName, setPipelineName] = useState("");
  const [steps, setSteps] = useState<PipelineStep[]>([
    { index: 0, title: "", description: "", agent_id: "", priority: 3, depends_on: [] },
  ]);
  const [contextText, setContextText] = useState("");
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    getWorkspaceAgents(workspaceId).then((r) => setAgents(r.agents)).catch(console.error);
    listPipelineTemplates(boardId).then((r) => setTemplates(r.templates)).catch(console.error);
  }, [workspaceId, boardId]);

  const addStep = () => {
    const newIdx = steps.length;
    setSteps([...steps, {
      index: newIdx,
      title: "",
      description: "",
      agent_id: "",
      priority: 3,
      depends_on: newIdx > 0 ? [newIdx - 1] : [],
    }]);
  };

  const removeStep = (idx: number) => {
    if (steps.length <= 1) return;
    const updated = steps.filter((_, i) => i !== idx).map((s, i) => ({
      ...s,
      index: i,
      depends_on: s.depends_on
        .filter((d) => d !== idx)
        .map((d) => (d > idx ? d - 1 : d)),
    }));
    setSteps(updated);
  };

  const updateStep = (idx: number, field: string, value: any) => {
    setSteps(steps.map((s, i) => (i === idx ? { ...s, [field]: value } : s)));
  };

  const handleSave = async () => {
    if (!pipelineName.trim() || steps.some((s) => !s.title.trim())) return;
    setSaving(true);
    try {
      const tpl = await createPipelineTemplate(boardId, {
        name: pipelineName.trim(),
        steps: steps.map((s) => ({ ...s, agent_id: s.agent_id || undefined })),
      });
      setTemplates((prev) => [tpl, ...prev]);
      setTab("plantillas");
    } catch (err) {
      console.error("Failed to save pipeline:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleRun = async (templateId: string) => {
    setRunning(true);
    try {
      await runPipeline(boardId, {
        template_id: templateId,
        context_text: contextText || undefined,
        auto_start: true,
      });
      onCreated();
    } catch (err) {
      console.error("Failed to run pipeline:", err);
    } finally {
      setRunning(false);
    }
  };

  const handleSaveAndRun = async () => {
    if (!pipelineName.trim() || steps.some((s) => !s.title.trim())) return;
    setSaving(true);
    try {
      const tpl = await createPipelineTemplate(boardId, {
        name: pipelineName.trim(),
        steps: steps.map((s) => ({ ...s, agent_id: s.agent_id || undefined })),
      });
      await runPipeline(boardId, {
        template_id: tpl.id,
        context_text: contextText || undefined,
        auto_start: true,
      });
      onCreated();
    } catch (err) {
      console.error("Failed to save and run pipeline:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    try {
      await deletePipelineTemplate(id);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      console.error("Failed to delete template:", err);
    }
  };

  const loadTemplate = (tpl: PipelineTemplate) => {
    setPipelineName(tpl.name);
    setSteps(tpl.steps);
    setTab("crear");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-[620px] max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-slate-800">Pipeline de Agentes</h2>
            <div className="flex gap-0.5 p-0.5 rounded-lg bg-slate-100">
              <button
                onClick={() => setTab("crear")}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                  tab === "crear" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"
                }`}
              >
                Crear
              </button>
              <button
                onClick={() => setTab("plantillas")}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                  tab === "plantillas" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"
                }`}
              >
                Plantillas ({templates.length})
              </button>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 text-slate-400">
            <Icon icon={X} size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {tab === "crear" ? (
            <div className="space-y-4">
              {/* Pipeline name */}
              <input
                value={pipelineName}
                onChange={(e) => setPipelineName(e.target.value)}
                placeholder="Nombre del pipeline (ej: Dev → Doc → Deploy)"
                className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-400"
              />

              {/* Steps */}
              <div className="space-y-1">
                {steps.map((step, idx) => (
                  <div key={idx}>
                    {/* Arrow between steps */}
                    {idx > 0 && (
                      <div className="flex items-center justify-center py-1">
                        <Icon icon={ArrowDown} size={16} className="text-emerald-400" />
                      </div>
                    )}
                    {/* Step card */}
                    <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50">
                      <div className="flex items-start gap-2">
                        <span className="shrink-0 w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[11px] font-bold mt-0.5">
                          {idx + 1}
                        </span>
                        <div className="flex-1 space-y-2">
                          <input
                            value={step.title}
                            onChange={(e) => updateStep(idx, "title", e.target.value)}
                            placeholder={`Paso ${idx + 1}: titulo de la tarea`}
                            className="w-full text-sm px-2 py-1.5 rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400"
                          />
                          <textarea
                            value={step.description || ""}
                            onChange={(e) => updateStep(idx, "description", e.target.value)}
                            placeholder="Descripcion (opcional)"
                            className="w-full text-xs px-2 py-1.5 rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400 resize-none h-12"
                          />
                          <div className="flex gap-2">
                            <select
                              value={step.agent_id || ""}
                              onChange={(e) => updateStep(idx, "agent_id", e.target.value)}
                              className="flex-1 text-xs px-2 py-1.5 rounded-md border border-slate-200 bg-white focus:outline-none"
                            >
                              <option value="">Sin agente</option>
                              {agents.map((a) => (
                                <option key={a.id} value={a.id}>{a.name}</option>
                              ))}
                            </select>
                            <select
                              value={step.priority}
                              onChange={(e) => updateStep(idx, "priority", Number(e.target.value))}
                              className="w-24 text-xs px-2 py-1.5 rounded-md border border-slate-200 bg-white focus:outline-none"
                            >
                              {PRIORITY_LABELS.map((p) => (
                                <option key={p.value} value={p.value}>{p.label}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        {steps.length > 1 && (
                          <button onClick={() => removeStep(idx)} className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 mt-0.5">
                            <Icon icon={Trash2} size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add step */}
              <button
                onClick={addStep}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-slate-300 text-xs text-slate-500 hover:border-emerald-400 hover:text-emerald-600 transition-colors"
              >
                <Icon icon={Plus} size={13} />
                Agregar paso
              </button>

              {/* Context */}
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Contexto inicial (opcional)</label>
                <textarea
                  value={contextText}
                  onChange={(e) => setContextText(e.target.value)}
                  placeholder="Instrucciones o contexto que recibira el primer agente..."
                  className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400 resize-none h-16"
                />
              </div>
            </div>
          ) : (
            /* Templates list */
            <div className="space-y-2">
              {templates.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">No hay plantillas guardadas</p>
              ) : (
                templates.map((tpl) => (
                  <div key={tpl.id} className="flex items-center gap-3 p-3 rounded-lg border border-slate-100 hover:border-slate-200 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{tpl.name}</p>
                      <div className="flex items-center gap-1 mt-1">
                        {(tpl.steps || []).map((s, i) => (
                          <span key={i} className="flex items-center gap-0.5">
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 truncate max-w-[100px]">
                              {s.title || `Paso ${i + 1}`}
                            </span>
                            {i < tpl.steps.length - 1 && <Icon icon={ChevronRight} size={10} className="text-slate-300" />}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <button
                        onClick={() => loadTemplate(tpl)}
                        className="text-[11px] px-2.5 py-1 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleRun(tpl.id)}
                        disabled={running}
                        className="text-[11px] px-2.5 py-1 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors flex items-center gap-1"
                      >
                        <Icon icon={Play} size={10} />
                        Ejecutar
                      </button>
                      <button
                        onClick={() => handleDeleteTemplate(tpl.id)}
                        className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                      >
                        <Icon icon={Trash2} size={12} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Footer (only in create tab) */}
        {tab === "crear" && (
          <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between">
            <button onClick={onClose} className="text-xs text-slate-500 hover:text-slate-700">Cancelar</button>
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={saving || !pipelineName.trim() || steps.some((s) => !s.title.trim())}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
              >
                <Icon icon={Save} size={13} />
                Guardar plantilla
              </button>
              <button
                onClick={handleSaveAndRun}
                disabled={saving || !pipelineName.trim() || steps.some((s) => !s.title.trim())}
                className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                <Icon icon={Play} size={13} />
                Guardar y ejecutar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
