import { useState, useEffect } from "react";
import { PlusIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { createMarketingProject, createMarketingSite, getMarketingClients, getMarketingSites } from "../../api/client";
import { toast } from "sonner";

const PROJECT_TYPES = [
  { id: "seo", label: "SEO", color: "#5b7fff", selClass: "bg-[#5b7fff]/15 border-[#5b7fff] text-[#5b7fff]" },
  { id: "ads", label: "Paid Media", color: "#f5a623", selClass: "bg-[#f5a623]/15 border-[#f5a623] text-[#f5a623]" },
  { id: "content", label: "Content", color: "#e879a0", selClass: "bg-[#e879a0]/15 border-[#e879a0] text-[#e879a0]" },
  { id: "web", label: "Web · Dev", color: "#22d3ee", selClass: "bg-[#22d3ee]/15 border-[#22d3ee] text-[#22d3ee]" },
  { id: "social", label: "Social", color: "#1ec97e", selClass: "bg-[#1ec97e]/15 border-[#1ec97e] text-[#1ec97e]" },
  { id: "estrategia", label: "Estrategia", color: "#a78bfa", selClass: "bg-[#a78bfa]/15 border-[#a78bfa] text-[#a78bfa]" },
];

const TOOL_OPTIONS = [
  { id: "ga4", label: "Google Analytics", icon: "📊" },
  { id: "gsc", label: "Search Console", icon: "🔍" },
  { id: "gtm", label: "Tag Manager", icon: "🏷" },
  { id: "pagespeed", label: "PageSpeed", icon: "⚡" },
  { id: "ads", label: "Google Ads", icon: "📣" },
  { id: "meta", label: "Meta Ads", icon: "📱" },
];

const KPI_METRICS = [
  "Trafico organico",
  "Posiciones top 10",
  "CTR medio",
  "Conversiones",
  "Leads",
  "CPC medio",
  "ROAS",
  "Impresiones",
];

interface Props {
  workspaceId: string;
  onCreated: (project: any) => void;
  onCancel: () => void;
}

export default function NewProjectForm({ workspaceId, onCreated, onCancel }: Props) {
  const [name, setName] = useState("");
  const [projectType, setProjectType] = useState("seo");
  const [clientId, setClientId] = useState("");
  const [clientName, setClientName] = useState("");
  const [objective, setObjective] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [kpis, setKpis] = useState<{ metric: string; target: string; deadline: string }[]>([]);
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  const [existingSites, setExistingSites] = useState<any[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [activeTools, setActiveTools] = useState<string[]>(["ga4", "gsc", "pagespeed"]);
  const [clients, setClients] = useState<any[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadClients();
    loadExistingSites();
  }, [workspaceId]);

  async function loadClients() {
    try {
      const data = await getMarketingClients(workspaceId);
      setClients(data);
    } catch (e) {
      // CRM may not have clients yet
    }
  }

  async function loadExistingSites() {
    try {
      const data = await getMarketingSites(workspaceId);
      setExistingSites(data.sites || []);
    } catch (e) {}
  }

  function toggleTool(toolId: string) {
    setActiveTools((prev) =>
      prev.includes(toolId) ? prev.filter((t) => t !== toolId) : [...prev, toolId]
    );
  }

  function addKpi() {
    setKpis((prev) => [...prev, { metric: KPI_METRICS[0], target: "", deadline: "" }]);
  }

  function removeKpi(index: number) {
    setKpis((prev) => prev.filter((_, i) => i !== index));
  }

  function updateKpi(index: number, field: string, value: string) {
    setKpis((prev) =>
      prev.map((k, i) => (i === index ? { ...k, [field]: value } : k))
    );
  }

  async function handleCreate() {
    if (!name.trim()) return;
    setCreating(true);
    try {
      // If a site URL is provided and no existing site selected, create one
      let siteId = selectedSiteId || undefined;
      if (!siteId && siteUrl.trim()) {
        try {
          const site = await createMarketingSite(workspaceId, {
            name: name.trim(),
            url: siteUrl.trim(),
          });
          siteId = site.id;
        } catch (e) {
          console.error("Failed to create site, continuing without it", e);
        }
      }

      const project = await createMarketingProject(workspaceId, {
        name: name.trim(),
        project_type: projectType,
        client_id: clientId || undefined,
        client_name: clientName || undefined,
        objective: objective || undefined,
        due_date: dueDate || undefined,
        kpis: kpis.filter((k) => k.target),
        repository_url: repositoryUrl || undefined,
        active_tools: activeTools,
        site_id: siteId,
      });
      onCreated(project);
    } catch (e: any) {
      toast.error("Error: " + (e.message || ""));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto p-6">
        {/* Bloque 1: Esencial */}
        <div className="mb-6">
          {/* Name */}
          <div className="mb-5">
            <label className="block text-[9px] font-bold tracking-[0.12em] uppercase text-slate-400 mb-1.5">
              Nombre del proyecto <span className="text-blue-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ej. SEO Q2 · Cliente A"
              className="w-full px-4 py-3 text-base font-medium border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 transition-colors"
              autoFocus
            />
          </div>

          {/* Type pills */}
          <div className="mb-5">
            <label className="block text-[9px] font-bold tracking-[0.12em] uppercase text-slate-400 mb-2">
              Tipo de proyecto <span className="text-blue-500">*</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {PROJECT_TYPES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setProjectType(t.id)}
                  className={`px-3.5 py-1.5 rounded-full text-[11px] font-semibold border transition-all ${
                    projectType === t.id
                      ? t.selClass
                      : "border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-500"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Client */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[9px] font-bold tracking-[0.12em] uppercase text-slate-400">
                Cliente
              </label>
              <span className="text-[9px] text-slate-300 italic">opcional — sin cliente = proyecto interno</span>
            </div>
            <select
              value={clientId}
              onChange={(e) => {
                setClientId(e.target.value);
                const c = clients.find((c) => c.id === e.target.value);
                setClientName(c?.name || "");
                // Auto-enable tools when selecting client
                if (c) setActiveTools(["ga4", "gsc", "gtm", "pagespeed"]);
              }}
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white"
            >
              <option value="">— Sin cliente (proyecto interno) —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}{c.domain ? ` · ${c.domain}` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Site URL / Existing site */}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[9px] font-bold tracking-[0.12em] uppercase text-slate-400">
                Sitio web
              </label>
              <span className="text-[9px] text-slate-300 italic">necesario para Google Suite</span>
            </div>
            {existingSites.length > 0 ? (
              <div className="space-y-2">
                <select
                  value={selectedSiteId}
                  onChange={(e) => {
                    setSelectedSiteId(e.target.value);
                    if (e.target.value) setSiteUrl("");
                  }}
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white"
                >
                  <option value="">— Crear nuevo sitio —</option>
                  {existingSites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.domain})
                    </option>
                  ))}
                </select>
                {!selectedSiteId && (
                  <input
                    type="url"
                    value={siteUrl}
                    onChange={(e) => setSiteUrl(e.target.value)}
                    placeholder="https://example.com"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                )}
              </div>
            ) : (
              <input
                type="url"
                value={siteUrl}
                onChange={(e) => setSiteUrl(e.target.value)}
                placeholder="https://example.com"
                className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            )}
            <p className="text-[9.5px] text-slate-300 mt-1">Se conectara con Google Analytics, Search Console, PageSpeed y SEO</p>
          </div>
        </div>

        {/* Divider */}
        <div className="flex items-center justify-between py-3 border-t border-b border-slate-200 mb-6">
          <span className="text-[9px] font-bold tracking-[0.12em] uppercase text-slate-500">
            Contexto del proyecto
          </span>
          <span className="text-[9px] text-slate-300 italic">todo lo siguiente es opcional</span>
        </div>

        {/* Bloque 2: Context */}
        <div className="space-y-5">
          {/* Objective + Due date */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[9px] font-bold tracking-[0.12em] uppercase text-slate-400 mb-1.5">
                Objetivo principal
              </label>
              <input
                type="text"
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                placeholder="ej. Aumentar trafico organico 30%"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
            <div>
              <label className="block text-[9px] font-bold tracking-[0.12em] uppercase text-slate-400 mb-1.5">
                Fecha de entrega{" "}
                <span className="text-slate-300 italic font-normal normal-case tracking-normal">— vacio si es fee</span>
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
          </div>

          {/* KPIs */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[9px] font-bold tracking-[0.12em] uppercase text-slate-400">KPIs</label>
              <button onClick={addKpi} className="text-[10.5px] text-blue-500 hover:text-blue-600 flex items-center gap-1">
                <PlusIcon className="w-3 h-3" /> Anadir KPI
              </button>
            </div>
            {kpis.length === 0 ? (
              <p className="text-[11px] text-slate-300 italic">
                Sin KPIs definidos · el agente los monitorizara cuando los anadas
              </p>
            ) : (
              <div className="space-y-2">
                {kpis.map((kpi, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <select
                      value={kpi.metric}
                      onChange={(e) => updateKpi(i, "metric", e.target.value)}
                      className="flex-1 px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    >
                      {KPI_METRICS.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={kpi.target}
                      onChange={(e) => updateKpi(i, "target", e.target.value)}
                      placeholder="+30%"
                      className="w-24 px-2 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    />
                    <input
                      type="date"
                      value={kpi.deadline}
                      onChange={(e) => updateKpi(i, "deadline", e.target.value)}
                      className="w-32 px-2 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    />
                    <button
                      onClick={() => removeKpi(i)}
                      className="w-6 h-6 flex items-center justify-center rounded text-slate-300 hover:text-red-500 hover:bg-red-50"
                    >
                      <XMarkIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Repo */}
          <div>
            <label className="block text-[9px] font-bold tracking-[0.12em] uppercase text-slate-400 mb-1.5">
              Repositorio
            </label>
            <input
              type="text"
              value={repositoryUrl}
              onChange={(e) => setRepositoryUrl(e.target.value)}
              placeholder="https://github.com/..."
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
            <p className="text-[9.5px] text-slate-300 mt-1">Git · para proyectos de desarrollo</p>
          </div>

          {/* Tools */}
          <div>
            <label className="block text-[9px] font-bold tracking-[0.12em] uppercase text-slate-400 mb-2">
              Herramientas activas
            </label>
            <div className="flex flex-wrap gap-2">
              {TOOL_OPTIONS.map((tool) => {
                const isActive = activeTools.includes(tool.id);
                return (
                  <button
                    key={tool.id}
                    onClick={() => toggleTool(tool.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium border transition-all ${
                      isActive
                        ? "border-green-400/50 text-green-600 bg-green-50/60"
                        : "border-slate-200 text-slate-400 hover:border-slate-300"
                    }`}
                  >
                    <span className="text-xs">{tool.icon}</span>
                    {tool.label}
                    {isActive && <span className="text-[9px]">✓</span>}
                  </button>
                );
              })}
            </div>
            <p className="text-[9.5px] text-slate-300 mt-1.5">Activa las que el agente puede usar en este proyecto</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 mt-8 pt-5 border-t border-slate-200">
          <button
            onClick={handleCreate}
            disabled={creating || !name.trim()}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-50 transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            {creating ? "Creando..." : "Crear proyecto y cargar plantilla"}
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-500 text-sm hover:bg-slate-50 transition-colors"
          >
            Descartar
          </button>
        </div>
      </div>
    </div>
  );
}
