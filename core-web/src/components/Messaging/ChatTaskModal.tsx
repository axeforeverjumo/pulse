import { useState, useEffect } from "react";
import { XMarkIcon, ClipboardDocumentListIcon, CheckIcon } from "@heroicons/react/24/outline";
import { getCrmOpportunities, createOpportunityTask } from "../../api/client";

interface Props {
  contactName: string;
  workspaceId: string;
  onClose: () => void;
}

export default function ChatTaskModal({ contactName, workspaceId, onClose }: Props) {
  const [title, setTitle] = useState(`Seguimiento con ${contactName}`);
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [selectedOpp, setSelectedOpp] = useState<any>(null);
  const [opportunities, setOpportunities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    getCrmOpportunities(workspaceId)
      .then((res) => setOpportunities(res.opportunities || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [workspaceId]);

  const handleCreate = async () => {
    if (!title.trim() || !selectedOpp) return;
    setCreating(true);
    try {
      await createOpportunityTask(selectedOpp.id, {
        workspace_id: workspaceId,
        title: title.trim(),
        due_date: dueDate || undefined,
      });
      setSuccess(true);
      setTimeout(onClose, 1200);
    } catch {
      // silent
    } finally {
      setCreating(false);
    }
  };

  if (success) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 flex flex-col items-center gap-3 shadow-2xl">
          <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
            <CheckIcon className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">Tarea creada</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden border border-gray-200/50 dark:border-slate-700/50"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center">
              <ClipboardDocumentListIcon className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            </div>
            <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">Crear tarea</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors">
            <XMarkIcon className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          {/* Select opportunity */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 dark:text-slate-400 mb-1 uppercase tracking-wider">Oportunidad</label>
            {loading ? (
              <p className="text-xs text-gray-400 py-2">Cargando...</p>
            ) : opportunities.length === 0 ? (
              <p className="text-xs text-gray-400 py-2">No hay oportunidades. Crea una desde el boton CRM primero.</p>
            ) : (
              <select
                value={selectedOpp?.id || ""}
                onChange={(e) => setSelectedOpp(opportunities.find((o) => o.id === e.target.value) || null)}
                className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-slate-800/60 rounded-lg border border-gray-200 dark:border-slate-700/50 focus:outline-none focus:ring-2 focus:ring-amber-300 dark:focus:ring-amber-700 text-gray-900 dark:text-slate-100"
              >
                <option value="">Seleccionar oportunidad...</option>
                {opportunities.map((opp) => (
                  <option key={opp.id} value={opp.id}>
                    {opp.name || opp.title} ({opp.stage})
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-gray-500 dark:text-slate-400 mb-1 uppercase tracking-wider">Titulo</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-slate-800/60 rounded-lg border border-gray-200 dark:border-slate-700/50 focus:outline-none focus:ring-2 focus:ring-amber-300 dark:focus:ring-amber-700 text-gray-900 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-gray-500 dark:text-slate-400 mb-1 uppercase tracking-wider">Fecha limite</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-slate-800/60 rounded-lg border border-gray-200 dark:border-slate-700/50 focus:outline-none text-gray-900 dark:text-slate-100"
            />
          </div>

          <button
            onClick={handleCreate}
            disabled={!title.trim() || !selectedOpp || creating}
            className="w-full py-2.5 text-sm font-semibold rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {creating ? "Creando..." : "Crear tarea"}
          </button>
        </div>
      </div>
    </div>
  );
}
