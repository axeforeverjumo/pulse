import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Search, Download, Star, ArrowLeft } from "lucide-react";
import { Icon } from "../ui/Icon";
import {
  getAgenciaTemplates,
  createAgent,
  type AgentTemplate,
} from "../../api/client";

const DEPARTMENTS = [
  { id: "all", label: "Todos", emoji: "\u{1F310}" },
  { id: "desarrollo", label: "Desarrollo", emoji: "\u{1F4BB}" },
  { id: "marketing", label: "Marketing", emoji: "\u{1F4E3}" },
  { id: "ventas", label: "Ventas", emoji: "\u{1F4B0}" },
  { id: "proyectos", label: "Proyectos", emoji: "\u{1F4CB}" },
  { id: "contabilidad", label: "Contabilidad", emoji: "\u{1F4CA}" },
  { id: "soporte", label: "Soporte", emoji: "\u{1F3A7}" },
  { id: "investigacion", label: "Investigacion", emoji: "\u{1F52C}" },
  { id: "administracion", label: "Administracion", emoji: "\u{1F3E2}" },
  { id: "general", label: "General", emoji: "\u{2699}\u{FE0F}" },
];

const DEPT_COLORS: Record<string, string> = {
  desarrollo: "bg-blue-100 text-blue-700",
  marketing: "bg-purple-100 text-purple-700",
  ventas: "bg-green-100 text-green-700",
  proyectos: "bg-orange-100 text-orange-700",
  contabilidad: "bg-yellow-100 text-yellow-700",
  soporte: "bg-pink-100 text-pink-700",
  investigacion: "bg-cyan-100 text-cyan-700",
  administracion: "bg-slate-100 text-slate-700",
  general: "bg-gray-100 text-gray-700",
};

