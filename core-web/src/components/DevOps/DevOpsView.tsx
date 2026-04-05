import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  ServerIcon,
  KeyIcon,
  ShieldCheckIcon,
  ChartBarSquareIcon,
  PlusIcon,
  TrashIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  ClipboardDocumentIcon,
  ArrowDownTrayIcon,
  ArrowPathIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  PencilIcon,
  EyeSlashIcon,
  StarIcon,
} from '@heroicons/react/24/outline';
import { StarIcon as StarSolid } from '@heroicons/react/24/solid';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { HeaderButtons } from '../MiniAppHeader';
import { toast } from 'sonner';
import {
  listServers,
  addServer,
  removeServer,
  verifyServer,
  listSSHKeys,
  generateSSHKey,
  getSSHPublicKey,
  deleteSSHKey,
  listRepoTokens,
  addRepoToken,
  updateRepoToken,
  deleteRepoToken,
  type WorkspaceServer,
  type WorkspaceSSHKey,
  type RepoToken,
} from '../../api/client';

type TabId = 'servers' | 'ssh-keys' | 'tokens' | 'overview';

const tabs: { id: TabId; label: string; icon: typeof ServerIcon }[] = [
  { id: 'servers', label: 'Servidores', icon: ServerIcon },
  { id: 'ssh-keys', label: 'Claves SSH', icon: KeyIcon },
  { id: 'tokens', label: 'Tokens', icon: ShieldCheckIcon },
  { id: 'overview', label: 'Resumen', icon: ChartBarSquareIcon },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    verified: { bg: 'bg-green-50', text: 'text-green-700', label: 'Verificado' },
    pending: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'Pendiente' },
    failed: { bg: 'bg-red-50', text: 'text-red-700', label: 'Fallido' },
  };
  const s = map[status] || map.pending;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${s.bg} ${s.text}`}>
      {status === 'verified' ? (
        <CheckCircleIcon className="w-3.5 h-3.5" />
      ) : status === 'failed' ? (
        <XCircleIcon className="w-3.5 h-3.5" />
      ) : (
        <ClockIcon className="w-3.5 h-3.5" />
      )}
      {s.label}
    </span>
  );
}

function ProviderBadge({ provider }: { provider: string }) {
  const colors: Record<string, string> = {
    github: 'bg-gray-900 text-white',
    gitlab: 'bg-orange-500 text-white',
    bitbucket: 'bg-blue-600 text-white',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide ${colors[provider] || 'bg-gray-200 text-gray-700'}`}>
      {provider}
    </span>
  );
}

