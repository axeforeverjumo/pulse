import { useState } from "react";
import { XMarkIcon, TrashIcon } from "@heroicons/react/24/outline";
import { updateMarketingProject } from "../../api/client";
import { toast } from "sonner";
import { createPortal } from "react-dom";

const TYPE_OPTIONS = [
  { id: "seo", label: "SEO" },
  { id: "ads", label: "Paid Media" },
  { id: "content", label: "Content" },
  { id: "web", label: "Web · Dev" },
  { id: "social", label: "Social" },
  { id: "estrategia", label: "Estrategia" },
];

const TOOL_OPTIONS = [
  { id: "ga4", label: "Google Analytics" },
  { id: "gsc", label: "Search Console" },
  { id: "gtm", label: "Tag Manager" },
  { id: "pagespeed", label: "PageSpeed" },
  { id: "ads", label: "Google Ads" },
  { id: "meta", label: "Meta Ads" },
];

interface Props {
  project: any;
  workspaceId: string;
  onClose: () => void;
  onUpdated: (project: any) => void;
  onDeleted: (id: string) => void;
}

export default function ProjectConfigModal({ project, workspaceId, onClose, onUpdated, onDeleted }: Props) {
  const [name, setName] = useState(project.name);
  const [projectType, setProjectType] = useState(project.project_type);
  const [objective, setObjective] = useState(project.objective || "");
  const [dueDate, setDueDate] = useState(project.due_date?.split("T")[0] || "");
  const [repositoryUrl, setRepositoryUrl] = useState(project.repository_url || "");
  const [activeTools, setActiveTools] = useState<string[]>(project.active_tools || []);
  const [saving, setSaving] = useState(false);

  function toggleTool(id: string) {
    setActiveTools((prev) => prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await updateMarketingProject(project.id, {
        name,
        project_type: projectType,
        objective: objective || null,
        due_date: dueDate || null,
        repository_url: repositoryUrl || null,
        active_tools: activeTools,
      });
      onUpdated(updated);
      onClose();
      toast.success("Proyecto actualizado");
    } catch (e: any) {
      toast.error("Error: " + (e.message || ""));
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center animate-in fade-in duration-200" onClick={onClose}>
      <div
        className="bg-white border border-slate-200 rounded-2xl w-[660px] max-w-[92vw] max-h-[88vh] flex flex-col overflow-hidden shadow-xl animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center px-5 py-4 border-b border-slate-200 flex-shrink-0">
          <div className="flex-1">
            <h3 className="text-sm font-bold text-slate-800">Configuracion del proyecto</h3>
            <p className="text-[10px] text-slate-400 mt-0.5">{project.name}</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Body — 2 columns */}
        <div className="flex-1 overflow-y-auto p-5 grid grid-cols-2 gap-5">
          {/* Left: Project data */}
          <div className="space-y-4">
            <h4 className="text-[8.5px] font-bold tracking-[0.12em] uppercase text-slate-400 pb-2 border-b border-slate-200">
              Datos del proyecto
            </h4>

            <div>
              <label className="block text-[10px] font-medium text-slate-500 mb-1">Nombre</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>

            <div>
              <label className="block text-[10px] font-medium text-slate-500 mb-1">Tipo</label>
              <select
                value={projectType}
                onChange={(e) => setProjectType(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                {TYPE_OPTIONS.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-medium text-slate-500 mb-1">Objetivo</label>
              <input
                type="text"
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                placeholder="ej. Aumentar trafico 30%"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>

            <div>
              <label className="block text-[10px] font-medium text-slate-500 mb-1">Fecha de entrega</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>

            <div>
              <label className="block text-[10px] font-medium text-slate-500 mb-1">Repositorio</label>
              <input
                type="text"
                value={repositoryUrl}
                onChange={(e) => setRepositoryUrl(e.target.value)}
                placeholder="https://github.com/..."
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
          </div>

          {/* Right: Connections */}
          <div className="space-y-4">
            <h4 className="text-[8.5px] font-bold tracking-[0.12em] uppercase text-slate-400 pb-2 border-b border-slate-200">
              Conexiones y herramientas
            </h4>

            <div>
              <label className="block text-[10px] font-medium text-slate-500 mb-2">Herramientas activas</label>
              <div className="flex flex-wrap gap-2">
                {TOOL_OPTIONS.map((tool) => {
                  const isActive = activeTools.includes(tool.id);
                  return (
                    <button
                      key={tool.id}
                      onClick={() => toggleTool(tool.id)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[10.5px] border transition-all ${
                        isActive
                          ? "border-green-300 text-green-600 bg-green-50"
                          : "border-slate-200 text-slate-400 hover:border-slate-300"
                      }`}
                    >
                      {tool.label}
                      {isActive && <span className="text-[9px]">✓</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-medium text-slate-500 mb-2">Sitio vinculado</label>
              {project.marketing_sites?.length > 0 ? (
                <div className="space-y-1.5">
                  {project.marketing_sites.map((s: any) => (
                    <div key={s.id} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-[11px]">
                      <span className="w-2 h-2 rounded-full bg-green-500" />
                      <span className="text-slate-600">{s.name}</span>
                      <span className="text-slate-300">{s.domain}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-slate-300 italic">Sin sitio vinculado</p>
              )}
            </div>

            <div>
              <label className="block text-[10px] font-medium text-slate-500 mb-2">Equipo</label>
              {project.marketing_project_members?.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {project.marketing_project_members.map((m: any) => (
                    <span
                      key={m.id}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10.5px] border border-slate-200 bg-slate-50 text-slate-600"
                    >
                      <span
                        className="w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-bold text-white"
                        style={{ backgroundColor: m.avatar_color || "#5b7fff" }}
                      >
                        {(m.display_name || m.agent_slug || "?").charAt(0).toUpperCase()}
                      </span>
                      {m.display_name || m.agent_slug || "Miembro"}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-slate-300 italic">Sin miembros adicionales</p>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-5 py-3.5 border-t border-slate-200 flex-shrink-0">
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-50 transition-colors"
          >
            {saving ? "Guardando..." : "Guardar cambios"}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-200 text-slate-500 text-sm hover:bg-slate-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => {
              if (confirm(`Eliminar "${project.name}" y todas sus tareas?`)) {
                onDeleted(project.id);
                onClose();
              }
            }}
            className="ml-auto text-[11px] text-red-400 hover:text-red-600 flex items-center gap-1 transition-colors"
          >
            <TrashIcon className="w-3.5 h-3.5" />
            Eliminar proyecto
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
