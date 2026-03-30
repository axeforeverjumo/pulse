import { useState, useEffect, useCallback, useRef, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { Brain, Send, ArrowLeft, Loader2, Users, Building2 } from "lucide-react";
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
/*  Chat View                                                          */
/* ------------------------------------------------------------------ */

function AgentChatView({
  agent,
  onBack,
}: {
  agent: OpenClawAgent;
  onBack: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = { role: "user", content: text };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput("");
    setLoading(true);

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
        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 text-gray-500 rounded-2xl rounded-bl-md px-4 py-2.5 text-sm flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" />
              Pensando...
            </div>
          </div>
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
              src="https://openclaw.factoriaia.com"
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
    </div>
  );
}
