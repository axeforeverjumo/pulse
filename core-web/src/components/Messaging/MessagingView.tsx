import { useState, useEffect, useRef, useMemo } from "react";
import { useParams } from "react-router-dom";
import { api, getWorkspaceAgents, type AgentInstance } from "../../api/client";
import { API_BASE } from "../../lib/apiBase";
import { useAuthStore } from "../../stores/authStore";
import { avatarGradient } from "../../utils/avatarGradient";
import {
  PaperAirplaneIcon,
  PhoneIcon,
  SparklesIcon,
  QrCodeIcon,
} from "@heroicons/react/24/outline";

interface ExternalAccount {
  id: string;
  provider: "whatsapp" | "telegram";
  status: string;
  phone_number?: string;
  away_mode: boolean;
  away_message?: string;
  away_directives?: string;
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

interface AutoReplySummaryItem {
  message_id: string;
  chat_id: string;
  contact_name: string;
  remote_jid?: string;
  content: string;
  created_at: string;
  status?: string;
}

interface ParsedDirectives {
  agentId: string;
  agentName: string;
  notes: string;
}

const MEDIA_LABELS: Record<string, string> = {
  image: "Imagen",
  video: "Video",
  audio: "Audio",
  document: "Documento",
  sticker: "Sticker",
};

const AUTO_MODE_DEFAULT_DIRECTIVES =
  "Responde de forma natural en mi nombre, manteniendo mi tono y el contexto de la conversación. Si falta información, di que lo revisas y contestas después.";

function parseAutoReplyDirectives(raw?: string): ParsedDirectives {
  if (!raw) return { agentId: "", agentName: "", notes: "" };

  const lines = raw.split("\n");
  let agentId = "";
  let agentName = "";
  const notes: string[] = [];

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (trimmed.startsWith("AGENT_ID:")) {
      agentId = trimmed.slice("AGENT_ID:".length).trim();
      return;
    }
    if (trimmed.startsWith("AGENT_NAME:")) {
      agentName = trimmed.slice("AGENT_NAME:".length).trim();
      return;
    }
    if (trimmed.startsWith("AGENT::")) {
      agentName = trimmed.slice("AGENT::".length).trim();
      return;
    }
    if (trimmed.startsWith("INSTRUCCIONES:")) {
      const value = trimmed.slice("INSTRUCCIONES:".length).trim();
      if (value) notes.push(value);
      return;
    }
    notes.push(trimmed);
  });

  return {
    agentId,
    agentName,
    notes: notes.join("\n").trim(),
  };
}

function buildAgentDirectives(
  selectedAgent: AgentInstance | undefined,
  notes: string,
): string {
  const lines: string[] = [];
  if (selectedAgent) {
    lines.push(`AGENT_ID:${selectedAgent.id}`);
    lines.push(`AGENT_NAME:${selectedAgent.name}`);
  }
  const cleanedNotes = notes.trim();
  if (cleanedNotes) {
    lines.push(`INSTRUCCIONES:${cleanedNotes}`);
  }
  return lines.join("\n");
}

