import { useMemo } from "react";
import { useWorkspaceAgents } from "../../../hooks/queries/useProjects";
import type { OpenClawAgent } from "../../../api/client";

/* ── Tier visual config ── */
const TIER_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  core: {
    label: "Core",
    color: "text-blue-700",
    bg: "bg-blue-50",
    border: "border-blue-200",
  },
  advance: {
    label: "Advance",
    color: "text-violet-700",
    bg: "bg-violet-50",
    border: "border-violet-200",
  },
  claude_code: {
    label: "Claude Code",
    color: "text-emerald-700",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
  },
};

const TIER_GRADIENT: Record<string, string> = {
  core: "linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)",
  advance: "linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)",
  claude_code: "linear-gradient(135deg, #10B981 0%, #059669 100%)",
};

/* ── Category labels (Spanish) ── */
const CATEGORY_LABELS: Record<string, string> = {
  general: "General",
  desarrollo: "Desarrollo",
  engineering: "Desarrollo",
  marketing: "Marketing",
  ventas: "Ventas",
  soporte: "Soporte",
  legal: "Legal",
  finanzas: "Finanzas",
  educacion: "Educacion",
  trading: "Trading",
  oficina: "Oficina",
  research: "Investigacion",
  content: "Contenido",
};

function getCategoryLabel(cat: string): string {
  return CATEGORY_LABELS[cat.toLowerCase()] || cat.charAt(0).toUpperCase() + cat.slice(1);
}

