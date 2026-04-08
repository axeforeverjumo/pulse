import { useState, useEffect } from "react";
import {
  getMarketingSearchPerformance,
  getMarketingSearchKeywords,
  getMarketingSearchPages,
  getMarketingSearchIndexing,
} from "../../../api/client";

interface Props {
  site: any;
  workspaceId: string;
}

type SubTab = "keywords" | "pages" | "indexing";

export default function SearchConsoleTab({ site }: Props) {
  const [subTab, setSubTab] = useState<SubTab>("keywords");
  const [performance, setPerformance] = useState<any>(null);
  const [keywords, setKeywords] = useState<any[]>([]);
  const [pages, setPages] = useState<any[]>([]);
  const [indexing, setIndexing] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (site.gsc_site_url) fetchData();
  }, [site.id]);

  async function fetchData() {
    setLoading(true);
    try {
      const [perf, kw, pg, idx] = await Promise.all([
        getMarketingSearchPerformance(site.id),
        getMarketingSearchKeywords(site.id),
        getMarketingSearchPages(site.id),
        getMarketingSearchIndexing(site.id),
      ]);
      setPerformance(perf);
      setKeywords(kw);
      setPages(pg);
      setIndexing(idx);
    } catch (e) {
      console.error("Search Console fetch error", e);
    } finally {
      setLoading(false);
    }
  }

  if (!site.gsc_site_url) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-white/40">
        <p className="text-lg font-medium mb-2">Search Console no configurado</p>
        <p className="text-sm">
          Configura la URL de Search Console en los ajustes del sitio.
        </p>
      </div>
    );
  }

  if (loading && !performance) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-white/5 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Performance totals */}
      {performance?.totals && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard label="Clicks" value={performance.totals.clicks} />
          <MetricCard label="Impresiones" value={performance.totals.impressions} />
          <MetricCard
            label="CTR medio"
            value={`${(performance.totals.avg_ctr * 100).toFixed(2)}%`}
          />
          <MetricCard
            label="Posicion media"
            value={performance.totals.avg_position.toFixed(1)}
          />
        </div>
      )}

      {/* Sub-tabs */}
      <div className="flex gap-2 border-b border-white/10 pb-2">
        {(
          [
            { id: "keywords", label: "Keywords" },
            { id: "pages", label: "Paginas" },
            { id: "indexing", label: "Indexacion" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
              subTab === t.id
                ? "bg-blue-600/20 text-blue-400"
                : "text-white/50 hover:bg-white/5"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Keywords table */}
      {subTab === "keywords" && (
        <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left px-4 py-3 text-white/50 font-medium">
                  Keyword
                </th>
                <th className="text-right px-4 py-3 text-white/50 font-medium">
                  Clicks
                </th>
                <th className="text-right px-4 py-3 text-white/50 font-medium">
                  Impresiones
                </th>
                <th className="text-right px-4 py-3 text-white/50 font-medium">
                  CTR
                </th>
                <th className="text-right px-4 py-3 text-white/50 font-medium">
                  Posicion
                </th>
              </tr>
            </thead>
            <tbody>
              {keywords.map((kw: any, i: number) => (
                <tr
                  key={i}
                  className="border-b border-white/5 hover:bg-white/5"
                >
                  <td className="px-4 py-2.5 text-white">{kw.query}</td>
                  <td className="px-4 py-2.5 text-right text-white/70 font-mono">
                    {kw.clicks}
                  </td>
                  <td className="px-4 py-2.5 text-right text-white/70 font-mono">
                    {kw.impressions.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right text-white/70 font-mono">
                    {(kw.ctr * 100).toFixed(2)}%
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono">
                    <span
                      className={
                        kw.position <= 3
                          ? "text-green-400"
                          : kw.position <= 10
                          ? "text-blue-400"
                          : kw.position <= 20
                          ? "text-yellow-400"
                          : "text-white/50"
                      }
                    >
                      {kw.position.toFixed(1)}
                    </span>
                  </td>
                </tr>
              ))}
              {keywords.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-white/30">
                    No hay datos de keywords disponibles
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pages table */}
      {subTab === "pages" && (
        <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left px-4 py-3 text-white/50 font-medium">URL</th>
                <th className="text-right px-4 py-3 text-white/50 font-medium">Clicks</th>
                <th className="text-right px-4 py-3 text-white/50 font-medium">Impresiones</th>
                <th className="text-right px-4 py-3 text-white/50 font-medium">Posicion</th>
              </tr>
            </thead>
            <tbody>
              {pages.map((pg: any, i: number) => (
                <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                  <td className="px-4 py-2.5 text-white truncate max-w-md">
                    {pg.url}
                  </td>
                  <td className="px-4 py-2.5 text-right text-white/70 font-mono">
                    {pg.clicks}
                  </td>
                  <td className="px-4 py-2.5 text-right text-white/70 font-mono">
                    {pg.impressions.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right text-white/70 font-mono">
                    {pg.position.toFixed(1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Indexing status */}
      {subTab === "indexing" && indexing && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <MetricCard label="Enviadas" value={indexing.total_submitted} />
            <MetricCard label="Indexadas" value={indexing.total_indexed} />
            <MetricCard
              label="Cobertura"
              value={`${(indexing.coverage_ratio * 100).toFixed(1)}%`}
            />
          </div>

          {indexing.sitemaps?.length > 0 && (
            <div className="bg-white/5 rounded-xl p-5 border border-white/10">
              <h3 className="text-sm font-semibold text-white/70 mb-3">Sitemaps</h3>
              <div className="space-y-3">
                {indexing.sitemaps.map((sm: any, i: number) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                    <div>
                      <p className="text-sm text-white">{sm.path}</p>
                      <p className="text-xs text-white/40">
                        {sm.submitted_count} enviadas / {sm.indexed_count} indexadas
                      </p>
                    </div>
                    {sm.errors > 0 && (
                      <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded">
                        {sm.errors} errores
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white/5 rounded-xl p-4 border border-white/10">
      <p className="text-xs text-white/40 mb-1">{label}</p>
      <p className="text-xl font-bold text-white">
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
    </div>
  );
}
