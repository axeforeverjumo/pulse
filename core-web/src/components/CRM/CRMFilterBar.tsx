import { useState, useEffect } from 'react';
import { FunnelIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { getCrmTags } from '../../api/client';

interface Tag {
  id: string;
  name: string;
  color: string;
}

interface CRMFilterBarProps {
  workspaceId: string;
  onFiltersChange: (filters: CRMFilters) => void;
  showStageFilter?: boolean;
  showAmountFilter?: boolean;
}

export interface CRMFilters {
  tags: string[];
  stage: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  amountMin: number | null;
  amountMax: number | null;
}

const EMPTY_FILTERS: CRMFilters = {
  tags: [],
  stage: null,
  dateFrom: null,
  dateTo: null,
  amountMin: null,
  amountMax: null,
};

const STAGES = [
  { id: 'lead', label: 'Lead' },
  { id: 'qualified', label: 'Calificado' },
  { id: 'proposal', label: 'Propuesta' },
  { id: 'negotiation', label: 'Negociacion' },
  { id: 'won', label: 'Ganado' },
  { id: 'lost', label: 'Perdido' },
];

export default function CRMFilterBar({ workspaceId, onFiltersChange, showStageFilter, showAmountFilter }: CRMFilterBarProps) {
  const [filters, setFilters] = useState<CRMFilters>(EMPTY_FILTERS);
  const [tags, setTags] = useState<Tag[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (workspaceId) {
      getCrmTags(workspaceId).then((res) => setTags(res.tags || [])).catch(() => {});
    }
  }, [workspaceId]);

  const updateFilters = (partial: Partial<CRMFilters>) => {
    const next = { ...filters, ...partial };
    setFilters(next);
    onFiltersChange(next);
  };

  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    onFiltersChange(EMPTY_FILTERS);
  };

  const hasActiveFilters = filters.tags.length > 0 || filters.stage || filters.dateFrom || filters.amountMin;

  const toggleTag = (tagName: string) => {
    const next = filters.tags.includes(tagName)
      ? filters.tags.filter((t) => t !== tagName)
      : [...filters.tags, tagName];
    updateFilters({ tags: next });
  };

  return (
    <div className="space-y-2">
      {/* Toggle bar */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setExpanded(!expanded)}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
            hasActiveFilters
              ? 'border-blue-300 bg-blue-50 text-blue-700'
              : 'border-slate-200 text-slate-500 hover:border-slate-300'
          }`}
        >
          <FunnelIcon className="w-3.5 h-3.5" />
          Filtros
          {hasActiveFilters && (
            <span className="ml-1 bg-blue-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
              {[filters.tags.length > 0, filters.stage, filters.dateFrom, filters.amountMin].filter(Boolean).length}
            </span>
          )}
        </button>

        {/* Active tag pills */}
        {filters.tags.map((tagName) => {
          const tag = tags.find((t) => t.name === tagName);
          return (
            <span
              key={tagName}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium text-white"
              style={{ backgroundColor: tag?.color || '#6B7280' }}
            >
              {tagName}
              <button onClick={() => toggleTag(tagName)} className="hover:bg-white/20 rounded-full">
                <XMarkIcon className="w-3 h-3" />
              </button>
            </span>
          );
        })}

        {filters.stage && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700">
            {STAGES.find((s) => s.id === filters.stage)?.label || filters.stage}
            <button onClick={() => updateFilters({ stage: null })} className="hover:bg-slate-200 rounded-full">
              <XMarkIcon className="w-3 h-3" />
            </button>
          </span>
        )}

        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="text-[11px] text-slate-400 hover:text-slate-600 font-medium"
          >
            Limpiar
          </button>
        )}
      </div>

      {/* Expanded filter panel */}
      {expanded && (
        <div className="flex flex-wrap items-center gap-3 p-3 bg-slate-50/80 rounded-xl border border-slate-200/60">
          {/* Tags */}
          <div className="flex flex-wrap gap-1">
            {tags.map((tag) => {
              const isActive = filters.tags.includes(tag.name);
              return (
                <button
                  key={tag.id}
                  onClick={() => toggleTag(tag.name)}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium border transition-colors ${
                    isActive
                      ? 'border-transparent text-white'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300 bg-white'
                  }`}
                  style={isActive ? { backgroundColor: tag.color } : {}}
                >
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: isActive ? '#fff' : tag.color }} />
                  {tag.name}
                </button>
              );
            })}
          </div>

          {/* Stage filter */}
          {showStageFilter && (
            <select
              value={filters.stage || ''}
              onChange={(e) => updateFilters({ stage: e.target.value || null })}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-blue-300"
            >
              <option value="">Todas las etapas</option>
              {STAGES.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          )}

          {/* Date range */}
          <div className="flex items-center gap-1">
            <input
              type="date"
              value={filters.dateFrom || ''}
              onChange={(e) => updateFilters({ dateFrom: e.target.value || null })}
              className="text-xs px-2 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-blue-300"
            />
            <span className="text-xs text-slate-400">-</span>
            <input
              type="date"
              value={filters.dateTo || ''}
              onChange={(e) => updateFilters({ dateTo: e.target.value || null })}
              className="text-xs px-2 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-blue-300"
            />
          </div>

          {/* Amount range */}
          {showAmountFilter && (
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={filters.amountMin ?? ''}
                onChange={(e) => updateFilters({ amountMin: e.target.value ? Number(e.target.value) : null })}
                placeholder="Min"
                className="w-20 text-xs px-2 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-blue-300"
              />
              <span className="text-xs text-slate-400">-</span>
              <input
                type="number"
                value={filters.amountMax ?? ''}
                onChange={(e) => updateFilters({ amountMax: e.target.value ? Number(e.target.value) : null })}
                placeholder="Max"
                className="w-20 text-xs px-2 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-blue-300"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
