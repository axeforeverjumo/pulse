import {
  ChartBarIcon,
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
          value={site.last_audit_score != null ? `${site.last_audit_score}/100` : "--"}
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
          value={site.organic_clicks_7d != null ? site.organic_clicks_7d.toLocaleString() : "--"}
          icon={<CursorArrowRaysIcon className="w-5 h-5" />}
          color="blue"
        />
        <KpiCard
          label="Impresiones (7d)"
          value={
            site.organic_impressions_7d != null
              ? site.organic_impressions_7d.toLocaleString()
              : "--"
          }
          icon={<EyeIcon className="w-5 h-5" />}
          color="purple"
        />
        <KpiCard
          label="Posicion media"
          value={site.avg_position != null ? site.avg_position.toFixed(1) : "--"}
          icon={<ArrowTrendingUpIcon className="w-5 h-5" />}
          color="orange"
        />
      </div>

      {/* Site Info */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200">
        <h3 className="text-sm font-semibold text-slate-500 mb-3 uppercase tracking-wide">
          Informacion del sitio
        </h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <InfoRow label="Dominio" value={site.domain} />
          <InfoRow label="URL" value={site.url} isLink />
          <InfoRow label="Tipo" value={site.site_type || "custom"} />
          <InfoRow
            label="Paginas indexadas"
            value={site.indexed_pages?.toLocaleString() || "--"}
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
    green: "bg-green-50 text-green-700 border-green-200",
    yellow: "bg-yellow-50 text-yellow-700 border-yellow-200",
    red: "bg-red-50 text-red-700 border-red-200",
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    purple: "bg-purple-50 text-purple-700 border-purple-200",
    orange: "bg-orange-50 text-orange-700 border-orange-200",
  };

  return (
    <div className={`rounded-2xl p-4 border ${colorClasses[color] || colorClasses.blue}`}>
      <div className="flex items-center gap-2 mb-2 opacity-60">{icon}</div>
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
      <p className="text-slate-400 text-xs mb-0.5">{label}</p>
      {isLink ? (
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline text-sm"
        >
          {value}
        </a>
      ) : (
        <p className="text-slate-800 text-sm flex items-center gap-1.5">
          {status !== undefined && (
            <span
              className={`w-2 h-2 rounded-full ${
                status ? "bg-green-400" : "bg-slate-200"
              }`}
            />
          )}
          {value}
        </p>
      )}
    </div>
  );
}
