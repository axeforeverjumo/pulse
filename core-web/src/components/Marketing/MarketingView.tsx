import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import {
  GlobeAltIcon,
  PlusIcon,
  MagnifyingGlassIcon,
  ChartBarIcon,
  MagnifyingGlassCircleIcon,
  ShieldCheckIcon,
  BoltIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { HeaderButtons } from "../MiniAppHeader";
import SitesList from "./SitesList";
import SiteDetail from "./SiteDetail";
import { getMarketingSites, createMarketingSite } from "../../api/client";
import { toast } from "sonner";

export default function MarketingView() {
  const { workspaceId, siteId: urlSiteId } = useParams<{
    workspaceId: string;
    siteId?: string;
  }>();
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const workspace = workspaces.find((w) => w.id === workspaceId);
  const effectiveWorkspaceId = workspaceId || workspace?.id || "";

  const [sites, setSites] = useState<any[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(
    urlSiteId || null
  );
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showAddSite, setShowAddSite] = useState(false);
  const [newSite, setNewSite] = useState({ name: "", url: "" });
  const [creating, setCreating] = useState(false);

  const selectedSite = sites.find((s) => s.id === selectedSiteId);

  useEffect(() => {
    if (effectiveWorkspaceId) fetchSites();
  }, [effectiveWorkspaceId]);

  useEffect(() => {
    if (urlSiteId) setSelectedSiteId(urlSiteId);
  }, [urlSiteId]);

  async function fetchSites() {
    setLoading(true);
    try {
      const data = await getMarketingSites(effectiveWorkspaceId, search);
      setSites(data.sites || []);
    } catch (e) {
      console.error("Failed to load sites", e);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateSite() {
    if (!newSite.name || !newSite.url) return;
    setCreating(true);
    try {
      const site = await createMarketingSite(effectiveWorkspaceId, newSite);
      setSites((prev) => [site, ...prev]);
      setSelectedSiteId(site.id);
      setShowAddSite(false);
      setNewSite({ name: "", url: "" });
      toast.success("Sitio creado");
    } catch (e: any) {
      toast.error("Error creando sitio: " + (e.message || ""));
    } finally {
      setCreating(false);
    }
  }

  function handleSiteUpdated(updated: any) {
    setSites((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  }

  function handleSiteDeleted(id: string) {
    setSites((prev) => prev.filter((s) => s.id !== id));
    setSelectedSiteId(null);
  }

  return (
    <div className="flex flex-col h-full">
      <HeaderButtons
        title="Marketing"
        icon={<ChartBarIcon className="w-5 h-5" />}
        actions={
          <button
            onClick={() => setShowAddSite(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            Nuevo sitio
          </button>
        }
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar: sites list */}
        <div className="w-72 border-r border-white/10 flex flex-col flex-shrink-0">
          {/* Search */}
          <div className="p-3 border-b border-white/10">
            <div className="relative">
              <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
              <input
                type="text"
                placeholder="Buscar sitios..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && fetchSites()}
                className="w-full pl-9 pr-3 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/40 focus:outline-none focus:border-blue-500/50"
              />
            </div>
          </div>

          {/* Sites list */}
          <div className="flex-1 overflow-y-auto">
            <SitesList
              sites={sites}
              loading={loading}
              selectedId={selectedSiteId}
              onSelect={setSelectedSiteId}
            />
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 overflow-y-auto">
          {selectedSite ? (
            <SiteDetail
              site={selectedSite}
              workspaceId={effectiveWorkspaceId}
              onUpdated={handleSiteUpdated}
              onDeleted={handleSiteDeleted}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-white/40">
              <GlobeAltIcon className="w-16 h-16 mb-4" />
              <p className="text-lg font-medium mb-1">Selecciona un sitio</p>
              <p className="text-sm">
                o crea uno nuevo para empezar a monitorizar su SEO
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Add site modal */}
      {showAddSite && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#1a1a2e] border border-white/10 rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-white mb-4">
              Nuevo sitio web
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-white/60 mb-1">
                  Nombre
                </label>
                <input
                  type="text"
                  placeholder="Mi Web"
                  value={newSite.name}
                  onChange={(e) =>
                    setNewSite((p) => ({ ...p, name: e.target.value }))
                  }
                  className="w-full px-3 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/40 focus:outline-none focus:border-blue-500/50"
                />
              </div>
              <div>
                <label className="block text-sm text-white/60 mb-1">URL</label>
                <input
                  type="url"
                  placeholder="https://example.com"
                  value={newSite.url}
                  onChange={(e) =>
                    setNewSite((p) => ({ ...p, url: e.target.value }))
                  }
                  className="w-full px-3 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/40 focus:outline-none focus:border-blue-500/50"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowAddSite(false)}
                className="px-4 py-2 text-sm rounded-lg border border-white/10 text-white/60 hover:bg-white/5"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateSite}
                disabled={creating || !newSite.name || !newSite.url}
                className="px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
              >
                {creating ? "Creando..." : "Crear sitio"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