function formatDate(iso?: string | null) {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function DevOpsView() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const workspace = workspaces.find((w) => w.id === workspaceId);
  const effectiveWorkspaceId = workspaceId || workspace?.id || '';

  const [activeTab, setActiveTab] = useState<TabId>('servers');

  // ── Servers ──
  const [servers, setServers] = useState<WorkspaceServer[]>([]);
  const [loadingServers, setLoadingServers] = useState(false);
  const [expandedServer, setExpandedServer] = useState<string | null>(null);
  const [showAddServer, setShowAddServer] = useState(false);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [newServer, setNewServer] = useState({
    name: '',
    host: '',
    port: 22,
    username: 'root',
    auth_type: 'ssh_key' as 'ssh_key' | 'password',
    ssh_private_key: '',
    password: '',
    wildcard_domain: '',
    is_default: false,
  });

  // ── SSH Keys ──
  const [sshKeys, setSSHKeys] = useState<WorkspaceSSHKey[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(false);
  const [generatingKey, setGeneratingKey] = useState(false);
  const [newKeyName, setNewKeyName] = useState('pulse-deploy');

  // ── Tokens ──
  const [tokens, setTokens] = useState<RepoToken[]>([]);
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [showAddToken, setShowAddToken] = useState(false);
  const [editingTokenId, setEditingTokenId] = useState<string | null>(null);
  const [newToken, setNewToken] = useState({
    name: '',
    provider: 'github',
    token: '',
    username: '',
    is_default: false,
  });

  // ── Data Fetching ──
  const fetchServers = useCallback(async () => {
    if (!effectiveWorkspaceId) return;
    setLoadingServers(true);
    try {
      const res = await listServers(effectiveWorkspaceId);
      setServers(res.servers || []);
    } catch {
      toast.error('Error al cargar servidores');
    } finally {
      setLoadingServers(false);
    }
  }, [effectiveWorkspaceId]);

  const fetchKeys = useCallback(async () => {
    if (!effectiveWorkspaceId) return;
    setLoadingKeys(true);
    try {
      const res = await listSSHKeys(effectiveWorkspaceId);
      setSSHKeys(res.keys || []);
    } catch {
      toast.error('Error al cargar claves SSH');
    } finally {
      setLoadingKeys(false);
    }
  }, [effectiveWorkspaceId]);

  const fetchTokens = useCallback(async () => {
    if (!effectiveWorkspaceId) return;
    setLoadingTokens(true);
    try {
      const res = await listRepoTokens(effectiveWorkspaceId);
      setTokens(res.tokens || []);
    } catch {
      toast.error('Error al cargar tokens');
    } finally {
      setLoadingTokens(false);
    }
  }, [effectiveWorkspaceId]);

  useEffect(() => {
    fetchServers();
    fetchKeys();
    fetchTokens();
  }, [fetchServers, fetchKeys, fetchTokens]);

  // ── Server Actions ──
  const handleAddServer = async () => {
    if (!newServer.name.trim() || !newServer.host.trim()) return;
    try {
      await addServer({
        workspace_id: effectiveWorkspaceId,
        name: newServer.name.trim(),
        host: newServer.host.trim(),
        port: newServer.port,
        username: newServer.username,
        auth_type: newServer.auth_type,
        ssh_private_key: newServer.ssh_private_key || undefined,
        password: newServer.password || undefined,
        wildcard_domain: newServer.wildcard_domain || undefined,
        is_default: newServer.is_default,
      });
      toast.success('Servidor agregado');
      setShowAddServer(false);
      setNewServer({ name: '', host: '', port: 22, username: 'root', auth_type: 'ssh_key', ssh_private_key: '', password: '', wildcard_domain: '', is_default: false });
      fetchServers();
    } catch {
      toast.error('Error al agregar servidor');
    }
  };

  const handleVerifyServer = async (id: string) => {
    setVerifyingId(id);
    try {
      const res = await verifyServer(id);
      toast.success(res.status === 'verified' ? 'Servidor verificado' : 'Verificacion fallida');
      fetchServers();
    } catch {
      toast.error('Error al verificar servidor');
    } finally {
      setVerifyingId(null);
    }
  };

  const handleRemoveServer = async (id: string) => {
    if (!confirm('Eliminar este servidor?')) return;
    try {
      await removeServer(id);
      toast.success('Servidor eliminado');
      fetchServers();
    } catch {
      toast.error('Error al eliminar servidor');
    }
  };

  // ── SSH Key Actions ──
  const handleGenerateKey = async () => {
    setGeneratingKey(true);
    try {
      await generateSSHKey({ workspace_id: effectiveWorkspaceId, name: newKeyName.trim() || 'pulse-deploy' });
      toast.success('Clave SSH generada');
      setNewKeyName('pulse-deploy');
      fetchKeys();
    } catch {
      toast.error('Error al generar clave SSH');
    } finally {
      setGeneratingKey(false);
    }
  };

  const handleCopyPublicKey = async (keyId: string) => {
    try {
      const res = await getSSHPublicKey(keyId);
      await navigator.clipboard.writeText(res.public_key);
      toast.success('Clave publica copiada');
    } catch {
      toast.error('Error al copiar clave');
    }
  };

  const handleDownloadPublicKey = async (keyId: string, name: string) => {
    try {
      const res = await getSSHPublicKey(keyId);
      const blob = new Blob([res.public_key], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${name}.pub`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Error al descargar clave');
    }
  };

  const handleDeleteKey = async (keyId: string) => {
    if (!confirm('Eliminar esta clave SSH?')) return;
    try {
      await deleteSSHKey(keyId);
      toast.success('Clave SSH eliminada');
      fetchKeys();
    } catch {
      toast.error('Error al eliminar clave');
    }
  };

  // ── Token Actions ──
  const handleAddToken = async () => {
    if (!newToken.name.trim() || !newToken.token.trim()) return;
    try {
      await addRepoToken({
        workspace_id: effectiveWorkspaceId,
        name: newToken.name.trim(),
        provider: newToken.provider,
        token: newToken.token.trim(),
        username: newToken.username.trim() || undefined,
        is_default: newToken.is_default,
      });
      toast.success('Token agregado');
      setShowAddToken(false);
      setNewToken({ name: '', provider: 'github', token: '', username: '', is_default: false });
      fetchTokens();
    } catch {
      toast.error('Error al agregar token');
    }
  };

  const handleUpdateToken = async (tokenId: string, data: Record<string, any>) => {
    try {
      await updateRepoToken(tokenId, data);
      toast.success('Token actualizado');
      setEditingTokenId(null);
      fetchTokens();
    } catch {
      toast.error('Error al actualizar token');
    }
  };

  const handleDeleteToken = async (tokenId: string) => {
    if (!confirm('Eliminar este token?')) return;
    try {
      await deleteRepoToken(tokenId);
      toast.success('Token eliminado');
      fetchTokens();
    } catch {
      toast.error('Error al eliminar token');
    }
  };

  // ── Input Styles ──
  const inputCls = 'w-full px-3 py-2 text-[13px] text-gray-900 bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400 placeholder:text-gray-400 transition-colors';
  const btnPrimary = 'px-3 py-2 text-[12px] font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors';
  const btnSecondary = 'px-3 py-2 text-[12px] font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors';

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gray-900 flex items-center justify-center">
            <ServerIcon className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-[15px] font-semibold text-gray-900">DevOps</h1>
            <p className="text-[11px] text-gray-400">Infraestructura y despliegue</p>
          </div>
        </div>
        <HeaderButtons />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-6 pt-3 border-b border-gray-100">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium rounded-t-lg border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'servers' && (
          <ServersTab
            servers={servers}
            loading={loadingServers}
            expandedServer={expandedServer}
            setExpandedServer={setExpandedServer}
            showAddServer={showAddServer}
            setShowAddServer={setShowAddServer}
            newServer={newServer}
            setNewServer={setNewServer}
            verifyingId={verifyingId}
            onAdd={handleAddServer}
            onVerify={handleVerifyServer}
            onRemove={handleRemoveServer}
            inputCls={inputCls}
            btnPrimary={btnPrimary}
            btnSecondary={btnSecondary}
          />
        )}
        {activeTab === 'ssh-keys' && (
          <SSHKeysTab
            keys={sshKeys}
            loading={loadingKeys}
            generating={generatingKey}
            newKeyName={newKeyName}
            setNewKeyName={setNewKeyName}
            onGenerate={handleGenerateKey}
            onCopy={handleCopyPublicKey}
            onDownload={handleDownloadPublicKey}
            onDelete={handleDeleteKey}
            inputCls={inputCls}
            btnPrimary={btnPrimary}
          />
        )}
        {activeTab === 'tokens' && (
          <TokensTab
            tokens={tokens}
            loading={loadingTokens}
            showAdd={showAddToken}
            setShowAdd={setShowAddToken}
            editingId={editingTokenId}
            setEditingId={setEditingTokenId}
            newToken={newToken}
            setNewToken={setNewToken}
            onAdd={handleAddToken}
            onUpdate={handleUpdateToken}
            onDelete={handleDeleteToken}
            inputCls={inputCls}
            btnPrimary={btnPrimary}
            btnSecondary={btnSecondary}
          />
        )}
        {activeTab === 'overview' && (
          <OverviewTab
            servers={servers}
            sshKeys={sshKeys}
            tokens={tokens}
          />
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB: Servidores
// ═══════════════════════════════════════════════════════════════════════════════

function ServersTab({
  servers, loading, expandedServer, setExpandedServer,
  showAddServer, setShowAddServer, newServer, setNewServer,
  verifyingId, onAdd, onVerify, onRemove,
  inputCls, btnPrimary, btnSecondary,
}: any) {
  if (loading) {
    return <div className="text-[13px] text-gray-400 py-12 text-center">Cargando servidores...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Add Server Form */}
      {showAddServer ? (
        <div className="border border-gray-200 rounded-xl p-4 space-y-3 bg-gray-50/50">
          <h3 className="text-[13px] font-semibold text-gray-900">Nuevo servidor</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Nombre</label>
              <input
                type="text"
                value={newServer.name}
                onChange={(e) => setNewServer({ ...newServer, name: e.target.value })}
                placeholder="Produccion"
                className={inputCls}
                autoFocus
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Host</label>
              <input
                type="text"
                value={newServer.host}
                onChange={(e) => setNewServer({ ...newServer, host: e.target.value })}
                placeholder="85.215.105.45"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Puerto</label>
              <input
                type="number"
                value={newServer.port}
                onChange={(e) => setNewServer({ ...newServer, port: parseInt(e.target.value) || 22 })}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Usuario</label>
              <input
                type="text"
                value={newServer.username}
                onChange={(e) => setNewServer({ ...newServer, username: e.target.value })}
                className={inputCls}
              />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-gray-500 mb-1">Autenticacion</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setNewServer({ ...newServer, auth_type: 'ssh_key' })}
                className={`px-3 py-1.5 text-[11px] rounded-lg border transition-colors ${
                  newServer.auth_type === 'ssh_key'
                    ? 'border-gray-900 bg-white text-gray-900 shadow-sm'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300'
                }`}
              >
                Clave SSH
              </button>
              <button
                type="button"
                onClick={() => setNewServer({ ...newServer, auth_type: 'password' })}
                className={`px-3 py-1.5 text-[11px] rounded-lg border transition-colors ${
                  newServer.auth_type === 'password'
                    ? 'border-gray-900 bg-white text-gray-900 shadow-sm'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300'
                }`}
              >
                Contrasena
              </button>
            </div>
          </div>
          {newServer.auth_type === 'ssh_key' ? (
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Clave privada SSH</label>
              <textarea
                value={newServer.ssh_private_key}
                onChange={(e) => setNewServer({ ...newServer, ssh_private_key: e.target.value })}
                placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                rows={4}
                className={`${inputCls} resize-none font-mono text-[11px]`}
              />
            </div>
          ) : (
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Contrasena</label>
              <input
                type="password"
                value={newServer.password}
                onChange={(e) => setNewServer({ ...newServer, password: e.target.value })}
                className={inputCls}
              />
            </div>
          )}
          <div>
            <label className="block text-[11px] font-medium text-gray-500 mb-1">Dominio wildcard <span className="text-gray-400 font-normal">(opcional)</span></label>
            <input
              type="text"
              value={newServer.wildcard_domain}
              onChange={(e) => setNewServer({ ...newServer, wildcard_domain: e.target.value })}
              placeholder="apps.midominio.com"
              className={inputCls}
            />
          </div>
          <label className="flex items-center gap-2 text-[12px] text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={newServer.is_default}
              onChange={(e) => setNewServer({ ...newServer, is_default: e.target.checked })}
              className="rounded border-gray-300"
            />
            Servidor por defecto
          </label>
          <div className="flex gap-2 pt-1">
            <button onClick={onAdd} className={btnPrimary} disabled={!newServer.name.trim() || !newServer.host.trim()}>
              Agregar
            </button>
            <button onClick={() => setShowAddServer(false)} className={btnSecondary}>
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAddServer(true)}
          className="flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium text-gray-600 hover:text-gray-900 border border-dashed border-gray-300 hover:border-gray-400 rounded-lg transition-colors"
        >
          <PlusIcon className="w-4 h-4" />
          Anadir servidor
        </button>
      )}

      {/* Server List */}
      {servers.length === 0 && !showAddServer ? (
        <div className="text-center py-16 text-gray-400">
          <ServerIcon className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-[13px]">No hay servidores configurados</p>
          <p className="text-[11px] mt-1">Agrega un servidor para empezar a desplegar</p>
        </div>
      ) : (
        <div className="space-y-2">
          {servers.map((server: WorkspaceServer) => {
            const isExpanded = expandedServer === server.id;
            const details = server.verification_details as any;
            return (
              <div key={server.id} className="border border-gray-200 rounded-xl overflow-hidden">
                <div
                  className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => setExpandedServer(isExpanded ? null : server.id)}
                >
                  <div className="flex items-center gap-3">
                    <button className="text-gray-400">
                      {isExpanded ? (
                        <ChevronDownIcon className="w-4 h-4" />
                      ) : (
                        <ChevronRightIcon className="w-4 h-4" />
                      )}
                    </button>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-medium text-gray-900">{server.name}</span>
                        <span className="text-[11px] text-gray-400 font-mono">{server.host}</span>
                        {server.is_default && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded font-medium">Por defecto</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <StatusBadge status={server.status || 'pending'} />
                        {server.last_verified_at && (
                          <span className="text-[10px] text-gray-400">
                            Verificado: {formatDate(server.last_verified_at)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => onVerify(server.id)}
                      disabled={verifyingId === server.id}
                      className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-40"
                      title="Verificar"
                    >
                      <ArrowPathIcon className={`w-4 h-4 ${verifyingId === server.id ? 'animate-spin' : ''}`} />
                    </button>
                    <button
                      onClick={() => onRemove(server.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                      title="Eliminar"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {isExpanded && details && (
                  <div className="px-4 pb-4 border-t border-gray-100 bg-gray-50/50">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-3">
                      <InfoCard label="Sistema operativo" value={details.os || '-'} />
                      <InfoCard
                        label="Docker"
                        value={details.docker_installed ? details.docker_version || 'Instalado' : 'No instalado'}
                        ok={details.docker_installed}
                      />
                      <InfoCard
                        label="Nginx"
                        value={details.nginx_installed ? details.nginx_version || 'Instalado' : 'No instalado'}
                        ok={details.nginx_installed}
                      />
                      <InfoCard
                        label="Disco"
                        value={details.disk_total_gb ? `${details.disk_used_gb}/${details.disk_total_gb} GB` : '-'}
                      />
                      <InfoCard
                        label="RAM"
                        value={details.ram_total_mb ? `${details.ram_available_mb}/${details.ram_total_mb} MB` : '-'}
                      />
                      {server.wildcard_domain && (
                        <InfoCard label="Dominio wildcard" value={`*.${server.wildcard_domain}`} />
                      )}
                    </div>
                    {details.error && (
                      <div className="mt-3 px-3 py-2 bg-red-50 rounded-lg text-[11px] text-red-600">
                        {details.error}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function InfoCard({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="px-3 py-2 bg-white rounded-lg border border-gray-100">
      <span className="block text-[10px] text-gray-400 font-medium uppercase tracking-wide">{label}</span>
      <span className={`block text-[12px] mt-0.5 font-medium ${ok === false ? 'text-red-500' : ok === true ? 'text-green-600' : 'text-gray-700'}`}>
        {value}
      </span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB: Claves SSH
// ═══════════════════════════════════════════════════════════════════════════════

function SSHKeysTab({
  keys, loading, generating, newKeyName, setNewKeyName,
  onGenerate, onCopy, onDownload, onDelete,
  inputCls, btnPrimary,
}: any) {
  if (loading) {
    return <div className="text-[13px] text-gray-400 py-12 text-center">Cargando claves SSH...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Generate New Key */}
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label className="block text-[11px] font-medium text-gray-500 mb-1">Nombre de la clave</label>
          <input
            type="text"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder="pulse-deploy"
            className={inputCls}
          />
        </div>
        <button
          onClick={onGenerate}
          disabled={generating}
          className={btnPrimary}
        >
          <span className="flex items-center gap-1.5">
            <PlusIcon className="w-4 h-4" />
            {generating ? 'Generando...' : 'Generar nueva clave'}
          </span>
        </button>
      </div>

      {/* Key List */}
      {keys.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <KeyIcon className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-[13px]">No hay claves SSH generadas</p>
          <p className="text-[11px] mt-1">Genera una clave RSA-4096 para conectar con tus servidores</p>
        </div>
      ) : (
        <div className="space-y-2">
          {keys.map((key: WorkspaceSSHKey) => (
            <div key={key.id} className="flex items-center justify-between px-4 py-3 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
              <div>
                <div className="flex items-center gap-2">
                  <KeyIcon className="w-4 h-4 text-gray-400" />
                  <span className="text-[13px] font-medium text-gray-900">{key.name}</span>
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-[11px] text-gray-400 font-mono">{key.fingerprint}</span>
                  <span className="text-[10px] text-gray-400">{formatDate(key.created_at)}</span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onCopy(key.id)}
                  className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
                  title="Copiar clave publica"
                >
                  <ClipboardDocumentIcon className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onDownload(key.id, key.name)}
                  className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
                  title="Descargar .pub"
                >
                  <ArrowDownTrayIcon className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onDelete(key.id)}
                  className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                  title="Eliminar"
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB: Tokens de Repositorio
// ═══════════════════════════════════════════════════════════════════════════════

function TokensTab({
  tokens, loading, showAdd, setShowAdd,
  editingId, setEditingId, newToken, setNewToken,
  onAdd, onUpdate, onDelete,
  inputCls, btnPrimary, btnSecondary,
}: any) {
  const [_editName, _setEditName] = useState('');
  void _editName; void _setEditName;

  if (loading) {
    return <div className="text-[13px] text-gray-400 py-12 text-center">Cargando tokens...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Add Token Form */}
      {showAdd ? (
        <div className="border border-gray-200 rounded-xl p-4 space-y-3 bg-gray-50/50">
          <h3 className="text-[13px] font-semibold text-gray-900">Nuevo token de repositorio</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Nombre</label>
              <input
                type="text"
                value={newToken.name}
                onChange={(e) => setNewToken({ ...newToken, name: e.target.value })}
                placeholder="Mi token de GitHub"
                className={inputCls}
                autoFocus
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Proveedor</label>
              <select
                value={newToken.provider}
                onChange={(e) => setNewToken({ ...newToken, provider: e.target.value })}
                className={inputCls}
              >
                <option value="github">GitHub</option>
                <option value="gitlab">GitLab</option>
                <option value="bitbucket">Bitbucket</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-gray-500 mb-1">Token</label>
            <input
              type="password"
              value={newToken.token}
              onChange={(e) => setNewToken({ ...newToken, token: e.target.value })}
              placeholder="ghp_..."
              className={inputCls}
            />
            <p className="mt-1 text-[10px] text-gray-400 flex items-center gap-1">
              <EyeSlashIcon className="w-3 h-3" />
              El token se cifra y no se mostrara despues de guardarlo
            </p>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-gray-500 mb-1">Usuario <span className="text-gray-400 font-normal">(opcional)</span></label>
            <input
              type="text"
              value={newToken.username}
              onChange={(e) => setNewToken({ ...newToken, username: e.target.value })}
              placeholder="mi-usuario-github"
              className={inputCls}
            />
          </div>
          <label className="flex items-center gap-2 text-[12px] text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={newToken.is_default}
              onChange={(e) => setNewToken({ ...newToken, is_default: e.target.checked })}
              className="rounded border-gray-300"
            />
            Token por defecto
          </label>
          <div className="flex gap-2 pt-1">
            <button onClick={onAdd} className={btnPrimary} disabled={!newToken.name.trim() || !newToken.token.trim()}>
              Guardar
            </button>
            <button onClick={() => setShowAdd(false)} className={btnSecondary}>
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium text-gray-600 hover:text-gray-900 border border-dashed border-gray-300 hover:border-gray-400 rounded-lg transition-colors"
        >
          <PlusIcon className="w-4 h-4" />
          Anadir token
        </button>
      )}

      {/* Token List */}
      {tokens.length === 0 && !showAdd ? (
        <div className="text-center py-16 text-gray-400">
          <ShieldCheckIcon className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-[13px]">No hay tokens configurados</p>
          <p className="text-[11px] mt-1">Agrega un token de GitHub, GitLab o Bitbucket</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tokens.map((token: RepoToken) => (
            <div key={token.id} className="flex items-center justify-between px-4 py-3 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
              <div className="flex items-center gap-3">
                <div>
                  {editingId === token.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        defaultValue={token.name}
                        className="px-2 py-1 text-[13px] border border-gray-300 rounded-lg focus:outline-none focus:border-gray-500 w-48"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            onUpdate(token.id, { name: (e.target as HTMLInputElement).value });
                          } else if (e.key === 'Escape') {
                            setEditingId(null);
                          }
                        }}
                        onBlur={(e) => {
                          if (e.target.value !== token.name) {
                            onUpdate(token.id, { name: e.target.value });
                          } else {
                            setEditingId(null);
                          }
                        }}
                      />
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium text-gray-900">{token.name}</span>
                      <ProviderBadge provider={token.provider} />
                      {token.is_default && (
                        <StarSolid className="w-3.5 h-3.5 text-amber-500" title="Token por defecto" />
                      )}
                    </div>
                  )}
                  <div className="flex items-center gap-3 mt-0.5">
                    {token.username && (
                      <span className="text-[11px] text-gray-500">@{token.username}</span>
                    )}
                    <span className="text-[10px] text-gray-400">{formatDate(token.created_at)}</span>
                    {token.last_used_at && (
                      <span className="text-[10px] text-gray-400">
                        Usado: {formatDate(token.last_used_at)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {!token.is_default && (
                  <button
                    onClick={() => onUpdate(token.id, { is_default: true })}
                    className="p-1.5 text-gray-400 hover:text-amber-500 rounded-lg hover:bg-amber-50 transition-colors"
                    title="Establecer como por defecto"
                  >
                    <StarIcon className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => setEditingId(token.id)}
                  className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
                  title="Editar nombre"
                >
                  <PencilIcon className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onDelete(token.id)}
                  className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                  title="Eliminar"
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB: Resumen
// ═══════════════════════════════════════════════════════════════════════════════

function OverviewTab({
  servers,
  sshKeys,
  tokens,
}: {
  servers: WorkspaceServer[];
  sshKeys: WorkspaceSSHKey[];
  tokens: RepoToken[];
}) {
  const verifiedServers = servers.filter((s) => s.status === 'verified').length;

  const cards = [
    {
      label: 'Servidores',
      value: servers.length,
      sub: `${verifiedServers} verificados`,
      icon: ServerIcon,
      color: 'bg-blue-50 text-blue-600',
    },
    {
      label: 'Claves SSH',
      value: sshKeys.length,
      sub: 'RSA-4096',
      icon: KeyIcon,
      color: 'bg-green-50 text-green-600',
    },
    {
      label: 'Tokens',
      value: tokens.length,
      sub: tokens.filter((t) => t.is_default).length > 0
        ? `${tokens.filter((t) => t.is_default).length} por defecto`
        : 'Sin default',
      icon: ShieldCheckIcon,
      color: 'bg-purple-50 text-purple-600',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        {cards.map((card) => {
          const CardIcon = card.icon;
          return (
            <div key={card.label} className="border border-gray-200 rounded-xl p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${card.color}`}>
                  <CardIcon className="w-4 h-4" />
                </div>
                <span className="text-[12px] font-medium text-gray-500">{card.label}</span>
              </div>
              <p className="text-2xl font-semibold text-gray-900">{card.value}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">{card.sub}</p>
            </div>
          );
        })}
      </div>

      {/* Server Status */}
      {servers.length > 0 && (
        <div>
          <h3 className="text-[13px] font-semibold text-gray-900 mb-3">Estado de servidores</h3>
          <div className="space-y-2">
            {servers.map((server) => (
              <div key={server.id} className="flex items-center justify-between px-4 py-2.5 border border-gray-200 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${
                    server.status === 'verified' ? 'bg-green-500' : server.status === 'failed' ? 'bg-red-500' : 'bg-amber-500'
                  }`} />
                  <span className="text-[13px] font-medium text-gray-900">{server.name}</span>
                  <span className="text-[11px] text-gray-400 font-mono">{server.host}</span>
                </div>
                <StatusBadge status={server.status || 'pending'} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
