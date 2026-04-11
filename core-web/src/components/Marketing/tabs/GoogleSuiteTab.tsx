/**
 * GoogleSuiteTab — Unified Google integrations panel for marketing projects.
 * Combines: Google OAuth connection, GA4 Analytics, Search Console, PageSpeed, SEO Audit
 * All reusing existing backend APIs that work through the project's linked site.
 */
import { useState, useEffect, useRef } from "react";
import {
  CheckCircleIcon,
  XCircleIcon,
  ArrowPathIcon,
  ChartBarIcon,
  MagnifyingGlassCircleIcon,
  BoltIcon,
  ShieldCheckIcon,
  GlobeAltIcon,
  ArrowTopRightOnSquareIcon,
} from "@heroicons/react/24/outline";
import {
  getMarketingAuthUrl,
  getMarketingAuthStatus,
  getMarketingGa4Properties,
  getMarketingGscSites,
  getMarketingAnalyticsOverview,
  getMarketingAnalyticsPages,
  getMarketingSearchPerformance,
  getMarketingSearchKeywords,
  getMarketingPageSpeed,
  runMarketingSeoAudit,
  getMarketingSeoAudits,
  updateMarketingSite,
  getMarketingSite,
} from "../../../api/client";
import { toast } from "sonner";

interface Props {
  project: any;
  workspaceId: string;
  onProjectUpdated?: (project: any) => void;
}

type Section = "overview" | "analytics" | "search" | "pagespeed" | "audit";

