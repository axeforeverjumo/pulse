import { useState, useEffect, useCallback, useRef, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useParams } from "react-router-dom";
import { Brain, Send, ArrowLeft, Loader2, Users, Building2, Plus, X, Check } from "lucide-react";
import { Icon } from "../ui/Icon";
import { api } from "../../api/client";
import { SIDEBAR } from "../../lib/sidebar";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface OpenClawAgent {
  id: string;
  name: string;
  description: string;
  tier: string;
  category: string;
  model: string;
  tools: string[];
  avatar_url?: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/* ------------------------------------------------------------------ */
/*  API helpers                                                        */
/* ------------------------------------------------------------------ */

async function fetchOpenClawAgents(workspaceId: string): Promise<OpenClawAgent[]> {
  const data = await api<{ agents: OpenClawAgent[] }>(
    `/openclaw-agents/?workspace_id=${workspaceId}`
  );
  return data.agents;
}

async function sendChatMessage(
  agentId: string,
  messages: ChatMessage[]
): Promise<ChatMessage> {
  const data = await api<{ message: ChatMessage }>(
    `/openclaw-agents/${agentId}/chat`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
    }
  );
  return data.message;
}

async function createAgent(payload: {
  name: string;
  expertise: string;
  tier: string;
  tools: string[];
}): Promise<{ agent: OpenClawAgent; message: string }> {
  return api<{ agent: OpenClawAgent; message: string }>(
    `/openclaw-agents/create`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );
}

/* ------------------------------------------------------------------ */
/*  Avatar component                                                   */
/* ------------------------------------------------------------------ */

