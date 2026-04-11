import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import {
  PlusIcon,
  MagnifyingGlassIcon,
  FolderIcon,
} from "@heroicons/react/24/outline";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useViewContextStore } from "../../stores/viewContextStore";
import ViewTopBar from "../ui/ViewTopBar";
import ProjectSidebar from "./ProjectSidebar";
import ProjectDetail from "./ProjectDetail";
import NewProjectForm from "./NewProjectForm";
import ProjectConfigModal from "./ProjectConfigModal";
import {
  getMarketingProjects,
  deleteMarketingProject,
} from "../../api/client";
import { toast } from "sonner";

export default function MarketingView() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const workspace = workspaces.find((w) => w.id === workspaceId);
  const effectiveWorkspaceId = workspaceId || workspace?.id || "";

  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showNewProject, setShowNewProject] = useState(false);
  const [showConfig, setShowConfig] = useState(false);

  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  // Set view context for agent chat
  useEffect(() => {
    const store = useViewContextStore.getState();
    store.setCurrentView("marketing");
    if (selectedProject) {
      store.setMarketingSite({
        id: selectedProject.id,
        name: selectedProject.name,
        domain: selectedProject.client_name || selectedProject.project_type,
        url: "",
        ga4_property_id: undefined,
        gsc_site_url: undefined,
        repository_url: selectedProject.repository_url,
        last_audit_score: undefined,
      });
    } else {
      store.setMarketingSite(null);
    }
    return () => {
      const current = useViewContextStore.getState();
      if (current.currentView === "marketing") {
        current.setCurrentView(null);
        current.setMarketingSite(null);
      }
    };
  }, [selectedProject?.id]);

  useEffect(() => {
    if (effectiveWorkspaceId) fetchProjects();
  }, [effectiveWorkspaceId]);

  async function fetchProjects() {
    setLoading(true);
    try {
      const data = await getMarketingProjects(effectiveWorkspaceId);
      setProjects(data.projects || []);
      // Auto-select first project if none selected
      if (!selectedProjectId && data.projects?.length > 0) {
        setSelectedProjectId(data.projects[0].id);
      }
    } catch (e) {
      console.error("Failed to load projects", e);
    } finally {
      setLoading(false);
    }
  }

  const handleProjectCreated = useCallback((project: any) => {
    setProjects((prev) => [project, ...prev]);
    setSelectedProjectId(project.id);
    setShowNewProject(false);
    toast.success("Proyecto creado");
  }, []);

  const handleProjectUpdated = useCallback((updated: any) => {
    setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  }, []);

  const handleProjectDeleted = useCallback(async (id: string) => {
    try {
      await deleteMarketingProject(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
      if (selectedProjectId === id) setSelectedProjectId(null);
      toast.success("Proyecto eliminado");
    } catch (e: any) {
      toast.error("Error: " + (e.message || ""));
    }
  }, [selectedProjectId]);

  const filteredProjects = search
    ? projects.filter(
        (p) =>
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          (p.client_name || "").toLowerCase().includes(search.toLowerCase())
      )
    : projects;

  return (
    <div className="flex-1 flex h-full min-w-0 overflow-hidden">
      <div className="relative flex-1 flex min-w-0 overflow-hidden rounded-[20px] bg-gradient-to-b from-[#f6fbff] to-[#edf4fb]">
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-white/92 md:rounded-[20px]">
          <ViewTopBar
            title="Marketing"
            pill={{ label: showNewProject ? "Nuevo" : "Produccion", color: showNewProject ? "amber" : "accent" }}
            cta={{
              label: "Nuevo proyecto",
              icon: <PlusIcon className="w-3.5 h-3.5" />,
              onClick: () => setShowNewProject(true),
            }}
          />

          <div className="flex flex-1 overflow-hidden">
            {/* Sidebar: projects list */}
            <div className="w-56 border-r border-[#e4edf8] flex flex-col flex-shrink-0 bg-white/60">
              {/* Search */}
              <div className="p-2.5 border-b border-[#e4edf8]">
                <div className="relative">
                  <MagnifyingGlassIcon className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 transition-colors"
                  />
                </div>
              </div>

              {/* Projects list */}
              <div className="flex-1 overflow-y-auto">
                <ProjectSidebar
                  projects={filteredProjects}
                  loading={loading}
                  selectedId={selectedProjectId}
                  onSelect={(id) => {
                    setSelectedProjectId(id);
                    setShowNewProject(false);
                  }}
                  onNew={() => setShowNewProject(true)}
                />
              </div>
            </div>

            {/* Main content */}
            <div className="flex-1 overflow-hidden flex flex-col min-w-0">
              {showNewProject ? (
                <NewProjectForm
                  workspaceId={effectiveWorkspaceId}
                  onCreated={handleProjectCreated}
                  onCancel={() => setShowNewProject(false)}
                />
              ) : selectedProject ? (
                <ProjectDetail
                  project={selectedProject}
                  workspaceId={effectiveWorkspaceId}
                  onUpdated={handleProjectUpdated}
                  onDeleted={handleProjectDeleted}
                  onOpenConfig={() => setShowConfig(true)}
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-slate-400">
                  <FolderIcon className="w-16 h-16 mb-4 text-slate-300" />
                  <p className="text-lg font-medium mb-1 text-slate-500">
                    Selecciona un proyecto
                  </p>
                  <p className="text-sm">
                    o crea uno nuevo para empezar
                  </p>
                  <button
                    onClick={() => setShowNewProject(true)}
                    className="mt-4 flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-xl border border-dashed border-blue-300 text-blue-600 hover:bg-blue-50 transition-colors"
                  >
                    <PlusIcon className="w-4 h-4" />
                    Nuevo proyecto
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Config modal */}
      {showConfig && selectedProject && (
        <ProjectConfigModal
          project={selectedProject}
          workspaceId={effectiveWorkspaceId}
          onClose={() => setShowConfig(false)}
          onUpdated={handleProjectUpdated}
          onDeleted={handleProjectDeleted}
        />
      )}
    </div>
  );
}
