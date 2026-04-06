import { useState, useEffect, useRef, useMemo } from "react";
import { useParams } from "react-router-dom";
import { api, getWorkspaceAgents, type AgentInstance } from "../../api/client";
import { API_BASE } from "../../lib/apiBase";
import { useAuthStore } from "../../stores/authStore";
import { avatarGradient } from "../../utils/avatarGradient";
import {
  ArrowLeftIcon,
  PaperAirplaneIcon,
  PhoneIcon,
  SparklesIcon,
  QrCodeIcon,
  UserGroupIcon,
  BellSlashIcon,
} from "@heroicons/react/24/outline";
import { PlayIcon, PauseIcon } from "@heroicons/react/24/solid";

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
  remote_message_id?: string;
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
  gif: "GIF",
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

function formatAudioTime(totalSeconds: number): string {
  const safeSeconds = Number.isFinite(totalSeconds) && totalSeconds > 0 ? totalSeconds : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = Math.floor(safeSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function normalizeMessageTextForDedupe(value?: string): string {
  if (!value) return "";
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function dedupeLikelyEchoMessages(input: ExternalMessage[]): ExternalMessage[] {
  if (input.length <= 1) return input;

  const byRemoteId = new Map<string, ExternalMessage>();
  const noRemote: ExternalMessage[] = [];

  // First pass: collapse duplicates that share the same provider remote id.
  input.forEach((msg) => {
    const remoteId = (msg.remote_message_id || "").trim();
    if (!remoteId) {
      noRemote.push(msg);
      return;
    }
    const existing = byRemoteId.get(remoteId);
    if (!existing) {
      byRemoteId.set(remoteId, msg);
      return;
    }
    // Prefer explicit auto-reply metadata when the same provider event appears twice.
    if (msg.is_auto_reply && !existing.is_auto_reply) {
      byRemoteId.set(remoteId, msg);
    }
  });

  const merged = [...byRemoteId.values(), ...noRemote].sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  const deduped: ExternalMessage[] = [];
  for (const msg of merged) {
    const prev = deduped[deduped.length - 1];
    if (!prev) {
      deduped.push(msg);
      continue;
    }

    const sameDirection = prev.direction === "out" && msg.direction === "out";
    const sameText =
      normalizeMessageTextForDedupe(prev.content) ===
      normalizeMessageTextForDedupe(msg.content);
    const nearInTime =
      Math.abs(
        new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime(),
      ) <= 15_000;
    const oneAutoOneManual = prev.is_auto_reply !== msg.is_auto_reply;

    if (sameDirection && sameText && nearInTime && oneAutoOneManual) {
      // Keep only one visible bubble when provider/webhook echoed the same send.
      const preferred = prev.is_auto_reply ? prev : msg;
      deduped[deduped.length - 1] = preferred;
      continue;
    }

    deduped.push(msg);
  }

  return deduped;
}

function InlineAudioPlayer({
  src,
  mimeType,
  outgoing,
}: {
  src: string;
  mimeType?: string;
  outgoing: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoaded = () => {
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    };
    const handleTimeUpdate = () => {
      setCurrentTime(Number.isFinite(audio.currentTime) ? audio.currentTime : 0);
    };
    const handlePlay = () => setPlaying(true);
    const handlePause = () => setPlaying(false);
    const handleEnded = () => setPlaying(false);

    audio.addEventListener("loadedmetadata", handleLoaded);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("loadedmetadata", handleLoaded);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [src]);

  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      try {
        await audio.play();
      } catch (err) {
        console.error("Failed to play audio:", err);
      }
      return;
    }
    audio.pause();
  };

  const seek = (value: number) => {
    const audio = audioRef.current;
    if (!audio || duration <= 0) return;
    const bounded = Math.max(0, Math.min(100, value));
    audio.currentTime = (bounded / 100) * duration;
  };

  return (
    <div
      className={`w-[272px] rounded-2xl px-3 py-2 ${
        outgoing ? "bg-emerald-700 text-white" : "bg-slate-800 text-white"
      }`}
    >
      <audio ref={audioRef} preload="metadata" className="hidden">
        <source src={src} type={mimeType || "audio/ogg"} />
      </audio>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={togglePlayback}
          className="h-9 w-9 shrink-0 rounded-full bg-emerald-400/90 hover:bg-emerald-300 text-slate-900 flex items-center justify-center transition-colors"
          title={playing ? "Pausar audio" : "Reproducir audio"}
        >
          {playing ? <PauseIcon className="h-5 w-5" /> : <PlayIcon className="h-5 w-5 ml-0.5" />}
        </button>

        <div className="min-w-0 flex-1">
          <div className="relative h-7 overflow-hidden rounded-full bg-white/15">
            <div
              className="absolute inset-0 opacity-70"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(90deg, rgba(255,255,255,0.9) 0px, rgba(255,255,255,0.9) 3px, transparent 3px, transparent 8px)",
              }}
            />
            <div
              className="absolute inset-y-0 left-0 bg-emerald-300/70"
              style={{ width: `${progress}%` }}
            />
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={0.1}
            value={progress}
            onChange={(event) => seek(Number(event.target.value))}
            className="mt-1 h-1 w-full cursor-pointer accent-emerald-300"
            aria-label="Posición del audio"
          />
        </div>
      </div>

      <div className="mt-1 flex items-center justify-between text-[11px] text-white/80">
        <span>{formatAudioTime(currentTime)}</span>
        <span>{duration > 0 ? formatAudioTime(duration) : "--:--"}</span>
      </div>
    </div>
  );
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
  const [autoModeExpanded, setAutoModeExpanded] = useState(false);
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
  const [showSetup, setShowSetup] = useState(false);
  const [qrCode, setQrCode] = useState("");
  const [qrLoading, setQrLoading] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [linkError, setLinkError] = useState("");
  const [resolvedMediaUrls, setResolvedMediaUrls] = useState<Record<string, string>>({});
  const [mediaMimeByMessage, setMediaMimeByMessage] = useState<Record<string, string>>({});
  const [mediaLoadingByMessage, setMediaLoadingByMessage] = useState<Record<string, boolean>>({});
  const [mediaErrorByMessage, setMediaErrorByMessage] = useState<Record<string, string>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const resolvedMediaUrlsRef = useRef<Record<string, string>>({});
  const prefetchedMediaIdsRef = useRef<Set<string>>(new Set());
  const sendQueueRef = useRef<Promise<void>>(Promise.resolve());
  const postSendRefreshRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeChatIdRef = useRef<string | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const qrPollRef = useRef<NodeJS.Timeout | null>(null);
  const warmupPollRef = useRef<NodeJS.Timeout | null>(null);
  const hydratedChatsRef = useRef<Set<string>>(new Set());

  const currentAccount = useMemo(
    () => accounts.find((account) => account.provider === "whatsapp"),
    [accounts],
  );
  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId),
    [agents, selectedAgentId],
  );

  useEffect(() => {
    resolvedMediaUrlsRef.current = resolvedMediaUrls;
  }, [resolvedMediaUrls]);

  useEffect(() => {
    activeChatIdRef.current = activeChat?.id ?? null;
  }, [activeChat?.id]);

  useEffect(() => {
    return () => {
      Object.values(resolvedMediaUrlsRef.current).forEach((url) => {
        URL.revokeObjectURL(url);
      });
      if (postSendRefreshRef.current) clearTimeout(postSendRefreshRef.current);
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
  }, [accounts]);

  // Keep chat list fresh even when no conversation is selected.
  // Without this polling, incoming webhooks can write to DB but UI stays stale.
  useEffect(() => {
    const tabAccount = accounts.find((account) => account.provider === "whatsapp");
    if (!tabAccount || tabAccount.status !== "connected") return;

    const chatsPoll = setInterval(() => {
      loadChats();
    }, 2500);

    return () => clearInterval(chatsPoll);
  }, [accounts]);

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

    setMediaMimeByMessage((prev) => {
      const next: Record<string, string> = {};
      Object.entries(prev).forEach(([id, mime]) => {
        if (currentIds.has(id)) next[id] = mime;
      });
      return next;
    });

    prefetchedMediaIdsRef.current.forEach((id) => {
      if (!currentIds.has(id)) prefetchedMediaIdsRef.current.delete(id);
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
      setMediaMimeByMessage((prev) => ({
        ...prev,
        [messageId]: blob.type || "",
      }));
      return objectUrl;
    } catch (err) {
      const rawMessage = err instanceof Error ? err.message : "";
      const normalized = rawMessage.toLowerCase();
      let userMessage = "No se pudo cargar el adjunto.";
      const isExpired =
        normalized.includes("expirado") ||
        normalized.includes("410") ||
        normalized.includes("gone") ||
        normalized.includes("no disponible");
      if (isExpired) {
        userMessage = "Este adjunto ya no esta disponible en WhatsApp.";
      } else {
        console.error("Failed to fetch message media:", err);
      }
      setMediaErrorByMessage((prev) => ({
        ...prev,
        [messageId]: userMessage,
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

  useEffect(() => {
    const recentMediaIds = messages
      .filter((msg) => Boolean(msg.media_type))
      .slice(-8)
      .map((msg) => msg.id);

    const pendingMediaIds = recentMediaIds
      .filter(
        (id) =>
          !resolvedMediaUrls[id] &&
          !mediaLoadingByMessage[id] &&
          !mediaErrorByMessage[id] &&
          !prefetchedMediaIdsRef.current.has(id),
      );

    if (pendingMediaIds.length === 0) return;

    // Prioritize newest media first so the visible/latest conversation loads fast.
    const batch = pendingMediaIds.slice(-3).reverse();
    batch.forEach((id) => prefetchedMediaIdsRef.current.add(id));

    let cancelled = false;
    const warmMedia = async () => {
      await Promise.all(
        batch.map(async (mediaId) => {
          if (cancelled) return;
          await fetchMediaForMessage(mediaId);
        }),
      );
    };

    void warmMedia();
    return () => {
      cancelled = true;
    };
  }, [messages, resolvedMediaUrls, mediaLoadingByMessage, mediaErrorByMessage]);

  const loadChats = async () => {
    try {
      const data = await api<{ chats: ExternalChat[] }>(
        "/messaging/chats?provider=whatsapp",
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
      const incomingMessages = dedupeLikelyEchoMessages(data.messages || []);
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
    const tempId = `temp-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
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

    const schedulePostSendRefresh = (targetChatId: string) => {
      if (postSendRefreshRef.current) clearTimeout(postSendRefreshRef.current);
      postSendRefreshRef.current = setTimeout(() => {
        void (async () => {
          if (activeChatIdRef.current === targetChatId) {
            await loadMessages(targetChatId);
          }
          await loadChats();
        })();
      }, 250);
    };

    sendQueueRef.current = sendQueueRef.current
      .then(async () => {
        setPendingSends((prev) => prev + 1);
        try {
          await api(`/messaging/chats/${chatId}/send`, {
            method: "POST",
            body: JSON.stringify({ chat_id: chatId, content: text }),
          });
          schedulePostSendRefresh(chatId);
        } catch (err) {
          console.error("Failed to send:", err);
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === tempId ? { ...msg, status: "failed" } : msg,
            ),
          );
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

  // Clean up polling timers on unmount
  useEffect(() => {
    return () => {
      if (qrPollRef.current) clearInterval(qrPollRef.current);
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
      if (warmupPollRef.current) clearInterval(warmupPollRef.current);
      hydratedChatsRef.current.clear();
      await loadAccounts();
    }
  };

  const handleLinkWhatsApp = async () => {
    await linkWhatsApp();
  };

  const formatPreview = (preview?: string) => {
    if (!preview) return "";
    if (preview === "[media]") return "Adjunto multimedia";
    if (preview === "[adjunto]") return "Adjunto multimedia";
    if (preview === "[imagen]") return "Imagen";
    if (preview === "[video]") return "Video";
    if (preview === "[gif]") return "GIF";
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
    <div className="flex-1 flex h-full min-h-0 bg-gray-50 dark:bg-slate-950">
      {/* Left sidebar - Chat list */}
      <div
        className={`${
          activeChat ? "hidden md:flex" : "flex"
        } w-full md:w-[340px] md:min-w-[320px] md:max-w-[360px] border-r border-gray-100 dark:border-slate-800 flex-col bg-white dark:bg-slate-900`}
      >
        {/* Header */}
        <div className="h-14 border-b border-gray-100 dark:border-slate-700/60 flex items-center px-4 gap-2.5 bg-white dark:bg-slate-900">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200/70 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/50">
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              WhatsApp
            </span>
          </div>
          <div className="flex-1" />
          {currentAccount && (
            <>
              <div
                className={`relative flex items-center gap-1.5 ${
                  currentAccount.status === "connected" ? "group" : ""
                }`}
              >
                <span
                  className={`relative flex h-2 w-2 ${
                    currentAccount.status === "connected" ? "" : "hidden"
                  }`}
                >
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                {currentAccount.status !== "connected" && (
                  <span className="h-2 w-2 rounded-full bg-red-400"></span>
                )}
              </div>
              {confirmUnlink ? (
                <div className="flex items-center gap-1.5 ml-1 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 rounded-lg px-2 py-1">
                  <span className="text-[10px] text-red-600 dark:text-red-400 font-medium">¿Cerrar sesión?</span>
                  <button
                    onClick={unlinkCurrentAccount}
                    disabled={unlinking}
                    className="text-[11px] text-red-600 dark:text-red-400 hover:text-red-800 font-semibold disabled:opacity-50 transition-colors"
                  >
                    {unlinking ? "..." : "Sí"}
                  </button>
                  <span className="text-red-300 dark:text-red-700">·</span>
                  <button
                    onClick={() => setConfirmUnlink(false)}
                    className="text-[11px] text-gray-500 dark:text-gray-400 hover:text-gray-700 transition-colors"
                  >
                    No
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmUnlink(true)}
                  className="text-[10px] text-gray-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400 transition-colors ml-0.5 px-1.5 py-0.5 rounded hover:bg-red-50 dark:hover:bg-red-950/20"
                  title="Cerrar sesión de WhatsApp"
                >
                  Salir
                </button>
              )}
            </>
          )}
        </div>

        {currentAccount?.status === "connected" && (
          <div className="border-b border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900">
            {/* AutoMode compact row — always visible */}
            <div className="flex items-center gap-2 px-4 py-2">
              <button
                type="button"
                onClick={() => setAutoModeExpanded((v) => !v)}
                className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
              >
                <SparklesIcon className={`w-3.5 h-3.5 shrink-0 ${awayModeDraft ? "text-violet-500" : "text-gray-400"}`} />
                <span className="text-[11px] font-medium text-gray-600 dark:text-slate-400">AutoMode</span>
                {awayModeDraft && (
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-500 shrink-0" />
                )}
                <svg className={`w-3 h-3 text-gray-400 ml-auto transition-transform ${autoModeExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </button>
              {/* Toggle switch */}
              <button
                type="button"
                onClick={() => saveAwayMode(!awayModeDraft)}
                disabled={awayModeSaving}
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${
                  awayModeDraft ? "bg-violet-500" : "bg-gray-200 dark:bg-slate-700"
                }`}
                role="switch"
                aria-checked={awayModeDraft}
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${awayModeDraft ? "translate-x-4.5" : "translate-x-0.5"}`} />
              </button>
            </div>

            {/* Expanded content */}
            {autoModeExpanded && (
              <div className="px-4 pb-3 space-y-2 border-t border-gray-50 dark:border-slate-800 pt-2">
                <textarea
                  value={awayDirectivesDraft}
                  onChange={(e) => setAwayDirectivesDraft(e.target.value)}
                  onBlur={() => { if (awayModeDraft) saveAwayMode(true); }}
                  placeholder="Rol, tono y cómo responder en tu ausencia..."
                  rows={2}
                  className="w-full px-2.5 py-1.5 text-[11px] bg-gray-50 dark:bg-slate-800/60 rounded-lg border border-gray-200 dark:border-slate-700/50 focus:outline-none focus:ring-1 focus:ring-violet-300 resize-none placeholder-gray-400"
                />
                <div>
                  <p className="text-[9px] uppercase tracking-widest text-gray-400 font-semibold mb-1">
                    Últimas respuestas {summaryLoading && <span className="normal-case">·</span>}
                  </p>
                  <div className="max-h-20 overflow-y-auto space-y-1">
                    {autoReplySummary.length === 0 ? (
                      <p className="text-[10px] text-gray-400 italic">Sin respuestas recientes.</p>
                    ) : (
                      autoReplySummary.slice(0, 4).map((item) => (
                        <div key={item.message_id} className="flex items-start gap-1.5 rounded bg-gray-50 px-2 py-1">
                          <div className="mt-1 w-1 h-1 rounded-full bg-violet-400 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-[10px] font-medium text-gray-600 truncate">{item.contact_name}</p>
                            <p className="text-[10px] text-gray-400 truncate">{item.content || "[sin contenido]"}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Connect prompt or chat list */}
        {!currentAccount || currentAccount.status !== "connected" ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            {showSetup && qrCode ? (
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
          <div className="flex-1 overflow-y-auto bg-white dark:bg-slate-900">
            {chats.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full p-6 text-center">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3 bg-emerald-50 dark:bg-emerald-950/30">
                  <PhoneIcon className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />
                </div>
                <p className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1">
                  WhatsApp conectado
                </p>
                <p className="text-xs text-gray-400 dark:text-slate-500 max-w-[200px]">
                  Las conversaciones aparecerán aquí cuando recibas o envíes mensajes.
                </p>
              </div>
            ) : (
              chats.map((chat) => {
                const isSelected = activeChat?.id === chat.id;
                const hasUnread = chat.unread_count > 0;
                return (
                  <button
                    key={chat.id}
                    onClick={() => setActiveChat(chat)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 transition-all relative border-b border-gray-50 dark:border-slate-800/60 group
                      ${isSelected
                        ? "bg-gray-50 dark:bg-slate-800/50 border-l-2 border-l-emerald-500"
                        : "hover:bg-gray-50/80 dark:hover:bg-slate-800/30 border-l-2 border-l-transparent"
                      }`}
                  >
                    {/* Avatar */}
                    {chat.is_group ? (
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 ring-1 ring-black/5 dark:ring-white/5"
                        style={{ background: avatarGradient(chat.contact_name || chat.remote_jid) }}
                      >
                        <UserGroupIcon className="w-5 h-5 text-white/90" />
                      </div>
                    ) : chat.contact_avatar_url ? (
                      <img
                        src={chat.contact_avatar_url}
                        alt={chat.contact_name}
                        className="w-10 h-10 rounded-full object-cover shrink-0 ring-1 ring-black/5 dark:ring-white/5"
                      />
                    ) : (
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm shrink-0 ring-1 ring-black/5 dark:ring-white/5"
                        style={{ background: avatarGradient(chat.contact_name || chat.remote_jid) }}
                      >
                        {chat.contact_name?.[0]?.toUpperCase() || "?"}
                      </div>
                    )}

                    <div className="flex-1 min-w-0 text-left">
                      {/* Name row */}
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className={`text-[13px] truncate ${
                            hasUnread
                              ? "font-semibold text-gray-900 dark:text-slate-100"
                              : "font-medium text-gray-800 dark:text-slate-200"
                          }`}>
                            {chat.contact_name}
                          </span>
                          {chat.is_group && (
                            <span className="shrink-0 px-1.5 py-px text-[9px] font-semibold rounded uppercase tracking-wide bg-gray-100 text-gray-500 dark:bg-slate-700/70 dark:text-slate-400 border border-gray-200/70 dark:border-slate-600/50">
                              Grupo
                            </span>
                          )}
                          {chat.muted && (
                            <BellSlashIcon className="w-3 h-3 text-gray-400 dark:text-slate-500 shrink-0" />
                          )}
                        </div>
                        <span className={`text-[10px] shrink-0 ${
                          hasUnread ? "text-emerald-600 dark:text-emerald-400 font-medium" : "text-gray-400 dark:text-slate-500"
                        }`}>
                          {chat.last_message_at ? formatTime(chat.last_message_at) : ""}
                        </span>
                      </div>

                      {/* Preview row */}
                      <div className="flex items-center justify-between gap-1 mt-0.5">
                        <span className={`text-[11.5px] truncate ${
                          hasUnread
                            ? "text-gray-700 dark:text-slate-300"
                            : "text-gray-400 dark:text-slate-500"
                        }`}>
                          {formatPreview(chat.last_message_preview)}
                        </span>
                        {hasUnread && (
                          <span className="ml-1.5 min-w-[18px] h-[18px] px-1 rounded-full text-white text-[10px] font-bold flex items-center justify-center shrink-0 bg-emerald-500 dark:bg-emerald-600 shadow-sm">
                            {chat.unread_count > 99 ? "99+" : chat.unread_count}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Right side - Conversation */}
      <div
        className={`${
          activeChat ? "flex" : "hidden md:flex"
        } flex-1 min-w-0 flex-col bg-gray-50 dark:bg-slate-950`}
      >
        {activeChat ? (
          <>
            {/* Chat header */}
            <div className="bg-white dark:bg-slate-900 border-b border-gray-100 dark:border-slate-700/60 px-3 md:px-4 py-2.5">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setActiveChat(null)}
                  className="md:hidden p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  title="Volver a chats"
                >
                  <ArrowLeftIcon className="w-4 h-4" />
                </button>

                {/* Avatar — larger, group-aware */}
                {activeChat.is_group ? (
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0 ring-1 ring-black/5 dark:ring-white/5"
                    style={{ background: avatarGradient(activeChat.contact_name || activeChat.remote_jid) }}
                  >
                    <UserGroupIcon className="w-5 h-5 text-white/90" />
                  </div>
                ) : activeChat.contact_avatar_url ? (
                  <img
                    src={activeChat.contact_avatar_url}
                    alt={activeChat.contact_name}
                    className="w-9 h-9 rounded-full object-cover shrink-0 ring-1 ring-black/5 dark:ring-white/5"
                  />
                ) : (
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-white font-semibold text-sm shrink-0 ring-1 ring-black/5 dark:ring-white/5"
                    style={{ background: avatarGradient(activeChat.contact_name || activeChat.remote_jid) }}
                  >
                    {activeChat.contact_name?.[0]?.toUpperCase() || "?"}
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[13px] font-semibold text-gray-900 dark:text-slate-100 truncate">
                      {activeChat.contact_name}
                    </span>
                    {activeChat.is_group && (
                      <span className="shrink-0 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide rounded bg-gray-100 text-gray-500 dark:bg-slate-700/70 dark:text-slate-400 border border-gray-200/70 dark:border-slate-600/50">
                        Grupo
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-gray-400 dark:text-slate-500 truncate">
                    {activeChat.contact_phone || activeChat.remote_jid}
                  </div>
                </div>

                {/* Auto-reply status pill */}
                {activeChat.auto_reply_enabled && (
                  <span className="flex items-center gap-1 px-2 py-0.5 bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400 text-[10px] font-semibold rounded-full border border-violet-200/70 dark:border-violet-800/50 shrink-0">
                    <SparklesIcon className="w-2.5 h-2.5" />
                    IA activa
                  </span>
                )}
              </div>

              {/* Agent controls row */}
              <div className="mt-2.5 flex items-center gap-2">
                <select
                  value={selectedAgentId}
                  onChange={(e) => {
                    setSelectedAgentId(e.target.value);
                    setAgentRulesError("");
                  }}
                  className="flex-1 px-2.5 py-1.5 text-[11px] bg-gray-50 dark:bg-slate-800/60 rounded-lg border border-gray-200 dark:border-slate-700/50 focus:outline-none focus:ring-1 focus:ring-violet-300 dark:focus:ring-violet-700 text-gray-700 dark:text-slate-300 transition-colors appearance-none"
                >
                  <option value="">
                    {agentsLoading
                      ? "Cargando agentes..."
                      : agents.length > 0
                        ? "Agente para este chat..."
                        : "Sin agentes en el workspace"}
                  </option>
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                    </option>
                  ))}
                </select>

                {/* Auto toggle pill */}
                <button
                  onClick={() => saveChatAgentRules(activeChat.auto_reply_enabled !== true)}
                  disabled={agentRulesSaving}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-lg transition-all disabled:opacity-50 shrink-0 ${
                    activeChat.auto_reply_enabled
                      ? "bg-violet-600 text-white hover:bg-violet-700 shadow-sm shadow-violet-200 dark:shadow-violet-900/30"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
                  }`}
                >
                  <SparklesIcon className="w-3 h-3" />
                  {agentRulesSaving
                    ? "..."
                    : activeChat.auto_reply_enabled
                      ? "Auto ON"
                      : "Auto OFF"}
                </button>
              </div>

              {/* Extra instructions */}
              <input
                value={agentNotes}
                onChange={(e) => {
                  setAgentNotes(e.target.value);
                  setAgentRulesError("");
                }}
                placeholder="Instrucciones extra para el agente en este chat..."
                className="mt-1.5 w-full px-2.5 py-1.5 text-[11px] bg-gray-50 dark:bg-slate-800/60 rounded-lg border border-gray-200 dark:border-slate-700/50 focus:outline-none focus:ring-1 focus:ring-violet-300 dark:focus:ring-violet-700 text-gray-700 dark:text-slate-300 placeholder-gray-400 dark:placeholder-slate-500 transition-colors"
              />
              {agentRulesError && (
                <p className="mt-1 text-[10px] text-red-500 dark:text-red-400">{agentRulesError}</p>
              )}
              <p className="mt-1 text-[10px] text-gray-400 dark:text-slate-500">
                Escribe <span className="font-semibold text-gray-500 dark:text-slate-400">@</span> para seleccionar agente rápidamente.
              </p>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-3 md:px-5 py-4 space-y-1">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.direction === "out" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[88%] md:max-w-[70%] px-3 py-2 rounded-2xl text-[13px] leading-relaxed ${
                      msg.direction === "out"
                        ? msg.is_auto_reply
                          ? "bg-violet-50 border border-violet-100 text-violet-900 dark:bg-violet-950/30 dark:border-violet-800/40 dark:text-violet-200 rounded-br-sm"
                          : "bg-emerald-50 border border-emerald-100 text-gray-900 dark:bg-emerald-950/30 dark:border-emerald-800/40 dark:text-slate-100 rounded-br-sm"
                        : "bg-white border border-gray-100 text-gray-900 shadow-sm dark:bg-slate-800 dark:border-slate-700/60 dark:text-slate-100 rounded-bl-sm"
                    }`}
                  >
                    {/* Group sender name for incoming messages */}
                    {msg.direction === "in" && activeChat.is_group && msg.sender_name && (
                      <div className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 mb-0.5 truncate">
                        {msg.sender_name}
                      </div>
                    )}
                    {msg.is_auto_reply && (
                      <div className="flex items-center gap-1 text-[10px] text-violet-500 dark:text-violet-400 font-semibold mb-1">
                        <SparklesIcon className="w-3 h-3" />
                        <span>IA</span>
                      </div>
                    )}
                    {(() => {
                      if (!msg.media_type) return null;

                      const objectUrl = resolvedMediaUrls[msg.id];
                      const mimeType = mediaMimeByMessage[msg.id] || "";
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
                                  className="max-w-[280px] max-h-[320px] rounded-xl object-cover"
                                />
                              </a>
                            ) : (
                              <div className="inline-flex items-center rounded-lg bg-gray-100 px-3 py-2 text-[11px] text-gray-600">
                                {isLoadingMedia ? "Cargando imagen..." : "Preparando imagen..."}
                              </div>
                            )
                          ) : msg.media_type === "video" ? (
                            objectUrl ? (
                              <video
                                controls
                                src={objectUrl}
                                className="max-w-[280px] max-h-[320px] rounded-xl bg-black"
                              />
                            ) : (
                              <div className="inline-flex items-center rounded-lg bg-gray-100 px-3 py-2 text-[11px] text-gray-600">
                                {isLoadingMedia ? "Cargando video..." : "Preparando video..."}
                              </div>
                            )
                          ) : msg.media_type === "gif" ? (
                            objectUrl ? (
                              mimeType.startsWith("image/") ? (
                                <img
                                  src={objectUrl}
                                  alt="GIF"
                                  className="max-w-[280px] max-h-[320px] rounded-xl object-cover"
                                />
                              ) : (
                                <video
                                  autoPlay
                                  loop
                                  muted
                                  playsInline
                                  src={objectUrl}
                                  className="max-w-[280px] max-h-[320px] rounded-xl bg-black"
                                />
                              )
                            ) : (
                              <div className="inline-flex items-center rounded-lg bg-gray-100 px-3 py-2 text-[11px] text-gray-600">
                                {isLoadingMedia ? "Cargando GIF..." : "Preparando GIF..."}
                              </div>
                            )
                          ) : msg.media_type === "audio" ? (
                            objectUrl ? (
                              <InlineAudioPlayer
                                src={objectUrl}
                                mimeType={mimeType}
                                outgoing={msg.direction === "out"}
                              />
                            ) : (
                              <div className="inline-flex items-center rounded-lg bg-gray-100 px-3 py-2 text-[11px] text-gray-600">
                                {isLoadingMedia ? "Cargando audio..." : "Preparando audio..."}
                              </div>
                            )
                          ) : (
                            objectUrl ? (
                              <button
                                onClick={() => openMediaInNewTab(msg.id)}
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-700 underline"
                              >
                                {`Abrir ${mediaLabel(msg.media_type)}`}
                              </button>
                            ) : (
                              <div className="inline-flex items-center rounded-lg bg-gray-100 px-3 py-2 text-[11px] text-gray-600">
                                {isLoadingMedia ? "Cargando adjunto..." : "Preparando adjunto..."}
                              </div>
                            )
                          )}
                          {mediaError && (
                            <div className="mt-1 flex items-center gap-2">
                              <p className="text-[10px] text-red-500">{mediaError}</p>
                              {!mediaError.toLowerCase().includes("no esta disponible") && (
                                <button
                                  type="button"
                                  onClick={() => fetchMediaForMessage(msg.id)}
                                  className="text-[10px] font-medium text-sky-700 underline"
                                >
                                  Reintentar
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                    {msg.content &&
                      ![
                        "[audio]",
                        "[video]",
                        "[gif]",
                        "[imagen]",
                        "[documento]",
                        "[sticker]",
                        "[adjunto]",
                        "[media]",
                      ].includes(msg.content.trim().toLowerCase()) && (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    )}
                    <div
                      className={`text-[10px] mt-1 text-right tabular-nums ${
                        msg.direction === "out"
                          ? msg.is_auto_reply
                            ? "text-violet-400 dark:text-violet-500"
                            : "text-emerald-500 dark:text-emerald-600"
                          : "text-gray-300 dark:text-slate-500"
                      }`}
                    >
                      {formatTime(msg.created_at)}
                      {msg.direction === "out" && msg.status === "pending" && (
                        <span className="ml-1 opacity-60">·</span>
                      )}
                      {msg.direction === "out" && msg.status === "failed" && (
                        <span className="ml-1 text-red-400">!</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Composer */}
            <div className="bg-white dark:bg-slate-900 border-t border-gray-100 dark:border-slate-700/60 px-3 md:px-4 py-3">
              <div className="flex items-end gap-2">
                {/* Suggest button */}
                <button
                  onClick={suggestReply}
                  disabled={suggesting}
                  className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/30 border border-violet-200/60 dark:border-violet-800/40 transition-all disabled:opacity-50 shrink-0 group"
                  title="Sugerir respuesta con IA"
                >
                  <SparklesIcon
                    className={`w-4 h-4 ${suggesting ? "animate-pulse" : "group-hover:scale-110 transition-transform"}`}
                  />
                  <span className="hidden md:inline text-[11px] font-medium">
                    {suggesting ? "..." : "Sugerir"}
                  </span>
                </button>

                <div className="flex-1 relative">
                  {/* Mention dropdown */}
                  {mentionCandidates.length > 0 && (
                    <div className="absolute bottom-[calc(100%+8px)] left-0 right-0 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-lg dark:shadow-slate-900/50 z-20 max-h-36 overflow-y-auto">
                      {mentionCandidates.slice(0, 6).map((agent) => (
                        <button
                          key={agent.id}
                          onClick={() => handleMentionSelect(agent)}
                          className="w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-slate-700/50 text-[12px] text-gray-700 dark:text-slate-300 first:rounded-t-xl last:rounded-b-xl transition-colors"
                        >
                          <span className="text-violet-500 dark:text-violet-400">@</span>{agent.name}
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
                    placeholder="Escribe un mensaje... (Enter para enviar)"
                    rows={1}
                    className="w-full px-3.5 py-2 text-[13px] bg-gray-50 dark:bg-slate-800/60 text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 rounded-xl border border-gray-200 dark:border-slate-700/50 focus:outline-none focus:ring-1 focus:ring-emerald-300 dark:focus:ring-emerald-700 focus:border-emerald-300 dark:focus:border-emerald-700 resize-none transition-colors"
                  />
                </div>

                {/* Send button */}
                <button
                  onClick={sendMessage}
                  disabled={!newMessage.trim()}
                  className={`p-2.5 rounded-xl transition-all shrink-0 ${
                    newMessage.trim()
                      ? "bg-emerald-500 hover:bg-emerald-600 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white shadow-sm shadow-emerald-200 dark:shadow-emerald-900/30 scale-100 hover:scale-105"
                      : "bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-slate-500 opacity-50"
                  }`}
                  title={pendingSends > 0 ? `Mensajes en cola: ${pendingSends}` : "Enviar"}
                >
                  <PaperAirplaneIcon className={`w-4 h-4 ${pendingSends > 0 ? "opacity-70" : ""}`} />
                </button>
              </div>
              {pendingSends > 0 && (
                <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-1.5">
                  {pendingSends} mensaje{pendingSends > 1 ? "s" : ""} en cola...
                </p>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 dark:text-slate-600 gap-3">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-slate-800/50 flex items-center justify-center">
              <PhoneIcon className="w-8 h-8 text-gray-300 dark:text-slate-600" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-gray-500 dark:text-slate-400">Selecciona una conversación</p>
              <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">Elige un chat de la lista para continuar</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
