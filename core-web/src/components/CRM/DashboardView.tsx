import { useEffect, useState, useCallback } from 'react';
import {
  CurrencyDollarIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  ClockIcon,
  UserGroupIcon,
  BuildingOfficeIcon,
  BoltIcon,
  ChartBarSquareIcon,
} from '@heroicons/react/24/outline';
import { getCrmDashboard } from '../../api/client';
import SuggestionsPanel from './SuggestionsPanel';

interface DashboardViewProps {
  workspaceId: string;
}

interface KPIs {
  total_pipeline_value: number;
  weighted_forecast: number;
  win_rate: number;
  avg_days_to_close: number;
  won_amount: number;
  won_count: number;
  lost_count: number;
  created_last_30_days: number;
  total_contacts: number;
  total_companies: number;
  recent_activity_count: number;
}

interface PipelineStage {
  stage: string;
  label: string;
  count: number;
  total_amount: number;
}

interface RevenueMonth {
  month: string;
  label: string;
  amount: number;
}

interface FunnelStage {
  stage: string;
  label: string;
  count: number;
  percentage: number;
}

interface DashboardData {
  kpis: KPIs;
  pipeline: PipelineStage[];
  revenue_by_month: RevenueMonth[];
  funnel: FunnelStage[];
  currency: string;
}

const STAGE_COLORS: Record<string, string> = {
  lead: '#EF4444',
  qualified: '#3B82F6',
  proposal: '#F59E0B',
  negotiation: '#8B5CF6',
  won: '#10B981',
  lost: '#64748B',
};

function formatCurrency(amount: number, currency = 'EUR'): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat('es-ES').format(n);
}

