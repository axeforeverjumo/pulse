import { useEffect, useState } from 'react';
import {
  PlusIcon,
  TrashIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  XCircleIcon,
  WifiIcon,
} from '@heroicons/react/24/outline';
import { api } from '../../api/client';
import { toast } from 'sonner';

interface Props {
  workspaceId: string;
}

export default function MCPSettings({ workspaceId }: Props) {
  const [servers, setServers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<'stdio' | 'http' | 'sse'>('http');
  const [newUrl, setNewUrl] = useState('');
  const [newCommand, setNewCommand] = useState('');
  const [newArgs, setNewArgs] = useState('');
  const [newDescription, setNewDescription] = useState('');

  const fetchServers = async () => {
    setLoading(true);
    try {
      const data = await api<{ servers: any[] }>(`/mcp/servers?workspace_id=${workspaceId}`);
      setServers(data.servers || []);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { fetchServers(); }, [workspaceId]);

  const handleCreate = async () => {
    if (!newName.trim()) return;

    const config: any = {};
    if (newType === 'http' || newType === 'sse') {
      config.url = newUrl;
    } else {
      config.command = newCommand;
      config.args = newArgs.split(' ').filter(Boolean);
    }

    try {
      await api('/mcp/servers', {
        method: 'POST',
        body: JSON.stringify({
          workspace_id: workspaceId,
          name: newName,
          description: newDescription,
          server_type: newType,
          config,
        }),
      });
      toast.success('MCP Server registrado');
      setShowCreate(false);
      setNewName('');
      setNewUrl('');
      setNewCommand('');
      setNewArgs('');
      setNewDescription('');
      fetchServers();
    } catch { toast.error('Error al crear servidor'); }
  };

  const handleConnect = async (serverId: string) => {
    try {
      toast.info('Conectando...');
      const result = await api<any>(`/mcp/servers/${serverId}/connect?workspace_id=${workspaceId}`, { method: 'POST' });
      toast.success(`Conectado — ${result.tools_count} tools disponibles`);
      fetchServers();
    } catch (e: any) {
      toast.error('Error de conexion');
    }
  };

  const handleDelete = async (serverId: string) => {
    if (!confirm('Eliminar este MCP server?')) return;
    try {
      await api(`/mcp/servers/${serverId}?workspace_id=${workspaceId}`, { method: 'DELETE' });
      toast.success('Server eliminado');
      fetchServers();
    } catch { toast.error('Error al eliminar'); }
  };

  const handleToggle = async (serverId: string, enabled: boolean) => {
    try {
      await api(`/mcp/servers/${serverId}?workspace_id=${workspaceId}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_enabled: !enabled }),
      });
      fetchServers();
    } catch {}
  };

  const statusIcon = (s: string) => {
    if (s === 'connected') return <CheckCircleIcon className="w-4 h-4 text-green-500" />;
    if (s === 'error') return <XCircleIcon className="w-4 h-4 text-red-500" />;
    return <WifiIcon className="w-4 h-4 text-zinc-400" />;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">MCP Servers</h3>
          <p className="text-xs text-zinc-500">Model Context Protocol — conecta herramientas externas</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-400 transition-colors"
        >
          <PlusIcon className="w-3.5 h-3.5" />
          Agregar Server
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-500" />
        </div>
      ) : servers.length === 0 ? (
        <div className="text-center py-8 text-sm text-zinc-500">
          No hay MCP servers configurados.
        </div>
      ) : (
        <div className="space-y-2">
          {servers.map((server: any) => (
            <div key={server.id} className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {statusIcon(server.status)}
                  <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{server.name}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500">{server.server_type}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => handleConnect(server.id)} className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800" title="Conectar y refrescar tools">
                    <ArrowPathIcon className="w-3.5 h-3.5 text-zinc-500" />
                  </button>
                  <button onClick={() => handleToggle(server.id, server.is_enabled)} className={`p-1.5 rounded text-xs ${server.is_enabled ? 'text-green-600' : 'text-zinc-400'}`}>
                    {server.is_enabled ? 'ON' : 'OFF'}
                  </button>
                  <button onClick={() => handleDelete(server.id)} className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-500/10">
                    <TrashIcon className="w-3.5 h-3.5 text-zinc-500 hover:text-red-500" />
                  </button>
                </div>
              </div>
              {server.description && <p className="text-xs text-zinc-500 mt-1">{server.description}</p>}
              {server.error_message && <p className="text-xs text-red-500 mt-1">{server.error_message}</p>}
              {server.tools_cache && server.tools_cache.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {server.tools_cache.map((tool: any, i: number) => (
                    <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                      {tool.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Nuevo MCP Server</h3>
            <div className="space-y-3">
              <input type="text" placeholder="Nombre (ej: exa-search)" value={newName} onChange={(e) => setNewName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100" />
              <input type="text" placeholder="Descripcion" value={newDescription} onChange={(e) => setNewDescription(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100" />
              <select value={newType} onChange={(e) => setNewType(e.target.value as any)}
                className="w-full px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100">
                <option value="http">HTTP</option>
                <option value="sse">SSE</option>
                <option value="stdio">stdio</option>
              </select>
              {(newType === 'http' || newType === 'sse') ? (
                <input type="text" placeholder="URL (ej: http://localhost:3001)" value={newUrl} onChange={(e) => setNewUrl(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100" />
              ) : (
                <>
                  <input type="text" placeholder="Command (ej: npx)" value={newCommand} onChange={(e) => setNewCommand(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100" />
                  <input type="text" placeholder="Args (ej: @anthropic/mcp-server-filesystem /tmp)" value={newArgs} onChange={(e) => setNewArgs(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100" />
                </>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg">Cancelar</button>
              <button onClick={handleCreate} disabled={!newName.trim()} className="px-4 py-2 text-xs font-medium bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 disabled:opacity-50">Crear</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
