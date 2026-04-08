import { useState, useEffect } from "react";
import {
  CodeBracketIcon,
  ServerStackIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/outline";
import { updateMarketingSite } from "../../../api/client";
import { toast } from "sonner";

interface Props {
  site: any;
  workspaceId: string;
  onSiteUpdated: (site: any) => void;
}

export default function SettingsTab({ site, workspaceId, onSiteUpdated }: Props) {
  const [repoUrl, setRepoUrl] = useState(site.repository_url || "");
  const [repoFullName, setRepoFullName] = useState(site.repository_full_name || "");
  const [serverHost, setServerHost] = useState(site.server_host || "");
  const [serverIp, setServerIp] = useState(site.server_ip || "");
  const [serverUser, setServerUser] = useState(site.server_user || "");
  const [serverPort, setServerPort] = useState(site.server_port || 22);
  const [saving, setSaving] = useState(false);

  // Auto-extract full_name from URL
  useEffect(() => {
    if (repoUrl && !repoFullName) {
      const match = repoUrl.match(/github\.com\/([^/]+\/[^/.]+)/);
      if (match) setRepoFullName(match[1]);
    }
  }, [repoUrl]);

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await updateMarketingSite(site.id, {
        repository_url: repoUrl || null,
        repository_full_name: repoFullName || null,
        server_host: serverHost || null,
        server_ip: serverIp || null,
        server_user: serverUser || null,
        server_port: serverPort || 22,
      });
      onSiteUpdated(updated);
      toast.success("Ajustes guardados");
    } catch (e: any) {
      toast.error("Error: " + (e.message || ""));
    } finally {
      setSaving(false);
    }
  }

  const hasRepo = !!site.repository_url;
  const hasServer = !!site.server_ip;

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Repositorio */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200">
        <div className="flex items-center gap-2 mb-4">
          <CodeBracketIcon className="w-5 h-5 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
            Repositorio Git
          </h3>
          {hasRepo && <CheckCircleIcon className="w-4 h-4 text-green-500" />}
        </div>
        <p className="text-sm text-slate-400 mb-4">
          Conecta el repositorio del sitio web para que PulseMark pueda crear PRs con los fixes de SEO directamente en el codigo.
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
        </div>
      </div>

      {/* Servidor */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200">
        <div className="flex items-center gap-2 mb-4">
          <ServerStackIcon className="w-5 h-5 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
            Servidor de produccion
          </h3>
          {hasServer && <CheckCircleIcon className="w-4 h-4 text-green-500" />}
        </div>
        <p className="text-sm text-slate-400 mb-4">
          Configura el servidor donde esta desplegado el sitio para que PulseMark pueda hacer deploy de los cambios.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre / Label</label>
            <input
              type="text"
              placeholder="Produccion"
              value={serverHost}
              onChange={(e) => setServerHost(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">IP del servidor</label>
            <input
              type="text"
              placeholder="85.215.105.45"
              value={serverIp}
              onChange={(e) => setServerIp(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Usuario SSH</label>
            <input
              type="text"
              placeholder="root"
              value={serverUser}
              onChange={(e) => setServerUser(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Puerto SSH</label>
            <input
              type="number"
              placeholder="22"
              value={serverPort}
              onChange={(e) => setServerPort(parseInt(e.target.value) || 22)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
            />
          </div>
        </div>
      </div>

      {/* PulseMark capabilities info */}
      <div className="bg-blue-50 rounded-2xl p-5 border border-blue-200">
        <h3 className="text-sm font-semibold text-blue-700 mb-2">
          Con repo + servidor configurados, PulseMark puede:
        </h3>
        <ul className="text-sm text-blue-600 space-y-1">
          <li>• Corregir meta tags, titles y canonical tags directamente en el codigo</li>
          <li>• Optimizar imagenes y añadir alt texts faltantes</li>
          <li>• Crear/actualizar sitemap.xml y robots.txt</li>
          <li>• Añadir schema markup (JSON-LD) para SEO estructurado</li>
          <li>• Instalar y configurar tags en Google Tag Manager</li>
          <li>• Hacer deploy de los cambios al servidor</li>
          <li>• Crear PRs en GitHub con cada fix para revision</li>
        </ul>
      </div>

      {/* Save */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 text-sm font-medium rounded-xl bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 transition-colors"
        >
          {saving ? "Guardando..." : "Guardar ajustes"}
        </button>
      </div>
    </div>
  );
}
