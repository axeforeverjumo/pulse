import { useEffect, useState, useCallback } from 'react';
import {
  LightBulbIcon,
  XMarkIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  UserIcon,
  CurrencyDollarIcon,
} from '@heroicons/react/24/outline';
import { getCrmSuggestions, dismissCrmSuggestion } from '../../api/client';

interface SuggestionsPanelProps {
  workspaceId: string;
  entityType?: string;
  entityId?: string;
  compact?: boolean;
}

const SUGGESTION_ICONS: Record<string, any> = {
  stale_deal: ClockIcon,
  no_followup: ClockIcon,
  missing_close_date: ExclamationTriangleIcon,
  missing_contact: UserIcon,
  missing_amount: CurrencyDollarIcon,
  stuck_in_stage: ExclamationTriangleIcon,
  high_value_no_activity: ExclamationTriangleIcon,
};

const SUGGESTION_COLORS: Record<string, string> = {
  stale_deal: 'text-amber-500',
  stuck_in_stage: 'text-red-500',
  missing_close_date: 'text-orange-500',
  missing_contact: 'text-blue-500',
  missing_amount: 'text-violet-500',
  high_value_no_activity: 'text-rose-500',
};

export default function SuggestionsPanel({ workspaceId, entityType, entityId, compact }: SuggestionsPanelProps) {
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSuggestions = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const data = await getCrmSuggestions(workspaceId, entityType, entityId);
      setSuggestions(data.suggestions || []);
    } catch {}
    setLoading(false);
  }, [workspaceId, entityType, entityId]);

  useEffect(() => {
    fetchSuggestions();
  }, [fetchSuggestions]);

  const handleDismiss = async (id: string) => {
    try {
      await dismissCrmSuggestion(id);
      setSuggestions((prev) => prev.filter((s) => s.id !== id));
    } catch {}
  };

  if (loading) return null;
  if (suggestions.length === 0) return null;

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <LightBulbIcon className="w-4 h-4 text-amber-500" />
        <span className="text-xs text-amber-600 font-medium">{suggestions.length} sugerencias</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-3">
        <LightBulbIcon className="w-4 h-4 text-amber-500" />
        <h3 className="text-sm font-semibold text-slate-800">Sugerencias IA</h3>
        <span className="text-[10px] bg-amber-100 text-amber-700 rounded-full px-1.5 py-0.5 font-medium">
          {suggestions.length}
        </span>
      </div>
      {suggestions.map((suggestion) => {
        const Icon = SUGGESTION_ICONS[suggestion.suggestion_type] || LightBulbIcon;
        const iconColor = SUGGESTION_COLORS[suggestion.suggestion_type] || 'text-slate-400';
        return (
          <div
            key={suggestion.id}
            className="flex items-start gap-2.5 p-3 bg-white rounded-xl border border-slate-200/80 hover:shadow-sm transition-shadow group"
          >
            <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${iconColor}`} />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-slate-700 leading-relaxed">{suggestion.message}</p>
              <span className="text-[10px] text-slate-400 mt-1 block">
                {suggestion.suggestion_type.replace(/_/g, ' ')}
              </span>
            </div>
            <button
              onClick={() => handleDismiss(suggestion.id)}
              className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-slate-100 transition-all"
              title="Descartar"
            >
              <XMarkIcon className="w-3.5 h-3.5 text-slate-400" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