function AgentAvatar({
  agent,
  size = "md",
}: {
  agent: OpenClawAgent;
  size?: "sm" | "md" | "lg";
}) {
  const sizeClasses = {
    sm: "w-7 h-7 text-xs",
    md: "w-8 h-8 text-sm",
    lg: "w-12 h-12 text-lg",
  };
  const initials = agent.name.charAt(0).toUpperCase();

  if (agent.avatar_url) {
    return (
      <img
        src={agent.avatar_url}
        alt={agent.name}
        className={`${sizeClasses[size]} rounded-full shrink-0 object-cover`}
      />
    );
  }

  return (
    <div
      className={`${sizeClasses[size]} rounded-full shrink-0 flex items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-bold`}
    >
      {initials}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab bar component                                                  */
/* ------------------------------------------------------------------ */

function SidebarTabBar({
  activeTab,
  onTabChange,
}: {
  activeTab: string;
  onTabChange: (tab: "agentes" | "oficina") => void;
}) {
  return (
    <div className="px-2 pt-2 pb-1 shrink-0">
      <div className="flex gap-1 bg-black/5 rounded-lg p-0.5">
        <button
          onClick={() => onTabChange("agentes")}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            activeTab === "agentes"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <Icon icon={Users} size={13} />
          Agentes
        </button>
        <button
          onClick={() => onTabChange("oficina")}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            activeTab === "oficina"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <Icon icon={Building2} size={13} />
          Oficina
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tier badge                                                         */
/* ------------------------------------------------------------------ */

function TierBadge({ tier }: { tier: string }) {
  const isAdvance = tier.toLowerCase().includes("advance") || tier.toLowerCase().includes("advanced");
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${
        isAdvance
          ? "bg-gradient-to-r from-purple-500 to-indigo-500 text-white"
          : "bg-blue-100 text-blue-700"
      }`}
    >
      {tier}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Agent Card                                                         */
/* ------------------------------------------------------------------ */

function AgentCard({
  agent,
  selected,
  onClick,
}: {
  agent: OpenClawAgent;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors cursor-pointer ${
        selected ? SIDEBAR.selected : `${SIDEBAR.item} hover:bg-black/5`
      }`}
    >
      <div className="flex items-start gap-2.5">
        <AgentAvatar agent={agent} size="md" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium truncate">{agent.name}</span>
            <TierBadge tier={agent.tier} />
          </div>
          <p className="text-[11px] text-text-tertiary truncate mt-0.5 leading-tight">
            {agent.description}
          </p>
          <span className="text-[10px] text-text-tertiary opacity-60">{agent.category}</span>
        </div>
      </div>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Create Agent Modal                                                 */
/* ------------------------------------------------------------------ */

const AVAILABLE_TOOLS = [
  { id: "web_search", label: "Buscar en la web", icon: "🌐" },
  { id: "memory", label: "Memoria persistente", icon: "🧠" },
  { id: "exec", label: "Ejecutar comandos", icon: "⚡" },
  { id: "read_write", label: "Leer/Escribir archivos", icon: "📁" },
  { id: "browser", label: "Navegar sitios web", icon: "🖥️" },
  { id: "google_drive", label: "Google Drive", icon: "📄" },
];

function CreateAgentModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (agent: OpenClawAgent) => void;
}) {
  const [step, setStep] = useState<"tier" | "form">("tier");
  const [tier, setTier] = useState<"core" | "advance">("core");
  const [name, setName] = useState("");
  const [expertise, setExpertise] = useState("");
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleTool = (toolId: string) => {
    setSelectedTools((prev) =>
      prev.includes(toolId) ? prev.filter((t) => t !== toolId) : [...prev, toolId]
    );
  };

  const handleSelectTier = (t: "core" | "advance") => {
    setTier(t);
    setStep("form");
  };

  const handleCreate = async () => {
    if (!name.trim() || !expertise.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const result = await createAgent({
        name: name.trim(),
        expertise: expertise.trim(),
        tier,
        tools: tier === "advance" ? selectedTools : [],
      });
      if (result.agent) {
        onCreated(result.agent);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error al crear el agente";
      setError(message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Crear agente</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {step === "tier" ? "Elige el tipo de agente" : `Configurar agente ${tier === "core" ? "Core" : "Advance"}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <Icon icon={X} size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-5">
          {step === "tier" ? (
            <div className="grid grid-cols-2 gap-3">
              {/* Core card */}
              <button
                onClick={() => handleSelectTier("core")}
                className="group text-left p-4 rounded-xl border-2 border-gray-200 hover:border-blue-400 hover:bg-blue-50/50 transition-all"
              >
                <div className="text-2xl mb-2">⭐</div>
                <div className="font-semibold text-gray-900 text-sm">Core</div>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                  Chat IA especializado. Solo conversación inteligente con personalidad propia.
                </p>
                <div className="mt-3 text-[10px] text-blue-600 font-medium uppercase tracking-wide">
                  Cualquier usuario
                </div>
              </button>

              {/* Advance card */}
              <button
                onClick={() => handleSelectTier("advance")}
                className="group text-left p-4 rounded-xl border-2 border-gray-200 hover:border-purple-400 hover:bg-purple-50/50 transition-all"
              >
                <div className="text-2xl mb-2">🚀</div>
                <div className="font-semibold text-gray-900 text-sm">Advance</div>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                  Con herramientas reales. Puede ejecutar acciones, buscar, leer archivos y más.
                </p>
                <div className="mt-3 text-[10px] text-purple-600 font-medium uppercase tracking-wide">
                  Requiere permiso admin
                </div>
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Back to tier selection */}
              <button
                onClick={() => setStep("tier")}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors -mt-1 mb-2"
              >
                <Icon icon={ArrowLeft} size={12} />
                Cambiar tipo
              </button>

              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej: Marco, Asistente Legal, TradingBot..."
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400/20 transition-colors"
                  disabled={creating}
                  autoFocus
                />
              </div>

              {/* Expertise */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ¿En qué es experto?
                </label>
                <textarea
                  value={expertise}
                  onChange={(e) => setExpertise(e.target.value)}
                  placeholder="Describe la especialidad del agente. Ej: Experto en derecho laboral español, ayuda a redactar contratos y resolver dudas legales..."
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400/20 transition-colors resize-none"
                  disabled={creating}
                />
              </div>

              {/* Tools (advance only) */}
              {tier === "advance" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Herramientas
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {AVAILABLE_TOOLS.map((tool) => (
                      <button
                        key={tool.id}
                        type="button"
                        onClick={() => toggleTool(tool.id)}
                        disabled={creating}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left text-xs transition-all ${
                          selectedTools.includes(tool.id)
                            ? "border-indigo-400 bg-indigo-50 text-indigo-700"
                            : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                        }`}
                      >
                        <span>{tool.icon}</span>
                        <span className="flex-1">{tool.label}</span>
                        {selectedTools.includes(tool.id) && (
                          <Icon icon={Check} size={12} className="text-indigo-500" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-600">
                  {error}
                </div>
              )}

              {/* Submit */}
              <button
                onClick={handleCreate}
                disabled={creating || !name.trim() || !expertise.trim()}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {creating ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Creando agente...
                  </>
                ) : (
                  <>
                    <Icon icon={Plus} size={14} />
                    Crear agente
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


/* ------------------------------------------------------------------ */
/*  Thinking states & bubble                                           */
/* ------------------------------------------------------------------ */

type ThinkingState = "connecting" | "processing" | "waiting" | null;

const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

function ThinkingBubble({
  agent,
  thinkingState,
  elapsedSeconds,
}: {
  agent: OpenClawAgent;
  thinkingState: ThinkingState;
  elapsedSeconds: number;
}) {
  const [expanded, setExpanded] = useState(false);

  if (!thinkingState) return null;

  return (
    <div className="flex gap-3 items-start">
      <div className="shrink-0 animate-pulse">
        <AgentAvatar agent={agent} size="sm" />
      </div>
      <div className="bg-gray-50 rounded-2xl rounded-bl-md px-4 py-3 max-w-md">
        {/* Animated dots + timer */}
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span className="font-medium">Pensando</span>
          <span className="flex gap-0.5 text-lg leading-none">
            <span className="animate-bounce inline-block" style={{ animationDelay: "0ms" }}>&middot;</span>
            <span className="animate-bounce inline-block" style={{ animationDelay: "150ms" }}>&middot;</span>
            <span className="animate-bounce inline-block" style={{ animationDelay: "300ms" }}>&middot;</span>
          </span>
          <span className="text-xs tabular-nums text-gray-400">{formatTime(elapsedSeconds)}</span>
        </div>

        {/* Collapsible activity log */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-[11px] text-gray-400 mt-1.5 flex items-center gap-1 hover:text-gray-500 transition-colors"
        >
          {expanded ? "▼" : "▶"} Ver actividad
        </button>
        {expanded && (
          <div className="mt-2 text-xs space-y-1">
            <div className={thinkingState === "connecting" ? "text-blue-500" : "text-green-500"}>
              {thinkingState === "connecting" ? "🔄" : "✓"} Conectando con {agent.name}...
            </div>
            {(thinkingState === "processing" || thinkingState === "waiting") && (
              <div className={thinkingState === "processing" ? "text-blue-500" : "text-green-500"}>
                {thinkingState === "processing" ? "🧠" : "✓"} Procesando tu mensaje...
              </div>
            )}
            {thinkingState === "waiting" && (
              <div className="text-blue-500">
                ⏳ Esperando respuesta del agente...
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Chat View                                                          */
/* ------------------------------------------------------------------ */

function AgentChatView({
  agent,
  onBack,
}: {
  agent: OpenClawAgent;
  onBack: () => void;
}) {
  const storageKey = `pulse-agent-chat-${agent.id}`;

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const saved = localStorage.getItem(storageKey);
    return saved ? JSON.parse(saved) : [];
  });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [thinkingState, setThinkingState] = useState<ThinkingState>(null);
  const [thinkingStartTime, setThinkingStartTime] = useState<number>(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const thinkingTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Persist messages to localStorage
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem(storageKey, JSON.stringify(messages));
    }
  }, [messages, storageKey]);

  // Load messages when switching agents
  useEffect(() => {
    const saved = localStorage.getItem(`pulse-agent-chat-${agent.id}`);
    setMessages(saved ? JSON.parse(saved) : []);
  }, [agent.id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, thinkingState]);

  // Elapsed timer for thinking state
  useEffect(() => {
    if (!thinkingState) {
      setElapsedSeconds(0);
      return;
    }
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - thinkingStartTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [thinkingState, thinkingStartTime]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = { role: "user", content: text };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput("");
    setLoading(true);
    setThinkingState("connecting");
    setThinkingStartTime(Date.now());

    // Clear any previous timers
    thinkingTimersRef.current.forEach(clearTimeout);
    thinkingTimersRef.current = [];

    // Progressive state transitions
    thinkingTimersRef.current.push(
      setTimeout(() => setThinkingState("processing"), 2000)
    );
    thinkingTimersRef.current.push(
      setTimeout(() => setThinkingState("waiting"), 5000)
    );

    try {
      const reply = await sendChatMessage(agent.id, updatedMessages);
      setMessages((prev) => [...prev, reply]);
    } catch (err) {
      console.error("Chat error:", err);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Error al obtener respuesta. Intenta de nuevo." },
      ]);
    } finally {
      thinkingTimersRef.current.forEach(clearTimeout);
      thinkingTimersRef.current = [];
      setThinkingState(null);
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-white">
      {/* Header */}
      <div className="h-12 flex items-center gap-3 px-4 border-b border-black/5 shrink-0">
        <button onClick={onBack} className="p-1 rounded hover:bg-black/5 transition-colors lg:hidden">
          <Icon icon={ArrowLeft} size={18} />
        </button>
        <AgentAvatar agent={agent} size="sm" />
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold truncate block">{agent.name}</span>
          <span className="text-[10px] text-text-tertiary">{agent.model}</span>
        </div>
        <TierBadge tier={agent.tier} />
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex-1 flex items-center justify-center h-full">
            <div className="text-center py-20">
              <div className="mx-auto mb-3 flex justify-center">
                <AgentAvatar agent={agent} size="lg" />
              </div>
              <p className="text-sm text-text-tertiary">{agent.description}</p>
              <p className="text-xs text-text-tertiary mt-2 opacity-60">Escribe un mensaje para comenzar</p>
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === "user"
                  ? "bg-indigo-600 text-white rounded-br-md"
                  : "bg-gray-100 text-gray-900 rounded-bl-md"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {thinkingState && (
          <ThinkingBubble
            agent={agent}
            thinkingState={thinkingState}
            elapsedSeconds={elapsedSeconds}
          />
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="px-4 pb-4 pt-2 shrink-0">
        <div className="flex items-center gap-2 bg-gray-50 border border-black/10 rounded-xl px-3 py-2 focus-within:border-indigo-400 transition-colors">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Escribe un mensaje..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="p-1.5 rounded-lg bg-indigo-600 text-white disabled:opacity-40 hover:bg-indigo-700 transition-colors"
          >
            <Icon icon={Send} size={14} />
          </button>
        </div>
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main AgentsView                                                    */
/* ------------------------------------------------------------------ */

export default function AgentsView() {
  const { workspaceId } = useParams<{ workspaceId: string }>();

  const [agents, setAgents] = useState<OpenClawAgent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<OpenClawAgent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"agentes" | "oficina">("agentes");
  const [showCreateModal, setShowCreateModal] = useState(false);

  const loadAgents = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchOpenClawAgents(workspaceId);
      setAgents(result);
    } catch (err) {
      console.error("Failed to load OpenClaw agents:", err);
      setError("No se pudieron cargar los agentes");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  const handleTabChange = (tab: "agentes" | "oficina") => {
    setActiveTab(tab);
    if (tab === "oficina") {
      setSelectedAgent(null);
    }
  };

  const handleAgentCreated = (agent: OpenClawAgent) => {
    setShowCreateModal(false);
    loadAgents().then(() => {
      setSelectedAgent(agent);
    });
  };

  const isOficina = activeTab === "oficina";

  return (
    <div className="flex-1 flex h-full overflow-hidden">
      <div className="flex-1 flex overflow-hidden bg-bg-mini-app">
        {/* Sidebar */}
        <div
          className={`w-[260px] shrink-0 flex flex-col overflow-hidden ${SIDEBAR.bg} border-r border-black/5 ${
            !isOficina && selectedAgent ? "hidden lg:flex" : "flex"
          }`}
        >
          {/* Tab bar */}
          <SidebarTabBar activeTab={activeTab} onTabChange={handleTabChange} />

          {/* Tab content */}
          {isOficina ? (
            <div className="flex-1 flex items-center justify-center px-4">
              <div className="text-center">
                <Icon icon={Building2} size={32} className="mx-auto text-text-tertiary opacity-50 mb-2" />
                <p className="text-sm text-text-tertiary">Oficina Virtual</p>
                <p className="text-[11px] text-text-tertiary opacity-60 mt-1">
                  Claw3D cargado en el panel principal
                </p>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto px-2">
              {/* Create agent button */}
              <div className="px-1 pt-2 pb-1">
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-gray-300 text-xs font-medium text-gray-500 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50/50 transition-all"
                >
                  <Icon icon={Plus} size={14} />
                  Crear agente
                </button>
              </div>

              {loading ? (
                <div className="px-4 py-8 text-center">
                  <Loader2 size={20} className="mx-auto animate-spin text-text-tertiary mb-2" />
                  <p className="text-sm text-text-tertiary">Cargando agentes...</p>
                </div>
              ) : error ? (
                <div className="px-4 py-8 text-center">
                  <p className="text-sm text-red-500">{error}</p>
                  <button
                    onClick={loadAgents}
                    className="mt-3 text-sm text-brand-primary hover:underline font-medium"
                  >
                    Reintentar
                  </button>
                </div>
              ) : agents.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <Icon icon={Brain} size={32} className="mx-auto text-text-tertiary opacity-50 mb-2" />
                  <p className="text-sm text-text-tertiary">No hay agentes disponibles</p>
                </div>
              ) : (
                <div className="space-y-0.5">
                  {agents.map((agent) => (
                    <AgentCard
                      key={agent.id}
                      agent={agent}
                      selected={selectedAgent?.id === agent.id}
                      onClick={() => setSelectedAgent(agent)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Main content */}
        <div
          className={`flex-1 flex min-w-0 overflow-hidden bg-white rounded-r-lg ${
            !isOficina && !selectedAgent ? "hidden lg:flex" : "flex"
          }`}
        >
          {isOficina ? (
            <iframe
              src="https://oficina.factoriaia.com/office"
              className="w-full h-full border-0"
              allow="microphone; camera"
              title="Oficina Virtual"
            />
          ) : selectedAgent ? (
            <AgentChatView
              key={selectedAgent.id}
              agent={selectedAgent}
              onBack={() => setSelectedAgent(null)}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <Icon icon={Brain} size={32} className="mx-auto text-text-tertiary opacity-50 mb-3" />
                <p className="text-sm text-text-tertiary">Selecciona un agente para comenzar</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create Agent Modal */}
      {showCreateModal && createPortal(
        <CreateAgentModal
          onClose={() => setShowCreateModal(false)}
          onCreated={handleAgentCreated}
        />,
        document.body
      )}
    </div>
  );
}
