import { useState, useEffect } from "react";
import { XMarkIcon, BriefcaseIcon, CheckIcon } from "@heroicons/react/24/outline";
import { getCrmOpportunities, createCrmOpportunity, linkChatToOpportunity } from "../../api/client";

interface ExternalChat {
  id: string;
  contact_name: string;
  contact_phone?: string;
  remote_jid: string;
  is_group: boolean;
}

interface Props {
  chat: ExternalChat;
  workspaceId: string;
  onClose: () => void;
  onLinked?: (opportunityId: string) => void;
}

export default function ChatOpportunityModal({ chat, workspaceId, onClose, onLinked }: Props) {
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [name, setName] = useState(chat.contact_name || "");
  const [creating, setCreating] = useState(false);
  const [linking, setLinking] = useState(false);
  const [success, setSuccess] = useState(false);
  const [opportunities, setOpportunities] = useState<any[]>([]);
  const [loadingOpps, setLoadingOpps] = useState(false);

  useEffect(() => {
    if (mode === "existing") {
      setLoadingOpps(true);
      getCrmOpportunities(workspaceId)
        .then((res) => setOpportunities(res.opportunities || []))
        .catch(() => {})
        .finally(() => setLoadingOpps(false));
    }
  }, [mode, workspaceId]);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const opp = await createCrmOpportunity({
        workspace_id: workspaceId,
        name: name.trim(),
        stage: "lead",
        description: `Creado desde WhatsApp: ${chat.contact_name}${chat.contact_phone ? ` (${chat.contact_phone})` : ""}`,
      });
      const oppId = opp?.opportunity?.id;
      if (oppId) {
        await linkChatToOpportunity(oppId, {
          workspace_id: workspaceId,
          chat_id: chat.id,
          contact_name: chat.contact_name,
          contact_phone: chat.contact_phone,
          remote_jid: chat.remote_jid,
          is_group: chat.is_group,
        });
        onLinked?.(oppId);
      }
      setSuccess(true);
      setTimeout(onClose, 1200);
    } catch {
      // error handled silently
    } finally {
      setCreating(false);
    }
  };

  const handleLink = async (opp: any) => {
    setLinking(true);
    try {
      await linkChatToOpportunity(opp.id, {
        workspace_id: workspaceId,
        chat_id: chat.id,
        contact_name: chat.contact_name,
        contact_phone: chat.contact_phone,
        remote_jid: chat.remote_jid,
        is_group: chat.is_group,
      });
      onLinked?.(opp.id);
      setSuccess(true);
      setTimeout(onClose, 1200);
    } catch {
      // error handled silently
    } finally {
      setLinking(false);
    }
  };

  const phone = chat.contact_phone || chat.remote_jid?.split("@")[0] || "";

  if (success) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 flex flex-col items-center gap-3 shadow-2xl">
          <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
            <CheckIcon className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">Oportunidad vinculada</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden border border-gray-200/50 dark:border-slate-700/50"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
              <BriefcaseIcon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">Vincular a CRM</p>
              <p className="text-[11px] text-gray-400 dark:text-slate-500 truncate max-w-[250px]">
                {chat.contact_name} {phone ? `(${phone})` : ""}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors">
            <XMarkIcon className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {/* Mode tabs */}
        <div className="flex border-b border-gray-100 dark:border-slate-800">
          <button
            onClick={() => setMode("new")}
            className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${
              mode === "new"
                ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
                : "text-gray-400 hover:text-gray-600 dark:hover:text-slate-300"
            }`}
          >
            Nueva oportunidad
          </button>
          <button
            onClick={() => setMode("existing")}
            className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${
              mode === "existing"
                ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
                : "text-gray-400 hover:text-gray-600 dark:hover:text-slate-300"
            }`}
          >
            Agregar a existente
          </button>
        </div>

        {/* Content */}
        <div className="p-5">
          {mode === "new" ? (
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 dark:text-slate-400 mb-1 uppercase tracking-wider">
                  Nombre de la oportunidad
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej: Proyecto web para..."
                  className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-slate-800/60 rounded-lg border border-gray-200 dark:border-slate-700/50 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-700 text-gray-900 dark:text-slate-100"
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 uppercase">
                  Lead
                </span>
                <span className="text-[11px] text-gray-400">Etapa inicial</span>
              </div>
              <button
                onClick={handleCreate}
                disabled={!name.trim() || creating}
                className="w-full py-2.5 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {creating ? "Creando..." : "Crear y vincular chat"}
              </button>
            </div>
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {loadingOpps ? (
                <p className="text-xs text-gray-400 text-center py-4">Cargando oportunidades...</p>
              ) : opportunities.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">No hay oportunidades. Crea una nueva.</p>
              ) : (
                opportunities.map((opp) => {
                  const oppPhone = opp.contact_phone || "";
                  const matches = phone && oppPhone && oppPhone.includes(phone.slice(-6));
                  return (
                    <button
                      key={opp.id}
                      onClick={() => handleLink(opp)}
                      disabled={linking}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-gray-100 dark:border-slate-800 hover:border-blue-200 dark:hover:border-blue-800 hover:bg-blue-50/30 dark:hover:bg-blue-950/20 transition-all text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-800 dark:text-slate-200 truncate">{opp.name || opp.title}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-gray-400 capitalize">{opp.stage}</span>
                          {opp.amount && <span className="text-[10px] text-gray-400">{opp.amount.toLocaleString()} {opp.currency || "EUR"}</span>}
                        </div>
                      </div>
                      {matches && (
                        <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 uppercase">
                          Coincide
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