function getTierConfig(tier?: string) {
  return TIER_CONFIG[tier || ""] || {
    label: tier || "Agent",
    color: "text-gray-700",
    bg: "bg-gray-50",
    border: "border-gray-200",
  };
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/* ── Agent card ── */
function AgentCard({ agent }: { agent: OpenClawAgent }) {
  const tier = getTierConfig(agent.tier);
  const gradient = TIER_GRADIENT[agent.tier || ""] || "linear-gradient(135deg, #6B7280 0%, #9CA3AF 100%)";
  const isActive = agent.is_active !== false; // default to active if undefined

  return (
    <div
      className={`relative flex flex-col items-center rounded-xl border ${tier.border} bg-white p-4 shadow-sm hover:shadow-md transition-shadow min-w-[140px]`}
    >
      {/* Status dot */}
      <div
        className={`absolute top-3 right-3 w-2.5 h-2.5 rounded-full ${
          isActive ? "bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.5)]" : "bg-gray-300"
        }`}
        title={isActive ? "Activo" : "Inactivo"}
      />

      {/* Avatar */}
      <div className="relative mb-3">
        {agent.avatar_url ? (
          <img
            src={agent.avatar_url}
            alt={agent.name}
            className="w-14 h-14 rounded-full object-cover ring-2 ring-white shadow"
          />
        ) : (
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-lg shadow ring-2 ring-white"
            style={{ background: gradient }}
          >
            {getInitials(agent.name)}
          </div>
        )}
      </div>

      {/* Name */}
      <h4 className="text-sm font-semibold text-gray-900 text-center leading-tight mb-1">
        {agent.name}
      </h4>

      {/* Description */}
      {agent.description && (
        <p className="text-[11px] text-gray-500 text-center line-clamp-2 mb-2 max-w-[160px]">
          {agent.description}
        </p>
      )}

      {/* Tier badge */}
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${tier.bg} ${tier.color}`}
      >
        {tier.label}
      </span>
    </div>
  );
}

/* ── Category group ── */
function CategoryGroup({
  category,
  agents,
}: {
  category: string;
  agents: OpenClawAgent[];
}) {
  const label = getCategoryLabel(category);

  return (
    <div className="flex flex-col items-center">
      {/* Category header */}
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
          <span className="text-sm">
            {getCategoryEmoji(category)}
          </span>
        </div>
        <span className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
          {label}
        </span>
        <span className="text-xs text-gray-400 font-normal">
          ({agents.length})
        </span>
      </div>

      {/* Agent cards grid */}
      <div className="flex flex-wrap justify-center gap-3">
        {agents.map((agent) => (
          <AgentCard key={agent.id} agent={agent} />
        ))}
      </div>
    </div>
  );
}

function getCategoryEmoji(cat: string): string {
  const map: Record<string, string> = {
    general: "\u{1F4BC}",       // briefcase
    desarrollo: "\u{1F4BB}",    // laptop
    engineering: "\u{1F4BB}",
    marketing: "\u{1F4E3}",     // megaphone
    ventas: "\u{1F4C8}",        // chart increasing
    soporte: "\u{1F3A7}",       // headphones
    legal: "\u{2696}\u{FE0F}",  // balance scale
    finanzas: "\u{1F4B0}",      // money bag
    educacion: "\u{1F4DA}",     // books
    trading: "\u{1F4CA}",       // bar chart
    oficina: "\u{1F3E2}",       // office
    research: "\u{1F50D}",      // magnifying glass
    content: "\u{270D}\u{FE0F}",// writing hand
  };
  return map[cat.toLowerCase()] || "\u{1F916}"; // robot fallback
}

/* ── Connector line (decorative) ── */
function ConnectorLine() {
  return (
    <div className="flex justify-center">
      <div className="w-px h-6 bg-gray-200" />
    </div>
  );
}

/* ── Main panel ── */
interface OrgChartPanelProps {
  workspaceId: string | null;
  workspaceName?: string;
}

export default function OrgChartPanel({ workspaceId, workspaceName }: OrgChartPanelProps) {
  const { data: agents = [], isLoading } = useWorkspaceAgents(workspaceId);

  // Group agents by category
  const grouped = useMemo(() => {
    const map: Record<string, OpenClawAgent[]> = {};
    for (const agent of agents) {
      const cat = (agent.category || "general").toLowerCase();
      if (!map[cat]) map[cat] = [];
      map[cat].push(agent);
    }
    // Sort categories: non-general first, general last
    const entries = Object.entries(map).sort(([a], [b]) => {
      if (a === "general") return 1;
      if (b === "general") return -1;
      return a.localeCompare(b);
    });
    return entries;
  }, [agents]);

  // Stats
  const stats = useMemo(() => {
    const tiers: Record<string, number> = {};
    let active = 0;
    for (const agent of agents) {
      const t = agent.tier || "unknown";
      tiers[t] = (tiers[t] || 0) + 1;
      if (agent.is_active !== false) active++;
    }
    return { total: agents.length, active, tiers };
  }, [agents]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
          <p className="text-sm text-gray-400">Cargando equipo...</p>
        </div>
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
          <span className="text-2xl">{"\u{1F916}"}</span>
        </div>
        <p className="text-sm text-gray-500 font-medium mb-1">Sin agentes asignados</p>
        <p className="text-xs text-gray-400 max-w-[240px]">
          Asigna agentes a este workspace desde la configuracion de agentes.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1 pb-4">
      {/* Workspace header */}
      <div className="flex flex-col items-center mb-2">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center text-white text-lg shadow-lg mb-2">
          {"\u{1F3E2}"}
        </div>
        <h3 className="text-base font-bold text-gray-900">
          {workspaceName || "Workspace"}
        </h3>
        <p className="text-xs text-gray-400 mt-0.5">
          {stats.total} agente{stats.total !== 1 ? "s" : ""} &middot; {stats.active} activo{stats.active !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Tier summary pills */}
      <div className="flex flex-wrap justify-center gap-2 mb-2">
        {Object.entries(stats.tiers).map(([tier, count]) => {
          const cfg = getTierConfig(tier);
          return (
            <span
              key={tier}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium ${cfg.bg} ${cfg.color}`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
              {count} {cfg.label}
            </span>
          );
        })}
      </div>

      <ConnectorLine />

      {/* Category groups */}
      <div className="w-full space-y-6">
        {grouped.map(([category, catAgents]) => (
          <CategoryGroup key={category} category={category} agents={catAgents} />
        ))}
      </div>
    </div>
  );
}
