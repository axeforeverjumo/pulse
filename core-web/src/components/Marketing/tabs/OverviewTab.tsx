import { useState, useEffect, useRef } from "react";
import {
  ChartBarIcon,
  EyeIcon,
  CursorArrowRaysIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  LinkIcon,
  CheckCircleIcon,
  BoltIcon,
  ShieldCheckIcon,
  GlobeAltIcon,
  DocumentMagnifyingGlassIcon,
  RocketLaunchIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import {
  updateMarketingSite,
  getMarketingAuthUrl,
  getMarketingAuthStatus,
  getMarketingGa4Properties,
  getMarketingGscSites,
  getMarketingSearchPerformance,
  getMarketingSearchKeywords,
  runMarketingSeoAudit,
  getMarketingSeoAudits,
} from "../../../api/client";
import { toast } from "sonner";

interface Props {
  site: any;
  workspaceId: string;
  onSiteUpdated?: (site: any) => void;
}

export default function OverviewTab({ site, workspaceId, onSiteUpdated }: Props) {
  const [googleAuth, setGoogleAuth] = useState<{ connected: boolean; email?: string } | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [ga4Properties, setGa4Properties] = useState<any[]>([]);
  const [gscSites, setGscSites] = useState<any[]>([]);
  const [loadingProperties, setLoadingProperties] = useState(false);

  // Dashboard data
  const [searchPerf, setSearchPerf] = useState<any>(null);
  const [topKeywords, setTopKeywords] = useState<any[]>([]);
  const [pagespeed, setPagespeed] = useState<any>(null);
  const [lastAudit, setLastAudit] = useState<any>(null);
  const [loadingDashboard, setLoadingDashboard] = useState(false);

  const autoSavedRef = useRef(false);

  useEffect(() => { if (workspaceId) checkGoogleAuth(); }, [workspaceId]);
  useEffect(() => { if (googleAuth?.connected && workspaceId) loadProperties(); }, [googleAuth?.connected, workspaceId]);
  useEffect(() => { loadDashboardData(); }, [site.gsc_site_url, site.ga4_property_id]);

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
    try { setGoogleAuth(await getMarketingAuthStatus(workspaceId)); } catch {}
  }

  async function loadDashboardData() {
    if (!site.gsc_site_url && !site.id) return;
    setLoadingDashboard(true);
    try {
      const promises: Promise<any>[] = [];

      // Search Console data
      if (site.gsc_site_url) {
        promises.push(
          getMarketingSearchPerformance(site.id).then(setSearchPerf).catch(() => null),
          getMarketingSearchKeywords(site.id).then((kw) => setTopKeywords(kw.slice(0, 8))).catch(() => null),
        );
      }

      // Last audit
      promises.push(
        getMarketingSeoAudits(site.id).then((audits) => {
          if (audits.length > 0) setLastAudit(audits[0]);
        }).catch(() => null),
      );

      await Promise.allSettled(promises);
    } finally {
      setLoadingDashboard(false);
    }
  }

  async function loadProperties() {
    setLoadingProperties(true);
    try {
      const [props, sites] = await Promise.all([
        getMarketingGa4Properties(workspaceId).catch(() => []),
        getMarketingGscSites(workspaceId).catch(() => []),
      ]);
      setGa4Properties(props);
      setGscSites(sites);

      if (!autoSavedRef.current) {
        let autoGa4 = site.ga4_property_id || "";
        let autoGsc = site.gsc_site_url || "";
        let needsSave = false;
        if (!autoGa4 && props.length >= 1) { autoGa4 = props[0].property_id; needsSave = true; }
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
    } catch {} finally { setLoadingProperties(false); }
  }

  async function saveProperties(ga4: string, gsc: string) {
    try {
      const updated = await updateMarketingSite(site.id, { ga4_property_id: ga4 || null, gsc_site_url: gsc || null });
      onSiteUpdated?.(updated);
      setTimeout(() => loadDashboardData(), 500);
    } catch {}
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
      const { url } = await getMarketingAuthUrl(workspaceId);
      const w = 500, h = 600, left = window.screenX + (window.outerWidth - w) / 2, top = window.screenY + (window.outerHeight - h) / 2;
      window.open(url, "google_marketing_oauth", `width=${w},height=${h},left=${left},top=${top}`);
    } catch (e: any) { toast.error("Error: " + (e.message || "")); } finally { setConnecting(false); }
  }

  // Derived data
  const clicks = searchPerf?.totals?.clicks;
  const impressions = searchPerf?.totals?.impressions;
  const avgCtr = searchPerf?.totals?.avg_ctr;
  const avgPosition = searchPerf?.totals?.avg_position;
  const perfScore = pagespeed?.scores?.performance;
  const seoScore = pagespeed?.scores?.seo;
  const auditScore = lastAudit?.seo_score ?? site.last_audit_score;
  const auditIssues = lastAudit?.diagnostics?.issue_summary;
  const isConfigured = googleAuth?.connected && (site.ga4_property_id || site.gsc_site_url);

  return (
    <div className="space-y-5">
      {/* Connect Google banner — only if not connected */}
      {!googleAuth?.connected && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-5 border border-blue-200 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-800 mb-1">Conecta Google para activar el dashboard</h3>
            <p className="text-sm text-slate-500">Analytics, Search Console, Tag Manager y Ads en un solo click.</p>
          </div>
          <button onClick={handleConnectGoogle} disabled={connecting}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 shadow-sm transition-all disabled:opacity-50">
            <GoogleIcon />
            {connecting ? "Conectando..." : "Conectar Google"}
          </button>
        </div>
      )}

      {/* Connected + property selectors (compact) */}
      {googleAuth?.connected && (!site.ga4_property_id || !site.gsc_site_url) && (
        <div className="bg-white rounded-2xl p-4 border border-slate-200">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircleIcon className="w-4 h-4 text-green-500" />
            <span className="text-sm text-green-700 font-medium">{googleAuth.email}</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {!site.ga4_property_id && ga4Properties.length > 0 && (
              <select value="" onChange={(e) => handleGa4Change(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-200">
                <option value="">Seleccionar GA4...</option>
                {ga4Properties.map((p) => <option key={p.property_id} value={p.property_id}>{p.display_name}</option>)}
              </select>
            )}
            {!site.gsc_site_url && gscSites.length > 0 && (
              <select value="" onChange={(e) => handleGscChange(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-200">
                <option value="">Seleccionar Search Console...</option>
                {gscSites.map((s) => <option key={s.site_url} value={s.site_url}>{s.site_url}</option>)}
              </select>
            )}
          </div>
        </div>
      )}

      {/* === MAIN DASHBOARD === */}

      {/* Row 1: Big KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard label="SEO Score" value={auditScore != null ? auditScore : "--"} suffix={auditScore != null ? "/100" : ""} color={auditScore >= 80 ? "green" : auditScore >= 50 ? "yellow" : "red"} icon={<ShieldCheckIcon className="w-5 h-5" />} />
        <KpiCard label="Clicks (28d)" value={clicks != null ? clicks.toLocaleString() : "--"} color="blue" icon={<CursorArrowRaysIcon className="w-5 h-5" />} />
        <KpiCard label="Impresiones" value={impressions != null ? (impressions > 1000 ? `${(impressions/1000).toFixed(1)}K` : impressions) : "--"} color="purple" icon={<EyeIcon className="w-5 h-5" />} />
        <KpiCard label="CTR" value={avgCtr != null ? `${(avgCtr * 100).toFixed(1)}%` : "--"} color="blue" icon={<ArrowTrendingUpIcon className="w-5 h-5" />} />
        <KpiCard label="Posicion" value={avgPosition != null ? Number(avgPosition).toFixed(1) : "--"} color={avgPosition && avgPosition <= 10 ? "green" : "orange"} icon={<GlobeAltIcon className="w-5 h-5" />} />
      </div>

      {/* Row 2: Performance + SEO Health side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* PageSpeed Scores */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-600 flex items-center gap-2">
              <BoltIcon className="w-4 h-4" /> PageSpeed
            </h3>
            {pagespeed && <span className="text-xs text-slate-400">Mobile</span>}
          </div>
          {pagespeed?.scores ? (
            <div className="grid grid-cols-4 gap-3">
              {Object.entries(pagespeed.scores).map(([key, score]: [string, any]) => (
                <div key={key} className="text-center">
                  <div className={`w-14 h-14 mx-auto rounded-full flex items-center justify-center text-lg font-bold border-[3px] ${
                    score >= 90 ? "border-green-400 text-green-600" :
                    score >= 50 ? "border-yellow-400 text-yellow-600" :
                    "border-red-400 text-red-600"
                  }`}>
                    {score}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1.5 leading-tight">{formatScoreLabel(key)}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-300 text-center py-6">Ejecuta un analisis en el tab PageSpeed</p>
          )}
        </div>

        {/* SEO Health */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-600 flex items-center gap-2">
              <ShieldCheckIcon className="w-4 h-4" /> SEO Health
            </h3>
            {lastAudit && <span className="text-xs text-slate-400">{new Date(lastAudit.created_at).toLocaleDateString("es-ES")}</span>}
          </div>
          {auditIssues ? (
            <div className="space-y-3">
              <div className="flex items-center gap-4">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold border-[3px] ${
                  auditScore >= 80 ? "border-green-400 text-green-600" :
                  auditScore >= 50 ? "border-yellow-400 text-yellow-600" :
                  "border-red-400 text-red-600"
                }`}>
                  {auditScore}
                </div>
                <div className="flex-1 space-y-1.5">
                  <IssueBar label="Criticos" count={auditIssues.critical} color="bg-red-400" max={auditIssues.critical + auditIssues.warning + auditIssues.info} />
                  <IssueBar label="Avisos" count={auditIssues.warning} color="bg-yellow-400" max={auditIssues.critical + auditIssues.warning + auditIssues.info} />
                  <IssueBar label="Info" count={auditIssues.info} color="bg-blue-300" max={auditIssues.critical + auditIssues.warning + auditIssues.info} />
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-300 text-center py-6">Ejecuta una auditoria en el tab SEO Audit</p>
          )}
        </div>
      </div>

      {/* Row 3: Top Keywords + Daily Traffic */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Keywords */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200">
          <h3 className="text-sm font-semibold text-slate-600 mb-3 flex items-center gap-2">
            <DocumentMagnifyingGlassIcon className="w-4 h-4" /> Top Keywords
          </h3>
          {topKeywords.length > 0 ? (
            <div className="space-y-1.5">
              {topKeywords.map((kw, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 text-sm">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-xs text-slate-300 w-4 text-right">{i + 1}</span>
                    <span className="text-slate-700 truncate">{kw.query}</span>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-xs text-slate-400 font-mono">{kw.clicks} clicks</span>
                    <span className={`text-xs font-bold font-mono px-1.5 py-0.5 rounded ${
                      kw.position <= 3 ? "bg-green-50 text-green-600" :
                      kw.position <= 10 ? "bg-blue-50 text-blue-600" :
                      kw.position <= 20 ? "bg-yellow-50 text-yellow-600" :
                      "bg-slate-50 text-slate-400"
                    }`}>
                      #{kw.position.toFixed(0)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-300 text-center py-6">{site.gsc_site_url ? "Cargando keywords..." : "Conecta Search Console"}</p>
          )}
        </div>

        {/* Daily Traffic Chart */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200">
          <h3 className="text-sm font-semibold text-slate-600 mb-3 flex items-center gap-2">
            <ChartBarIcon className="w-4 h-4" /> Trafico organico (28d)
          </h3>
          {searchPerf?.daily && searchPerf.daily.length > 0 ? (
            <div className="flex items-end gap-[2px] h-28">
              {searchPerf.daily.map((day: any, i: number) => {
                const maxClicks = Math.max(...searchPerf.daily.map((d: any) => d.clicks));
                const height = maxClicks > 0 ? (day.clicks / maxClicks) * 100 : 0;
                return (
                  <div key={i} className="flex-1 group relative">
                    <div
                      className="bg-blue-200 hover:bg-blue-400 rounded-t transition-colors w-full"
                      style={{ height: `${Math.max(height, 2)}%` }}
                    />
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-slate-800 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap z-10">
                      {day.date}: {day.clicks} clicks
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-slate-300 text-center py-6">{site.gsc_site_url ? "Cargando trafico..." : "Conecta Search Console"}</p>
          )}
        </div>
      </div>

      {/* Row 4: Quick status bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200">
        <div className="flex items-center gap-6 text-sm">
          <StatusDot label="Google" active={!!googleAuth?.connected} detail={googleAuth?.email} />
          <StatusDot label="Analytics" active={!!site.ga4_property_id} />
          <StatusDot label="Search Console" active={!!site.gsc_site_url} />
          <StatusDot label="Repositorio" active={!!site.repository_url} detail={site.repository_full_name} />
          <StatusDot label="Servidor" active={!!site.server_ip} detail={site.server_host} />
          <StatusDot label="PulseMark" active={!!site.repository_url && !!site.server_ip} detail={site.repository_url && site.server_ip ? "Listo" : "Necesita repo + servidor"} />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function KpiCard({ label, value, suffix, color, icon }: { label: string; value: any; suffix?: string; color: string; icon: React.ReactNode }) {
  const c: Record<string, string> = {
    green: "bg-green-50 text-green-700 border-green-200",
    yellow: "bg-yellow-50 text-yellow-700 border-yellow-200",
    red: "bg-red-50 text-red-700 border-red-200",
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    purple: "bg-purple-50 text-purple-700 border-purple-200",
    orange: "bg-orange-50 text-orange-700 border-orange-200",
  };
  return (
    <div className={`rounded-2xl p-3.5 border ${c[color] || c.blue}`}>
      <div className="flex items-center gap-1.5 mb-1.5 opacity-50">{icon}<span className="text-[10px] font-medium uppercase tracking-wide">{label}</span></div>
      <p className="text-2xl font-bold leading-none">{value}<span className="text-sm font-normal opacity-50">{suffix}</span></p>
    </div>
  );
}

function IssueBar({ label, count, color, max }: { label: string; count: number; color: string; max: number }) {
  const pct = max > 0 ? (count / max) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-slate-400 w-12">{label}</span>
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-bold text-slate-600 w-6 text-right">{count}</span>
    </div>
  );
}

function StatusDot({ label, active, detail }: { label: string; active: boolean; detail?: string }) {
  return (
    <div className="flex items-center gap-1.5" title={detail || ""}>
      <span className={`w-2 h-2 rounded-full ${active ? "bg-green-400" : "bg-slate-200"}`} />
      <span className={`text-xs ${active ? "text-slate-600" : "text-slate-300"}`}>{label}</span>
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

function formatScoreLabel(key: string): string {
  const m: Record<string, string> = { performance: "Rendimiento", seo: "SEO", accessibility: "Accesibilidad", "best-practices": "Buenas practicas" };
  return m[key] || key;
}
