import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import {
  GlobeAltIcon,
  PlusIcon,
  MagnifyingGlassIcon,
  ChartBarIcon,
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
    <div className="flex-1 flex h-full min-w-0 overflow-hidden">
      <div className="relative flex-1 flex min-w-0 overflow-hidden rounded-[20px] bg-gradient-to-b from-[#f6fbff] to-[#edf4fb]">
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-white/92 md:rounded-[20px]">
          {/* Header toolbar */}
          <div className="h-14 flex items-center justify-between gap-2 border-b border-[#e4edf8] pl-3 pr-2 sm:pl-5 sm:pr-3">
            <div className="flex min-w-0 items-center gap-2">
              <ChartBarIcon className="w-[18px] h-[18px] text-slate-700 hidden sm:block" />
              <h1 className="text-sm sm:text-base font-semibold text-slate-900 truncate">
                Marketing
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAddSite(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-xl border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
              >
                <PlusIcon className="w-4 h-4" />
                Nuevo sitio
              </button>
              <HeaderButtons />
            </div>
          </div>

          {/* Content area */}
          <div className="flex flex-1 overflow-hidden">
            {/* Sidebar: sites list */}
            <div className="w-72 border-r border-[#e4edf8] flex flex-col flex-shrink-0 bg-white/60">
              {/* Search */}
              <div className="p-3 border-b border-[#e4edf8]">
                <div className="relative">
                  <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar sitios..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && fetchSites()}
                    className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 transition-colors"
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
                <div className="flex flex-col items-center justify-center h-full text-slate-400">
                  <GlobeAltIcon className="w-16 h-16 mb-4 text-slate-300" />
                  <p className="text-lg font-medium mb-1 text-slate-500">
                    Selecciona un sitio
                  </p>
                  <p className="text-sm">
                    o crea uno nuevo para empezar a monitorizar su SEO
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Add site modal */}
      {showAddSite && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">
              Nuevo sitio web
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-slate-600 mb-1">
                  Nombre
                </label>
                <input
                  type="text"
                  placeholder="Mi Web"
                  value={newSite.name}
                  onChange={(e) =>
                    setNewSite((p) => ({ ...p, name: e.target.value }))
                  }
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">URL</label>
                <input
                  type="url"
                  placeholder="https://example.com"
                  value={newSite.url}
                  onChange={(e) =>
                    setNewSite((p) => ({ ...p, url: e.target.value }))
                  }
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowAddSite(false)}
                className="px-4 py-2 text-sm rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateSite}
                disabled={creating || !newSite.name || !newSite.url}
                className="px-4 py-2 text-sm rounded-xl bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 transition-colors"
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
