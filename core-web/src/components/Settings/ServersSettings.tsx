import { useState, useEffect, useCallback } from 'react';
import {
  PlusIcon,
  TrashIcon,
  ArrowPathIcon,
  ClipboardDocumentIcon,
  KeyIcon,
  ServerStackIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  ArrowDownTrayIcon,
} from '@heroicons/react/24/outline';
import {
  listServers,
  addServer,
  verifyServer,
  removeServer,
  generateSSHKey,
  listSSHKeys,
  deleteSSHKey,
  type WorkspaceServer,
  type WorkspaceSSHKey,
} from '../../api/client';

interface ServersSettingsProps {
  workspaceId: string;
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  pending: { label: 'Pendiente', className: 'bg-yellow-500/15 text-yellow-400' },
  verified: { label: 'Verificado', className: 'bg-green-500/15 text-green-400' },
  failed: { label: 'Error', className: 'bg-red-500/15 text-red-400' },
  offline: { label: 'Offline', className: 'bg-gray-500/15 text-gray-400' },
};

export default function ServersSettings({ workspaceId }: ServersSettingsProps) {
  // Servers state
  const [servers, setServers] = useState<WorkspaceServer[]>([]);
  const [loadingServers, setLoadingServers] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addingServer, setAddingServer] = useState(false);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState('');

  // Add form state
  const [formName, setFormName] = useState('');
  const [formHost, setFormHost] = useState('');
  const [formPort, setFormPort] = useState(22);
  const [formUsername, setFormUsername] = useState('root');
  const [formAuthType, setFormAuthType] = useState<'ssh_key' | 'password' | 'both'>('ssh_key');
  const [formSSHKey, setFormSSHKey] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formDomain, setFormDomain] = useState('');

  // SSH keys state
  const [sshKeys, setSSHKeys] = useState<WorkspaceSSHKey[]>([]);
  const [generatingKey, setGeneratingKey] = useState(false);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);

  const fetchServers = useCallback(async () => {
    try {
      setLoadingServers(true);
      const res = await listServers(workspaceId);
      setServers(res.servers);
    } catch (err) {
      console.error('Failed to fetch servers:', err);
    } finally {
      setLoadingServers(false);
    }
  }, [workspaceId]);

  const fetchSSHKeys = useCallback(async () => {
    try {
      const res = await listSSHKeys(workspaceId);
      setSSHKeys(res.keys);
    } catch (err) {
      console.error('Failed to fetch SSH keys:', err);
    }
  }, [workspaceId]);

  useEffect(() => {
    fetchServers();
    fetchSSHKeys();
  }, [fetchServers, fetchSSHKeys]);

  const resetForm = () => {
    setFormName('');
    setFormHost('');
    setFormPort(22);
    setFormUsername('root');
    setFormAuthType('ssh_key');
    setFormSSHKey('');
    setFormPassword('');
    setFormDomain('');
    setShowAddForm(false);
  };

  const handleAddServer = async () => {
    if (!formName.trim() || !formHost.trim()) return;
    setAddingServer(true);
    setError('');
    try {
      await addServer({
        workspace_id: workspaceId,
        name: formName.trim(),
        host: formHost.trim(),
        port: formPort,
        username: formUsername.trim(),
        auth_type: formAuthType,
        ssh_private_key: formSSHKey || undefined,
        password: formPassword || undefined,
        wildcard_domain: formDomain || undefined,
      });
      resetForm();
      await fetchServers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al agregar servidor');
    } finally {
      setAddingServer(false);
    }
  };

  const handleVerify = async (serverId: string) => {
    setVerifyingId(serverId);
    try {
      const result = await verifyServer(serverId);
      // Update local state with result
      setServers(prev =>
        prev.map(s =>
          s.id === serverId
            ? { ...s, status: result.status as WorkspaceServer['status'], verification_details: result.details }
            : s
        )
      );
      setExpandedId(serverId);
    } catch (err) {
      console.error('Verification failed:', err);
    } finally {
      setVerifyingId(null);
    }
  };

  const handleRemove = async (serverId: string) => {
    setRemovingId(serverId);
    try {
      await removeServer(serverId);
      setServers(prev => prev.filter(s => s.id !== serverId));
    } catch (err) {
      console.error('Failed to remove server:', err);
    } finally {
      setRemovingId(null);
    }
  };

  const handleGenerateKey = async () => {
    setGeneratingKey(true);
    try {
      await generateSSHKey({ workspace_id: workspaceId });
      await fetchSSHKeys();
    } catch (err) {
      console.error('Failed to generate SSH key:', err);
    } finally {
      setGeneratingKey(false);
    }
  };

  const handleCopyPublicKey = async (key: WorkspaceSSHKey) => {
    try {
      await navigator.clipboard.writeText(key.public_key);
      setCopiedKeyId(key.id);
      setTimeout(() => setCopiedKeyId(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleDeleteKey = async (keyId: string) => {
    try {
      await deleteSSHKey(keyId);
      setSSHKeys(prev => prev.filter(k => k.id !== keyId));
    } catch (err) {
      console.error('Failed to delete SSH key:', err);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setFormSSHKey(reader.result as string);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-text-body flex items-center gap-2">
          <ServerStackIcon className="w-4 h-4" />
          Servidores
          <span className="text-text-secondary font-normal">({servers.length})</span>
        </h2>
      </div>

      {error && (
        <div className="p-3 mb-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Server list */}
      {loadingServers ? (
        <p className="text-sm text-text-secondary">Cargando servidores...</p>
      ) : servers.length === 0 && !showAddForm ? (
        <p className="text-sm text-text-secondary mb-3">
          No hay servidores configurados. Agrega un servidor externo para desplegar proyectos.
        </p>
      ) : (
        <div className="space-y-3 mb-4">
          {servers.map(server => (
            <div key={server.id} className="border border-border-gray rounded-lg p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <ServerStackIcon className="w-5 h-5 text-text-secondary shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-text-body font-medium truncate">{server.name}</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${STATUS_BADGE[server.status]?.className || ''}`}>
                        {STATUS_BADGE[server.status]?.label || server.status}
                      </span>
                      {server.is_default && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400">
                          Principal
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-text-secondary truncate">
                      {server.username}@{server.host}:{server.port}
                      {server.wildcard_domain && ` - *.${server.wildcard_domain}`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0 ml-2">
                  <button
                    onClick={() => handleVerify(server.id)}
                    disabled={verifyingId === server.id}
                    className="p-1.5 text-text-secondary hover:text-text-body hover:bg-bg-gray-dark/50 rounded transition-colors disabled:opacity-50"
                    title="Verificar servidor"
                  >
                    <ArrowPathIcon className={`w-4 h-4 ${verifyingId === server.id ? 'animate-spin' : ''}`} />
                  </button>
                  <button
                    onClick={() => setExpandedId(expandedId === server.id ? null : server.id)}
                    className="px-2 py-1 text-xs text-text-secondary hover:text-text-body hover:bg-bg-gray-dark/50 rounded transition-colors"
                  >
                    {expandedId === server.id ? 'Ocultar' : 'Detalles'}
                  </button>
                  <button
                    onClick={() => handleRemove(server.id)}
                    disabled={removingId === server.id}
                    className="p-1.5 text-red-400/60 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors disabled:opacity-50"
                    title="Eliminar servidor"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Verification details */}
              {expandedId === server.id && server.verification_details && (
                <div className="mt-3 pt-3 border-t border-border-gray">
                  {server.verification_details.error && (
                    <div className="flex items-center gap-2 text-xs text-red-400 mb-2">
                      <ExclamationTriangleIcon className="w-4 h-4 shrink-0" />
                      {server.verification_details.error}
                    </div>
                  )}

                  {server.verification_details.os && (
                    <p className="text-xs text-text-secondary mb-1">
                      SO: <span className="text-text-body">{server.verification_details.os}</span>
                    </p>
                  )}

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-1.5">
                      {server.verification_details.docker_installed ? (
                        <CheckCircleIcon className="w-4 h-4 text-green-400" />
                      ) : (
                        <XCircleIcon className="w-4 h-4 text-red-400" />
                      )}
                      <span className="text-text-secondary">Docker</span>
                      {server.verification_details.docker_version && (
                        <span className="text-text-body truncate">{server.verification_details.docker_version}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {server.verification_details.nginx_installed ? (
                        <CheckCircleIcon className="w-4 h-4 text-green-400" />
                      ) : (
                        <XCircleIcon className="w-4 h-4 text-red-400" />
                      )}
                      <span className="text-text-secondary">Nginx</span>
                      {server.verification_details.nginx_version && (
                        <span className="text-text-body truncate">{server.verification_details.nginx_version}</span>
                      )}
                    </div>
                  </div>

                  {(server.verification_details.disk_total_gb != null || server.verification_details.ram_total_mb != null) && (
                    <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
                      {server.verification_details.disk_total_gb != null && (
                        <div className="text-text-secondary">
                          Disco: <span className="text-text-body">
                            {server.verification_details.disk_free_gb}GB libres / {server.verification_details.disk_total_gb}GB
                          </span>
                        </div>
                      )}
                      {server.verification_details.ram_total_mb != null && (
                        <div className="text-text-secondary">
                          RAM: <span className="text-text-body">
                            {server.verification_details.ram_available_mb}MB disp / {server.verification_details.ram_total_mb}MB
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {server.last_verified_at && (
                    <p className="text-[10px] text-text-secondary mt-2">
                      Verificado: {new Date(server.last_verified_at).toLocaleString('es-ES')}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add server form */}
      {showAddForm ? (
        <div className="border border-border-gray rounded-lg p-4 mb-4 space-y-3">
          <h3 className="text-sm font-medium text-text-body mb-2">Nuevo servidor</h3>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-secondary mb-1">Nombre</label>
              <input
                value={formName}
                onChange={e => setFormName(e.target.value)}
                placeholder="Mi servidor"
                className="w-full text-sm text-text-body bg-transparent border border-border-gray rounded px-2.5 py-1.5 outline-none focus:border-text-tertiary"
              />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Host / IP</label>
              <input
                value={formHost}
                onChange={e => setFormHost(e.target.value)}
                placeholder="192.168.1.100"
                className="w-full text-sm text-text-body bg-transparent border border-border-gray rounded px-2.5 py-1.5 outline-none focus:border-text-tertiary"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-text-secondary mb-1">Puerto SSH</label>
              <input
                type="number"
                value={formPort}
                onChange={e => setFormPort(Number(e.target.value) || 22)}
                className="w-full text-sm text-text-body bg-transparent border border-border-gray rounded px-2.5 py-1.5 outline-none focus:border-text-tertiary"
              />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Usuario</label>
              <input
                value={formUsername}
                onChange={e => setFormUsername(e.target.value)}
                placeholder="root"
                className="w-full text-sm text-text-body bg-transparent border border-border-gray rounded px-2.5 py-1.5 outline-none focus:border-text-tertiary"
              />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Autenticacion</label>
              <select
                value={formAuthType}
                onChange={e => setFormAuthType(e.target.value as 'ssh_key' | 'password' | 'both')}
                className="w-full text-sm text-text-body bg-transparent border border-border-gray rounded px-2.5 py-1.5 outline-none focus:border-text-tertiary"
              >
                <option value="ssh_key">Clave SSH</option>
                <option value="password">Password</option>
                <option value="both">Ambos</option>
              </select>
            </div>
          </div>

          {(formAuthType === 'ssh_key' || formAuthType === 'both') && (
            <div>
              <label className="block text-xs text-text-secondary mb-1">
                Clave privada SSH
                <label className="ml-2 text-text-tertiary cursor-pointer hover:underline">
                  <input type="file" className="hidden" onChange={handleFileUpload} accept=".pem,.key,*" />
                  Subir archivo
                </label>
              </label>
              <textarea
                value={formSSHKey}
                onChange={e => setFormSSHKey(e.target.value)}
                placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;..."
                rows={4}
                className="w-full text-xs text-text-body bg-transparent border border-border-gray rounded px-2.5 py-1.5 outline-none focus:border-text-tertiary font-mono"
              />
            </div>
          )}

          {(formAuthType === 'password' || formAuthType === 'both') && (
            <div>
              <label className="block text-xs text-text-secondary mb-1">Password</label>
              <input
                type="password"
                value={formPassword}
                onChange={e => setFormPassword(e.target.value)}
                className="w-full text-sm text-text-body bg-transparent border border-border-gray rounded px-2.5 py-1.5 outline-none focus:border-text-tertiary"
              />
            </div>
          )}

          <div>
            <label className="block text-xs text-text-secondary mb-1">Dominio wildcard (opcional)</label>
            <input
              value={formDomain}
              onChange={e => setFormDomain(e.target.value)}
              placeholder="apps.midominio.com"
              className="w-full text-sm text-text-body bg-transparent border border-border-gray rounded px-2.5 py-1.5 outline-none focus:border-text-tertiary"
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleAddServer}
              disabled={addingServer || !formName.trim() || !formHost.trim()}
              className="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {addingServer ? 'Agregando...' : 'Agregar servidor'}
            </button>
            <button
              onClick={resetForm}
              className="px-4 py-1.5 text-sm text-text-secondary hover:text-text-body border border-border-gray rounded-lg hover:bg-bg-gray-dark/50 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAddForm(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm text-text-secondary hover:text-text-body border border-border-gray rounded-lg hover:bg-bg-gray-dark/50 transition-colors"
        >
          <PlusIcon className="w-4 h-4" />
          Agregar servidor
        </button>
      )}

      {/* SSH Keys Section */}
      <div className="mt-6 pt-6 border-t border-border-gray">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-text-body flex items-center gap-2">
            <KeyIcon className="w-4 h-4" />
            Claves SSH
            <span className="text-text-secondary font-normal">({sshKeys.length})</span>
          </h3>
        </div>

        {sshKeys.length === 0 ? (
          <p className="text-sm text-text-secondary mb-3">
            No hay claves SSH generadas. Genera una para configurar el acceso a tus servidores.
          </p>
        ) : (
          <div className="space-y-2 mb-4">
            {sshKeys.map(key => (
              <div key={key.id} className="group flex items-center justify-between border border-border-gray rounded-lg px-3 py-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-text-body font-medium">{key.name}</p>
                    {key.fingerprint && (
                      <span className="text-[10px] text-text-secondary font-mono truncate max-w-[200px]">
                        {key.fingerprint}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-text-secondary">
                    Creada: {new Date(key.created_at).toLocaleDateString('es-ES')}
                  </p>
                </div>

                <div className="flex items-center gap-1 shrink-0 ml-2">
                  <button
                    onClick={() => handleCopyPublicKey(key)}
                    className="p-1.5 text-text-secondary hover:text-text-body hover:bg-bg-gray-dark/50 rounded transition-colors"
                    title="Copiar clave publica"
                  >
                    {copiedKeyId === key.id ? (
                      <CheckCircleIcon className="w-4 h-4 text-green-400" />
                    ) : (
                      <ClipboardDocumentIcon className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    onClick={() => {
                      const blob = new Blob([key.public_key], { type: 'text/plain' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `${key.name}.pub`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="p-1.5 text-text-secondary hover:text-text-body hover:bg-bg-gray-dark/50 rounded transition-colors"
                    title="Descargar clave publica"
                  >
                    <ArrowDownTrayIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteKey(key.id)}
                    className="p-1.5 text-red-400/60 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors opacity-0 group-hover:opacity-100"
                    title="Eliminar clave"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={handleGenerateKey}
          disabled={generatingKey}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm text-text-secondary hover:text-text-body border border-border-gray rounded-lg hover:bg-bg-gray-dark/50 transition-colors disabled:opacity-50"
        >
          <KeyIcon className="w-4 h-4" />
          {generatingKey ? 'Generando...' : 'Generar clave SSH'}
        </button>
      </div>
    </div>
  );
}
