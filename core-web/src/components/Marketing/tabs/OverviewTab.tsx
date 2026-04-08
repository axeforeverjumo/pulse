import { useState, useEffect, useRef } from "react";
import {
  ChartBarIcon,
  EyeIcon,
  CursorArrowRaysIcon,
  ArrowTrendingUpIcon,
  LinkIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/outline";
import {
  updateMarketingSite,
  getMarketingAuthUrl,
  getMarketingAuthStatus,
  getMarketingGa4Properties,
  getMarketingGscSites,
  getMarketingSearchPerformance,
} from "../../../api/client";
import { toast } from "sonner";

interface Props {
  site: any;
  workspaceId: string;
  onSiteUpdated?: (site: any) => void;
}

export default function OverviewTab({ site, onSiteUpdated }: Props) {
  const [googleAuth, setGoogleAuth] = useState<{ connected: boolean; email?: string } | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [ga4Properties, setGa4Properties] = useState<any[]>([]);
  const [gscSites, setGscSites] = useState<any[]>([]);
  const [loadingProperties, setLoadingProperties] = useState(false);
  const [liveKpis, setLiveKpis] = useState<{ clicks?: number; impressions?: number; ctr?: number; position?: number } | null>(null);
  const autoSavedRef = useRef(false);

  useEffect(() => {
    checkGoogleAuth();
  }, []);

  useEffect(() => {
    if (googleAuth?.connected) loadProperties();
  }, [googleAuth?.connected]);

  // Load live KPIs if GSC is configured
  useEffect(() => {
    if (site.gsc_site_url) loadLiveKpis();
  }, [site.gsc_site_url]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "google_marketing_connected") {
        setGoogleAuth({ connected: true, email: event.data.email });
        toast.success(`Google conectado: ${event.data.email}`);
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  async function checkGoogleAuth() {
    try {
      const status = await getMarketingAuthStatus();
      setGoogleAuth(status);
    } catch {}
  }

  async function loadLiveKpis() {
    try {
      const perf = await getMarketingSearchPerformance(site.id);
      if (perf?.totals) {
        setLiveKpis({
          clicks: perf.totals.clicks,
          impressions: perf.totals.impressions,
          ctr: perf.totals.avg_ctr,
          position: perf.totals.avg_position,
        });
      }
    } catch {}
  }

  async function loadProperties() {
    setLoadingProperties(true);
    try {
      const [props, sites] = await Promise.all([
        getMarketingGa4Properties().catch(() => []),
        getMarketingGscSites().catch(() => []),
      ]);
      setGa4Properties(props);
      setGscSites(sites);

      // Auto-save if not yet configured
      if (!autoSavedRef.current) {
        let autoGa4 = site.ga4_property_id || "";
        let autoGsc = site.gsc_site_url || "";
        let needsSave = false;

        if (!autoGa4 && props.length >= 1) {
          autoGa4 = props[0].property_id;
          needsSave = true;
        }
        if (!autoGsc && sites.length > 0) {
          const match = sites.find((s: any) => s.site_url.includes(site.domain));
          autoGsc = match ? match.site_url : sites[0].site_url;
          needsSave = true;
        }

        if (needsSave) {
          autoSavedRef.current = true;
          await saveProperties(autoGa4, autoGsc);
        }
      }
    } catch (e) {
      console.error("Failed to load properties", e);
    } finally {
      setLoadingProperties(false);
    }
  }

  async function saveProperties(ga4: string, gsc: string) {
    try {
      const updated = await updateMarketingSite(site.id, {
        ga4_property_id: ga4 || null,
        gsc_site_url: gsc || null,
      });
      onSiteUpdated?.(updated);
      // Load KPIs immediately after saving GSC
      if (gsc) {
        setTimeout(() => loadLiveKpis(), 500);
      }
    } catch (e: any) {
      console.error("Auto-save failed", e);
    }
  }

  async function handleGa4Change(value: string) {
    await saveProperties(value, site.gsc_site_url || "");
    toast.success("Analytics configurado");
  }

  async function handleGscChange(value: string) {
    await saveProperties(site.ga4_property_id || "", value);
    toast.success("Search Console configurado");
  }

  async function handleConnectGoogle() {
    setConnecting(true);
    try {
      const { url } = await getMarketingAuthUrl();
      const w = 500, h = 600;
      const left = window.screenX + (window.outerWidth - w) / 2;
      const top = window.screenY + (window.outerHeight - h) / 2;
      window.open(url, "google_marketing_oauth", `width=${w},height=${h},left=${left},top=${top}`);
    } catch (e: any) {
      toast.error("Error: " + (e.message || ""));
    } finally {
      setConnecting(false);
    }
  }

  // Use live KPIs or cached site values
  const clicks = liveKpis?.clicks ?? site.organic_clicks_7d;
  const impressions = liveKpis?.impressions ?? site.organic_impressions_7d;
  const position = liveKpis?.position ?? site.avg_position;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="SEO Score" value={site.last_audit_score != null ? `${site.last_audit_score}/100` : "--"} icon={<ChartBarIcon className="w-5 h-5" />} color={site.last_audit_score >= 80 ? "green" : site.last_audit_score >= 50 ? "yellow" : "red"} />
        <KpiCard label="Clicks (28d)" value={clicks != null ? clicks.toLocaleString() : "--"} icon={<CursorArrowRaysIcon className="w-5 h-5" />} color="blue" />
        <KpiCard label="Impresiones (28d)" value={impressions != null ? impressions.toLocaleString() : "--"} icon={<EyeIcon className="w-5 h-5" />} color="purple" />
        <KpiCard label="Posicion media" value={position != null ? Number(position).toFixed(1) : "--"} icon={<ArrowTrendingUpIcon className="w-5 h-5" />} color="orange" />
      </div>

      {/* Google Connection + Property Selection */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <LinkIcon className="w-4 h-4 text-slate-500" />
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Google</h3>
          </div>
          {googleAuth?.connected ? (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 border border-green-200 rounded-lg">
              <CheckCircleIcon className="w-4 h-4 text-green-500" />
              <span className="text-sm text-green-700">{googleAuth.email}</span>
            </div>
          ) : (
            <button onClick={handleConnectGoogle} disabled={connecting}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors disabled:opacity-50">
              <GoogleIcon />
              {connecting ? "Conectando..." : "Conectar Google"}
            </button>
          )}
        </div>

        {!googleAuth?.connected && (
          <p className="text-sm text-slate-400">Conecta tu cuenta de Google para acceder a Analytics, Search Console, Tag Manager y Ads.</p>
        )}

        {googleAuth?.connected && (
          <div className="space-y-4 mt-4">
            {loadingProperties ? (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                Detectando propiedades...
              </div>
            ) : (
              <>
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
                    <AnalyticsIcon />
                    Google Analytics 4
                    {site.ga4_property_id && <CheckCircleIcon className="w-4 h-4 text-green-500" />}
                  </label>
                  {ga4Properties.length > 0 ? (
                    <select value={site.ga4_property_id || ""} onChange={(e) => handleGa4Change(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 bg-white">
                      <option value="">Seleccionar propiedad...</option>
                      {ga4Properties.map((p) => (
                        <option key={p.property_id} value={p.property_id}>{p.display_name} — {p.account} ({p.property_id})</option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-sm text-slate-400">No se encontraron propiedades GA4 en esta cuenta.</p>
                  )}
                </div>

                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
                    <GoogleIcon />
                    Google Search Console
                    {site.gsc_site_url && <CheckCircleIcon className="w-4 h-4 text-green-500" />}
                  </label>
                  {gscSites.length > 0 ? (
                    <select value={site.gsc_site_url || ""} onChange={(e) => handleGscChange(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 bg-white">
                      <option value="">Seleccionar sitio...</option>
                      {gscSites.map((s) => (
                        <option key={s.site_url} value={s.site_url}>{s.site_url} ({s.permission_level})</option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-sm text-slate-400">No se encontraron sitios en Search Console.</p>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Site Info */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200">
        <h3 className="text-sm font-semibold text-slate-500 mb-3 uppercase tracking-wide">Informacion del sitio</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <InfoRow label="Dominio" value={site.domain} />
          <InfoRow label="URL" value={site.url} isLink />
          <InfoRow label="Tipo" value={site.site_type || "custom"} />
          <InfoRow label="Ultimo audit" value={site.last_audit_at ? new Date(site.last_audit_at).toLocaleDateString("es-ES") : "Nunca"} />
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}

function AnalyticsIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24">
      <path fill="#E37400" d="M22.84 2.998V21c0 1.1-.9 2-2 2h-4.5c-1.1 0-2-.9-2-2V2.998c0-1.657 1.343-3 3-3h2.5c1.1.002 2 .9 2 2.002z"/>
      <path fill="#F9AB00" d="M14.34 11.2v9.8c0 1.1-.9 2-2 2h-4.5c-1.1 0-2-.9-2-2v-9.8c0-1.1.9-2 2-2h4.5c1.1 0 2 .9 2 2z"/>
      <path fill="#E37400" d="M5.84 17.6v3.4c0 1.1-.9 2-2 2h-1.5c-1.1 0-2-.9-2-2v-3.4c0-1.1.9-2 2-2h1.5c1.1 0 2 .9 2 2z"/>
    </svg>
  );
}

function KpiCard({ label, value, icon, color }: { label: string; value: string; icon: React.ReactNode; color: string }) {
  const c: Record<string, string> = {
    green: "bg-green-50 text-green-700 border-green-200",
    yellow: "bg-yellow-50 text-yellow-700 border-yellow-200",
    red: "bg-red-50 text-red-700 border-red-200",
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    purple: "bg-purple-50 text-purple-700 border-purple-200",
    orange: "bg-orange-50 text-orange-700 border-orange-200",
  };
  return (
    <div className={`rounded-2xl p-4 border ${c[color] || c.blue}`}>
      <div className="flex items-center gap-2 mb-2 opacity-60">{icon}</div>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs opacity-60 mt-1">{label}</p>
    </div>
  );
}

function InfoRow({ label, value, isLink }: { label: string; value: string; isLink?: boolean }) {
  return (
    <div>
      <p className="text-slate-400 text-xs mb-0.5">{label}</p>
      {isLink ? <a href={value} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-sm">{value}</a>
        : <p className="text-slate-800 text-sm">{value}</p>}
    </div>
  );
}
