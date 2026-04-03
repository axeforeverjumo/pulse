import { useCallback, useEffect, useState, useRef, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useProjectsStore } from "../../stores/projectsStore";
import { useProjectBoards, usePrefetchBoards } from "../../hooks/queries/useProjects";
import { updateProjectBoard, deleteProjectBoard } from "../../api/client";
import { useQueryClient } from "@tanstack/react-query";
import { useViewContextStore } from "../../stores/viewContextStore";
import ProjectSidebar from "./components/ProjectSidebar";
import KanbanBoard from "./components/KanbanBoard";
import CreateProjectModal from "./components/CreateProjectModal";
import ProjectsFilterBar from "./components/ProjectsFilterBar";
import ProjectsListView from "./components/ProjectsListView";
import ProjectsSettingsModal from "./components/ProjectsSettingsModal";
import ProjectsSettingsDropdown from "./components/ProjectsSettingsDropdown";
import AgentQueuePanel from "./components/AgentQueuePanel";
import { HeaderButtons } from "../MiniAppHeader";
import { Columns3, PanelLeft, X } from "lucide-react";
import { Icon } from "../ui/Icon";

export default function ProjectsView() {
  const { workspaceId, boardId: urlBoardId } = useParams<{ workspaceId: string; boardId?: string }>();
  const navigate = useNavigate();
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const workspace = workspaces.find((w) => w.id === workspaceId);
  const projectsApp = workspace?.apps.find((app) => app.type === "projects");

  const workspaceAppId = useProjectsStore((state) => state.workspaceAppId);
  const projectsWorkspaceId = useProjectsStore((state) => state.workspaceId);
  const setWorkspaceAppId = useProjectsStore(
    (state) => state.setWorkspaceAppId,
  );
  const setWorkspaceId = useProjectsStore((state) => state.setWorkspaceId);
  const activeProjectId = useProjectsStore((state) => state.activeProjectId);
  const setActiveProject = useProjectsStore((state) => state.setActiveProject);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsModalTab, setSettingsModalTab] = useState<"board" | "app" | "agents" | "routines" | "team">("board");
  const [showSettingsDropdown, setShowSettingsDropdown] = useState(false);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const queryClient = useQueryClient();

  // React Query: fetch boards for auto-select
  const { data: boards = [] } = useProjectBoards(workspaceAppId);
  const prefetchBoards = usePrefetchBoards();
  const hasPrefetchedRef = useRef<string | null>(null);

  // Get active board name
  const activeBoard = useMemo(
    () => boards.find((b) => b.id === activeProjectId),
    [boards, activeProjectId]
  );

  // Prefetch ALL boards when entering projects view for instant switching
  useEffect(() => {
    if (workspaceAppId && boards.length > 0 && hasPrefetchedRef.current !== workspaceAppId) {
      hasPrefetchedRef.current = workspaceAppId;
      // Prefetch in background - don't await
      prefetchBoards(workspaceAppId);
    }
  }, [workspaceAppId, boards.length, prefetchBoards]);

  // Initialize workspace app context
  useEffect(() => {
    if (projectsApp?.id && projectsApp.id !== workspaceAppId) {
      setWorkspaceAppId(projectsApp.id);
    }
  }, [projectsApp?.id, workspaceAppId, setWorkspaceAppId]);

  // Initialize workspace context for member fetching
  useEffect(() => {
    if (workspaceId && workspaceId !== projectsWorkspaceId) {
      setWorkspaceId(workspaceId);
    }
  }, [workspaceId, projectsWorkspaceId, setWorkspaceId]);

  // Sync URL boardId to store
  useEffect(() => {
    if (urlBoardId && urlBoardId !== activeProjectId) {
      setActiveProject(urlBoardId);
    }
  }, [urlBoardId, activeProjectId, setActiveProject]);

  // Auto-select first board when boards are loaded and no board is selected
  useEffect(() => {
    if (!urlBoardId && !activeProjectId && boards.length > 0) {
      setActiveProject(boards[0].id);
    }
  }, [urlBoardId, activeProjectId, boards, setActiveProject]);

  // Keep URL in sync when store changes programmatically (e.g. auto-select after fetch)
  useEffect(() => {
    if (activeProjectId && activeProjectId !== urlBoardId && workspaceId) {
      window.history.replaceState(null, '', `/workspace/${workspaceId}/projects/${activeProjectId}`);
    }
  }, [activeProjectId, workspaceId, urlBoardId]);

  // Set view context for sidebar chat
  useEffect(() => {
    useViewContextStore.getState().setCurrentView("projects");
    return () => {
      useViewContextStore.getState().setCurrentView(null);
      useViewContextStore.getState().setCurrentProject(null);
      useViewContextStore.getState().setCurrentTask(null);
    };
  }, []);

  // Update project context when active board changes
  useEffect(() => {
    if (activeProjectId && activeBoard) {
      useViewContextStore.getState().setCurrentProject({
        id: activeProjectId,
        name: activeBoard.name,
        boardId: activeProjectId,
      });
    } else {
      useViewContextStore.getState().setCurrentProject(null);
    }
  }, [activeProjectId, activeBoard]);
  const navigateToProject = useCallback((boardId: string) => {
    navigate(`/workspace/${workspaceId}/projects/${boardId}`);
  }, [navigate, workspaceId]);
  const handleSelectProject = useCallback((boardId: string) => {
    navigateToProject(boardId);
    setIsMobileSidebarOpen(false);
  }, [navigateToProject]);

  const handleSaveBoardSettings = useCallback(async (updates: {
    name: string;
    description?: string;
    is_development?: boolean;
    project_url?: string;
    repository_url?: string;
    repository_full_name?: string;
    server_host?: string;
    server_ip?: string;
    server_user?: string;
    server_password?: string;
    server_port?: number;
  }) => {
    if (!activeProjectId) return;
    await updateProjectBoard(activeProjectId, updates);
    // Invalidate boards query to refresh the list
    queryClient.invalidateQueries({ queryKey: ["project-boards", workspaceAppId] });
  }, [activeProjectId, workspaceAppId, queryClient]);

  const handleDeleteBoard = useCallback(async () => {
    if (!activeProjectId || !workspaceId) return;
    await deleteProjectBoard(activeProjectId);
    // Invalidate and navigate to first remaining board or empty state
    queryClient.invalidateQueries({ queryKey: ["project-boards", workspaceAppId] });
    setActiveProject(null);
    navigate(`/workspace/${workspaceId}/projects`);
  }, [activeProjectId, workspaceAppId, workspaceId, queryClient, navigate, setActiveProject]);

  if (!workspace) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background-primary">
        <p className="text-text-tertiary">Espacio de trabajo no encontrado</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex h-full min-w-0 overflow-hidden">
      <div className="relative flex-1 flex min-w-0 overflow-hidden rounded-[20px] bg-gradient-to-b from-[#f6fbff] to-[#edf4fb]">
        {/* Desktop Sidebar */}
        <div className="hidden md:flex md:w-[232px] md:shrink-0 md:flex-col md:overflow-hidden">
          <ProjectSidebar onCreateClick={() => setShowCreateModal(true)} onSelectProject={handleSelectProject} />
        </div>

        {/* Mobile Sidebar Overlay */}
        {isMobileSidebarOpen && (
          <div
            className="absolute inset-0 z-30 bg-slate-950/28 md:hidden"
            onClick={() => setIsMobileSidebarOpen(false)}
          />
        )}
        <div
          className={`absolute inset-y-0 left-0 z-40 w-[84%] max-w-[292px] transition-transform duration-300 md:hidden ${
            isMobileSidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="h-full overflow-hidden border-r border-[#d2deec] shadow-2xl">
            <ProjectSidebar onCreateClick={() => setShowCreateModal(true)} onSelectProject={handleSelectProject} />
          </div>
        </div>

        {/* Board Content */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-white/92 md:rounded-r-[20px]">
          {activeProjectId ? (
            <>
              {/* Board Header */}
              <div className="h-14 flex items-center justify-between gap-2 border-b border-[#e4edf8] pl-3 pr-2 sm:pl-5 sm:pr-3">
                <div className="flex min-w-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsMobileSidebarOpen(true)}
                    className="md:hidden inline-flex h-8 items-center gap-1 rounded-lg border border-[#d7e4f2] bg-white px-2 text-xs font-semibold text-slate-700 shadow-sm"
                  >
                    <Icon icon={PanelLeft} size={14} />
                    Tableros
                  </button>
                  <Icon icon={Columns3} size={18} className="text-slate-700 hidden sm:block" />
                  <h1 className="text-sm sm:text-base font-semibold text-slate-900 truncate">
                    {activeBoard?.name || "Project Board"}
                  </h1>
                </div>
                <div className="flex items-center gap-2">
                  <AgentQueuePanel
                    workspaceId={workspaceId}
                    workspaceAppId={workspaceAppId}
                    boardId={activeProjectId}
                  />
                  <HeaderButtons
                    onSettingsClick={() => setShowSettingsDropdown(prev => !prev)}
                    settingsButtonRef={settingsButtonRef}
                  />
                </div>
              </div>
              {/* Filter bar + content area with overlay panels */}
              <div className="flex-1 flex flex-col overflow-hidden relative">
                <ProjectsFilterBar viewMode={viewMode} setViewMode={setViewMode} />
                <div className="flex-1 overflow-hidden">
                  {viewMode === "kanban" ? <KanbanBoard /> : <ProjectsListView />}
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center relative">
              <div className="text-center px-4">
                <button
                  type="button"
                  onClick={() => setIsMobileSidebarOpen((prev) => !prev)}
                  className="mb-4 md:hidden inline-flex h-9 items-center gap-2 rounded-xl border border-[#d7e4f2] bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm"
                >
                  <Icon icon={isMobileSidebarOpen ? X : PanelLeft} size={16} />
                  {isMobileSidebarOpen ? "Cerrar panel" : "Ver proyectos"}
                </button>
                <p className="text-text-tertiary mb-4">Sin proyectos aún</p>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="px-4 py-2 bg-brand-primary text-white rounded-lg hover:opacity-90 transition-opacity"
                >
                  Crea tu primer proyecto
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create Project Modal */}
      {showCreateModal && (
        <CreateProjectModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onCreated={handleSelectProject}
        />
      )}

      {/* Settings Dropdown */}
      <ProjectsSettingsDropdown
        isOpen={showSettingsDropdown}
        onClose={() => setShowSettingsDropdown(false)}
        trigger={settingsButtonRef}
        onBoardSettings={activeProjectId ? () => { setSettingsModalTab("board"); setShowSettingsModal(true); } : undefined}
        onAppSettings={() => { setSettingsModalTab("app"); setShowSettingsModal(true); }}
        onDelete={activeProjectId ? handleDeleteBoard : undefined}
      />

      {/* Projects Settings Modal */}
      <ProjectsSettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        board={activeBoard || null}
        initialTab={settingsModalTab}
        onSave={handleSaveBoardSettings}
        onDelete={handleDeleteBoard}
      />
    </div>
  );
}