export default function AgenciaView() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const [templates, setTemplates] = useState<AgentTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDept, setSelectedDept] = useState("all");
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<AgentTemplate | null>(null);
  const [installName, setInstallName] = useState("");
  const [installModel, setInstallModel] = useState("gpt-5.4-mini");
  const [installing, setInstalling] = useState(false);
  const [installed, setInstalled] = useState<string | null>(null);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Fetch templates
  useEffect(() => {
    setLoading(true);
    getAgenciaTemplates({
      department: selectedDept === "all" ? undefined : selectedDept,
      search: searchDebounced || undefined,
    })
      .then((r) => setTemplates(r.templates))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedDept, searchDebounced]);

  const handleInstall = async () => {
    if (!selectedTemplate || !installName.trim()) return;
    setInstalling(true);
    try {
      await createAgent(workspaceId, {
        name: installName.trim(),
        template_slug: selectedTemplate.slug,
        model: installModel,
      });
      setInstalled(selectedTemplate.slug);
      setTimeout(() => {
        setSelectedTemplate(null);
        setInstallName("");
        setInstalled(null);
      }, 1500);
    } catch (err) {
      console.error("Failed to install agent:", err);
    } finally {
      setInstalling(false);
    }
  };

  const featured = templates.filter((t) => t.is_featured);
  const rest = templates.filter((t) => !t.is_featured);

  return (
    <div className="flex-1 flex min-w-0 overflow-hidden rounded-[20px] bg-gradient-to-b from-[#f6fbff] to-[#edf4fb]">
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-white/92 md:rounded-[20px]">
        {/* Header */}
        <div className="h-14 flex items-center justify-between gap-2 border-b border-[#e4edf8] pl-3 pr-2 sm:pl-5 sm:pr-3">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold text-slate-800">Agencia</h1>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-medium">
              Marketplace
            </span>
          </div>
          <div className="relative w-64">
            <Icon icon={Search} size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar agentes..."
              className="w-full text-xs pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar departments */}
          <div className="w-48 shrink-0 border-r border-slate-100 overflow-y-auto p-2.5">
            {DEPARTMENTS.map((dept) => (
              <button
                key={dept.id}
                onClick={() => setSelectedDept(dept.id)}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors mb-0.5 ${
                  selectedDept === dept.id
                    ? "bg-indigo-50 text-indigo-700 font-medium"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <span className="text-sm">{dept.emoji}</span>
                <span>{dept.label}</span>
              </button>
            ))}
          </div>

          {/* Main grid */}
          <div className="flex-1 overflow-y-auto p-5">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="animate-spin w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full" />
              </div>
            ) : templates.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-sm text-slate-400">No se encontraron agentes</p>
              </div>
            ) : (
              <>
                {/* Featured */}
                {featured.length > 0 && !searchDebounced && (
                  <div className="mb-6">
                    <div className="flex items-center gap-1.5 mb-3">
                      <Icon icon={Star} size={14} className="text-amber-500" />
                      <h2 className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Destacados</h2>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {featured.map((t) => (
                        <AgenciaCard
                          key={t.id}
                          template={t}
                          onInstall={() => {
                            setSelectedTemplate(t);
                            setInstallName(t.name);
                          }}
                          installed={installed === t.slug}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* All */}
                <div>
                  {!searchDebounced && featured.length > 0 && (
                    <h2 className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-3">
                      Todos los agentes
                    </h2>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {(searchDebounced ? templates : rest).map((t) => (
                      <AgenciaCard
                        key={t.id}
                        template={t}
                        onInstall={() => {
                          setSelectedTemplate(t);
                          setInstallName(t.name);
                        }}
                        installed={installed === t.slug}
                      />
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Install modal */}
      {selectedTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl w-[420px] overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedTemplate(null)}
                  className="p-1 rounded hover:bg-slate-100 text-slate-400"
                >
                  <Icon icon={ArrowLeft} size={14} />
                </button>
                <h3 className="text-sm font-semibold text-slate-800">Instalar Agente</h3>
              </div>
            </div>
            <div className="p-5 space-y-4">
              {/* Template preview */}
              <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50">
                <span className="text-2xl">{selectedTemplate.emoji || "\u{1F916}"}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{selectedTemplate.name}</p>
                  <p className="text-[11px] text-slate-500 line-clamp-1">{selectedTemplate.description}</p>
                </div>
                {selectedTemplate.department && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${DEPT_COLORS[selectedTemplate.department] || DEPT_COLORS.general}`}>
                    {selectedTemplate.department}
                  </span>
                )}
              </div>

              {/* Name */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Nombre del agente</label>
                <input
                  type="text"
                  value={installName}
                  onChange={(e) => setInstallName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleInstall()}
                  className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  autoFocus
                />
              </div>

              {/* Model */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Modelo</label>
                <select
                  value={installModel}
                  onChange={(e) => setInstallModel(e.target.value)}
                  className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
                >
                  <option value="gpt-5.4-mini">GPT-5.4 Mini (rapido)</option>
                  <option value="gpt-5.3-codex">GPT-5.3 Codex (codigo)</option>
                  <option value="gpt-5.4">GPT-5.4 (avanzado)</option>
                </select>
              </div>

              {/* Install button */}
              <button
                onClick={handleInstall}
                disabled={installing || !installName.trim()}
                className="w-full py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {installed ? "\u2713 Instalado" : installing ? "Instalando..." : "Instalar en este workspace"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AgenciaCard({
  template,
  onInstall,
  installed,
}: {
  template: AgentTemplate;
  onInstall: () => void;
  installed: boolean;
}) {
  return (
    <div className="group relative flex flex-col p-3.5 rounded-xl border border-slate-100 bg-white hover:border-indigo-200 hover:shadow-sm transition-all">
      {/* Header */}
      <div className="flex items-start gap-2.5 mb-2">
        <span className="text-xl shrink-0">{template.emoji || "\u{1F916}"}</span>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-slate-800 truncate">{template.name}</p>
          <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed mt-0.5">
            {template.description}
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-auto pt-2.5">
        <div className="flex items-center gap-1.5">
          {template.department && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${DEPT_COLORS[template.department] || DEPT_COLORS.general}`}>
              {template.department}
            </span>
          )}
          {(template.install_count || 0) > 0 && (
            <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
              <Icon icon={Download} size={10} />
              {template.install_count}
            </span>
          )}
        </div>
        <button
          onClick={onInstall}
          className={`text-[11px] px-3 py-1 rounded-md font-medium transition-colors ${
            installed
              ? "bg-green-100 text-green-700"
              : "bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
          }`}
        >
          {installed ? "\u2713" : "Instalar"}
        </button>
      </div>
    </div>
  );
}
