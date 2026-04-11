import { PlusIcon, BookmarkIcon } from "@heroicons/react/24/outline";
import { useViewTabsStore } from "../../stores/viewTabsStore";

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

interface Props {
  projects: any[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}

export default function ProjectSidebar({ projects, loading, selectedId, onSelect, onNew }: Props) {
  const pinnedTabs = useViewTabsStore((s) => s.tabs.filter((t) => t.state === "pinned"));
  const setActiveTab = useViewTabsStore((s) => s.setActiveTab);

  if (loading) {
    return (
      <div className="p-3 space-y-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-12 bg-slate-100 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  const active = projects.filter((p) => p.status === "active");
  const other = projects.filter((p) => p.status !== "active");

  return (
    <div className="p-2 space-y-1">
      {/* Section: Projects */}
      <div className="flex items-center justify-between px-2 py-1">
        <span className="text-[9px] font-bold tracking-[0.12em] uppercase text-slate-400">
          Proyectos
        </span>
        <button
          onClick={onNew}
          className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-blue-500 hover:bg-blue-50 transition-colors"
          title="Nuevo proyecto"
        >
          <PlusIcon className="w-3.5 h-3.5" />
        </button>
      </div>

      {active.map((project) => (
        <ProjectItem
          key={project.id}
          project={project}
          isSelected={project.id === selectedId}
          onSelect={onSelect}
        />
      ))}

      {active.length === 0 && (
        <div className="text-xs text-slate-400 px-2 py-3 text-center italic">
          Sin proyectos activos
        </div>
      )}

      {/* Pinned views */}
      {pinnedTabs.length > 0 && (
        <>
          <div className="mx-2 my-2 border-t border-slate-200" />
          <div className="flex items-center px-2 py-1">
            <span className="text-[9px] font-bold tracking-[0.12em] uppercase text-slate-400">
              Vistas guardadas
            </span>
          </div>
          {pinnedTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-[11px] text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors"
            >
              <BookmarkIcon className="w-3 h-3 text-blue-400 flex-shrink-0" />
              <span className="truncate">{tab.title}</span>
            </button>
          ))}
        </>
      )}

      {other.length > 0 && (
        <>
          <div className="px-2 pt-3 pb-1">
            <span className="text-[9px] font-bold tracking-[0.12em] uppercase text-slate-300">
              Archivados
            </span>
          </div>
          {other.map((project) => (
            <ProjectItem
              key={project.id}
              project={project}
              isSelected={project.id === selectedId}
              onSelect={onSelect}
            />
          ))}
        </>
      )}
    </div>
  );
}

function ProjectItem({
  project,
  isSelected,
  onSelect,
}: {
  project: any;
  isSelected: boolean;
  onSelect: (id: string) => void;
}) {
  const color = TYPE_COLORS[project.project_type] || "#5b7fff";
  const typeLabel = TYPE_LABELS[project.project_type] || project.project_type;
  return (
    <button
      onClick={() => onSelect(project.id)}
      className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-all border ${
        isSelected
          ? "bg-blue-50/80 border-blue-200/60 text-blue-700"
          : "border-transparent text-slate-600 hover:bg-slate-50 hover:border-slate-200/50"
      }`}
    >
      {/* Color dot */}
      <span
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: color }}
      />
      <div className="flex-1 min-w-0">
        <p className={`text-[11.5px] font-medium truncate ${isSelected ? "text-blue-700" : "text-slate-700"}`}>
          {project.name}
        </p>
        <p className="text-[9.5px] text-slate-400 truncate">
          {project.client_name ? `${project.client_name} · ` : ""}{typeLabel}
        </p>
      </div>
    </button>
  );
}
