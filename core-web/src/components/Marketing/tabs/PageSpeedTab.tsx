import { useState } from "react";
import { getMarketingPageSpeed } from "../../../api/client";
import { toast } from "sonner";

interface Props {
  site: any;
  workspaceId: string;
}

export default function PageSpeedTab({ site }: Props) {
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [strategy, setStrategy] = useState<"mobile" | "desktop">("mobile");

  async function runTest() {
    setLoading(true);
    try {
      const data = await getMarketingPageSpeed(site.id, strategy);
      setResult(data);
    } catch (e: any) {
      toast.error("Error: " + (e.message || "PageSpeed no disponible"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex items-center gap-4">
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
          {(["mobile", "desktop"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStrategy(s)}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors capitalize ${
                strategy === s
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <button
          onClick={runTest}
          disabled={loading}
          className="px-4 py-2 text-sm rounded-xl bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 transition-colors"
        >
          {loading ? "Analizando..." : "Analizar"}
        </button>
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-6">
          {/* Scores */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Object.entries(result.scores || {}).map(([key, score]: [string, any]) => (
              <ScoreCircle key={key} label={formatLabel(key)} score={score} />
            ))}
          </div>

          {/* Core Web Vitals */}
          {Object.keys(result.core_web_vitals || {}).length > 0 && (
            <div className="bg-white rounded-2xl p-5 border border-slate-200">
              <h3 className="text-sm font-semibold text-slate-500 mb-4">Core Web Vitals</h3>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.entries(result.core_web_vitals).map(([key, data]: [string, any]) => (
                  <div key={key} className="bg-slate-50 rounded-xl p-3">
                    <p className="text-xs text-slate-400 mb-1">{formatCwvName(key)}</p>
                    <p className="text-lg font-bold text-slate-800">
                      {data.percentile}{key.includes("CLS") ? "" : "ms"}
                    </p>
                    <span className={`text-xs px-2 py-0.5 rounded-lg ${
                      data.category === "FAST" ? "bg-green-50 text-green-600" :
                      data.category === "AVERAGE" ? "bg-yellow-50 text-yellow-600" :
                      "bg-red-50 text-red-600"
                    }`}>
                      {data.category}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Key Audits */}
          {Object.keys(result.key_audits || {}).length > 0 && (
            <div className="bg-white rounded-2xl p-5 border border-slate-200">
              <h3 className="text-sm font-semibold text-slate-500 mb-3">Auditorias clave</h3>
              <div className="space-y-2">
                {Object.entries(result.key_audits).map(([id, audit]: [string, any]) => (
                  <div key={id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${
                        audit.score === 1 ? "bg-green-400" :
                        audit.score >= 0.5 ? "bg-yellow-400" :
                        "bg-red-400"
                      }`} />
                      <p className="text-sm text-slate-800">{audit.title}</p>
                    </div>
                    {audit.display_value && (
                      <span className="text-sm text-slate-400 font-mono">{audit.display_value}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Opportunities */}
          {result.opportunities?.length > 0 && (
            <div className="bg-white rounded-2xl p-5 border border-slate-200">
              <h3 className="text-sm font-semibold text-slate-500 mb-3">Oportunidades de mejora</h3>
              <div className="space-y-2">
                {result.opportunities.map((opp: any, i: number) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                    <p className="text-sm text-slate-800">{opp.title}</p>
                    <div className="flex items-center gap-2">
                      {opp.display_value && (
                        <span className="text-xs text-slate-400">{opp.display_value}</span>
                      )}
                      <span className="text-xs bg-orange-50 text-orange-600 px-2 py-0.5 rounded-lg">
                        -{Math.round(opp.savings_ms)}ms
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!result && !loading && (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
          <p className="text-lg font-medium mb-2 text-slate-500">PageSpeed Insights</p>
          <p className="text-sm">
            Analiza el rendimiento de {site.domain} con Lighthouse.
          </p>
        </div>
      )}
    </div>
  );
}

function ScoreCircle({ label, score }: { label: string; score: number }) {
  const color =
    score >= 90 ? "text-green-600 border-green-400" :
    score >= 50 ? "text-yellow-600 border-yellow-400" :
    "text-red-600 border-red-400";

  return (
    <div className="flex flex-col items-center gap-2 p-4 bg-white rounded-2xl border border-slate-200">
      <div className={`w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold border-4 ${color}`}>
        {score}
      </div>
      <p className="text-xs text-slate-500 text-center">{label}</p>
    </div>
  );
}

function formatLabel(key: string): string {
  const labels: Record<string, string> = {
    performance: "Rendimiento",
    seo: "SEO",
    accessibility: "Accesibilidad",
    "best-practices": "Buenas practicas",
  };
  return labels[key] || key;
}

function formatCwvName(key: string): string {
  const names: Record<string, string> = {
    LARGEST_CONTENTFUL_PAINT_MS: "LCP",
    FIRST_CONTENTFUL_PAINT_MS: "FCP",
    FIRST_INPUT_DELAY_MS: "FID",
    CUMULATIVE_LAYOUT_SHIFT_SCORE: "CLS",
    INTERACTION_TO_NEXT_PAINT: "INP",
    EXPERIMENTAL_TIME_TO_FIRST_BYTE: "TTFB",
  };
  return names[key] || key;
}