function mediaLabel(mediaType?: string): string {
  if (!mediaType) return "Adjunto";
  return MEDIA_LABELS[mediaType] || "Adjunto";
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
  const [awayModeSaving, setAwayModeSaving] = useState(false);
  const [awayModeDraft, setAwayModeDraft] = useState(false);
  const [awayDirectivesDraft, setAwayDirectivesDraft] = useState(
    AUTO_MODE_DEFAULT_DIRECTIVES,
  );
  const [autoReplySummary, setAutoReplySummary] = useState<AutoReplySummaryItem[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [agents, setAgents] = useState<AgentInstance[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [agentNotes, setAgentNotes] = useState("");
  const [agentRulesSaving, setAgentRulesSaving] = useState(false);
  const [agentRulesError, setAgentRulesError] = useState("");
  const [activeTab, setActiveTab] = useState<"whatsapp" | "telegram">(
    "whatsapp",
  );
  const [showSetup, setShowSetup] = useState(false);
  const [qrCode, setQrCode] = useState("");
  const [qrLoading, setQrLoading] = useState(false);
  const [telegramLinking, setTelegramLinking] = useState(false);
  const [telegramDeepLink, setTelegramDeepLink] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [linkError, setLinkError] = useState("");
  const [resolvedMediaUrls, setResolvedMediaUrls] = useState<Record<string, string>>({});
  const [mediaLoadingByMessage, setMediaLoadingByMessage] = useState<Record<string, boolean>>({});
  const [mediaErrorByMessage, setMediaErrorByMessage] = useState<Record<string, string>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const resolvedMediaUrlsRef = useRef<Record<string, string>>({});
  const sendQueueRef = useRef<Promise<void>>(Promise.resolve());
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const qrPollRef = useRef<NodeJS.Timeout | null>(null);
  const telegramPollRef = useRef<NodeJS.Timeout | null>(null);
  const warmupPollRef = useRef<NodeJS.Timeout | null>(null);
  const hydratedChatsRef = useRef<Set<string>>(new Set());

  const currentAccount = useMemo(
    () => accounts.find((account) => account.provider === activeTab),
    [accounts, activeTab],
  );
  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId),
    [agents, selectedAgentId],
  );

  useEffect(() => {
    resolvedMediaUrlsRef.current = resolvedMediaUrls;
  }, [resolvedMediaUrls]);

  useEffect(() => {
    return () => {
      Object.values(resolvedMediaUrlsRef.current).forEach((url) => {
        URL.revokeObjectURL(url);
      });
    };
  }, []);

  // Load accounts on mount
  useEffect(() => {
    loadAccounts();
  }, []);

  useEffect(() => {
    loadAgents();
  }, [workspaceId]);

  // Keep account status updated (connected/disconnected) without manual refresh.
  useEffect(() => {
    const accountsPoll = setInterval(() => {
      loadAccounts();
    }, 8000);
    return () => clearInterval(accountsPoll);
  }, []);

  // Load chats when accounts change
  useEffect(() => {
    if (accounts.length > 0) loadChats();
  }, [accounts, activeTab]);

  // Keep chat list fresh even when no conversation is selected.
  // Without this polling, incoming webhooks can write to DB but UI stays stale.
  useEffect(() => {
    const tabAccount = accounts.find((account) => account.provider === activeTab);
    if (!tabAccount || tabAccount.status !== "connected") return;

    const chatsPoll = setInterval(() => {
      loadChats();
    }, 2500);

    return () => clearInterval(chatsPoll);
  }, [activeTab, accounts]);

  // Poll for new messages in active chat
  useEffect(() => {
    if (!activeChat) return;

    ensureChatHistory(activeChat.id).finally(() => {
      loadMessages(activeChat.id);
    });

    pollRef.current = setInterval(() => {
      loadMessages(activeChat.id);
    }, 2500);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [activeChat?.id]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const currentIds = new Set(messages.map((msg) => msg.id));

    setResolvedMediaUrls((prev) => {
      let changed = false;
      const next: Record<string, string> = {};
      Object.entries(prev).forEach(([id, url]) => {
        if (currentIds.has(id)) {
          next[id] = url;
        } else {
          URL.revokeObjectURL(url);
          changed = true;
        }
      });
      return changed ? next : prev;
    });

    setMediaLoadingByMessage((prev) => {
      const next: Record<string, boolean> = {};
      Object.entries(prev).forEach(([id, loading]) => {
        if (currentIds.has(id)) next[id] = loading;
      });
      return next;
    });

    setMediaErrorByMessage((prev) => {
      const next: Record<string, string> = {};
      Object.entries(prev).forEach(([id, error]) => {
        if (currentIds.has(id)) next[id] = error;
      });
      return next;
    });
  }, [messages]);

  const areChatsEqual = (left: ExternalChat[], right: ExternalChat[]) => {
    if (left.length !== right.length) return false;

    for (let i = 0; i < left.length; i += 1) {
      if (
        left[i].id !== right[i].id ||
        left[i].contact_name !== right[i].contact_name ||
        left[i].unread_count !== right[i].unread_count ||
        left[i].last_message_at !== right[i].last_message_at ||
        left[i].last_message_preview !== right[i].last_message_preview
      ) {
        return false;
      }
    }

    return true;
  };

  const areMessagesEqual = (
    left: ExternalMessage[],
    right: ExternalMessage[],
  ) => {
    if (left.length !== right.length) return false;

    for (let i = 0; i < left.length; i += 1) {
      if (
        left[i].id !== right[i].id ||
        left[i].status !== right[i].status ||
        left[i].content !== right[i].content ||
        left[i].created_at !== right[i].created_at ||
        left[i].media_type !== right[i].media_type ||
        left[i].media_url !== right[i].media_url ||
        left[i].is_auto_reply !== right[i].is_auto_reply
      ) {
        return false;
      }
    }

    return true;
  };

  const loadAccounts = async (): Promise<ExternalAccount[]> => {
    try {
      const data = await api<{ accounts: ExternalAccount[] }>(
        "/messaging/accounts",
      );
      const incomingAccounts = data.accounts || [];
      setAccounts(incomingAccounts);
      return incomingAccounts;
    } catch (err) {
      console.error("Failed to load accounts:", err);
      return [];
    } finally {
      setLoading(false);
    }
  };

  const loadAgents = async () => {
    if (!workspaceId) {
      setAgents([]);
      return;
    }
    setAgentsLoading(true);
    try {
      const result = await getWorkspaceAgents(workspaceId);
      setAgents(result.agents || []);
    } catch (err) {
      console.error("Failed to load workspace agents:", err);
      setAgents([]);
    } finally {
      setAgentsLoading(false);
    }
  };

  const loadAutoReplySummary = async (accountId: string) => {
    setSummaryLoading(true);
    try {
      const result = await api<{ items: AutoReplySummaryItem[] }>(
        `/messaging/accounts/${accountId}/auto-replies?limit=20`,
      );
      setAutoReplySummary(result.items || []);
    } catch (err) {
      console.error("Failed to load auto-reply summary:", err);
      setAutoReplySummary([]);
    } finally {
      setSummaryLoading(false);
    }
  };

  const fetchMediaForMessage = async (messageId: string): Promise<string | null> => {
    if (resolvedMediaUrls[messageId]) return resolvedMediaUrls[messageId];
    if (mediaLoadingByMessage[messageId]) return null;

    const token = useAuthStore.getState().session?.access_token;
    if (!token) {
      setMediaErrorByMessage((prev) => ({
        ...prev,
        [messageId]: "Sesión expirada. Recarga la página.",
      }));
      return null;
    }

    setMediaLoadingByMessage((prev) => ({ ...prev, [messageId]: true }));
    setMediaErrorByMessage((prev) => {
      const next = { ...prev };
      delete next[messageId];
      return next;
    });

    try {
      const response = await fetch(`${API_BASE}/messaging/messages/${messageId}/media`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        let detail = `Error ${response.status}`;
        try {
          const json = await response.json();
          detail = json?.detail || json?.message || detail;
        } catch {
          // keep fallback detail
        }
        throw new Error(detail);
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      setResolvedMediaUrls((prev) => ({ ...prev, [messageId]: objectUrl }));
      return objectUrl;
    } catch (err) {
      console.error("Failed to fetch message media:", err);
      setMediaErrorByMessage((prev) => ({
        ...prev,
        [messageId]: "No se pudo cargar el adjunto.",
      }));
      return null;
    } finally {
      setMediaLoadingByMessage((prev) => ({ ...prev, [messageId]: false }));
    }
  };

  const openMediaInNewTab = async (messageId: string) => {
    const mediaUrl = await fetchMediaForMessage(messageId);
    if (mediaUrl) {
      window.open(mediaUrl, "_blank", "noopener,noreferrer");
    }
  };

  const loadChats = async () => {
    try {
      const data = await api<{ chats: ExternalChat[] }>(
        `/messaging/chats?provider=${activeTab}`,
      );
      const incomingChats = data.chats || [];
      setChats((prev) =>
        areChatsEqual(prev, incomingChats) ? prev : incomingChats,
      );

      setActiveChat((prev) => {
        if (!prev) return null;
        const refreshed = incomingChats.find((chat) => chat.id === prev.id);
        if (!refreshed) return null;
        if (
          refreshed.id === prev.id &&
          refreshed.contact_name === prev.contact_name &&
          refreshed.unread_count === prev.unread_count &&
          refreshed.last_message_at === prev.last_message_at &&
          refreshed.last_message_preview === prev.last_message_preview
        ) {
          return prev;
        }
        return refreshed;
      });
    } catch (err) {
      console.error("Failed to load chats:", err);
    }
  };

  const startChatsWarmup = () => {
    if (warmupPollRef.current) clearInterval(warmupPollRef.current);

    let attempts = 0;
    const tick = () => {
      attempts += 1;
      loadChats();
      if (attempts >= 12 && warmupPollRef.current) {
        clearInterval(warmupPollRef.current);
        warmupPollRef.current = null;
      }
    };

    tick();
    warmupPollRef.current = setInterval(tick, 1200);
  };

  const ensureChatHistory = async (chatId: string) => {
    if (activeTab !== "whatsapp") return;
    if (hydratedChatsRef.current.has(chatId)) return;

    hydratedChatsRef.current.add(chatId);
    try {
      await api<{ synced: number }>(`/messaging/chats/${chatId}/sync-history`, {
        method: "POST",
      });
      await loadChats();
    } catch (err) {
      console.error("Failed to sync chat history:", err);
      hydratedChatsRef.current.delete(chatId);
    }
  };

  const loadMessages = async (chatId: string) => {
    try {
      const data = await api<{ messages: ExternalMessage[] }>(
        `/messaging/chats/${chatId}/messages`,
      );
      const incomingMessages = data.messages || [];
      setMessages((prev) =>
        areMessagesEqual(prev, incomingMessages) ? prev : incomingMessages,
      );
    } catch (err) {
      console.error("Failed to load messages:", err);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !activeChat) return;

    const chatId = activeChat.id;
    const preparedText = stripLeadingAgentMention(newMessage.trim());
    const text = preparedText || newMessage.trim();
    setNewMessage("");

    // Optimistic add so users can fire multiple messages in a row instantly.
    const tempMsg: ExternalMessage = {
      id: `temp-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      chat_id: chatId,
      direction: "out",
      content: text,
      is_auto_reply: false,
      status: "pending",
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempMsg]);

    sendQueueRef.current = sendQueueRef.current
      .then(async () => {
        setPendingSends((prev) => prev + 1);
        try {
          await api(`/messaging/chats/${chatId}/send`, {
            method: "POST",
            body: JSON.stringify({ chat_id: chatId, content: text }),
          });

          if (activeChat?.id === chatId) {
            await loadMessages(chatId);
          }
          await loadChats();
        } catch (err) {
          console.error("Failed to send:", err);
        } finally {
          setPendingSends((prev) => Math.max(0, prev - 1));
        }
      })
      .catch((err) => {
        console.error("Message queue error:", err);
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
      setTelegramDeepLink("");
      // Start polling for QR refresh and connection status
      startQrPolling();
    } catch (err) {
      console.error("Failed to link:", err);
      setLinkError("Error al vincular WhatsApp. Intenta de nuevo.");
    } finally {
      setQrLoading(false);
    }
  };

  const startQrPolling = () => {
    // Clear any existing QR poll
    if (qrPollRef.current) clearInterval(qrPollRef.current);
    if (warmupPollRef.current) clearInterval(warmupPollRef.current);

    qrPollRef.current = setInterval(async () => {
      try {
        const data = await api<{ qr_code: string; status: string }>(
          "/messaging/whatsapp/qr",
        );
        if (data.status === "connected") {
          // Connected! Stop polling, refresh accounts
          if (qrPollRef.current) clearInterval(qrPollRef.current);
          setShowSetup(false);
          setQrCode("");
          hydratedChatsRef.current.clear();
          await loadAccounts();
          startChatsWarmup();
          return;
        }
        if (data.qr_code) {
          setQrCode(data.qr_code);
        }
      } catch (err) {
        console.error("QR poll error:", err);
      }
    }, 5000);
  };

  const linkTelegram = async () => {
    if (!workspaceId) {
      setLinkError("No se pudo determinar el workspace. Recarga la pagina.");
      return;
    }

    setTelegramLinking(true);
    setLinkError("");
    try {
      const data = await api<{ deep_link_url: string; bot_username: string }>(
        "/messaging/telegram/link",
        {
          method: "POST",
          body: JSON.stringify({ workspace_id: workspaceId }),
        },
      );

      setQrCode("");
      setShowSetup(true);
      setTelegramDeepLink(data.deep_link_url || "");

      if (data.deep_link_url) {
        window.open(data.deep_link_url, "_blank", "noopener,noreferrer");
      }

      startTelegramLinkPolling();
    } catch (err) {
      console.error("Failed to link Telegram:", err);
      setLinkError("Error al vincular Telegram. Revisa el bot y vuelve a intentarlo.");
    } finally {
      setTelegramLinking(false);
    }
  };

  const startTelegramLinkPolling = () => {
    if (telegramPollRef.current) clearInterval(telegramPollRef.current);
    if (warmupPollRef.current) clearInterval(warmupPollRef.current);

    let attempts = 0;
    const tick = async () => {
      attempts += 1;
      const freshAccounts = await loadAccounts();
      const telegramAccount = freshAccounts.find(
        (account) => account.provider === "telegram",
      );

      if (telegramAccount?.status === "connected") {
        if (telegramPollRef.current) clearInterval(telegramPollRef.current);
        setShowSetup(false);
        setTelegramDeepLink("");
        hydratedChatsRef.current.clear();
        await loadChats();
        startChatsWarmup();
        return;
      }

      if (attempts >= 60 && telegramPollRef.current) {
        clearInterval(telegramPollRef.current);
        telegramPollRef.current = null;
      }
    };

    tick();
    telegramPollRef.current = setInterval(tick, 2000);
  };

  // Clean up polling timers on unmount
  useEffect(() => {
    return () => {
      if (qrPollRef.current) clearInterval(qrPollRef.current);
      if (telegramPollRef.current) clearInterval(telegramPollRef.current);
      if (warmupPollRef.current) clearInterval(warmupPollRef.current);
    };
  }, []);

  const [unlinking, setUnlinking] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState(false);

  useEffect(() => {
    if (!currentAccount) return;
    setAwayModeDraft(Boolean(currentAccount.away_mode));
    setAwayDirectivesDraft(
      currentAccount.away_directives?.trim() || AUTO_MODE_DEFAULT_DIRECTIVES,
    );
    loadAutoReplySummary(currentAccount.id);
  }, [currentAccount?.id]);

  useEffect(() => {
    if (!currentAccount || currentAccount.status !== "connected") return;
    const summaryPoll = setInterval(() => {
      loadAutoReplySummary(currentAccount.id);
    }, 10000);
    return () => clearInterval(summaryPoll);
  }, [currentAccount?.id, currentAccount?.status]);

  useEffect(() => {
    if (!activeChat) {
      setSelectedAgentId("");
      setAgentNotes("");
      setAgentRulesError("");
      return;
    }

    const parsed = parseAutoReplyDirectives(activeChat.auto_reply_directives);
    let resolvedId = parsed.agentId;
    if (!resolvedId && parsed.agentName) {
      const matched = agents.find(
        (agent) => agent.name.trim().toLowerCase() === parsed.agentName.trim().toLowerCase(),
      );
      if (matched) resolvedId = matched.id;
    }

    setSelectedAgentId(resolvedId || "");
    setAgentNotes(parsed.notes || "");
    setAgentRulesError("");
  }, [activeChat?.id, activeChat?.auto_reply_directives, agents]);

  const saveAwayMode = async (enabled: boolean) => {
    if (!currentAccount || awayModeSaving) return;

    setAwayModeSaving(true);
    setLinkError("");
    try {
      await api(`/messaging/accounts/${currentAccount.id}/away`, {
        method: "PUT",
        body: JSON.stringify({
          enabled,
          message: "AutoMode IA activo",
          directives:
            awayDirectivesDraft.trim() || AUTO_MODE_DEFAULT_DIRECTIVES,
        }),
      });

      setAwayModeDraft(enabled);
      await loadAutoReplySummary(currentAccount.id);
      setAccounts((prev) =>
        prev.map((account) =>
          account.id === currentAccount.id
            ? {
                ...account,
                away_mode: enabled,
                away_message: "AutoMode IA activo",
                away_directives: awayDirectivesDraft,
              }
            : account,
        ),
      );
    } catch (err) {
      console.error("Failed to update away mode:", err);
      setLinkError("No se pudo actualizar el AutoMode.");
    } finally {
      setAwayModeSaving(false);
    }
  };

  const saveChatAgentRules = async (enabled: boolean) => {
    if (!activeChat || agentRulesSaving) return;

    if (enabled && !selectedAgentId) {
      setAgentRulesError("Selecciona un agente para activar AutoMode en este chat.");
      return;
    }

    const directives = enabled
      ? buildAgentDirectives(selectedAgent, agentNotes)
      : "";
    const chatId = activeChat.id;

    setAgentRulesSaving(true);
    setAgentRulesError("");
    try {
      await api(`/messaging/chats/${chatId}/rules`, {
        method: "PUT",
        body: JSON.stringify({
          auto_reply_enabled: enabled,
          auto_reply_directives: directives,
        }),
      });

      setActiveChat((prev) =>
        prev && prev.id === chatId
          ? {
              ...prev,
              auto_reply_enabled: enabled,
              auto_reply_directives: directives,
            }
          : prev,
      );

      setChats((prev) =>
        prev.map((chat) =>
          chat.id === chatId
            ? {
                ...chat,
                auto_reply_enabled: enabled,
                auto_reply_directives: directives,
              }
            : chat,
        ),
      );
    } catch (err) {
      console.error("Failed to update chat auto-reply rules:", err);
      setAgentRulesError("No se pudo guardar la regla del agente.");
    } finally {
      setAgentRulesSaving(false);
    }
  };

  const mentionMatch = newMessage.match(/@([^\s@]*)$/);
  const mentionQuery = mentionMatch ? mentionMatch[1].toLowerCase() : "";
  const mentionCandidates = mentionMatch
    ? agents.filter((agent) =>
        agent.name.toLowerCase().includes(mentionQuery),
      )
    : [];

  const handleMentionSelect = (agent: AgentInstance) => {
    setSelectedAgentId(agent.id);
    setAgentRulesError("");
    setNewMessage((prev) => prev.replace(/@([^\s@]*)$/, `@${agent.name} `));
    setTimeout(() => messageInputRef.current?.focus(), 0);
  };

  const stripLeadingAgentMention = (value: string): string => {
    const match = value.match(/^@([^\s]+)\s+/);
    if (!match) return value;
    const mentioned = (match[1] || "").trim().toLowerCase();
    const known = agents.some(
      (agent) => agent.name.trim().toLowerCase() === mentioned,
    );
    if (!known) return value;
    return value.slice(match[0].length).trim();
  };

  const unlinkCurrentAccount = async () => {
    if (!currentAccount || unlinking) return;

    const endpoint =
      activeTab === "telegram"
        ? "/messaging/telegram/unlink"
        : "/messaging/whatsapp/unlink";

    setUnlinking(true);
    setConfirmUnlink(false);
    try {
      await api(endpoint, { method: "DELETE" });
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
      setTelegramDeepLink("");
      if (qrPollRef.current) clearInterval(qrPollRef.current);
      if (telegramPollRef.current) clearInterval(telegramPollRef.current);
      if (warmupPollRef.current) clearInterval(warmupPollRef.current);
      hydratedChatsRef.current.clear();
      await loadAccounts();
    }
  };

  const handleLinkWhatsApp = async () => {
    await linkWhatsApp();
  };

  const handleLinkTelegram = async () => {
    await linkTelegram();
  };

  const formatPreview = (preview?: string) => {
    if (!preview) return "";
    if (preview === "[media]") return "Adjunto multimedia";
    if (preview === "[adjunto]") return "Adjunto multimedia";
    if (preview === "[imagen]") return "Imagen";
    if (preview === "[video]") return "Video";
    if (preview === "[audio]") return "Audio";
    if (preview === "[documento]") return "Documento";
    if (preview === "[sticker]") return "Sticker";
    return preview;
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday)
      return d.toLocaleTimeString("es-ES", {
        hour: "2-digit",
        minute: "2-digit",
      });
    return d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        Cargando...
      </div>
    );
  }

  return (
    <div className="flex-1 flex h-full">
      {/* Left sidebar - Chat list */}
      <div className="w-80 border-r border-gray-200 flex flex-col bg-white">
        {/* Header with tabs */}
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
              {confirmUnlink ? (
                <div className="flex items-center gap-1 ml-1">
                  <span className="text-[10px] text-gray-500">¿Seguro?</span>
                  <button
                    onClick={unlinkCurrentAccount}
                    disabled={unlinking}
                    className="text-[11px] text-red-500 hover:text-red-700 font-medium disabled:opacity-50"
                  >
                    {unlinking ? "..." : "Sí"}
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
                  title={`Cerrar sesión de ${activeTab === "telegram" ? "Telegram" : "WhatsApp"}`}
                >
                  Cerrar sesión
                </button>
              )}
            </>
          )}
        </div>

        {currentAccount?.status === "connected" && (
          <div className="px-3 py-2 border-b border-gray-100 bg-gray-50/70">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-gray-600">
                AutoMode IA
              </span>
              <button
                onClick={() => saveAwayMode(!awayModeDraft)}
                disabled={awayModeSaving}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${
                  awayModeDraft
                    ? "bg-violet-100 text-violet-700 hover:bg-violet-200"
                    : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                } disabled:opacity-50`}
              >
                {awayModeSaving
                  ? "Guardando..."
                  : awayModeDraft
                    ? "Activo"
                    : "Inactivo"}
              </button>
            </div>
            <textarea
              value={awayDirectivesDraft}
              onChange={(e) => setAwayDirectivesDraft(e.target.value)}
              onBlur={() => {
                if (awayModeDraft) {
                  saveAwayMode(true);
                }
              }}
              placeholder="Directrices IA: rol, tono y cómo responder cuando no estás."
              rows={3}
              className="mt-2 w-full px-2 py-1.5 text-[11px] bg-white rounded-md border border-gray-200 focus:outline-none focus:ring-1 focus:ring-violet-300 resize-none"
            />
            <div className="mt-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">
                  Últimas respuestas IA
                </span>
                {summaryLoading && (
                  <span className="text-[10px] text-gray-400">Actualizando...</span>
                )}
              </div>
              <div className="mt-1 max-h-28 overflow-y-auto space-y-1">
                {autoReplySummary.length === 0 ? (
                  <p className="text-[10px] text-gray-400">
                    Sin respuestas automáticas recientes.
                  </p>
                ) : (
                  autoReplySummary.slice(0, 6).map((item) => (
                    <div key={item.message_id} className="rounded-md bg-white border border-gray-200 px-2 py-1">
                      <p className="text-[10px] font-medium text-gray-700 truncate">
                        {item.contact_name}
                      </p>
                      <p className="text-[10px] text-gray-500 truncate">
                        {item.content || "[sin contenido]"}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Connect prompt or chat list */}
        {!currentAccount || currentAccount.status !== "connected" ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            {activeTab === "telegram" ? (
              showSetup && telegramDeepLink ? (
                <>
                  <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center mb-3">
                    <PaperAirplaneIcon className="w-6 h-6 text-blue-500" />
                  </div>
                  <p className="text-sm font-medium text-gray-900 mb-1">
                    Vincula tu Telegram
                  </p>
                  <p className="text-xs text-gray-500 mb-4 max-w-[220px]">
                    Se ha abierto el bot en otra pestaña. Pulsa en Start para confirmar el enlace.
                  </p>
                  <button
                    onClick={() => window.open(telegramDeepLink, "_blank", "noopener,noreferrer")}
                    className="px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 transition-colors"
                  >
                    Abrir Telegram
                  </button>
                  <p className="text-[10px] text-gray-400 mt-3">Esperando confirmación automática...</p>
                </>
              ) : (
                <>
                  <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center mb-3">
                    <PaperAirplaneIcon className="w-6 h-6 text-blue-500" />
                  </div>
                  <p className="text-sm font-medium text-gray-900 mb-1">
                    {currentAccount?.status === "disconnected"
                      ? "Telegram desconectado"
                      : "Conecta tu Telegram"}
                  </p>
                  <p className="text-xs text-gray-500 mb-4 max-w-[220px]">
                    Vincula tu bot de Telegram para recibir y responder mensajes desde Pulse.
                  </p>
                  {linkError && (
                    <p className="text-xs text-red-500 mb-3">{linkError}</p>
                  )}
                  <button
                    onClick={handleLinkTelegram}
                    disabled={telegramLinking}
                    className="px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors"
                  >
                    {telegramLinking
                      ? "Preparando enlace..."
                      : currentAccount?.status === "disconnected"
                        ? "Reconectar Telegram"
                        : "Vincular Telegram"}
                  </button>
                </>
              )
            ) : showSetup && qrCode ? (
              <>
                <QrCodeIcon className="w-8 h-8 text-green-500 mb-3" />
                <p className="text-sm font-medium text-gray-900 mb-2">
                  Escanea el QR con WhatsApp
                </p>
                <p className="text-[11px] text-gray-400 mb-3">
                  Abre WhatsApp &gt; Dispositivos vinculados &gt; Vincular dispositivo
                </p>
                <img
                  src={qrCode}
                  alt="QR"
                  className="w-48 h-48 rounded-lg mb-3"
                />
                <p className="text-[10px] text-gray-400 mb-2">
                  El QR se actualiza automáticamente
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
            ) : currentAccount && currentAccount.status === "disconnected" ? (
              <>
                <div className="w-12 h-12 rounded-full bg-orange-50 flex items-center justify-center mb-3">
                  <PhoneIcon className="w-6 h-6 text-orange-500" />
                </div>
                <p className="text-sm font-medium text-gray-900 mb-1">
                  WhatsApp desconectado
                </p>
                <p className="text-xs text-gray-500 mb-4 max-w-[220px]">
                  Tu sesión de WhatsApp fue cerrada desde el teléfono. Vuelve a vincular para reconectar.
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
                  Escanea un código QR para vincular tu WhatsApp.
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
          <div className="flex-1 overflow-y-auto">
            {chats.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full p-6 text-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center mb-3 ${
                    activeTab === "telegram" ? "bg-blue-50" : "bg-green-50"
                  }`}
                >
                  {activeTab === "telegram" ? (
                    <PaperAirplaneIcon className="w-5 h-5 text-blue-500" />
                  ) : (
                    <PhoneIcon className="w-5 h-5 text-green-500" />
                  )}
                </div>
                <p className="text-sm font-medium text-gray-700 mb-1">
                  {activeTab === "telegram" ? "Telegram conectado" : "WhatsApp conectado"}
                </p>
                <p className="text-xs text-gray-400 max-w-[200px]">
                  Las conversaciones aparecerán aquí cuando recibas o envíes mensajes.
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
                  {chat.contact_avatar_url ? (
                    <img
                      src={chat.contact_avatar_url}
                      alt={chat.contact_name}
                      className="w-10 h-10 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white font-medium text-sm shrink-0"
                      style={{ background: avatarGradient(chat.contact_name || chat.remote_jid) }}
                    >
                      {chat.contact_name?.[0]?.toUpperCase() || "?"}
                    </div>
                  )}
                  <div className="flex-1 min-w-0 text-left">
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-medium text-gray-900 truncate">
                        {chat.contact_name}
                      </span>
                      <span className="text-[10px] text-gray-400 shrink-0">
                        {chat.last_message_at
                          ? formatTime(chat.last_message_at)
                          : ""}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-[12px] text-gray-500 truncate">
                        {formatPreview(chat.last_message_preview)}
                      </span>
                      {chat.unread_count > 0 && (
                        <span
                          className={`ml-2 w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center shrink-0 ${
                            activeTab === "telegram" ? "bg-blue-500" : "bg-green-500"
                          }`}
                        >
                          {chat.unread_count > 99
                            ? "99+"
                            : chat.unread_count}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Right side - Conversation */}
      <div className="flex-1 flex flex-col bg-[#F0F0F0]">
        {activeChat ? (
          <>
            {/* Chat header */}
            <div className="bg-white border-b border-gray-200 px-4 py-2">
              <div className="flex items-center gap-3">
                {activeChat.contact_avatar_url ? (
                  <img
                    src={activeChat.contact_avatar_url}
                    alt={activeChat.contact_name}
                    className="w-8 h-8 rounded-full object-cover"
                  />
                ) : (
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white font-medium text-xs"
                    style={{ background: avatarGradient(activeChat.contact_name || activeChat.remote_jid) }}
                  >
                    {activeChat.contact_name?.[0]?.toUpperCase() || "?"}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-gray-900">
                    {activeChat.contact_name}
                  </div>
                  <div className="text-[11px] text-gray-500">
                    {activeChat.contact_phone || activeChat.remote_jid}
                  </div>
                </div>
                {activeChat.auto_reply_enabled && (
                  <span className="px-2 py-0.5 bg-violet-100 text-violet-600 text-[10px] font-medium rounded-full">
                    Auto-respuesta activa
                  </span>
                )}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <select
                  value={selectedAgentId}
                  onChange={(e) => {
                    setSelectedAgentId(e.target.value);
                    setAgentRulesError("");
                  }}
                  className="flex-1 px-2 py-1 text-[11px] bg-gray-50 rounded-md border border-gray-200 focus:outline-none focus:ring-1 focus:ring-violet-300"
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
                  onClick={() => saveChatAgentRules(activeChat.auto_reply_enabled !== true)}
                  disabled={agentRulesSaving}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${
                    activeChat.auto_reply_enabled
                      ? "bg-violet-600 text-white hover:bg-violet-700"
                      : "bg-violet-100 text-violet-700 hover:bg-violet-200"
                  } disabled:opacity-50`}
                >
                  {agentRulesSaving
                    ? "Guardando..."
                    : activeChat.auto_reply_enabled
                      ? "Auto ON"
                      : "Auto OFF"}
                </button>
              </div>
              <input
                value={agentNotes}
                onChange={(e) => {
                  setAgentNotes(e.target.value);
                  setAgentRulesError("");
                }}
                placeholder="Instrucciones extra para este agente en este chat"
                className="mt-2 w-full px-2 py-1 text-[11px] bg-gray-50 rounded-md border border-gray-200 focus:outline-none focus:ring-1 focus:ring-violet-300"
              />
              {agentRulesError && (
                <p className="mt-1 text-[10px] text-red-500">{agentRulesError}</p>
              )}
              <p className="mt-1 text-[10px] text-gray-400">
                Tip: escribe <span className="font-medium">@</span> en el mensaje para seleccionar agente rápido.
              </p>
            </div>

            {/* Messages */}
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
                    {(() => {
                      if (!msg.media_type) return null;

                      const objectUrl = resolvedMediaUrls[msg.id];
                      const isLoadingMedia = Boolean(mediaLoadingByMessage[msg.id]);
                      const mediaError = mediaErrorByMessage[msg.id];
                      const hasMeaningfulText = Boolean(
                        msg.content &&
                          !["[adjunto]", "[media]"].includes(msg.content.trim().toLowerCase()),
                      );
                      const shouldShowLabel =
                        msg.media_type !== "media" || !hasMeaningfulText;

                      return (
                        <div className="mb-1">
                          {shouldShowLabel && (
                            <p className="text-[11px] font-medium text-gray-500 mb-1">
                              {mediaLabel(msg.media_type)}
                            </p>
                          )}
                          {msg.media_type === "image" ? (
                            objectUrl ? (
                              <a href={objectUrl} target="_blank" rel="noreferrer" className="block">
                                <img
                                  src={objectUrl}
                                  alt="Imagen"
                                  className="max-w-[220px] max-h-[220px] rounded-lg object-cover"
                                />
                              </a>
                            ) : (
                              <button
                                onClick={() => fetchMediaForMessage(msg.id)}
                                disabled={isLoadingMedia}
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-700 underline disabled:opacity-60"
                              >
                                {isLoadingMedia ? "Cargando imagen..." : "Ver imagen"}
                              </button>
                            )
                          ) : msg.media_type === "video" ? (
                            objectUrl ? (
                              <video
                                controls
                                src={objectUrl}
                                className="max-w-[220px] max-h-[220px] rounded-lg"
                              />
                            ) : (
                              <button
                                onClick={() => fetchMediaForMessage(msg.id)}
                                disabled={isLoadingMedia}
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-700 underline disabled:opacity-60"
                              >
                                {isLoadingMedia ? "Cargando video..." : "Ver video"}
                              </button>
                            )
                          ) : msg.media_type === "audio" ? (
                            objectUrl ? (
                              <audio controls src={objectUrl} className="w-[220px]" />
                            ) : (
                              <button
                                onClick={() => fetchMediaForMessage(msg.id)}
                                disabled={isLoadingMedia}
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-700 underline disabled:opacity-60"
                              >
                                {isLoadingMedia ? "Cargando audio..." : "Reproducir audio"}
                              </button>
                            )
                          ) : (
                            <button
                              onClick={() => openMediaInNewTab(msg.id)}
                              disabled={isLoadingMedia}
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-700 underline disabled:opacity-60"
                            >
                              {isLoadingMedia
                                ? "Cargando adjunto..."
                                : `Abrir ${mediaLabel(msg.media_type)}`}
                            </button>
                          )}
                          {mediaError && (
                            <p className="text-[10px] text-red-500 mt-1">{mediaError}</p>
                          )}
                        </div>
                      );
                    })()}
                    {msg.content && (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    )}
                    <div
                      className={`text-[10px] mt-1 text-right ${
                        msg.direction === "out"
                          ? "text-green-600"
                          : "text-gray-400"
                      }`}
                    >
                      {formatTime(msg.created_at)}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
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
                <div className="flex-1 relative">
                  {mentionCandidates.length > 0 && (
                    <div className="absolute bottom-[calc(100%+6px)] left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-sm z-20 max-h-36 overflow-y-auto">
                      {mentionCandidates.slice(0, 6).map((agent) => (
                        <button
                          key={agent.id}
                          onClick={() => handleMentionSelect(agent)}
                          className="w-full text-left px-3 py-2 hover:bg-gray-50 text-[12px] text-gray-700"
                        >
                          @{agent.name}
                        </button>
                      ))}
                    </div>
                  )}
                  <textarea
                    ref={messageInputRef}
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
                    className="w-full px-3 py-2 text-[13px] bg-gray-50 rounded-xl border-0 focus:outline-none focus:ring-1 focus:ring-green-300 resize-none"
                  />
                </div>
                <button
                  onClick={sendMessage}
                  disabled={!newMessage.trim()}
                  className="p-2 rounded-lg bg-green-500 text-white hover:bg-green-600 disabled:opacity-40 transition-colors shrink-0"
                  title={pendingSends > 0 ? `Mensajes en cola: ${pendingSends}` : "Enviar"}
                >
                  <PaperAirplaneIcon className={`w-5 h-5 ${pendingSends > 0 ? "opacity-70" : ""}`} />
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
