import { useState, useEffect } from "react";
import {
  CodeBracketIcon,
  ServerStackIcon,
  CheckCircleIcon,
  ChevronDownIcon,
} from "@heroicons/react/24/outline";
import { updateMarketingSite, listServers } from "../../../api/client";
import type { WorkspaceServer } from "../../../api/client";
import { toast } from "sonner";

interface Props {
  site: any;
  workspaceId: string;
  onSiteUpdated: (site: any) => void;
}

export default function SettingsTab({ site, workspaceId, onSiteUpdated }: Props) {
  const [repoUrl, setRepoUrl] = useState(site.repository_url || "");
  const [repoFullName, setRepoFullName] = useState(site.repository_full_name || "");
  const [saving, setSaving] = useState(false);

  // Auto-extract full_name from URL
  useEffect(() => {
    if (repoUrl && !repoFullName) {
      const match = repoUrl.match(/github\.com\/([^/]+\/[^/.]+)/);
      if (match) setRepoFullName(match[1]);
    }
  }, [repoUrl]);

  async function handleSaveRepo() {
    setSaving(true);
    try {
      const updated = await updateMarketingSite(site.id, {
        repository_url: repoUrl || null,
        repository_full_name: repoFullName || null,
      });
      onSiteUpdated(updated);
      toast.success("Repositorio guardado");
    } catch (e: any) {
      toast.error("Error: " + (e.message || ""));
    } finally {
      setSaving(false);
    }
  }

  async function handleServerSelect(server: WorkspaceServer | null) {
    try {
      const updated = await updateMarketingSite(site.id, {
        server_id: server?.id || null,
        server_host: server?.name || null,
        server_ip: server?.host || null,
        server_user: server?.username || null,
        server_port: server?.port || 22,
      });
      onSiteUpdated(updated);
      toast.success(server ? `Servidor "${server.name}" asignado` : "Servidor desvinculado");
    } catch (e: any) {
      toast.error("Error: " + (e.message || ""));
    }
  }

  const hasRepo = !!site.repository_url;
  const hasServer = !!site.server_ip;
  const repoChanged =
    repoUrl !== (site.repository_url || "") ||
    repoFullName !== (site.repository_full_name || "");

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Repositorio */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200">
        <div className="flex items-center gap-2 mb-4">
          <CodeBracketIcon className="w-5 h-5 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Repositorio Git</h3>
          {hasRepo && <CheckCircleIcon className="w-4 h-4 text-green-500" />}
        </div>
        <p className="text-sm text-slate-400 mb-4">
          Conecta el repositorio del sitio web para que PulseMark pueda crear PRs con los fixes de SEO.
        </p>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">URL del repositorio</label>
            <input
              type="url"
              placeholder="https://github.com/usuario/mi-web"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">GitHub owner/repo</label>
            <input
              type="text"
              placeholder="usuario/mi-web"
              value={repoFullName}
              onChange={(e) => setRepoFullName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
            />
            <p className="text-xs text-slate-400 mt-1">Se detecta automaticamente de la URL</p>
          </div>
          {repoChanged && (
            <div className="flex justify-end">
              <button onClick={handleSaveRepo} disabled={saving}
                className="px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 transition-colors">
                {saving ? "Guardando..." : "Guardar repositorio"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Servidor — dropdown from DevOps */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200">
        <div className="flex items-center gap-2 mb-4">
          <ServerStackIcon className="w-5 h-5 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Servidor de produccion</h3>
          {hasServer && <CheckCircleIcon className="w-4 h-4 text-green-500" />}
        </div>
        <p className="text-sm text-slate-400 mb-4">
          Selecciona el servidor donde esta desplegado el sitio (configurados en DevOps).
        </p>
        <ServerSelector
          workspaceId={workspaceId}
          selectedServerId={site.server_id || ""}
          serverHost={site.server_host || ""}
          onSelect={handleServerSelect}
        />
      </div>

      {/* PulseMark capabilities */}
      <div className="bg-blue-50 rounded-2xl p-5 border border-blue-200">
        <h3 className="text-sm font-semibold text-blue-700 mb-2">
          Con repo + servidor configurados, PulseMark puede:
        </h3>
        <ul className="text-sm text-blue-600 space-y-1">
          <li>• Corregir meta tags, titles y canonical tags directamente en el codigo</li>
          <li>• Optimizar imagenes y anadir alt texts faltantes</li>
          <li>• Crear/actualizar sitemap.xml y robots.txt</li>
          <li>• Anadir schema markup (JSON-LD) para SEO estructurado</li>
          <li>• Instalar y configurar tags en Google Tag Manager</li>
          <li>• Hacer deploy de los cambios al servidor</li>
          <li>• Crear PRs en GitHub con cada fix para revision</li>
        </ul>
      </div>
    </div>
  );
}

// ============================================================================
// Server Selector — picks from DevOps workspace_servers
// ============================================================================

function ServerSelector({
  workspaceId,
  selectedServerId,
  serverHost,
  onSelect,
}: {
  workspaceId: string;
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
  const displayName = selected?.name || serverHost || "";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-white text-left focus:outline-none focus:ring-2 focus:ring-blue-200"
      >
        <span className={displayName ? "text-gray-900" : "text-gray-400"}>
          {loading ? "Cargando servidores..." : displayName || "Seleccionar servidor..."}
        </span>
        <ChevronDownIcon className="w-4 h-4 text-gray-400 shrink-0" />
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          <button
            type="button"
            onClick={() => { onSelect(null); setOpen(false); }}
            className="w-full px-3 py-2 text-xs text-gray-400 hover:bg-gray-50 text-left"
          >
            Sin servidor
          </button>

          {servers.length === 0 && !loading && (
            <div className="px-3 py-3 text-xs text-gray-400 text-center">
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
              className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-gray-50 text-left ${
                server.id === selectedServerId ? "bg-blue-50 text-blue-700" : "text-gray-700"
              }`}
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${
                server.status === "verified" ? "bg-green-500" :
                server.status === "failed" ? "bg-red-500" :
                "bg-gray-300"
              }`} />
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{server.name}</div>
                <div className="text-xs text-gray-400">{server.host} · {server.username}@:{server.port || 22}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
