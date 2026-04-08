import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { XMarkIcon, ChevronDownIcon } from "@heroicons/react/24/outline";
import type { ProjectBoard, WorkspaceServer } from "../../../api/client";
import { updateDeployConfig, triggerDeploy, listServers } from "../../../api/client";
import AgentStatsPanel from "./AgentStatsPanel";
import RoutinesPanel from "./RoutinesPanel";
import OrgChartPanel from "./OrgChartPanel";

interface ProjectsSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  board: ProjectBoard | null;
  initialTab?: "board" | "app" | "agents" | "routines" | "team";
  onSave: (updates: {
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
    deploy_mode?: 'local' | 'external' | 'dedicated';
    deploy_server_id?: string;
    deploy_subdomain?: string;
    deploy_url?: string;
    specs_enabled?: boolean;
  }) => Promise<void>;
  onDelete?: () => void;
}

export default function ProjectsSettingsModal({
  isOpen,
  onClose,
  board,
  initialTab = "board",
  onSave,
  onDelete,
}: ProjectsSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<"board" | "app" | "agents" | "routines" | "team">("board");
  const [editingName, setEditingName] = useState(board?.name || "");
  const [editingDescription, setEditingDescription] = useState(board?.description || "");
  const [isDevelopment, setIsDevelopment] = useState(Boolean(board?.is_development));
  const [projectUrl, setProjectUrl] = useState(board?.project_url || "");
  const [repositoryUrl, setRepositoryUrl] = useState(board?.repository_url || "");
  const [repositoryFullName, setRepositoryFullName] = useState(board?.repository_full_name || "");
  const [serverHost, setServerHost] = useState(board?.server_host || "");
  const [serverIp, setServerIp] = useState(board?.server_ip || "");
  const [serverUser, setServerUser] = useState(board?.server_user || "");
  const [serverPassword, setServerPassword] = useState(board?.server_password || "");
  const [serverPort, setServerPort] = useState(board?.server_port ? String(board.server_port) : "");
  const [deployMode, setDeployMode] = useState<'local' | 'external' | 'dedicated'>(board?.deploy_mode || 'local');
  const [deployServerId, setDeployServerId] = useState(board?.deploy_server_id || '');
  const [deploySubdomain, setDeploySubdomain] = useState(board?.deploy_subdomain || '');
  const [deployUrl, setDeployUrl] = useState(board?.deploy_url || '');
  const [specsEnabled, setSpecsEnabled] = useState(board?.specs_enabled !== false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Reset form when modal opens or board changes
  useEffect(() => {
    if (isOpen) {
      setEditingName(board?.name || "");
      setEditingDescription(board?.description || "");
      setIsDevelopment(Boolean(board?.is_development));
      setProjectUrl(board?.project_url || "");
      setRepositoryUrl(board?.repository_url || "");
      setRepositoryFullName(board?.repository_full_name || "");
      setServerHost(board?.server_host || "");
      setServerIp(board?.server_ip || "");
      setServerUser(board?.server_user || "");
      setServerPassword(board?.server_password || "");
      setServerPort(board?.server_port ? String(board.server_port) : "");
      setDeployMode(board?.deploy_mode || 'local');
      setDeployServerId(board?.deploy_server_id || '');
      setDeploySubdomain(board?.deploy_subdomain || '');
      setDeployUrl(board?.deploy_url || '');
      setSpecsEnabled(board?.specs_enabled !== false);
      setDeployError(null);
      setShowAdvancedOptions(false);
      setActiveTab(initialTab);
    }
  }, [isOpen, board, initialTab]);

  const handleSave = async () => {
    if (!editingName.trim() || isSaving) return;
    setIsSaving(true);
    try {
      await onSave({
        name: editingName.trim(),
        description: editingDescription.trim() || undefined,
        is_development: isDevelopment,
        project_url: isDevelopment ? (projectUrl.trim() || undefined) : undefined,
        repository_url: isDevelopment ? (repositoryUrl.trim() || undefined) : undefined,
        repository_full_name: isDevelopment ? (repositoryFullName.trim() || undefined) : undefined,
        server_host: isDevelopment ? (serverHost.trim() || undefined) : undefined,
        server_ip: isDevelopment ? (serverIp.trim() || undefined) : undefined,
        server_user: isDevelopment ? (serverUser.trim() || undefined) : undefined,
        server_password: isDevelopment ? (serverPassword.trim() || undefined) : undefined,
        server_port: isDevelopment && serverPort.trim() ? Number(serverPort.trim()) : undefined,
        deploy_mode: isDevelopment ? deployMode : undefined,
        deploy_server_id: isDevelopment && deployServerId.trim() ? deployServerId.trim() : undefined,
        deploy_subdomain: isDevelopment && deploySubdomain.trim() ? deploySubdomain.trim() : undefined,
        deploy_url: isDevelopment && deployUrl.trim() ? deployUrl.trim() : undefined,
        specs_enabled: isDevelopment ? specsEnabled : undefined,
      });
      onClose();
    } catch (err) {
      console.error("Failed to save board settings:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    setShowAdvancedOptions(false);
    onClose();
  };

  if (!isOpen) return null;

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-[9999]"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
        className="bg-white rounded-lg shadow-xl w-[520px] max-w-[calc(100%-2rem)] max-h-[80vh] flex flex-col overflow-hidden"
        style={{ minHeight: 400 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-5">
          <h2 className="text-lg font-semibold text-gray-900">Proyectos</h2>
          <button
            onClick={handleClose}
            className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-4 px-6 mb-4">
          <button
            onClick={() => setActiveTab("board")}
            className={`pb-2 text-sm font-medium transition-colors relative ${
              activeTab === "board"
                ? "text-gray-900"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Board Settings
            {activeTab === "board" && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-900 rounded-full" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("app")}
            className={`pb-2 text-sm font-medium transition-colors relative ${
              activeTab === "app"
                ? "text-gray-900"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            App Settings
            {activeTab === "app" && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-900 rounded-full" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("agents")}
            className={`pb-2 text-sm font-medium transition-colors relative ${
              activeTab === "agents"
                ? "text-gray-900"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Agentes
            {activeTab === "agents" && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-900 rounded-full" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("routines")}
            className={`pb-2 text-sm font-medium transition-colors relative ${
              activeTab === "routines"
                ? "text-gray-900"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Rutinas
            {activeTab === "routines" && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-900 rounded-full" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("team")}
            className={`pb-2 text-sm font-medium transition-colors relative ${
              activeTab === "team"
                ? "text-gray-900"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Equipo
            {activeTab === "team" && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-900 rounded-full" />
            )}
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === "board" ? (
          <>
            <div className="overflow-y-auto flex-1 px-6 py-3 space-y-4">
              {/* Board Details Section */}
              <div>
                <h3 className="text-xs font-medium text-text-secondary mb-2">
                  Details
                </h3>
                {/* Board Name */}
                <div className="mb-3">
                  <label className="block text-xs text-text-secondary mb-2">
                    Name
                  </label>
                  <input
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    placeholder="e.g. Product Roadmap"
                    className="w-full px-3 py-2.5 bg-white border border-border-gray rounded-lg text-sm outline-none focus:border-text-tertiary"
                  />
                </div>

                {/* Board Description */}
                <div>
                  <label className="block text-xs text-text-secondary mb-2">
                    Description{" "}
                    <span className="text-text-tertiary">(optional)</span>
                  </label>
                  <textarea
                    value={editingDescription}
                    onChange={(e) => setEditingDescription(e.target.value)}
                    placeholder="¿De qué trata este tablero?"
                    rows={2}
                    className="w-full px-3 py-2.5 bg-white border border-border-gray rounded-lg text-sm outline-none focus:border-text-tertiary resize-none"
                  />
                </div>
              </div>

              <div className="border border-border-light rounded-lg p-3 bg-[#f9fbff]">
                <label className="flex items-center gap-2 text-[13px] text-gray-700 cursor-pointer select-none mb-3">
                  <input
                    type="checkbox"
                    checked={isDevelopment}
                    onChange={(e) => setIsDevelopment(e.target.checked)}
                    className="rounded border-gray-300 text-gray-900 focus:ring-gray-300"
                  />
                  Proyecto de desarrollo
                </label>

                {isDevelopment && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-text-secondary mb-1">URL del proyecto</label>
                      <input
                        type="url"
                        value={projectUrl}
                        onChange={(e) => setProjectUrl(e.target.value)}
                        placeholder="https://miapp.com"
                        className="w-full px-3 py-2 text-[13px] border border-border-gray rounded-lg bg-white outline-none focus:border-text-tertiary"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="sm:col-span-2">
                        <label className="block text-xs text-text-secondary mb-1">Repositorio (URL)</label>
                        <input
                          type="url"
                          value={repositoryUrl}
                          onChange={(e) => setRepositoryUrl(e.target.value)}
                          placeholder="https://github.com/owner/repo"
                          className="w-full px-3 py-2 text-[13px] border border-border-gray rounded-lg bg-white outline-none focus:border-text-tertiary"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-xs text-text-secondary mb-1">Repositorio (owner/repo)</label>
                        <input
                          type="text"
                          value={repositoryFullName}
                          onChange={(e) => setRepositoryFullName(e.target.value)}
                          placeholder="owner/repo"
                          className="w-full px-3 py-2 text-[13px] border border-border-gray rounded-lg bg-white outline-none focus:border-text-tertiary"
                        />
                      </div>
                    </div>
                    <p className="text-[11px] text-text-tertiary -mt-1">
                      El commit automático del agente usa credenciales seguras del servidor; aquí solo defines el repo objetivo.
                    </p>

                    {/* Deploy mode selector */}
                    <div>
                      <label className="block text-xs text-text-secondary mb-1.5">Modo de ejecucion</label>
                      <div className="flex gap-2">
                        {([
                          { value: 'local' as const, label: 'Local', desc: 'Agente trabaja en este servidor' },
                          { value: 'external' as const, label: 'Externo', desc: 'SSH a otro servidor' },
                          { value: 'dedicated' as const, label: 'Dedicado', desc: 'GitHub + servidor dedicado' },
                        ]).map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setDeployMode(opt.value)}
                            className={`flex-1 px-3 py-2 text-[12px] rounded-lg border transition-colors ${
                              deployMode === opt.value
                                ? 'border-gray-900 bg-gray-900 text-white'
                                : 'border-border-gray bg-white text-text-secondary hover:border-gray-400'
                            }`}
                          >
                            <div className="font-medium">{opt.label}</div>
                            <div className={`text-[10px] mt-0.5 ${deployMode === opt.value ? 'text-gray-300' : 'text-text-tertiary'}`}>
                              {opt.desc}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Server selector from DevOps — shown for external/dedicated modes */}
                    {deployMode !== 'local' && (
                    <div>
                      <label className="block text-xs text-text-secondary mb-1">Servidor</label>
                      <ServerSelector
                        workspaceId={board?.workspace_id}
                        selectedServerId={deployServerId}
                        serverHost={serverHost}
                        onSelect={(server) => {
                          if (server) {
                            setDeployServerId(server.id);
                            setServerHost(server.name);
                            setServerIp(server.host);
                            setServerUser(server.username);
                            setServerPort(String(server.port || 22));
                          } else {
                            setDeployServerId('');
                            setServerHost('');
                            setServerIp('');
                            setServerUser('');
                            setServerPort('22');
                          }
                        }}
                      />
                    </div>

                    {/* Show resolved server details (read-only) */}
                    {serverIp && (
                      <div className="grid grid-cols-3 gap-2 text-[11px] text-text-tertiary bg-gray-50 rounded-lg px-3 py-2">
                        <div><span className="font-medium">IP:</span> {serverIp}</div>
                        <div><span className="font-medium">User:</span> {serverUser || 'root'}</div>
                        <div><span className="font-medium">Puerto:</span> {serverPort || '22'}</div>
                      </div>
                    )}

                    <p className="text-[11px] text-text-tertiary">
                      Estos datos se usan como contexto de ejecucion para agentes.
                    </p>
                    </div>
                    )}

                    {/* Deploy mode info */}
                    {deployMode === 'local' && (
                      <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-lg">
                        <p className="text-[11px] text-blue-800">
                          <span className="font-medium">Modo Local:</span> El agente buscara el repositorio en el servidor ({repositoryFullName ? `/opt/projects/${repositoryFullName.split('/').pop()}` : 'auto-detectado'}). Si no existe, lo clonara automaticamente.
                        </p>
                      </div>
                    )}

                    {/* Deploy info */}
                    <div className="border-t border-border-light pt-3 mt-3">
                      <p className="text-[11px] text-text-tertiary">
                        {deployMode === 'local'
                          ? 'Modo local — el agente trabaja directamente en el servidor'
                          : deployMode === 'external'
                          ? `Modo externo — SSH a ${serverIp || 'servidor por configurar'}`
                          : `Modo dedicado — deploy en ${serverHost || 'servidor por configurar'}`}
                      </p>

                      {deployServerId && deploySubdomain && (
                        <div className="mt-3">
                          <button
                            type="button"
                            onClick={async () => {
                              if (!board?.id) return;
                              setIsDeploying(true);
                              setDeployError(null);
                              try {
                                await updateDeployConfig(board.id, {
                                  deploy_mode: 'dedicated',
                                  deploy_server_id: deployServerId,
                                  deploy_subdomain: deploySubdomain,
                                });
                                const result = await triggerDeploy(board.id);
                                setDeployUrl(result.deploy_url);
                              } catch (err) {
                                setDeployError(err instanceof Error ? err.message : 'Error al desplegar');
                              } finally {
                                setIsDeploying(false);
                              }
                            }}
                            disabled={isDeploying}
                            className="px-3 py-1.5 text-xs font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50"
                          >
                            {isDeploying ? 'Desplegando...' : 'Desplegar ahora'}
                          </button>
                          {deployError && (
                            <p className="text-[11px] text-red-500 mt-1">{deployError}</p>
                          )}
                        </div>
                      )}

                      {deployUrl && (
                        <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded-lg">
                          <p className="text-[11px] text-text-secondary mb-0.5">URL de despliegue</p>
                          <a
                            href={deployUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[13px] text-blue-600 hover:underline break-all"
                          >
                            {deployUrl}
                          </a>
                        </div>
                      )}
                    </div>

                    {/* Specs Toggle */}
                    <div className="border-t border-border-light pt-3 mt-3">
                      <label className="flex items-center gap-2 text-[13px] text-gray-700 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={specsEnabled}
                          onChange={(e) => setSpecsEnabled(e.target.checked)}
                          className="rounded border-gray-300 text-gray-900 focus:ring-gray-300"
                        />
                        Generar especificaciones automáticas
                      </label>
                      <p className="text-[11px] text-text-tertiary mt-1 ml-5">
                        Los agentes crearán specs/SPEC.md documentando cada cambio realizado.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Collapsible Advanced Options */}
              {onDelete && (
                <div className="border-t border-border-light pt-4">
                  <button
                    onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                    className="flex items-center gap-2 text-xs text-text-tertiary hover:text-text-secondary transition-colors"
                  >
                    <ChevronDownIcon
                      className="w-3 h-3"
                      style={{
                        transform: showAdvancedOptions ? "rotate(0deg)" : "rotate(-90deg)",
                        transition: "transform 0.15s ease",
                      }}
                    />
                    Advanced options
                  </button>
                  {showAdvancedOptions && (
                    <div className="mt-3">
                      <p className="text-xs text-text-tertiary mb-3">
                        Deleting this board will permanently remove all cards and data. This action no se puede deshacer.
                      </p>
                      <button
                        onClick={() => {
                          handleClose();
                          onDelete();
                        }}
                        className="px-3 py-1.5 text-xs text-red-600 border border-red-200 rounded-md hover:bg-red-50 transition-colors"
                      >
                        Delete board
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Board Settings Footer */}
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-border-light">
              <button
                onClick={handleClose}
                className="px-4 py-2 text-sm text-text-secondary hover:bg-bg-gray rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!editingName.trim() || isSaving}
                className="px-4 py-2 text-sm bg-black text-white rounded-lg disabled:opacity-50"
              >
                {isSaving ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </>
        ) : activeTab === "app" ? (
          <>
            {/* App Settings Tab Content */}
            <div className="overflow-y-auto flex-1 px-6 py-4">
              <h3 className="text-sm font-medium text-gray-900 mb-4">
                Permissions
              </h3>
              <div className="space-y-1">
                {/* Notifications Toggle */}
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      Notifications
                    </p>
                    <p className="text-[13px] text-gray-500">
                      Receive notifications from this app
                    </p>
                  </div>
                  <button
                    className="relative w-11 h-6 bg-gray-200 rounded-full transition-colors cursor-not-allowed"
                    disabled
                  >
                    <span className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full shadow transition-transform" />
                  </button>
                </div>
              </div>
            </div>

            {/* App Settings Footer */}
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-border-light">
              <button
                onClick={handleClose}
                className="px-4 py-2 text-sm text-text-secondary hover:bg-bg-gray rounded-lg"
              >
                Cancel
              </button>
              <button
                disabled
                className="px-4 py-2 text-sm bg-black text-white rounded-lg disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </>
        ) : activeTab === "agents" ? (
          <>
            {/* Agent Stats Tab Content */}
            <div className="overflow-y-auto flex-1 px-6 py-4">
              <h3 className="text-sm font-medium text-gray-900 mb-4">
                Estadísticas de Agentes
              </h3>
              <AgentStatsPanel boardId={board?.id ?? null} />
            </div>

            {/* Agent Stats Footer */}
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-border-light">
              <button
                onClick={handleClose}
                className="px-4 py-2 text-sm text-text-secondary hover:bg-bg-gray rounded-lg"
              >
                Cerrar
              </button>
            </div>
          </>
        ) : activeTab === "routines" ? (
          <>
            {/* Routines Tab Content */}
            <div className="overflow-y-auto flex-1 px-6 py-4">
              <h3 className="text-sm font-medium text-gray-900 mb-4">
                Tareas Recurrentes
              </h3>
              <RoutinesPanel
                boardId={board?.id ?? null}
                workspaceId={board?.workspace_id ?? null}
              />
            </div>

            {/* Routines Footer */}
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-border-light">
              <button
                onClick={handleClose}
                className="px-4 py-2 text-sm text-text-secondary hover:bg-bg-gray rounded-lg"
              >
                Cerrar
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Team Org Chart Tab Content */}
            <div className="overflow-y-auto flex-1 px-6 py-4">
              <OrgChartPanel
                workspaceId={board?.workspace_id ?? null}
                workspaceName={board?.name}
              />
            </div>

            {/* Team Footer */}
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-border-light">
              <button
                onClick={handleClose}
                className="px-4 py-2 text-sm text-text-secondary hover:bg-bg-gray rounded-lg"
              >
                Cerrar
              </button>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>,
    document.body
  );
}

// ============================================================================
// Server Selector — picks from DevOps servers
// ============================================================================

function ServerSelector({
  workspaceId,
  selectedServerId,
  serverHost,
  onSelect,
}: {
  workspaceId?: string;
  selectedServerId: string;
  serverHost: string;
  onSelect: (server: WorkspaceServer | null) => void;
}) {
  const [servers, setServers] = useState<WorkspaceServer[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!workspaceId) return;
    setLoading(true);
    listServers(workspaceId)
      .then((res) => setServers(res.servers || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [workspaceId]);

  const selected = servers.find((s) => s.id === selectedServerId);
  const displayName = selected?.name || serverHost || '';

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 text-[13px] border border-border-gray rounded-lg bg-white outline-none focus:border-text-tertiary text-left"
      >
        <span className={displayName ? 'text-gray-900' : 'text-gray-400'}>
          {loading ? 'Cargando servidores...' : displayName || 'Seleccionar servidor...'}
        </span>
        <ChevronDownIcon className="w-4 h-4 text-gray-400 shrink-0" />
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {/* None option */}
          <button
            type="button"
            onClick={() => { onSelect(null); setOpen(false); }}
            className="w-full px-3 py-2 text-[12px] text-gray-400 hover:bg-gray-50 text-left"
          >
            Sin servidor
          </button>

          {servers.length === 0 && !loading && (
            <div className="px-3 py-3 text-[11px] text-gray-400 text-center">
              No hay servidores en DevOps.
              <br />
              Anade uno desde la app DevOps primero.
            </div>
          )}

          {servers.map((server) => (
            <button
              key={server.id}
              type="button"
              onClick={() => { onSelect(server); setOpen(false); }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-[12px] hover:bg-gray-50 text-left ${
                server.id === selectedServerId ? 'bg-indigo-50 text-indigo-700' : 'text-gray-700'
              }`}
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${
                server.status === 'verified' ? 'bg-green-500' :
                server.status === 'failed' ? 'bg-red-500' :
                'bg-gray-300'
              }`} />
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{server.name}</div>
                <div className="text-[10px] text-gray-400">{server.host} &middot; {server.username}@:{server.port || 22}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
