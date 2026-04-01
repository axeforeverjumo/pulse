import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { api, getWorkspaceAgents, type AgentInstance } from "../../api/client";
import {
  PaperAirplaneIcon,
  PhoneIcon,
  SparklesIcon,
  QrCodeIcon,
  ClockIcon,
} from "@heroicons/react/24/outline";

interface ExternalAccount {
  id: string;
  provider: "whatsapp" | "telegram";
  status: string;
  phone_number?: string;
  away_mode: boolean;
  away_message?: string;
}

interface ExternalChat {
  id: string;
  account_id: string;
  remote_jid: string;
  contact_name: string;
  contact_phone?: string;
  contact_avatar_url?: string;
  is_group: boolean;
  unread_count: number;
  last_message_at?: string;
  last_message_preview?: string;
  auto_reply_enabled?: boolean;
  auto_reply_directives?: string;
  muted?: boolean;
  account?: { provider: string };
}

interface ExternalMessage {
  id: string;
  chat_id: string;
  direction: "in" | "out";
  content: string;
  media_type?: string;
  media_url?: string;
  is_auto_reply: boolean;
  sender_name?: string;
  status: string;
  created_at: string;
}

interface ParsedDirectives {
  agentId: string;
  agentName: string;
  notes: string;
}

const AVATAR_PALETTE = [
  "bg-gradient-to-br from-sky-400 to-blue-500",
  "bg-gradient-to-br from-emerald-400 to-green-500",
  "bg-gradient-to-br from-amber-400 to-orange-500",
  "bg-gradient-to-br from-rose-400 to-pink-500",
  "bg-gradient-to-br from-indigo-400 to-violet-500",
];

function avatarClass(value?: string): string {
  const key = (value || "?").trim();
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[idx];
}

function parseAutoReplyDirectives(raw?: string): ParsedDirectives {
  if (!raw) {
    return { agentId: "", agentName: "", notes: "" };
  }

  const lines = raw.split("\n");
  let agentId = "";
  let agentName = "";
  const noteLines: string[] = [];

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("AGENT_ID:")) {
      agentId = trimmed.slice("AGENT_ID:".length).trim();
      return;
    }
    if (trimmed.startsWith("AGENT_NAME:")) {
      agentName = trimmed.slice("AGENT_NAME:".length).trim();
      return;
    }
    if (trimmed.startsWith("INSTRUCCIONES:")) {
      const value = trimmed.slice("INSTRUCCIONES:".length).trim();
      if (value) noteLines.push(value);
      return;
    }
    if (trimmed) {
      noteLines.push(trimmed);
    }
  });

  return {
    agentId,
    agentName,
    notes: noteLines.join("\n").trim(),
  };
}

function buildAutoReplyDirectives(
  selectedAgent: AgentInstance | undefined,
  notes: string,
): string {
  const lines: string[] = [];

  if (selectedAgent) {
    lines.push(`AGENT_ID:${selectedAgent.id}`);
    lines.push(`AGENT_NAME:${selectedAgent.name}`);
  }

  const trimmedNotes = notes.trim();
  if (trimmedNotes) {
    lines.push(`INSTRUCCIONES:${trimmedNotes}`);
  }

  return lines.join("\n");
}

