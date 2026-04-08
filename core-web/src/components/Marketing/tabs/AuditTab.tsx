import { useState, useEffect } from "react";
import {
  runMarketingSeoAudit,
  getMarketingSeoAudits,
  getMarketingSeoAudit,
} from "../../../api/client";
import { toast } from "sonner";

interface Props {
  site: any;
  workspaceId: string;
  onSiteUpdated: (site: any) => void;
}

export default function AuditTab({ site, onSiteUpdated }: Props) {
  const [audits, setAudits] = useState<any[]>([]);
  const [selectedAudit, setSelectedAudit] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    fetchAudits();
  }, [site.id]);

  async function fetchAudits() {
    setLoading(true);
    try {
      const data = await getMarketingSeoAudits(site.id);
      setAudits(data);
      if (data.length > 0 && !selectedAudit) {
        const full = await getMarketingSeoAudit(site.id, data[0].id);
        setSelectedAudit(full);
      }
    } catch (e) {
      console.error("Failed to load audits", e);
    } finally {
      setLoading(false);
    }
  }

  async function handleRunAudit() {
    setRunning(true);
    try {
      const audit = await runMarketingSeoAudit(site.id);
      setAudits((prev) => [audit, ...prev]);
      setSelectedAudit(audit);
      onSiteUpdated({ ...site, last_audit_score: audit.seo_score, last_audit_at: audit.created_at });
      toast.success(`Audit completado: ${audit.seo_score}/100`);
    } catch (e: any) {
      toast.error("Error ejecutando audit: " + (e.message || ""));
    } finally {
      setRunning(false);
    }
  }

  async function handleSelectAudit(auditId: string) {
    try {
      const full = await getMarketingSeoAudit(site.id, auditId);
      setSelectedAudit(full);
    } catch (e) {
      console.error("Failed to load audit", e);
    }
  }

  return (
    <div className="space-y-6">
      {/* Action bar */}
      <div className="flex items-center justify-between">
        <h3 className="text-white font-medium">Auditorias SEO</h3>
        <button
          onClick={handleRunAudit}
          disabled={running}
          className="px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 transition-colors"
        >
          {running ? "Analizando..." : "Nueva auditoria"}
        </button>
      </div>

      {/* Audit history */}
      {audits.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-2">
          {audits.map((a) => (
            <button
              key={a.id}
              onClick={() => handleSelectAudit(a.id)}
              className={`flex-shrink-0 px-3 py-2 rounded-lg border text-sm transition-colors ${
                selectedAudit?.id === a.id
                  ? "bg-blue-600/20 border-blue-500/30 text-blue-400"
                  : "border-white/10 text-white/50 hover:bg-white/5"
              }`}
            >
              <span className="font-mono font-bold">{a.seo_score ?? "—"}</span>
              <span className="text-xs ml-2 opacity-60">
                {new Date(a.created_at).toLocaleDateString("es-ES")}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Audit detail */}
      {selectedAudit && (
        <div className="space-y-4">
          {/* Score */}
          <div className="flex items-center gap-4">
            <div
              className={`w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold border-4 ${
                (selectedAudit.seo_score ?? 0) >= 80
                  ? "border-green-500 text-green-400"
                  : (selectedAudit.seo_score ?? 0) >= 50
                  ? "border-yellow-500 text-yellow-400"
                  : "border-red-500 text-red-400"
              }`}
            >
              {selectedAudit.seo_score ?? "—"}
            </div>
            <div>
              <p className="text-white font-medium">SEO Score</p>
              <p className="text-sm text-white/40">
                {selectedAudit.audited_url}
              </p>
              <p className="text-xs text-white/30">
                {selectedAudit.diagnostics?.pages_crawled || 0} paginas analizadas
              </p>
            </div>
          </div>

          {/* Issue summary */}
          {selectedAudit.diagnostics?.issue_summary && (
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-red-500/10 rounded-xl p-3 border border-red-500/20">
                <p className="text-2xl font-bold text-red-400">
                  {selectedAudit.diagnostics.issue_summary.critical}
                </p>
                <p className="text-xs text-red-400/60">Criticos</p>
              </div>
              <div className="bg-yellow-500/10 rounded-xl p-3 border border-yellow-500/20">
                <p className="text-2xl font-bold text-yellow-400">
                  {selectedAudit.diagnostics.issue_summary.warning}
                </p>
                <p className="text-xs text-yellow-400/60">Advertencias</p>
              </div>
              <div className="bg-blue-500/10 rounded-xl p-3 border border-blue-500/20">
                <p className="text-2xl font-bold text-blue-400">
                  {selectedAudit.diagnostics.issue_summary.info}
                </p>
                <p className="text-xs text-blue-400/60">Info</p>
              </div>
            </div>
          )}

          {/* Issues list */}
          {selectedAudit.issues?.length > 0 && (
            <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
              <div className="px-4 py-3 border-b border-white/10">
                <h4 className="text-sm font-medium text-white/70">
                  Issues ({selectedAudit.issues.length})
                </h4>
              </div>
              <div className="divide-y divide-white/5 max-h-96 overflow-y-auto">
                {selectedAudit.issues.map((issue: any, i: number) => (
                  <div key={i} className="px-4 py-3 flex items-start gap-3">
                    <span
                      className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${
                        issue.severity === "critical"
                          ? "bg-red-400"
                          : issue.severity === "warning"
                          ? "bg-yellow-400"
                          : "bg-blue-400"
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white">{issue.message}</p>
                      {issue.url && (
                        <p className="text-xs text-white/30 truncate mt-0.5">
                          {issue.url}
                        </p>
                      )}
                    </div>
                    <span
                      className={`text-xs px-2 py-0.5 rounded flex-shrink-0 ${
                        issue.severity === "critical"
                          ? "bg-red-500/20 text-red-400"
                          : issue.severity === "warning"
                          ? "bg-yellow-500/20 text-yellow-400"
                          : "bg-blue-500/20 text-blue-400"
                      }`}
                    >
                      {issue.type}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!loading && audits.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-white/40">
          <p className="text-lg font-medium mb-2">Sin auditorias</p>
          <p className="text-sm">
            Ejecuta una nueva auditoria para analizar el SEO de tu sitio.
          </p>
        </div>
      )}
    </div>
  );
}
