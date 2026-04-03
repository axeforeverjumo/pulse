import { useState, useEffect } from "react";
import Modal from "../../Modal/Modal";
import {
  getWorkspaceTemplates,
  applyWorkspaceTemplate,
  type WorkspaceTemplate,
} from "../../../api/client";

interface WorkspaceTemplatesModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  workspaceAppId: string;
  onApplied: () => void;
}

export default function WorkspaceTemplatesModal({
  isOpen,
  onClose,
  workspaceId,
  workspaceAppId,
  onApplied,
}: WorkspaceTemplatesModalProps) {
  const [templates, setTemplates] = useState<WorkspaceTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState<string | null>(null);
  const [result, setResult] = useState<{
    template: string;
    created_boards: number;
    assigned_agents: string[];
    created_routines: number;
  } | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setResult(null);
      return;
    }
    setLoading(true);
    getWorkspaceTemplates()
      .then((res) => setTemplates(res.templates))
      .catch((err) => console.error("Failed to load templates:", err))
      .finally(() => setLoading(false));
  }, [isOpen]);

  const handleApply = async (templateId: string) => {
    if (applying) return;
    setApplying(templateId);
    setResult(null);
    try {
      const res = await applyWorkspaceTemplate(templateId, workspaceId, workspaceAppId);
      setResult(res);
      onApplied();
    } catch (err) {
      console.error("Failed to apply template:", err);
    } finally {
      setApplying(null);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Plantillas de Workspace" size="lg">
      <div className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          </div>
        ) : (
          <>
            <p className="text-sm text-slate-500">
              Aplica una plantilla para crear tableros, asignar agentes y configurar rutinas de un solo click.
            </p>

            {result && (
              <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                <p className="font-medium">Plantilla aplicada correctamente</p>
                <ul className="mt-1 list-disc pl-4 text-xs">
                  <li>{result.created_boards} tablero(s) creado(s)</li>
                  <li>{result.assigned_agents.length} agente(s) asignado(s)</li>
                  <li>{result.created_routines} rutina(s) creada(s)</li>
                </ul>
              </div>
            )}

            <div className="grid gap-3">
              {templates.map((t) => (
                <div
                  key={t.id}
                  className="group relative rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="flex items-start gap-3">
                    <span className="text-2xl leading-none">{t.icon}</span>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-slate-900">
                        {t.name}
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {t.description}
                      </p>

                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {t.agents.map((a) => (
                          <span
                            key={a}
                            className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700"
                          >
                            {a}
                          </span>
                        ))}
                      </div>

                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {t.boards.map((b) => (
                          <span
                            key={b.name}
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              b.is_development
                                ? "bg-violet-50 text-violet-700"
                                : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {b.name}
                          </span>
                        ))}
                      </div>

                      {t.routines.length > 0 && (
                        <div className="mt-1.5">
                          {t.routines.map((r) => (
                            <span
                              key={r.title}
                              className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700"
                            >
                              {r.title}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      disabled={applying !== null}
                      onClick={() => handleApply(t.id)}
                      className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-50"
                    >
                      {applying === t.id ? (
                        <span className="flex items-center gap-1.5">
                          <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          Aplicando...
                        </span>
                      ) : (
                        "Aplicar"
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
