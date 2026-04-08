import { useState, useEffect } from "react";
import {
  GlobeAltIcon,
  ChartBarIcon,
  MagnifyingGlassIcon,
  EyeIcon,
  CursorArrowRaysIcon,
  ArrowTrendingUpIcon,
} from "@heroicons/react/24/outline";

interface Props {
  site: any;
  workspaceId: string;
}

export default function OverviewTab({ site }: Props) {
  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="SEO Score"
          value={site.last_audit_score != null ? `${site.last_audit_score}/100` : "—"}
          icon={<ChartBarIcon className="w-5 h-5" />}
          color={
            site.last_audit_score >= 80
              ? "green"
              : site.last_audit_score >= 50
              ? "yellow"
              : "red"
          }
        />
        <KpiCard
          label="Clicks (7d)"
          value={site.organic_clicks_7d != null ? site.organic_clicks_7d.toLocaleString() : "—"}
          icon={<CursorArrowRaysIcon className="w-5 h-5" />}
          color="blue"
        />
        <KpiCard
          label="Impresiones (7d)"
          value={
            site.organic_impressions_7d != null
              ? site.organic_impressions_7d.toLocaleString()
              : "—"
          }
          icon={<EyeIcon className="w-5 h-5" />}
          color="purple"
        />
        <KpiCard
          label="Posicion media"
          value={site.avg_position != null ? site.avg_position.toFixed(1) : "—"}
          icon={<ArrowTrendingUpIcon className="w-5 h-5" />}
          color="orange"
        />
      </div>

      {/* Site Info */}
      <div className="bg-white/5 rounded-xl p-5 border border-white/10">
        <h3 className="text-sm font-semibold text-white/70 mb-3 uppercase tracking-wide">
          Informacion del sitio
        </h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <InfoRow label="Dominio" value={site.domain} />
          <InfoRow label="URL" value={site.url} isLink />
          <InfoRow label="Tipo" value={site.site_type || "custom"} />
          <InfoRow
            label="Paginas indexadas"
            value={site.indexed_pages?.toLocaleString() || "—"}
          />
          <InfoRow
            label="Google Analytics"
            value={site.ga4_property_id ? "Conectado" : "No configurado"}
            status={!!site.ga4_property_id}
          />
          <InfoRow
            label="Search Console"
            value={site.gsc_site_url ? "Conectado" : "No configurado"}
            status={!!site.gsc_site_url}
          />
          <InfoRow
            label="Ultimo audit"
            value={
              site.last_audit_at
                ? new Date(site.last_audit_at).toLocaleDateString("es-ES")
                : "Nunca"
            }
          />
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white/5 rounded-xl p-5 border border-white/10">
        <h3 className="text-sm font-semibold text-white/70 mb-3 uppercase tracking-wide">
          Acciones rapidas
        </h3>
        <div className="flex flex-wrap gap-2">
          <QuickAction label="Ejecutar Audit SEO" tab="audit" />
          <QuickAction label="Ver PageSpeed" tab="pagespeed" />
          <QuickAction label="Analizar Keywords" tab="search" />
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
}) {
  const colorClasses: Record<string, string> = {
    green: "bg-green-500/10 text-green-400 border-green-500/20",
    yellow: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    red: "bg-red-500/10 text-red-400 border-red-500/20",
    blue: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    purple: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    orange: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  };

  return (
    <div
      className={`rounded-xl p-4 border ${colorClasses[color] || colorClasses.blue}`}
    >
      <div className="flex items-center gap-2 mb-2 opacity-70">{icon}</div>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs opacity-60 mt-1">{label}</p>
    </div>
  );
}

function InfoRow({
  label,
  value,
  isLink,
  status,
}: {
  label: string;
  value: string;
  isLink?: boolean;
  status?: boolean;
}) {
  return (
    <div>
      <p className="text-white/40 text-xs mb-0.5">{label}</p>
      {isLink ? (
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-400 hover:underline text-sm"
        >
          {value}
        </a>
      ) : (
        <p className="text-white text-sm flex items-center gap-1.5">
          {status !== undefined && (
            <span
              className={`w-2 h-2 rounded-full ${
                status ? "bg-green-400" : "bg-white/20"
              }`}
            />
          )}
          {value}
        </p>
      )}
    </div>
  );
}

function QuickAction({ label, tab }: { label: string; tab: string }) {
  return (
    <button className="px-3 py-1.5 text-sm rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white transition-colors">
      {label}
    </button>
  );
}