export default function MessagingView() {
  const { workspaceId } = useParams<{ workspaceId: string }>();

  const [accounts, setAccounts] = useState<ExternalAccount[]>([]);
  const [chats, setChats] = useState<ExternalChat[]>([]);
  const [activeChat, setActiveChat] = useState<ExternalChat | null>(null);
  const [messages, setMessages] = useState<ExternalMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [pendingSends, setPendingSends] = useState(0);

  const [activeTab, setActiveTab] = useState<"whatsapp" | "telegram">(
    "whatsapp",
  );
  const [showSetup, setShowSetup] = useState(false);
  const [qrCode, setQrCode] = useState("");
  const [qrLoading, setQrLoading] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [linkError, setLinkError] = useState("");

  const [agents, setAgents] = useState<AgentInstance[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [agentNotes, setAgentNotes] = useState("");
  const [agentRulesSaving, setAgentRulesSaving] = useState(false);
  const [agentRulesError, setAgentRulesError] = useState("");

  const [awayModeDraft, setAwayModeDraft] = useState(false);
  const [awayMessageDraft, setAwayMessageDraft] = useState(
    "Estoy fuera de la oficina ahora, te respondo en cuanto pueda.",
  );
  const [awayModeSaving, setAwayModeSaving] = useState(false);

  const [unlinking, setUnlinking] = useState(false);
  const [forceSetup, setForceSetup] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesPollRef = useRef<NodeJS.Timeout | null>(null);
  const chatsPollRef = useRef<NodeJS.Timeout | null>(null);
  const qrPollRef = useRef<NodeJS.Timeout | null>(null);
  const sendQueueRef = useRef<Promise<void>>(Promise.resolve());

  const currentAccount = useMemo(
    () => accounts.find((a) => a.provider === activeTab),
    [accounts, activeTab],
  );

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId),
    [agents, selectedAgentId],
  );

  const loadAccounts = async () => {
    try {
      const data = await api<{ accounts: ExternalAccount[] }>(
        "/messaging/accounts",
      );
      setAccounts(data.accounts);
    } catch (err) {
      console.error("Failed to load accounts:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadChats = async () => {
    try {
      const data = await api<{ chats: ExternalChat[] }>(
        `/messaging/chats?provider=${activeTab}`,
      );
      const freshChats = data.chats;
      setChats(freshChats);
      setActiveChat((prev) => {
        if (!prev) return prev;
        const updated = freshChats.find((chat) => chat.id === prev.id);
        return updated ?? prev;
      });
    } catch (err) {
      console.error("Failed to load chats:", err);
    }
  };

  const loadMessages = async (chatId: string) => {
    try {
      const data = await api<{ messages: ExternalMessage[] }>(
        `/messaging/chats/${chatId}/messages`,
      );
      setMessages(data.messages);
    } catch (err) {
      console.error("Failed to load messages:", err);
    }
  };

  const loadAgents = async () => {
    if (!workspaceId) {
      setAgents([]);
      return;
    }
    setAgentsLoading(true);
    try {
      const data = await getWorkspaceAgents(workspaceId);
      setAgents(data.agents || []);
    } catch (err) {
      console.error("Failed to load workspace agents:", err);
      setAgents([]);
    } finally {
      setAgentsLoading(false);
    }
  };

  useEffect(() => {
    loadAccounts();
  }, []);

  useEffect(() => {
    loadAgents();
  }, [workspaceId]);

  useEffect(() => {
    if (accounts.length > 0) {
      loadChats();
    }
  }, [accounts, activeTab]);

  useEffect(() => {
    if (forceSetup || !currentAccount || currentAccount.status !== "connected") {
      if (chatsPollRef.current) {
        clearInterval(chatsPollRef.current);
      }
      return;
    }

    chatsPollRef.current = setInterval(() => {
      loadChats();
    }, 3000);

    return () => {
      if (chatsPollRef.current) {
        clearInterval(chatsPollRef.current);
      }
    };
  }, [currentAccount?.id, currentAccount?.status, activeTab, forceSetup]);

  useEffect(() => {
    if (!activeChat) {
      if (messagesPollRef.current) {
        clearInterval(messagesPollRef.current);
      }
      return;
    }

    loadMessages(activeChat.id);

    messagesPollRef.current = setInterval(() => {
      loadMessages(activeChat.id);
    }, 2500);

    return () => {
      if (messagesPollRef.current) {
        clearInterval(messagesPollRef.current);
      }
    };
  }, [activeChat?.id]);

  useEffect(() => {
    return () => {
      if (qrPollRef.current) clearInterval(qrPollRef.current);
      if (chatsPollRef.current) clearInterval(chatsPollRef.current);
      if (messagesPollRef.current) clearInterval(messagesPollRef.current);
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!currentAccount) {
      setAwayModeDraft(false);
      setAwayMessageDraft(
        "Estoy fuera de la oficina ahora, te respondo en cuanto pueda.",
      );
      return;
    }

    setAwayModeDraft(Boolean(currentAccount.away_mode));
    setAwayMessageDraft(
      currentAccount.away_message?.trim() ||
        "Estoy fuera de la oficina ahora, te respondo en cuanto pueda.",
    );
  }, [currentAccount?.id, currentAccount?.away_mode, currentAccount?.away_message]);

  useEffect(() => {
    if (!activeChat) {
      setSelectedAgentId("");
      setAgentNotes("");
      setAgentRulesError("");
      return;
    }

    const parsed = parseAutoReplyDirectives(activeChat.auto_reply_directives);

    let resolvedAgentId = parsed.agentId;
    if (!resolvedAgentId && parsed.agentName) {
      const matchedAgent = agents.find((agent) => agent.name === parsed.agentName);
      if (matchedAgent) {
        resolvedAgentId = matchedAgent.id;
      }
    }

    setSelectedAgentId(resolvedAgentId || "");
    setAgentNotes(parsed.notes || "");
    setAgentRulesError("");
  }, [activeChat?.id, activeChat?.auto_reply_directives, agents]);

  const sendMessage = async () => {
    if (!newMessage.trim() || !activeChat) return;

    const text = newMessage.trim();
    const chatId = activeChat.id;
    const tempId = `temp-${Date.now()}`;

    setNewMessage("");

    const tempMsg: ExternalMessage = {
      id: tempId,
      chat_id: chatId,
      direction: "out",
      content: text,
      is_auto_reply: false,
      status: "pending",
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, tempMsg]);
    setPendingSends((count) => count + 1);

    const task = async () => {
      try {
        await api(`/messaging/chats/${chatId}/send`, {
          method: "POST",
          body: JSON.stringify({ chat_id: chatId, content: text }),
        });
        await Promise.all([loadChats(), loadMessages(chatId)]);
      } catch (err) {
        console.error("Failed to send:", err);
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === tempId ? { ...msg, status: "failed" } : msg,
          ),
        );
      } finally {
        setPendingSends((count) => Math.max(0, count - 1));
      }
    };

    sendQueueRef.current = sendQueueRef.current.then(task).catch((err) => {
      console.error("Send queue error:", err);
    });
  };

  const suggestReply = async () => {
    if (!activeChat || suggesting) return;
    setSuggesting(true);
    try {
      const data = await api<{ suggestion: string }>(
        "/messaging/suggest-reply",
        {
          method: "POST",
          body: JSON.stringify({ chat_id: activeChat.id }),
        },
      );
      setNewMessage(data.suggestion);
    } catch (err) {
      console.error("Failed to suggest:", err);
    } finally {
      setSuggesting(false);
    }
  };

  const linkWhatsApp = async () => {
    if (!workspaceId) {
      setLinkError("No se pudo determinar el workspace. Recarga la pagina.");
      return;
    }

    setQrLoading(true);
    setLinkError("");

    try {
      const data = await api<{ qr_code: string; instance_name: string }>(
        "/messaging/whatsapp/link",
        {
          method: "POST",
          body: JSON.stringify({ workspace_id: workspaceId }),
        },
      );
      setQrCode(data.qr_code);
      setShowSetup(true);
      startQrPolling();
    } catch (err) {
      console.error("Failed to link:", err);
      setLinkError("Error al vincular WhatsApp. Intenta de nuevo.");
    } finally {
      setQrLoading(false);
    }
  };

  const startQrPolling = () => {
    if (qrPollRef.current) clearInterval(qrPollRef.current);

    qrPollRef.current = setInterval(async () => {
      try {
        const data = await api<{ qr_code: string; status: string }>(
          "/messaging/whatsapp/qr",
        );

        if (data.status === "connected") {
          if (qrPollRef.current) clearInterval(qrPollRef.current);
          setShowSetup(false);
          setQrCode("");
          setForceSetup(false);
          await Promise.all([loadAccounts(), loadChats()]);
          return;
        }

        if (data.qr_code) {
          setQrCode(data.qr_code);
        }
      } catch (err) {
        console.error("QR poll error:", err);
      }
    }, 3000);
  };

  const handleLinkWhatsApp = async () => {
    setForceSetup(false);
    await linkWhatsApp();
  };

  const unlinkWhatsApp = async () => {
    if (!currentAccount || unlinking) return;

    setUnlinking(true);
    setConfirmUnlink(false);

    try {
      await api("/messaging/whatsapp/unlink", { method: "DELETE" });
    } catch (err) {
      console.error("Failed to unlink:", err);
    } finally {
      setUnlinking(false);
      setAccounts([]);
      setChats([]);
      setActiveChat(null);
      setMessages([]);
      setShowSetup(false);
      setQrCode("");
      if (qrPollRef.current) clearInterval(qrPollRef.current);
      setForceSetup(true);
      await loadAccounts();
    }
  };

  const saveAwayMode = async (enabled: boolean) => {
    if (!currentAccount) return;

    setAwayModeSaving(true);
    try {
      await api(`/messaging/accounts/${currentAccount.id}/away`, {
        method: "PUT",
        body: JSON.stringify({
          enabled,
          message: awayMessageDraft.trim() || undefined,
        }),
      });
      await loadAccounts();
    } catch (err) {
      console.error("Failed to save away mode:", err);
    } finally {
      setAwayModeSaving(false);
    }
  };

  const toggleAwayMode = async () => {
    const next = !awayModeDraft;
    setAwayModeDraft(next);
    await saveAwayMode(next);
  };

  const saveChatAgentRules = async (autoReplyEnabled?: boolean) => {
    if (!activeChat) return;

    const willEnable = autoReplyEnabled ?? activeChat.auto_reply_enabled ?? false;
    if (willEnable && !selectedAgentId) {
      setAgentRulesError("Selecciona un agente para activar la auto-respuesta.");
      return;
    }

    setAgentRulesSaving(true);
    setAgentRulesError("");

    try {
      await api(`/messaging/chats/${activeChat.id}/rules`, {
        method: "PUT",
        body: JSON.stringify({
          auto_reply_enabled: willEnable,
          auto_reply_directives: buildAutoReplyDirectives(
            selectedAgent,
            agentNotes,
          ),
        }),
      });
      await loadChats();
    } catch (err) {
      console.error("Failed to save chat rules:", err);
      setAgentRulesError("No se pudo guardar la regla del chat.");
    } finally {
      setAgentRulesSaving(false);
    }
  };

  const toggleChatAutoReply = async () => {
    if (!activeChat) return;
    const next = activeChat.auto_reply_enabled !== true;
    await saveChatAgentRules(next);
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) {
      return d.toLocaleTimeString("es-ES", {
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    return d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        Cargando...
      </div>
    );
  }

  return (
    <div className="flex-1 flex h-full">
      <div className="w-80 border-r border-gray-200 flex flex-col bg-white">
        <div className="h-12 border-b border-gray-200 flex items-center px-4 gap-2">
          <button
            onClick={() => setActiveTab("whatsapp")}
            className={`px-3 py-1 text-[12px] font-medium rounded-md transition-colors ${
              activeTab === "whatsapp"
                ? "bg-green-50 text-green-700"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            WhatsApp
          </button>
          <button
            onClick={() => setActiveTab("telegram")}
            className={`px-3 py-1 text-[12px] font-medium rounded-md transition-colors ${
              activeTab === "telegram"
                ? "bg-blue-50 text-blue-700"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Telegram
          </button>
          <div className="flex-1" />
          {currentAccount && (
            <>
              <div
                className={`w-2 h-2 rounded-full ${
                  currentAccount.status === "connected"
                    ? "bg-green-500"
                    : "bg-red-400"
                }`}
                title={currentAccount.status}
              />
              {activeTab === "whatsapp" &&
                (confirmUnlink ? (
                  <div className="flex items-center gap-1 ml-1">
                    <span className="text-[10px] text-gray-500">Seguro?</span>
                    <button
                      onClick={unlinkWhatsApp}
                      disabled={unlinking}
                      className="text-[11px] text-red-500 hover:text-red-700 font-medium disabled:opacity-50"
                    >
                      {unlinking ? "..." : "Si"}
                    </button>
                    <button
                      onClick={() => setConfirmUnlink(false)}
                      className="text-[11px] text-gray-400 hover:text-gray-600"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmUnlink(true)}
                    className="text-[11px] text-red-400 hover:text-red-600 transition-colors ml-1"
                    title="Cerrar sesion de WhatsApp"
                  >
                    Cerrar sesion
                  </button>
                ))}
            </>
          )}
        </div>

        {forceSetup || !currentAccount || currentAccount.status !== "connected" ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            {activeTab === "telegram" ? (
              <>
                <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center mb-3">
                  <ClockIcon className="w-6 h-6 text-blue-500" />
                </div>
                <p className="text-sm font-medium text-gray-900 mb-1">
                  Telegram - Proximamente
                </p>
                <p className="text-xs text-gray-500 mb-4 max-w-[220px]">
                  La integracion con Telegram estara disponible pronto. Por ahora
                  puedes vincular tu WhatsApp.
                </p>
                <button
                  onClick={() => setActiveTab("whatsapp")}
                  className="px-4 py-2 bg-green-500 text-white text-sm font-medium rounded-lg hover:bg-green-600 transition-colors"
                >
                  Vincular WhatsApp
                </button>
              </>
            ) : showSetup && qrCode ? (
              <>
                <QrCodeIcon className="w-8 h-8 text-green-500 mb-3" />
                <p className="text-sm font-medium text-gray-900 mb-2">
                  Escanea el QR con WhatsApp
                </p>
                <p className="text-[11px] text-gray-400 mb-3">
                  Abre WhatsApp &gt; Dispositivos vinculados &gt; Vincular
                  dispositivo
                </p>
                <img src={qrCode} alt="QR" className="w-48 h-48 rounded-lg mb-3" />
                <p className="text-[10px] text-gray-400 mb-2">
                  El QR se actualiza automaticamente
                </p>
                <button
                  onClick={() => {
                    if (qrPollRef.current) clearInterval(qrPollRef.current);
                    setShowSetup(false);
                    setQrCode("");
                  }}
                  className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
                >
                  Cancelar
                </button>
              </>
            ) : currentAccount &&
              currentAccount.status === "disconnected" &&
              !forceSetup ? (
              <>
                <div className="w-12 h-12 rounded-full bg-orange-50 flex items-center justify-center mb-3">
                  <PhoneIcon className="w-6 h-6 text-orange-500" />
                </div>
                <p className="text-sm font-medium text-gray-900 mb-1">
                  WhatsApp desconectado
                </p>
                <p className="text-xs text-gray-500 mb-4 max-w-[220px]">
                  Tu sesion de WhatsApp fue cerrada desde el telefono. Vuelve a
                  vincular para reconectar.
                </p>
                {linkError && (
                  <p className="text-xs text-red-500 mb-3">{linkError}</p>
                )}
                <button
                  onClick={handleLinkWhatsApp}
                  disabled={qrLoading}
                  className="px-4 py-2 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors"
                >
                  {qrLoading ? "Generando QR..." : "Reconectar WhatsApp"}
                </button>
              </>
            ) : (
              <>
                <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center mb-3">
                  <PhoneIcon className="w-6 h-6 text-green-600" />
                </div>
                <p className="text-sm font-medium text-gray-900 mb-1">
                  Conecta tu WhatsApp
                </p>
                <p className="text-xs text-gray-500 mb-4">
                  Escanea un codigo QR para vincular tu WhatsApp
                </p>
                {linkError && (
                  <p className="text-xs text-red-500 mb-3">{linkError}</p>
                )}
                <button
                  onClick={handleLinkWhatsApp}
                  disabled={qrLoading}
                  className="px-4 py-2 bg-green-500 text-white text-sm font-medium rounded-lg hover:bg-green-600 disabled:opacity-50 transition-colors"
                >
                  {qrLoading ? "Generando QR..." : "Vincular WhatsApp"}
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="border-b border-gray-100 px-3 py-2 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-gray-700">AutoMode global</span>
                <button
                  onClick={toggleAwayMode}
                  disabled={awayModeSaving}
                  className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
                    awayModeDraft
                      ? "bg-violet-100 text-violet-700"
                      : "bg-gray-100 text-gray-600"
                  } ${awayModeSaving ? "opacity-60" : ""}`}
                >
                  {awayModeDraft ? "ON" : "OFF"}
                </button>
              </div>
              <textarea
                value={awayMessageDraft}
                onChange={(e) => setAwayMessageDraft(e.target.value)}
                rows={2}
                placeholder="Mensaje automático cuando no estés disponible"
                className="w-full resize-none rounded-md border border-gray-200 px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-violet-300"
              />
              <button
                onClick={() => saveAwayMode(awayModeDraft)}
                disabled={awayModeSaving}
                className="w-full px-2 py-1 rounded-md bg-violet-500 text-white text-[11px] font-medium hover:bg-violet-600 disabled:opacity-60 transition-colors"
              >
                {awayModeSaving ? "Guardando..." : "Guardar modo ausente"}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {chats.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full p-6 text-center">
                  <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center mb-3">
                    <PhoneIcon className="w-5 h-5 text-green-500" />
                  </div>
                  <p className="text-sm font-medium text-gray-700 mb-1">
                    WhatsApp conectado
                  </p>
                  <p className="text-xs text-gray-400 max-w-[200px]">
                    Las conversaciones apareceran aqui cuando recibas o envies
                    mensajes.
                  </p>
                </div>
              ) : (
                chats.map((chat) => (
                  <button
                    key={chat.id}
                    onClick={() => setActiveChat(chat)}
                    className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-50 ${
                      activeChat?.id === chat.id ? "bg-gray-50" : ""
                    }`}
                  >
                    <div
                      className={`w-10 h-10 rounded-full ${avatarClass(
                        chat.contact_name || chat.contact_phone,
                      )} flex items-center justify-center text-white font-semibold text-sm shrink-0`}
                    >
                      {chat.contact_name?.[0]?.toUpperCase() || "?"}
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[13px] font-medium text-gray-900 truncate">
                          {chat.contact_name}
                        </span>
                        <span className="text-[10px] text-gray-400 shrink-0">
                          {chat.last_message_at ? formatTime(chat.last_message_at) : ""}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-0.5 gap-2">
                        <span className="text-[12px] text-gray-500 truncate">
                          {chat.last_message_preview || ""}
                        </span>
                        <div className="flex items-center gap-1 shrink-0">
                          {chat.auto_reply_enabled && (
                            <span className="px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 text-[9px] font-semibold">
                              AUTO
                            </span>
                          )}
                          {chat.unread_count > 0 && (
                            <span className="w-5 h-5 rounded-full bg-green-500 text-white text-[10px] font-bold flex items-center justify-center">
                              {chat.unread_count > 99 ? "99+" : chat.unread_count}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </>
        )}
      </div>

      <div className="flex-1 flex flex-col bg-[#F0F0F0]">
        {activeChat ? (
          <>
            <div className="bg-white border-b border-gray-200 px-4 py-2.5 space-y-2">
              <div className="flex items-center gap-3">
                <div
                  className={`w-8 h-8 rounded-full ${avatarClass(
                    activeChat.contact_name || activeChat.contact_phone,
                  )} flex items-center justify-center text-white font-semibold text-xs`}
                >
                  {activeChat.contact_name?.[0]?.toUpperCase() || "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-gray-900 truncate">
                    {activeChat.contact_name}
                  </div>
                  <div className="text-[11px] text-gray-500 truncate">
                    {activeChat.contact_phone || activeChat.remote_jid}
                  </div>
                </div>
                <button
                  onClick={toggleChatAutoReply}
                  disabled={agentRulesSaving}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                    activeChat.auto_reply_enabled
                      ? "bg-violet-100 text-violet-700"
                      : "bg-gray-100 text-gray-600"
                  } ${agentRulesSaving ? "opacity-60" : ""}`}
                >
                  {activeChat.auto_reply_enabled ? "Auto ON" : "Auto OFF"}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-[1fr,auto] gap-2">
                <select
                  value={selectedAgentId}
                  onChange={(e) => {
                    setSelectedAgentId(e.target.value);
                    setAgentRulesError("");
                  }}
                  className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-[12px] bg-white focus:outline-none focus:ring-1 focus:ring-violet-300"
                >
                  <option value="">
                    {agentsLoading
                      ? "Cargando agentes..."
                      : agents.length > 0
                        ? "Selecciona agente para este chat"
                        : "No hay agentes en este workspace"}
                  </option>
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                    </option>
                  ))}
                </select>

                <button
                  onClick={() => saveChatAgentRules(activeChat.auto_reply_enabled ?? false)}
                  disabled={agentRulesSaving || agentsLoading}
                  className="px-3 py-1.5 rounded-md bg-violet-500 text-white text-[12px] font-medium hover:bg-violet-600 disabled:opacity-60 transition-colors"
                >
                  {agentRulesSaving ? "Guardando..." : "Guardar regla"}
                </button>
              </div>

              <input
                type="text"
                value={agentNotes}
                onChange={(e) => setAgentNotes(e.target.value)}
                placeholder="Instrucciones extra para este chat (opcional)"
                className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-violet-300"
              />

              {agentRulesError && (
                <p className="text-[11px] text-red-500">{agentRulesError}</p>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.direction === "out" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[70%] px-3 py-2 rounded-xl text-[13px] leading-relaxed ${
                      msg.direction === "out"
                        ? msg.is_auto_reply
                          ? "bg-violet-100 text-violet-900"
                          : "bg-green-100 text-gray-900"
                        : "bg-white text-gray-900 shadow-sm"
                    }`}
                  >
                    {msg.is_auto_reply && (
                      <div className="text-[10px] text-violet-500 font-medium mb-0.5">
                        Auto-respuesta
                      </div>
                    )}
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                    <div
                      className={`text-[10px] mt-1 text-right ${
                        msg.direction === "out"
                          ? msg.status === "failed"
                            ? "text-red-500"
                            : "text-green-600"
                          : "text-gray-400"
                      }`}
                    >
                      {msg.status === "pending"
                        ? "Enviando..."
                        : msg.status === "failed"
                          ? "Error"
                          : formatTime(msg.created_at)}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <div className="bg-white border-t border-gray-200 px-4 py-3">
              <div className="flex items-end gap-2">
                <button
                  onClick={suggestReply}
                  disabled={suggesting}
                  className="p-2 rounded-lg text-violet-500 hover:bg-violet-50 transition-colors shrink-0"
                  title="Sugerir respuesta con IA"
                >
                  <SparklesIcon
                    className={`w-5 h-5 ${suggesting ? "animate-pulse" : ""}`}
                  />
                </button>
                <textarea
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                  placeholder="Escribe un mensaje..."
                  rows={1}
                  className="flex-1 px-3 py-2 text-[13px] bg-gray-50 rounded-xl border-0 focus:outline-none focus:ring-1 focus:ring-green-300 resize-none"
                />
                <button
                  onClick={sendMessage}
                  disabled={!newMessage.trim()}
                  className="p-2 rounded-lg bg-green-500 text-white hover:bg-green-600 disabled:opacity-40 transition-colors shrink-0"
                  title={pendingSends > 0 ? `Mensajes en cola: ${pendingSends}` : "Enviar"}
                >
                  <PaperAirplaneIcon className="w-5 h-5" />
                </button>
              </div>
              {pendingSends > 0 && (
                <p className="text-[10px] text-gray-400 mt-1">
                  Cola de envio activa: {pendingSends}
                </p>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
            <PhoneIcon className="w-12 h-12 mb-3 text-gray-300" />
            <p className="text-sm">Selecciona una conversacion</p>
          </div>
        )}
      </div>
    </div>
  );
}