export default function GoogleSuiteTab({ project, workspaceId, onProjectUpdated }: Props) {
  const [activeSection, setActiveSection] = useState<Section>("overview");
  const [googleAuth, setGoogleAuth] = useState<{ connected: boolean; email?: string } | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [site, setSite] = useState<any>(null);

  // GA4 auto-discovery
  const [ga4Properties, setGa4Properties] = useState<any[]>([]);
  const [gscSites, setGscSites] = useState<any[]>([]);

  // Data states
  const [analyticsData, setAnalyticsData] = useState<any>(null);
  const [analyticsPages, setAnalyticsPages] = useState<any[]>([]);
  const [searchPerf, setSearchPerf] = useState<any>(null);
  const [searchKeywords, setSearchKeywords] = useState<any[]>([]);
  const [pagespeedData, setPagespeedData] = useState<any>(null);
  const [pagespeedStrategy, setPagespeedStrategy] = useState<"mobile" | "desktop">("mobile");
  const [auditHistory, setAuditHistory] = useState<any[]>([]);
  const [runningAudit, setRunningAudit] = useState(false);

  const [loading, setLoading] = useState(true);

  const siteId = project.site_id;

  useEffect(() => {
    if (workspaceId) checkGoogleAuth();
    if (siteId) loadSite();
  }, [workspaceId, siteId]);

  useEffect(() => {
    if (googleAuth?.connected) loadDiscovery();
  }, [googleAuth?.connected]);

  useEffect(() => {
    if (site && googleAuth?.connected) loadSectionData();
  }, [activeSection, site?.ga4_property_id, site?.gsc_site_url]);

  // Listen for OAuth popup callback
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "google_marketing_connected") {
        setGoogleAuth({ connected: true, email: event.data.email });
        toast.success(`Google conectado: ${event.data.email}`);
        loadDiscovery();
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  async function checkGoogleAuth() {
    try {
      const auth = await getMarketingAuthStatus(workspaceId);
      setGoogleAuth(auth);
    } catch {
      setGoogleAuth({ connected: false });
    } finally {
      setLoading(false);
    }
  }

  async function loadSite() {
    try {
      const s = await getMarketingSite(siteId);
      setSite(s);
    } catch {}
  }

  async function loadDiscovery() {
    try {
      const [ga4, gsc] = await Promise.all([
        getMarketingGa4Properties(workspaceId).catch(() => []),
        getMarketingGscSites(workspaceId).catch(() => []),
      ]);
      setGa4Properties(ga4);
      setGscSites(gsc);

      // Auto-link if site exists and properties not set
      if (site && !site.ga4_property_id && ga4.length > 0) {
        const match = ga4.find((p: any) =>
          site.domain && p.display_name?.toLowerCase().includes(site.domain.split(".")[0])
        );
        if (match) {
          await updateMarketingSite(siteId, { ga4_property_id: match.property_id });
          setSite((prev: any) => ({ ...prev, ga4_property_id: match.property_id }));
        }
      }
      if (site && !site.gsc_site_url && gsc.length > 0) {
        const match = gsc.find((s: any) => site.url && s.site_url?.includes(site.domain));
        if (match) {
          await updateMarketingSite(siteId, { gsc_site_url: match.site_url });
          setSite((prev: any) => ({ ...prev, gsc_site_url: match.site_url }));
        }
      }
    } catch {}
  }

  async function loadSectionData() {
    if (!siteId) return;
    try {
      if (activeSection === "analytics" && site?.ga4_property_id) {
        const [overview, pages] = await Promise.all([
          getMarketingAnalyticsOverview(siteId).catch(() => null),
          getMarketingAnalyticsPages(siteId).catch(() => []),
        ]);
        setAnalyticsData(overview);
        setAnalyticsPages(pages);
      } else if (activeSection === "search" && site?.gsc_site_url) {
        const [perf, kw] = await Promise.all([
          getMarketingSearchPerformance(siteId).catch(() => null),
          getMarketingSearchKeywords(siteId).catch(() => []),
        ]);
        setSearchPerf(perf);
        setSearchKeywords(kw);
      } else if (activeSection === "pagespeed") {
        const ps = await getMarketingPageSpeed(siteId, pagespeedStrategy).catch(() => null);
        setPagespeedData(ps);
      } else if (activeSection === "audit") {
        const audits = await getMarketingSeoAudits(siteId).catch(() => []);
        setAuditHistory(audits);
      }
    } catch {}
  }

  async function handleConnect() {
    setConnecting(true);
    try {
      const { url } = await getMarketingAuthUrl(workspaceId);
      window.open(url, "google_auth", "width=600,height=700");
    } catch (e: any) {
      toast.error("Error: " + (e.message || ""));
    } finally {
      setConnecting(false);
    }
  }

  async function handleRunAudit() {
    if (!siteId) return;
    setRunningAudit(true);
    try {
      await runMarketingSeoAudit(siteId);
      toast.success("Auditoria SEO completada");
      const audits = await getMarketingSeoAudits(siteId);
      setAuditHistory(audits);
    } catch (e: any) {
      toast.error("Error: " + (e.message || ""));
    } finally {
      setRunningAudit(false);
    }
  }

  async function handleSaveProperty(field: string, value: string) {
    if (!siteId) return;
    try {
      await updateMarketingSite(siteId, { [field]: value });
      setSite((prev: any) => ({ ...prev, [field]: value }));
      toast.success("Guardado");
    } catch (e: any) {
      toast.error("Error: " + (e.message || ""));
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-full text-slate-400 text-sm">Cargando Google Suite...</div>;
  }

  if (!siteId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-400 p-6">
        <GlobeAltIcon className="w-12 h-12 text-slate-300 mb-3" />
        <p className="text-sm font-medium text-slate-500 mb-1">Sin sitio web vinculado</p>
        <p className="text-xs text-center max-w-sm">
          Vincula un sitio web en la configuracion del proyecto para conectar Google Analytics, Search Console, PageSpeed y SEO Audit.
        </p>
      </div>
    );
  }

  const SECTIONS: { id: Section; label: string; icon: typeof ChartBarIcon; configured?: boolean }[] = [
    { id: "overview", label: "Conexion", icon: GlobeAltIcon },
    { id: "analytics", label: "Analytics", icon: ChartBarIcon, configured: !!site?.ga4_property_id },
    { id: "search", label: "Search Console", icon: MagnifyingGlassCircleIcon, configured: !!site?.gsc_site_url },
    { id: "pagespeed", label: "PageSpeed", icon: BoltIcon, configured: true },
    { id: "audit", label: "SEO Audit", icon: ShieldCheckIcon, configured: true },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Section tabs */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-[#e4edf8] overflow-x-auto flex-shrink-0">
        {SECTIONS.map((sec) => {
          const Icon = sec.icon;
          const isActive = activeSection === sec.id;
          return (
            <button
              key={sec.id}
              onClick={() => setActiveSection(sec.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all whitespace-nowrap ${
                isActive
                  ? "bg-blue-50 text-blue-600 border border-blue-200"
                  : "text-slate-400 hover:text-slate-600 hover:bg-slate-50 border border-transparent"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {sec.label}
              {sec.configured === false && (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              )}
              {sec.configured === true && sec.id !== "overview" && (
                <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
              )}
            </button>
          );
        })}
      </div>

      {/* Section content */}
      <div className="flex-1 overflow-y-auto p-5">
        {activeSection === "overview" && (
          <OverviewSection
            googleAuth={googleAuth}
            connecting={connecting}
            site={site}
            ga4Properties={ga4Properties}
            gscSites={gscSites}
            onConnect={handleConnect}
            onSaveProperty={handleSaveProperty}
          />
        )}
        {activeSection === "analytics" && (
          <AnalyticsSection data={analyticsData} pages={analyticsPages} configured={!!site?.ga4_property_id} />
        )}
        {activeSection === "search" && (
          <SearchSection perf={searchPerf} keywords={searchKeywords} configured={!!site?.gsc_site_url} />
        )}
        {activeSection === "pagespeed" && (
          <PageSpeedSection
            data={pagespeedData}
            strategy={pagespeedStrategy}
            onStrategyChange={(s) => { setPagespeedStrategy(s); setPagespeedData(null); }}
            onRefresh={() => { setPagespeedData(null); loadSectionData(); }}
          />
        )}
        {activeSection === "audit" && (
          <AuditSection history={auditHistory} running={runningAudit} onRun={handleRunAudit} />
        )}
      </div>
    </div>
  );
}


// ============================================================================
// OVERVIEW — Google connection + property selectors
// ============================================================================

function OverviewSection({
  googleAuth, connecting, site, ga4Properties, gscSites, onConnect, onSaveProperty,
}: {
  googleAuth: any;
  connecting: boolean;
  site: any;
  ga4Properties: any[];
  gscSites: any[];
  onConnect: () => void;
  onSaveProperty: (field: string, value: string) => void;
}) {
  return (
    <div className="max-w-xl space-y-6">
      {/* Connection status */}
      <div className={`flex items-center gap-3 p-4 rounded-xl border ${
        googleAuth?.connected ? "bg-green-50/50 border-green-200" : "bg-amber-50/50 border-amber-200"
      }`}>
        {googleAuth?.connected ? (
          <CheckCircleIcon className="w-6 h-6 text-green-500 flex-shrink-0" />
        ) : (
          <XCircleIcon className="w-6 h-6 text-amber-500 flex-shrink-0" />
        )}
        <div className="flex-1">
          <p className="text-sm font-medium text-slate-700">
            {googleAuth?.connected ? `Conectado como ${googleAuth.email}` : "Google no conectado"}
          </p>
          <p className="text-xs text-slate-400">
            {googleAuth?.connected
              ? "Analytics, Search Console, Tag Manager y Ads disponibles"
              : "Conecta para acceder a Analytics, Search Console, PageSpeed y mas"}
          </p>
        </div>
        <button
          onClick={onConnect}
          disabled={connecting}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            googleAuth?.connected
              ? "border border-slate-200 text-slate-500 hover:bg-slate-50"
              : "bg-blue-600 text-white hover:bg-blue-700"
          }`}
        >
          {connecting ? "Conectando..." : googleAuth?.connected ? "Reconectar" : "Conectar Google"}
        </button>
      </div>

      {/* Site info */}
      {site && (
        <div className="p-4 rounded-xl border border-slate-200 bg-white">
          <h4 className="text-[9px] font-bold tracking-[0.12em] uppercase text-slate-400 mb-3">Sitio vinculado</h4>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
              <GlobeAltIcon className="w-4 h-4 text-slate-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-700">{site.name}</p>
              <a href={site.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline flex items-center gap-1">
                {site.domain} <ArrowTopRightOnSquareIcon className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* GA4 Property selector */}
      {googleAuth?.connected && (
        <div className="p-4 rounded-xl border border-slate-200 bg-white">
          <h4 className="text-[9px] font-bold tracking-[0.12em] uppercase text-slate-400 mb-3">Google Analytics 4</h4>
          {ga4Properties.length > 0 ? (
            <select
              value={site?.ga4_property_id || ""}
              onChange={(e) => onSaveProperty("ga4_property_id", e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              <option value="">— Seleccionar propiedad —</option>
              {ga4Properties.map((p: any) => (
                <option key={p.property_id} value={p.property_id}>
                  {p.display_name} ({p.property_id})
                </option>
              ))}
            </select>
          ) : (
            <p className="text-xs text-slate-400">No se encontraron propiedades GA4</p>
          )}
          {site?.ga4_property_id && (
            <p className="text-[10px] text-green-500 mt-1.5 flex items-center gap-1">
              <CheckCircleIcon className="w-3.5 h-3.5" /> Configurado: {site.ga4_property_id}
            </p>
          )}
        </div>
      )}

      {/* GSC Site selector */}
      {googleAuth?.connected && (
        <div className="p-4 rounded-xl border border-slate-200 bg-white">
          <h4 className="text-[9px] font-bold tracking-[0.12em] uppercase text-slate-400 mb-3">Search Console</h4>
          {gscSites.length > 0 ? (
            <select
              value={site?.gsc_site_url || ""}
              onChange={(e) => onSaveProperty("gsc_site_url", e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              <option value="">— Seleccionar sitio —</option>
              {gscSites.map((s: any) => (
                <option key={s.site_url} value={s.site_url}>
                  {s.site_url} ({s.permission_level})
                </option>
              ))}
            </select>
          ) : (
            <p className="text-xs text-slate-400">No se encontraron sitios en Search Console</p>
          )}
          {site?.gsc_site_url && (
            <p className="text-[10px] text-green-500 mt-1.5 flex items-center gap-1">
              <CheckCircleIcon className="w-3.5 h-3.5" /> Configurado: {site.gsc_site_url}
            </p>
          )}
        </div>
      )}
    </div>
  );
}


// ============================================================================
// ANALYTICS — GA4 overview
// ============================================================================

function AnalyticsSection({ data, pages, configured }: { data: any; pages: any[]; configured: boolean }) {
  if (!configured) {
    return <NotConfigured label="Google Analytics 4" hint="Selecciona una propiedad GA4 en la seccion Conexion" />;
  }
  if (!data) {
    return <div className="text-sm text-slate-400 py-8 text-center">Cargando datos de Analytics...</div>;
  }

  const metrics = data.metrics || {};

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3">
        <MetricCard label="Usuarios" value={formatNum(metrics.totalUsers)} />
        <MetricCard label="Sesiones" value={formatNum(metrics.sessions)} />
        <MetricCard label="Vistas" value={formatNum(metrics.screenPageViews)} />
        <MetricCard label="Duracion media" value={metrics.avgSessionDuration ? `${Math.round(metrics.avgSessionDuration)}s` : "—"} />
      </div>

      {/* Top pages */}
      {pages.length > 0 && (
        <div>
          <h4 className="text-[9px] font-bold tracking-[0.12em] uppercase text-slate-400 mb-2">Paginas mas visitadas</h4>
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50">
                  <th className="text-left px-3 py-2 text-[8.5px] font-bold tracking-wider uppercase text-slate-400">Pagina</th>
                  <th className="text-right px-3 py-2 text-[8.5px] font-bold tracking-wider uppercase text-slate-400">Vistas</th>
                  <th className="text-right px-3 py-2 text-[8.5px] font-bold tracking-wider uppercase text-slate-400">Usuarios</th>
                </tr>
              </thead>
              <tbody>
                {pages.slice(0, 10).map((p: any, i: number) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="px-3 py-2 text-slate-600 truncate max-w-[300px]">{p.page || p.pagePath}</td>
                    <td className="px-3 py-2 text-right text-slate-500">{formatNum(p.screenPageViews || p.views)}</td>
                    <td className="px-3 py-2 text-right text-slate-500">{formatNum(p.totalUsers || p.users)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}


// ============================================================================
// SEARCH CONSOLE
// ============================================================================

function SearchSection({ perf, keywords, configured }: { perf: any; keywords: any[]; configured: boolean }) {
  if (!configured) {
    return <NotConfigured label="Search Console" hint="Selecciona un sitio GSC en la seccion Conexion" />;
  }

  const totals = perf?.totals || {};

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-3">
        <MetricCard label="Clicks" value={formatNum(totals.clicks)} color="text-blue-600" />
        <MetricCard label="Impresiones" value={formatNum(totals.impressions)} />
        <MetricCard label="CTR medio" value={totals.avg_ctr ? `${(totals.avg_ctr * 100).toFixed(1)}%` : "—"} color="text-green-600" />
        <MetricCard label="Posicion media" value={totals.avg_position ? totals.avg_position.toFixed(1) : "—"} color="text-amber-600" />
      </div>

      {keywords.length > 0 && (
        <div>
          <h4 className="text-[9px] font-bold tracking-[0.12em] uppercase text-slate-400 mb-2">Top keywords</h4>
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50">
                  <th className="text-left px-3 py-2 text-[8.5px] font-bold tracking-wider uppercase text-slate-400">Keyword</th>
                  <th className="text-right px-3 py-2 text-[8.5px] font-bold tracking-wider uppercase text-slate-400">Clicks</th>
                  <th className="text-right px-3 py-2 text-[8.5px] font-bold tracking-wider uppercase text-slate-400">Impresiones</th>
                  <th className="text-right px-3 py-2 text-[8.5px] font-bold tracking-wider uppercase text-slate-400">Posicion</th>
                </tr>
              </thead>
              <tbody>
                {keywords.slice(0, 15).map((kw: any, i: number) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="px-3 py-2 text-slate-600 font-medium">{kw.query}</td>
                    <td className="px-3 py-2 text-right text-blue-600 font-medium">{kw.clicks}</td>
                    <td className="px-3 py-2 text-right text-slate-400">{formatNum(kw.impressions)}</td>
                    <td className="px-3 py-2 text-right text-slate-500">#{kw.position?.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {keywords.length === 0 && !perf && (
        <div className="text-sm text-slate-400 py-8 text-center">Cargando datos de Search Console...</div>
      )}
    </div>
  );
}


// ============================================================================
// PAGESPEED
// ============================================================================

function PageSpeedSection({
  data, strategy, onStrategyChange, onRefresh,
}: {
  data: any;
  strategy: "mobile" | "desktop";
  onStrategyChange: (s: "mobile" | "desktop") => void;
  onRefresh: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
          {(["mobile", "desktop"] as const).map((s) => (
            <button
              key={s}
              onClick={() => onStrategyChange(s)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                strategy === s ? "bg-white shadow-sm text-slate-700" : "text-slate-400 hover:text-slate-600"
              }`}
            >
              {s === "mobile" ? "Movil" : "Escritorio"}
            </button>
          ))}
        </div>
        <button onClick={onRefresh} className="text-xs text-blue-500 hover:text-blue-600 flex items-center gap-1">
          <ArrowPathIcon className="w-3.5 h-3.5" /> Analizar
        </button>
      </div>

      {!data ? (
        <div className="text-sm text-slate-400 py-8 text-center">
          Pulsa "Analizar" para obtener datos de PageSpeed
        </div>
      ) : (
        <div className="space-y-4">
          {/* Scores */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Rendimiento", key: "performance", color: "text-green-600" },
              { label: "Accesibilidad", key: "accessibility", color: "text-blue-600" },
              { label: "Buenas practicas", key: "best-practices", color: "text-amber-600" },
              { label: "SEO", key: "seo", color: "text-purple-600" },
            ].map((cat) => {
              const score = data.categories?.[cat.key]?.score;
              const pct = score != null ? Math.round(score * 100) : null;
              return (
                <div key={cat.key} className="bg-white border border-slate-200 rounded-xl p-4 text-center">
                  <div className={`text-2xl font-bold ${pct != null && pct >= 90 ? "text-green-500" : pct != null && pct >= 50 ? "text-amber-500" : "text-red-500"}`}>
                    {pct != null ? pct : "—"}
                  </div>
                  <div className="text-[9px] text-slate-400 mt-1 uppercase tracking-wider font-bold">{cat.label}</div>
                </div>
              );
            })}
          </div>

          {/* Core Web Vitals */}
          {data.audits && (
            <div>
              <h4 className="text-[9px] font-bold tracking-[0.12em] uppercase text-slate-400 mb-2">Core Web Vitals</h4>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { key: "largest-contentful-paint", label: "LCP" },
                  { key: "first-input-delay", label: "FID" },
                  { key: "cumulative-layout-shift", label: "CLS" },
                  { key: "first-contentful-paint", label: "FCP" },
                  { key: "speed-index", label: "Speed Index" },
                  { key: "total-blocking-time", label: "TBT" },
                ].map((vital) => {
                  const audit = data.audits[vital.key];
                  if (!audit) return null;
                  return (
                    <div key={vital.key} className="bg-white border border-slate-200 rounded-lg p-3">
                      <p className="text-[9px] text-slate-400 uppercase tracking-wider font-bold">{vital.label}</p>
                      <p className="text-sm font-bold text-slate-700 mt-1">{audit.displayValue || "—"}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


// ============================================================================
// SEO AUDIT
// ============================================================================

function AuditSection({ history, running, onRun }: { history: any[]; running: boolean; onRun: () => void }) {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button
          onClick={onRun}
          disabled={running}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          <ShieldCheckIcon className="w-3.5 h-3.5" />
          {running ? "Analizando..." : "Ejecutar auditoria SEO"}
        </button>
        <span className="text-[10px] text-slate-400">{history.length} auditorias realizadas</span>
      </div>

      {history.length > 0 ? (
        <div className="space-y-3">
          {history.slice(0, 5).map((audit: any) => (
            <div key={audit.id} className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <ScoreCircle score={audit.seo_score} />
                  <div>
                    <p className="text-sm font-medium text-slate-700">SEO Score: {audit.seo_score}/100</p>
                    <p className="text-[10px] text-slate-400">
                      {new Date(audit.created_at).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
                <div className="flex gap-4 text-[10px] text-slate-400">
                  <span>Perf: {audit.performance_score ?? "—"}</span>
                  <span>A11y: {audit.accessibility_score ?? "—"}</span>
                </div>
              </div>
              {audit.issues && Array.isArray(audit.issues) && audit.issues.length > 0 && (
                <div className="space-y-1">
                  {audit.issues.slice(0, 5).map((issue: any, i: number) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <span className={`mt-0.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        issue.severity === "error" ? "bg-red-500" : issue.severity === "warning" ? "bg-amber-500" : "bg-blue-400"
                      }`} />
                      <span className="text-slate-600">{issue.message || issue.title}</span>
                    </div>
                  ))}
                  {audit.issues.length > 5 && (
                    <p className="text-[10px] text-slate-300 pl-4">+{audit.issues.length - 5} mas</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8">
          <ShieldCheckIcon className="w-10 h-10 text-slate-200 mx-auto mb-2" />
          <p className="text-sm text-slate-400">Sin auditorias previas</p>
          <p className="text-xs text-slate-300">Ejecuta una auditoria para analizar el SEO del sitio</p>
        </div>
      )}
    </div>
  );
}


// ============================================================================
// Shared components
// ============================================================================

function MetricCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3.5">
      <div className="text-[9.5px] text-slate-400 mb-1">{label}</div>
      <div className={`text-lg font-bold ${color || "text-slate-700"}`}>{value || "—"}</div>
    </div>
  );
}

function NotConfigured({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-slate-400">
      <XCircleIcon className="w-10 h-10 text-slate-200 mb-3" />
      <p className="text-sm font-medium text-slate-500">{label} no configurado</p>
      <p className="text-xs">{hint}</p>
    </div>
  );
}

function ScoreCircle({ score }: { score: number | null }) {
  const pct = score ?? 0;
  const color = pct >= 80 ? "#1ec97e" : pct >= 50 ? "#f5a623" : "#ef4444";
  return (
    <div className="relative w-10 h-10">
      <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
        <circle cx="18" cy="18" r="15.5" fill="none" stroke="#e2e8f0" strokeWidth="2.5" />
        <circle cx="18" cy="18" r="15.5" fill="none" stroke={color} strokeWidth="2.5"
          strokeDasharray={`${pct} ${100 - pct}`} strokeLinecap="round" />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold" style={{ color }}>
        {score ?? "—"}
      </span>
    </div>
  );
}

function formatNum(n: any): string {
  if (n == null) return "—";
  const num = Number(n);
  if (isNaN(num)) return String(n);
  if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
  if (num >= 1000) return (num / 1000).toFixed(1) + "K";
  return num.toLocaleString("es-ES");
}