function KPICard({ icon: Icon, label, value, subValue, color }: {
  icon: any;
  label: string;
  value: string;
  subValue?: string;
  color: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-4 flex flex-col gap-2 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center gap-2">
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${color}`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
        <span className="text-xs font-medium text-slate-500">{label}</span>
      </div>
      <div className="text-xl font-bold text-slate-900">{value}</div>
      {subValue && <div className="text-xs text-slate-400">{subValue}</div>}
    </div>
  );
}

function FunnelChart({ stages }: { stages: FunnelStage[] }) {
  const maxCount = Math.max(...stages.map((s) => s.count), 1);
  return (
    <div className="space-y-2">
      {stages.map((stage) => (
        <div key={stage.stage} className="flex items-center gap-3">
          <span className="text-xs font-medium text-slate-600 w-24 text-right shrink-0">{stage.label}</span>
          <div className="flex-1 h-7 bg-slate-100 rounded-lg overflow-hidden relative">
            <div
              className="h-full rounded-lg transition-all duration-500"
              style={{
                width: `${Math.max((stage.count / maxCount) * 100, 2)}%`,
                backgroundColor: STAGE_COLORS[stage.stage] || '#94A3B8',
              }}
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-700">
              {stage.count} ({stage.percentage}%)
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function RevenueChart({ months, currency }: { months: RevenueMonth[]; currency: string }) {
  const maxAmount = Math.max(...months.map((m) => m.amount), 1);
  return (
    <div className="flex items-end gap-2 h-40">
      {months.map((m) => (
        <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
          <span className="text-[10px] font-semibold text-slate-600">
            {m.amount > 0 ? formatCurrency(m.amount, currency) : ''}
          </span>
          <div className="w-full flex justify-center">
            <div
              className="w-full max-w-10 rounded-t-lg bg-gradient-to-t from-blue-500 to-blue-400 transition-all duration-500"
              style={{ height: `${Math.max((m.amount / maxAmount) * 120, 4)}px` }}
            />
          </div>
          <span className="text-[10px] text-slate-400 font-medium">{m.label}</span>
        </div>
      ))}
    </div>
  );
}

function PipelineSummary({ stages, currency }: { stages: PipelineStage[]; currency: string }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
      {stages.map((stage) => (
        <div
          key={stage.stage}
          className="rounded-xl border border-slate-200/80 p-3 text-center bg-white hover:shadow-sm transition-shadow"
        >
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: STAGE_COLORS[stage.stage] }} />
            <span className="text-[11px] font-semibold text-slate-600">{stage.label}</span>
          </div>
          <div className="text-lg font-bold text-slate-900">{stage.count}</div>
          <div className="text-[10px] text-slate-400 font-medium">{formatCurrency(stage.total_amount, currency)}</div>
        </div>
      ))}
    </div>
  );
}

export default function DashboardView({ workspaceId }: DashboardViewProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const result = await getCrmDashboard(workspaceId);
      setData(result);
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-slate-500">Cargando dashboard...</span>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <p className="text-sm text-slate-400">No se pudieron cargar los datos del dashboard</p>
      </div>
    );
  }

  const { kpis, pipeline, revenue_by_month, funnel, currency } = data;

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KPICard
          icon={CurrencyDollarIcon}
          label="Pipeline total"
          value={formatCurrency(kpis.total_pipeline_value, currency)}
          subValue={`Forecast: ${formatCurrency(kpis.weighted_forecast, currency)}`}
          color="bg-blue-500"
        />
        <KPICard
          icon={ArrowTrendingUpIcon}
          label="Ganados"
          value={formatCurrency(kpis.won_amount, currency)}
          subValue={`${kpis.won_count} deals`}
          color="bg-emerald-500"
        />
        <KPICard
          icon={ArrowTrendingDownIcon}
          label="Win Rate"
          value={`${kpis.win_rate}%`}
          subValue={`${kpis.lost_count} perdidos`}
          color="bg-amber-500"
        />
        <KPICard
          icon={ClockIcon}
          label="Dias promedio"
          value={`${kpis.avg_days_to_close}d`}
          subValue="hasta cerrar"
          color="bg-violet-500"
        />
        <KPICard
          icon={BoltIcon}
          label="Actividad (7d)"
          value={formatNumber(kpis.recent_activity_count)}
          subValue={`${kpis.created_last_30_days} nuevos (30d)`}
          color="bg-rose-500"
        />
      </div>

      {/* Pipeline Overview */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2">
          <ChartBarSquareIcon className="w-4 h-4 text-slate-500" />
          Pipeline por etapa
        </h3>
        <PipelineSummary stages={pipeline} currency={currency} />
      </div>

      {/* Two-column: Revenue + Funnel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Revenue by Month */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <CurrencyDollarIcon className="w-4 h-4 text-slate-500" />
            Revenue por mes (ganados)
          </h3>
          {revenue_by_month.length > 0 ? (
            <RevenueChart months={revenue_by_month} currency={currency} />
          ) : (
            <p className="text-xs text-slate-400 text-center py-8">Sin datos de revenue</p>
          )}
        </div>

        {/* Conversion Funnel */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <ArrowTrendingUpIcon className="w-4 h-4 text-slate-500" />
            Embudo de conversion
          </h3>
          {funnel.length > 0 ? (
            <FunnelChart stages={funnel} />
          ) : (
            <p className="text-xs text-slate-400 text-center py-8">Sin datos del embudo</p>
          )}
        </div>
      </div>

      {/* AI Suggestions */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm">
        <SuggestionsPanel workspaceId={workspaceId} />
      </div>

      {/* Bottom stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-slate-200/80 p-3 text-center">
          <UserGroupIcon className="w-5 h-5 text-blue-400 mx-auto mb-1" />
          <div className="text-lg font-bold text-slate-900">{formatNumber(kpis.total_contacts)}</div>
          <div className="text-[11px] text-slate-400">Contactos</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200/80 p-3 text-center">
          <BuildingOfficeIcon className="w-5 h-5 text-violet-400 mx-auto mb-1" />
          <div className="text-lg font-bold text-slate-900">{formatNumber(kpis.total_companies)}</div>
          <div className="text-[11px] text-slate-400">Empresas</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200/80 p-3 text-center">
          <ArrowTrendingUpIcon className="w-5 h-5 text-emerald-400 mx-auto mb-1" />
          <div className="text-lg font-bold text-slate-900">{kpis.won_count}</div>
          <div className="text-[11px] text-slate-400">Deals ganados</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200/80 p-3 text-center">
          <ArrowTrendingDownIcon className="w-5 h-5 text-rose-400 mx-auto mb-1" />
          <div className="text-lg font-bold text-slate-900">{kpis.lost_count}</div>
          <div className="text-[11px] text-slate-400">Deals perdidos</div>
        </div>
      </div>
    </div>
  );
}
