import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjectsStore } from '../../../stores/projectsStore';
import { useCreateBoard } from '../../../hooks/queries/useProjects';
import { api, createGitHubRepo, listServers, listRepoTokens, type WorkspaceServer, type RepoToken } from '../../../api/client';
import Modal from '../../Modal/Modal';

type DeployMode = 'local' | 'external' | 'dedicated';

const DEPLOY_OPTIONS: { value: DeployMode; icon: string; label: string; desc: string }[] = [
  { value: 'local', icon: '🖥️', label: 'Local', desc: 'Servidor principal' },
  { value: 'external', icon: '🌐', label: 'Externo', desc: 'Servidor de pruebas' },
  { value: 'dedicated', icon: '🔧', label: 'Dedicado', desc: 'Servidor completo' },
];

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (boardId: string) => void;
}

export default function CreateProjectModal({
  isOpen,
  onClose,
  onCreated,
}: CreateProjectModalProps) {
  // Basic fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isDevelopment, setIsDevelopment] = useState(false);

  // Deploy config
  const [deployMode, setDeployMode] = useState<DeployMode>('local');
  const [deployServerId, setDeployServerId] = useState('');
  const [deploySubdomain, setDeploySubdomain] = useState('');

  // Servers from workspace
  const [servers, setServers] = useState<WorkspaceServer[]>([]);
  const [loadingServers, setLoadingServers] = useState(false);

  // GitHub
  const [repoMode, setRepoMode] = useState<'url' | 'create'>('url');
  const [repositoryUrl, setRepositoryUrl] = useState('');
  const [newRepoName, setNewRepoName] = useState('');
  const [githubToken, setGithubToken] = useState('');
  const [_showToken, _setShowToken] = useState(false);
  void _showToken; void _setShowToken;
  const [isCreatingRepo, setIsCreatingRepo] = useState(false);
  const [githubError, setGithubError] = useState<string | null>(null);

  // Saved tokens
  const [savedTokens, setSavedTokens] = useState<RepoToken[]>([]);
  const [selectedTokenId, setSelectedTokenId] = useState<string>('');
  const [useManualToken, setUseManualToken] = useState(false);

  const navigate = useNavigate();
  const workspaceAppId = useProjectsStore((state) => state.workspaceAppId);
  const workspaceId = useProjectsStore((state) => state.workspaceId);
  const createBoard = useCreateBoard(workspaceAppId);

  const needsServer = deployMode === 'external' || deployMode === 'dedicated';

  // Parse owner/repo from URL
  const parsedRepo = useMemo(() => {
    try {
      const url = new URL(repositoryUrl.trim());
      const parts = url.pathname.replace(/^\//, '').replace(/\.git$/, '').split('/');
      if (parts.length >= 2) return `${parts[0]}/${parts[1]}`;
    } catch { /* ignore */ }
    return '';
  }, [repositoryUrl]);

  // Selected server's wildcard domain for subdomain preview
  const selectedServer = useMemo(
    () => servers.find((s) => s.id === deployServerId),
    [servers, deployServerId]
  );
  const subdomainPreview = useMemo(() => {
    if (!deploySubdomain.trim() || !selectedServer?.wildcard_domain) return '';
    return `${deploySubdomain.trim()}.${selectedServer.wildcard_domain}`;
  }, [deploySubdomain, selectedServer]);

  // Load servers when dev mode + needs server
  useEffect(() => {
    if (!isOpen || !isDevelopment || !needsServer || !workspaceId) return;
    if (servers.length > 0) return; // already loaded
    setLoadingServers(true);
    listServers(workspaceId)
      .then((res) => {
        setServers(res.servers || []);
        // Auto-select default server
        const def = (res.servers || []).find((s) => s.is_default);
        if (def) setDeployServerId(def.id);
      })
      .catch(() => setServers([]))
      .finally(() => setLoadingServers(false));
  }, [isOpen, isDevelopment, needsServer, workspaceId]);

  // Load saved tokens when dev mode is activated
  useEffect(() => {
    if (!isOpen || !isDevelopment || !workspaceId) return;
    if (savedTokens.length > 0) return;
    listRepoTokens(workspaceId)
      .then((res) => {
        setSavedTokens(res.tokens || []);
        // Auto-select default token
        const def = (res.tokens || []).find((t) => t.is_default);
        if (def) setSelectedTokenId(def.id);
      })
      .catch(() => setSavedTokens([]));
  }, [isOpen, isDevelopment, workspaceId]);

  const reset = () => {
    setName('');
    setDescription('');
    setIsDevelopment(false);
    setDeployMode('local');
    setDeployServerId('');
    setDeploySubdomain('');
    setServers([]);
    setRepoMode('url');
    setRepositoryUrl('');
    setNewRepoName('');
    setGithubToken('');
    setShowToken(false);
    setGithubError(null);
    setSavedTokens([]);
    setSelectedTokenId('');
    setUseManualToken(false);
  };

  // Resolve the effective token (manual or saved)
  const hasToken = useManualToken ? !!githubToken.trim() : !!selectedTokenId;

  const handleCreateRepo = async () => {
    if (!newRepoName.trim()) return;
    setIsCreatingRepo(true);
    setGithubError(null);
    try {
      let tokenValue = githubToken.trim();
      // If using a saved token, fetch its decrypted value
      if (!useManualToken && selectedTokenId) {
        const res = await api<{ value: string }>(`/servers/tokens/${selectedTokenId}/value`);
        tokenValue = res.value;
      }
      if (!tokenValue) {
        setGithubError('No se encontro un token valido');
        return;
      }
      const result = await createGitHubRepo({
        token: tokenValue,
        name: newRepoName.trim(),
        private: true,
        description: `Repository for ${name.trim() || newRepoName.trim()}`,
      });
      const created = result.repo;
      setRepositoryUrl(created.html_url || '');
      setRepoMode('url');
      setNewRepoName('');
    } catch (error) {
      setGithubError(error instanceof Error ? error.message : 'No pude crear el repositorio');
    } finally {
      setIsCreatingRepo(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      const result = await createBoard.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
        is_development: isDevelopment,
        ...(isDevelopment
          ? {
              deploy_mode: deployMode,
              deploy_server_id: needsServer && deployServerId ? deployServerId : undefined,
              deploy_subdomain: needsServer && deploySubdomain.trim() ? deploySubdomain.trim() : undefined,
              repository_url: repositoryUrl.trim() || undefined,
              repository_full_name: parsedRepo || undefined,
            }
          : {}),
      });
      if (result.board && onCreated) {
        onCreated(result.board.id);
      }
      reset();
      onClose();
    } catch (error) {
      console.error('Failed to create project:', error);
    }
  };

  const inputCls =
    'w-full px-3 py-2 text-[13px] text-gray-900 bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400 placeholder:text-gray-400 transition-colors';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Nuevo proyecto">
      <form onSubmit={handleSubmit} className="space-y-4" style={{ maxWidth: 480 }}>
        {/* Name */}
        <div>
          <label className="block text-[12px] font-medium text-gray-500 mb-1.5">Nombre</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Pulse Core API"
            className="w-full px-3 py-2 text-[14px] text-gray-900 bg-transparent border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400 placeholder:text-gray-400"
            autoFocus
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-[12px] font-medium text-gray-500 mb-1.5">
            Descripcion <span className="text-gray-400 font-normal">(opcional)</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Objetivo del proyecto..."
            rows={2}
            className="w-full px-3 py-2 text-[14px] text-gray-900 bg-transparent border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400 placeholder:text-gray-400 resize-none"
          />
        </div>

        {/* Development toggle */}
        <label className="flex items-center gap-2 text-[13px] text-gray-700 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={isDevelopment}
            onChange={(e) => setIsDevelopment(e.target.checked)}
            className="rounded border-gray-300 text-gray-900 focus:ring-gray-300"
          />
          Proyecto de desarrollo
        </label>

        {/* Development section */}
        {isDevelopment && (
          <div className="space-y-4 border border-gray-100 bg-gray-50/50 rounded-xl p-4">
            {/* Deploy mode cards */}
            <div>
              <label className="block text-[12px] font-medium text-gray-500 mb-2">
                Modo de despliegue
              </label>
              <div className="grid grid-cols-3 gap-2">
                {DEPLOY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setDeployMode(opt.value)}
                    className={`
                      flex flex-col items-center gap-1 px-3 py-3 rounded-lg border text-center transition-all cursor-pointer
                      ${
                        deployMode === opt.value
                          ? 'border-gray-900 bg-white shadow-sm ring-1 ring-gray-900/5'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      }
                    `}
                  >
                    <span className="text-lg leading-none">{opt.icon}</span>
                    <span className="text-[12px] font-medium text-gray-900">{opt.label}</span>
                    <span className="text-[10px] text-gray-500 leading-tight">{opt.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Server selection (external/dedicated only) */}
            {needsServer && (
              <div className="space-y-3">
                <div>
                  <label className="block text-[12px] font-medium text-gray-500 mb-1.5">
                    Servidor
                  </label>
                  {loadingServers ? (
                    <div className="px-3 py-2 text-[13px] text-gray-400 border border-gray-200 rounded-lg bg-white">
                      Cargando servidores...
                    </div>
                  ) : servers.length === 0 ? (
                    <div className="px-3 py-2 text-[13px] text-gray-500 border border-dashed border-gray-200 rounded-lg bg-white text-center">
                      No hay servidores configurados.{' '}
                      <span
                        className="text-gray-900 underline underline-offset-2 cursor-pointer"
                        onClick={() => {
                          reset();
                          onClose();
                          navigate(`/workspace/${workspaceId}/devops`);
                        }}
                      >
                        Configura uno en DevOps
                      </span>
                    </div>
                  ) : (
                    <select
                      value={deployServerId}
                      onChange={(e) => setDeployServerId(e.target.value)}
                      className={inputCls}
                    >
                      <option value="">Selecciona un servidor</option>
                      {servers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.host})
                          {s.status === 'verified' ? ' ✓' : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Subdomain */}
                <div>
                  <label className="block text-[12px] font-medium text-gray-500 mb-1.5">
                    Subdominio
                  </label>
                  <input
                    type="text"
                    value={deploySubdomain}
                    onChange={(e) => setDeploySubdomain(e.target.value.replace(/[^a-z0-9-]/gi, '').toLowerCase())}
                    placeholder="miapp"
                    className={inputCls}
                  />
                  {subdomainPreview && (
                    <p className="mt-1 text-[11px] text-gray-400">
                      URL: <span className="text-gray-600 font-medium">{subdomainPreview}</span>
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Separator */}
            <div className="border-t border-gray-200" />

            {/* GitHub section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-medium text-gray-500">Repositorio GitHub</span>
                <div className="flex gap-1 bg-gray-100 rounded-md p-0.5">
                  <button
                    type="button"
                    onClick={() => setRepoMode('url')}
                    className={`px-2 py-0.5 text-[11px] rounded transition-colors ${
                      repoMode === 'url'
                        ? 'bg-white text-gray-900 shadow-sm font-medium'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    URL
                  </button>
                  <button
                    type="button"
                    onClick={() => setRepoMode('create')}
                    className={`px-2 py-0.5 text-[11px] rounded transition-colors ${
                      repoMode === 'create'
                        ? 'bg-white text-gray-900 shadow-sm font-medium'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Crear nuevo
                  </button>
                </div>
              </div>

              {repoMode === 'url' ? (
                <div>
                  <input
                    type="url"
                    value={repositoryUrl}
                    onChange={(e) => setRepositoryUrl(e.target.value)}
                    placeholder="https://github.com/owner/repo"
                    className={inputCls}
                  />
                  {parsedRepo && (
                    <p className="mt-1 text-[11px] text-gray-400">
                      Repo: <span className="text-gray-600 font-medium">{parsedRepo}</span>
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newRepoName}
                      onChange={(e) => setNewRepoName(e.target.value)}
                      placeholder="Nombre del repositorio"
                      className={`flex-1 ${inputCls}`}
                    />
                    <button
                      type="button"
                      onClick={handleCreateRepo}
                      disabled={!hasToken || !newRepoName.trim() || isCreatingRepo}
                      className="px-3 py-2 text-[12px] font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                    >
                      {isCreatingRepo ? 'Creando...' : 'Crear'}
                    </button>
                  </div>
                  {!hasToken && (
                    <p className="text-[11px] text-amber-600">
                      Necesitas un token de GitHub para crear repositorios
                    </p>
                  )}
                </div>
              )}

              {githubError && (
                <p className="text-[12px] text-red-500">{githubError}</p>
              )}

              {/* Token selection */}
              <div className="space-y-2">
                <label className="block text-[11px] font-medium text-gray-500">Token GitHub</label>
                {savedTokens.length > 0 && !useManualToken ? (
                  <div className="space-y-1.5">
                    <select
                      value={selectedTokenId}
                      onChange={(e) => setSelectedTokenId(e.target.value)}
                      className={inputCls}
                    >
                      <option value="">Selecciona un token guardado</option>
                      {savedTokens.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.provider}){t.is_default ? ' - Por defecto' : ''}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setUseManualToken(true)}
                      className="text-[11px] text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      Usar otro token manualmente
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <input
                      type="password"
                      value={githubToken}
                      onChange={(e) => setGithubToken(e.target.value)}
                      placeholder="ghp_..."
                      className={inputCls}
                    />
                    {savedTokens.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setUseManualToken(false)}
                        className="text-[11px] text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        Usar token guardado
                      </button>
                    )}
                    {savedTokens.length === 0 && (
                      <p className="text-[10px] text-gray-400">
                        Guarda tokens en{' '}
                        <span
                          className="text-gray-600 underline cursor-pointer"
                          onClick={() => {
                            reset();
                            onClose();
                            navigate(`/workspace/${workspaceId}/devops`);
                          }}
                        >
                          DevOps
                        </span>{' '}
                        para reutilizarlos
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-100">
          <button
            type="button"
            onClick={() => {
              reset();
              onClose();
            }}
            className="px-3 py-2 text-[12px] font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!name.trim()}
            className="px-3 py-2 text-[12px] font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            Crear proyecto
          </button>
        </div>
      </form>
    </Modal>
  );
}
