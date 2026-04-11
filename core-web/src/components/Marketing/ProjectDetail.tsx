import { useState, useEffect } from "react";
import {
  Cog6ToothIcon,
  TrashIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import { getMarketingTasks } from "../../api/client";
import KanbanTab from "./tabs/KanbanTab";
import GanttTab from "./tabs/GanttTab";
import CalendarTab from "./tabs/CalendarTab";
import TablaTab from "./tabs/TablaTab";
import CargaTab from "./tabs/CargaTab";
import RutinasTab from "./tabs/RutinasTab";
import GoogleSuiteTab from "./tabs/GoogleSuiteTab";
import { getMarketingKanbanColumns } from "../../api/client";

const TYPE_COLORS: Record<string, string> = {
  seo: "#5b7fff",
  ads: "#f5a623",
  content: "#e879a0",
  web: "#22d3ee",
  social: "#1ec97e",
  estrategia: "#a78bfa",
};

const TYPE_LABELS: Record<string, string> = {
  seo: "SEO",
  ads: "Paid Media",
  content: "Content",
  web: "Web · Dev",
  social: "Social",
  estrategia: "Estrategia",
};

// Tab bar definition matching the spec
const PERMANENT_TABS = [
  { id: "tablero", label: "Tablero", icon: "⊞", group: 1 },
  { id: "gantt", label: "Gantt", icon: "📅", group: 1 },
  { id: "calendario", label: "Calendario", icon: "🗓", group: 1 },
  { id: "tabla", label: "Tabla", icon: "☰", group: 1 },
  // separator
  { id: "carga", label: "Carga", icon: "👥", group: 2 },
  { id: "rutinas", label: "Rutinas", icon: "↻", group: 2 },
  { id: "google", label: "Conexiones", icon: "🔗", group: 2 },
] as const;

type TabId = (typeof PERMANENT_TABS)[number]["id"];

interface Props {
  project: any;
  workspaceId: string;
  onUpdated: (project: any) => void;
  onDeleted: (id: string) => void;
  onOpenConfig: () => void;
}

export default function ProjectDetail({
  project,
  workspaceId,
  onUpdated: _onUpdated,
  onDeleted,
  onOpenConfig,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("tablero");
  const [columns, setColumns] = useState<any[]>([]);
  const [agentTaskCount, setAgentTaskCount] = useState(0);

  const color = TYPE_COLORS[project.project_type] || "#5b7fff";
  const typeLabel = TYPE_LABELS[project.project_type] || project.project_type;

  useEffect(() => {
    loadColumns();
    loadAgentTasks();
    const interval = setInterval(loadAgentTasks, 10000);
    return () => clearInterval(interval);
  }, [project.id]);

  async function loadAgentTasks() {
    try {
      const data = await getMarketingTasks(project.site_id || project.id, { status: "in_progress" });
      const agentTasks = (data.tasks || []).filter((t: any) => t.assigned_agent);
      setAgentTaskCount(agentTasks.length);
    } catch {}
  }

  async function loadColumns() {
    try {
      const cols = await getMarketingKanbanColumns(project.id);
      setColumns(cols);
    } catch (e) {
      console.error("Failed to load columns", e);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Project header */}
      <div className="px-5 pt-3 pb-0 flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
              style={{ background: `linear-gradient(135deg, ${color}, ${color}dd)` }}
            >
              {project.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-slate-900 truncate">
                {project.name}
              </h2>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                {project.client_name && (
                  <span>{project.client_name}</span>
                )}
                <span
                  className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider"
                  style={{
                    backgroundColor: `${color}18`,
                    color: color,
                  }}
                >
                  {typeLabel}
                </span>
                {project.objective && (
                  <span className="text-slate-300 truncate max-w-[200px]">
                    {project.objective}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* Cola IA */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-[11px] text-slate-500">
              <SparklesIcon className="w-3.5 h-3.5" />
              Cola IA
              <span className={`min-w-[18px] text-center text-[10px] font-bold px-1 py-0.5 rounded-full ${
                agentTaskCount > 0 ? "bg-blue-100 text-blue-600" : "bg-slate-100 text-slate-400"
              }`}>
                {agentTaskCount}
              </span>
            </div>
            <button
              onClick={onOpenConfig}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              title="Configuracion del proyecto"
            >
              <Cog6ToothIcon className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                if (confirm(`Eliminar "${project.name}"?`)) {
                  onDeleted(project.id);
                }
              }}
              className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
              title="Eliminar proyecto"
            >
              <TrashIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab bar — matching spec layout with separator */}
        <div className="flex items-stretch gap-0 border-b border-[#e4edf8] overflow-x-auto">
          {PERMANENT_TABS.map((tab, i) => {
            // Insert separator between group 1 and group 2
            const prevTab = PERMANENT_TABS[i - 1];
            const showSep = prevTab && prevTab.group !== tab.group;

            return (
              <div key={tab.id} className="flex items-stretch">
                {showSep && (
                  <div className="w-px bg-slate-200 mx-1.5 my-2" />
                )}
                <button
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-2 text-[11.5px] font-medium border-b-2 transition-colors whitespace-nowrap rounded-t-md ${
                    activeTab === tab.id
                      ? "border-blue-500 text-blue-600 bg-blue-50/40"
                      : "border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-50/60"
                  }`}
                >
                  <span className="text-[11px] opacity-70">{tab.icon}</span>
                  {tab.label}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "tablero" && (
          <KanbanTab
            project={project}
            workspaceId={workspaceId}
            columns={columns}
            onColumnsChanged={loadColumns}
          />
        )}
        {activeTab === "gantt" && (
          <GanttTab project={project} workspaceId={workspaceId} />
        )}
        {activeTab === "calendario" && (
          <CalendarTab project={project} workspaceId={workspaceId} />
        )}
        {activeTab === "tabla" && (
          <TablaTab project={project} workspaceId={workspaceId} />
        )}
        {activeTab === "carga" && (
          <CargaTab project={project} workspaceId={workspaceId} />
        )}
        {activeTab === "rutinas" && (
          <RutinasTab project={project} workspaceId={workspaceId} />
        )}
        {activeTab === "google" && (
          <GoogleSuiteTab project={project} workspaceId={workspaceId} />
        )}
      </div>
    </div>
  );
}
