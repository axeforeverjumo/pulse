import { useState, useEffect } from "react";
import {
  getMarketingAnalyticsOverview,
  getMarketingAnalyticsPages,
  getMarketingAnalyticsSources,
} from "../../../api/client";

interface Props {
  site: any;
  workspaceId: string;
}

export default function AnalyticsTab({ site }: Props) {
  const [overview, setOverview] = useState<any>(null);
  const [pages, setPages] = useState<any[]>([]);
  const [sources, setSources] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState("28daysAgo");

  useEffect(() => {
    if (site.ga4_property_id) fetchData();
  }, [site.id, dateRange]);

  async function fetchData() {
    setLoading(true);
    try {
      const [ov, pg, src] = await Promise.all([
        getMarketingAnalyticsOverview(site.id, dateRange),
        getMarketingAnalyticsPages(site.id, dateRange),
        getMarketingAnalyticsSources(site.id, dateRange),
      ]);
      setOverview(ov);
      setPages(pg);
      setSources(src);
    } catch (e) {
      console.error("Analytics fetch error", e);
    } finally {
      setLoading(false);
    }
  }

  if (!site.ga4_property_id) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-400">
        <p className="text-lg font-medium mb-2 text-slate-500">Google Analytics no configurado</p>
        <p className="text-sm">
          Configura el GA4 Property ID en los ajustes del sitio para ver las metricas.
        </p>
      </div>
    );
  }

  if (loading && !overview) {
    return (
      <div className="space-y-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Date range selector */}
      <div className="flex gap-2">
        {[
          { value: "7daysAgo", label: "7 dias" },
          { value: "28daysAgo", label: "28 dias" },
          { value: "90daysAgo", label: "90 dias" },
        ].map((opt) => (
          <button
            key={opt.value}
            onClick={() => setDateRange(opt.value)}
            className={`px-3 py-1.5 text-sm rounded-xl border transition-colors ${
              dateRange === opt.value
                ? "bg-blue-50 border-blue-200 text-blue-600"
                : "border-slate-200 text-slate-500 hover:bg-slate-50"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Metrics summary */}
      {overview?.metrics && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard label="Sesiones" value={overview.metrics.sessions} />
          <MetricCard label="Usuarios" value={overview.metrics.totalUsers} />
          <MetricCard label="Paginas vistas" value={overview.metrics.screenPageViews} />
          <MetricCard
            label="Bounce Rate"
            value={`${(parseFloat(overview.metrics.bounceRate || "0") * 100).toFixed(1)}%`}
          />
        </div>
      )}

      {/* Daily chart */}
      {overview?.daily && overview.daily.length > 0 && (
        <div className="bg-white rounded-2xl p-5 border border-slate-200">
          <h3 className="text-sm font-semibold text-slate-500 mb-3">Trafico diario</h3>
          <div className="flex items-end gap-1 h-32">
            {overview.daily.map((day: any, i: number) => {
              const maxSessions = Math.max(...overview.daily.map((d: any) => d.sessions));
              const height = maxSessions > 0 ? (day.sessions / maxSessions) * 100 : 0;
              return (
                <div
                  key={i}
                  className="flex-1 bg-blue-200 rounded-t hover:bg-blue-400 transition-colors"
                  style={{ height: `${Math.max(height, 2)}%` }}
                  title={`${day.date}: ${day.sessions} sesiones`}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Top pages */}
      {pages.length > 0 && (
        <div className="bg-white rounded-2xl p-5 border border-slate-200">
          <h3 className="text-sm font-semibold text-slate-500 mb-3">Paginas mas visitadas</h3>
          <div className="space-y-2">
            {pages.slice(0, 10).map((page: any, i: number) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-800 truncate">{page.path}</p>
                  <p className="text-xs text-slate-400 truncate">{page.title}</p>
                </div>
                <div className="text-sm text-slate-600 font-mono ml-4">
                  {page.pageviews.toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Traffic sources */}
      {sources.length > 0 && (
        <div className="bg-white rounded-2xl p-5 border border-slate-200">
          <h3 className="text-sm font-semibold text-slate-500 mb-3">Fuentes de trafico</h3>
          <div className="space-y-2">
            {sources.slice(0, 10).map((src: any, i: number) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                <div>
                  <p className="text-sm text-slate-800">{src.channel}</p>
                  <p className="text-xs text-slate-400">{src.source}</p>
                </div>
                <div className="text-sm text-slate-600 font-mono">
                  {src.sessions.toLocaleString()} sesiones
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white rounded-2xl p-4 border border-slate-200">
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      <p className="text-xl font-bold text-slate-900">
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
    </div>
  );
}
