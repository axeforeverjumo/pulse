import { useMemo, useState } from 'react';
import { useProjectsStore } from '../../../stores/projectsStore';
import { useCreateBoard } from '../../../hooks/queries/useProjects';
import { createGitHubRepo, listGitHubRepos, type GitHubRepo } from '../../../api/client';
import Modal from '../../Modal/Modal';

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
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isDevelopment, setIsDevelopment] = useState(false);
  const [projectUrl, setProjectUrl] = useState('');
  const [repositoryUrl, setRepositoryUrl] = useState('');
  const [repositoryFullName, setRepositoryFullName] = useState('');
  const [serverHost, setServerHost] = useState('');
  const [serverIp, setServerIp] = useState('');
  const [serverUser, setServerUser] = useState('');
  const [serverPassword, setServerPassword] = useState('');
  const [serverPort, setServerPort] = useState('');

  // GitHub linkage (ephemeral, not persisted)
  const [githubToken, setGithubToken] = useState('');
  const [githubOwner, setGithubOwner] = useState('');
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState('');
  const [newRepoName, setNewRepoName] = useState('');
  const [isLoadingRepos, setIsLoadingRepos] = useState(false);
  const [isCreatingRepo, setIsCreatingRepo] = useState(false);
  const [githubError, setGithubError] = useState<string | null>(null);

  const workspaceAppId = useProjectsStore((state) => state.workspaceAppId);
  const createBoard = useCreateBoard(workspaceAppId);

  const canLoadRepos = useMemo(
    () => githubToken.trim().length >= 20 && !isLoadingRepos,
    [githubToken, isLoadingRepos]
  );

  const reset = () => {
    setName('');
    setDescription('');
    setIsDevelopment(false);
    setProjectUrl('');
    setRepositoryUrl('');
    setRepositoryFullName('');
    setServerHost('');
    setServerIp('');
    setServerUser('');
    setServerPassword('');
    setServerPort('');
    setGithubToken('');
    setGithubOwner('');
    setRepos([]);
    setSelectedRepo('');
    setNewRepoName('');
    setGithubError(null);
  };

  const handleLoadRepos = async () => {
    if (!canLoadRepos) return;
    setIsLoadingRepos(true);
    setGithubError(null);
    try {
      const result = await listGitHubRepos({
        token: githubToken.trim(),
        owner: githubOwner.trim() || undefined,
      });
      setRepos(result.repos || []);
      if ((result.repos || []).length === 0) {
        setGithubError('No encontré repos para ese token/owner.');
      }
    } catch (error) {
      setGithubError(error instanceof Error ? error.message : 'No pude cargar repositorios');
    } finally {
      setIsLoadingRepos(false);
    }
  };

  const handleCreateRepo = async () => {
    if (!githubToken.trim() || !newRepoName.trim()) return;
    setIsCreatingRepo(true);
    setGithubError(null);
    try {
      const result = await createGitHubRepo({
        token: githubToken.trim(),
        owner: githubOwner.trim() || undefined,
        name: newRepoName.trim(),
        private: true,
        description: `Repository for ${name.trim() || newRepoName.trim()}`,
      });
      const created = result.repo;
      setRepos((prev) => [created, ...prev.filter((r) => r.id !== created.id)]);
      setSelectedRepo(created.full_name);
      setRepositoryUrl(created.html_url || '');
      setRepositoryFullName(created.full_name || '');
      setNewRepoName('');
    } catch (error) {
      setGithubError(error instanceof Error ? error.message : 'No pude crear el repositorio');
    } finally {
      setIsCreatingRepo(false);
    }
  };

  const handleRepoSelect = (fullName: string) => {
    setSelectedRepo(fullName);
    const repo = repos.find((r) => r.full_name === fullName);
    if (!repo) return;
    setRepositoryUrl(repo.html_url || '');
    setRepositoryFullName(repo.full_name || '');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) return;

    try {
      const result = await createBoard.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
        is_development: isDevelopment,
        project_url: isDevelopment ? (projectUrl.trim() || undefined) : undefined,
        repository_url: isDevelopment ? (repositoryUrl.trim() || undefined) : undefined,
        repository_full_name: isDevelopment ? (repositoryFullName.trim() || undefined) : undefined,
        server_host: isDevelopment ? (serverHost.trim() || undefined) : undefined,
        server_ip: isDevelopment ? (serverIp.trim() || undefined) : undefined,
        server_user: isDevelopment ? (serverUser.trim() || undefined) : undefined,
        server_password: isDevelopment ? (serverPassword.trim() || undefined) : undefined,
        server_port: isDevelopment && serverPort.trim() ? Number(serverPort.trim()) : undefined,
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

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Nuevo proyecto">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-[12px] font-medium text-gray-500 mb-2">Nombre</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Pulse Core API"
            className="w-full px-3 py-2 text-[14px] text-gray-900 bg-transparent border border-gray-200 rounded-lg focus:outline-none focus:border-gray-300 placeholder:text-gray-400"
            autoFocus
          />
        </div>

        <div>
          <label className="block text-[12px] font-medium text-gray-500 mb-2">
            Descripción <span className="text-gray-400 font-normal">(opcional)</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="¿Qué objetivo tiene este proyecto?"
            rows={3}
            className="w-full px-3 py-2 text-[14px] text-gray-900 bg-transparent border border-gray-200 rounded-lg focus:outline-none focus:border-gray-300 placeholder:text-gray-400 resize-none"
          />
        </div>

        <label className="flex items-center gap-2 text-[13px] text-gray-700 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={isDevelopment}
            onChange={(e) => setIsDevelopment(e.target.checked)}
            className="rounded border-gray-300 text-gray-900 focus:ring-gray-300"
          />
          Proyecto de desarrollo
        </label>

        {isDevelopment && (
          <div className="space-y-3 border border-gray-100 bg-gray-50/50 rounded-xl p-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-[12px] font-medium text-gray-500 mb-1">URL del proyecto</label>
                <input
                  type="url"
                  value={projectUrl}
                  onChange={(e) => setProjectUrl(e.target.value)}
                  placeholder="https://miapp.com"
                  className="w-full px-3 py-2 text-[13px] border border-gray-200 rounded-lg focus:outline-none focus:border-gray-300 bg-white"
                />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-gray-500 mb-1">Servidor</label>
                <input
                  type="text"
                  value={serverHost}
                  onChange={(e) => setServerHost(e.target.value)}
                  placeholder="Producción / Staging"
                  className="w-full px-3 py-2 text-[13px] border border-gray-200 rounded-lg focus:outline-none focus:border-gray-300 bg-white"
                />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-gray-500 mb-1">IP del servidor</label>
                <input
                  type="text"
                  value={serverIp}
                  onChange={(e) => setServerIp(e.target.value)}
                  placeholder="85.215.105.45"
                  className="w-full px-3 py-2 text-[13px] border border-gray-200 rounded-lg focus:outline-none focus:border-gray-300 bg-white"
                />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-gray-500 mb-1">Usuario servidor</label>
                <input
                  type="text"
                  value={serverUser}
                  onChange={(e) => setServerUser(e.target.value)}
                  placeholder="root"
                  className="w-full px-3 py-2 text-[13px] border border-gray-200 rounded-lg focus:outline-none focus:border-gray-300 bg-white"
                />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-gray-500 mb-1">Puerto</label>
                <input
                  type="number"
                  min={1}
                  max={65535}
                  value={serverPort}
                  onChange={(e) => setServerPort(e.target.value)}
                  placeholder="22"
                  className="w-full px-3 py-2 text-[13px] border border-gray-200 rounded-lg focus:outline-none focus:border-gray-300 bg-white"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[12px] font-medium text-gray-500 mb-1">Contraseña servidor (opcional)</label>
                <input
                  type="text"
                  value={serverPassword}
                  onChange={(e) => setServerPassword(e.target.value)}
                  placeholder="Si aplica, guárdala aquí temporalmente"
                  className="w-full px-3 py-2 text-[13px] border border-gray-200 rounded-lg focus:outline-none focus:border-gray-300 bg-white"
                />
              </div>
            </div>

            <div className="border-t border-gray-200 pt-3 space-y-2">
              <div className="text-[12px] font-medium text-gray-500">Repositorio (GitHub)</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="password"
                  value={githubToken}
                  onChange={(e) => setGithubToken(e.target.value)}
                  placeholder="GitHub token del cliente"
                  className="w-full px-3 py-2 text-[13px] border border-gray-200 rounded-lg focus:outline-none focus:border-gray-300 bg-white"
                />
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={githubOwner}
                    onChange={(e) => setGithubOwner(e.target.value)}
                    placeholder="owner/org (opcional)"
                    className="flex-1 px-3 py-2 text-[13px] border border-gray-200 rounded-lg focus:outline-none focus:border-gray-300 bg-white"
                  />
                  <button
                    type="button"
                    onClick={handleLoadRepos}
                    disabled={!canLoadRepos}
                    className="px-3 py-2 text-[12px] font-medium bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40"
                  >
                    {isLoadingRepos ? 'Cargando...' : 'Ver repos'}
                  </button>
                </div>
              </div>

              {repos.length > 0 && (
                <select
                  value={selectedRepo}
                  onChange={(e) => handleRepoSelect(e.target.value)}
                  className="w-full px-3 py-2 text-[13px] border border-gray-200 rounded-lg focus:outline-none focus:border-gray-300 bg-white"
                >
                  <option value="">Selecciona repositorio</option>
                  {repos.map((repo) => (
                    <option key={repo.id} value={repo.full_name}>{repo.full_name}</option>
                  ))}
                </select>
              )}

              <div className="flex gap-2">
                <input
                  type="text"
                  value={newRepoName}
                  onChange={(e) => setNewRepoName(e.target.value)}
                  placeholder="Crear repo nuevo (nombre)"
                  className="flex-1 px-3 py-2 text-[13px] border border-gray-200 rounded-lg focus:outline-none focus:border-gray-300 bg-white"
                />
                <button
                  type="button"
                  onClick={handleCreateRepo}
                  disabled={!githubToken.trim() || !newRepoName.trim() || isCreatingRepo}
                  className="px-3 py-2 text-[12px] font-medium bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40"
                >
                  {isCreatingRepo ? 'Creando...' : 'Crear repo'}
                </button>
              </div>

              <input
                type="text"
                value={repositoryUrl}
                onChange={(e) => setRepositoryUrl(e.target.value)}
                placeholder="https://github.com/owner/repo"
                className="w-full px-3 py-2 text-[13px] border border-gray-200 rounded-lg focus:outline-none focus:border-gray-300 bg-white"
              />
              <input
                type="text"
                value={repositoryFullName}
                onChange={(e) => setRepositoryFullName(e.target.value)}
                placeholder="owner/repo"
                className="w-full px-3 py-2 text-[13px] border border-gray-200 rounded-lg focus:outline-none focus:border-gray-300 bg-white"
              />

              {githubError && (
                <p className="text-[12px] text-red-500">{githubError}</p>
              )}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2 pt-4 border-t border-gray-100">
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
