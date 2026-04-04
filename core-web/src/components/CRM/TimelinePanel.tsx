import { useState, useEffect } from 'react';
import {
  EnvelopeIcon,
  PhoneIcon,
  DocumentTextIcon,
  CalendarIcon,
  ChatBubbleLeftIcon,
  CurrencyDollarIcon,
  UserPlusIcon,
} from '@heroicons/react/24/outline';
import { getCrmTimeline } from '../../api/client';

const eventIcons: Record<string, React.ElementType> = {
  email: EnvelopeIcon,
  call: PhoneIcon,
  note: DocumentTextIcon,
  meeting: CalendarIcon,
  message: ChatBubbleLeftIcon,
  deal: CurrencyDollarIcon,
  created: UserPlusIcon,
};

const eventColors: Record<string, string> = {
  email: 'bg-blue-100 text-blue-600',
  call: 'bg-green-100 text-green-600',
  note: 'bg-amber-100 text-amber-600',
  meeting: 'bg-purple-100 text-purple-600',
  message: 'bg-cyan-100 text-cyan-600',
  deal: 'bg-emerald-100 text-emerald-600',
  created: 'bg-slate-100 text-slate-600',
};

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return 'ahora';
  if (diffMin < 60) return `hace ${diffMin}m`;
  if (diffHr < 24) return `hace ${diffHr}h`;
  if (diffDay < 7) return `hace ${diffDay}d`;
  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

interface TimelinePanelProps {
  entityType: string;
  entityId: string;
}

export default function TimelinePanel({ entityType, entityId }: TimelinePanelProps) {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getCrmTimeline(entityType, entityId)
      .then((data) => {
        if (!cancelled) setEvents(data.events || []);
      })
      .catch(() => {
        if (!cancelled) setEvents([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [entityType, entityId]);

  if (loading) {
    return (
      <div className="space-y-3 p-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex gap-3 animate-pulse">
            <div className="w-8 h-8 rounded-full bg-slate-200 shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-32 bg-slate-200 rounded" />
              <div className="h-3 w-48 bg-slate-100 rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-slate-400">
        <CalendarIcon className="w-8 h-8 mb-2" />
        <p className="text-sm">Sin actividad registrada</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Timeline line */}
      <div className="absolute left-[19px] top-4 bottom-4 w-px bg-slate-200" />

      <div className="space-y-1">
        {events.map((event: any, index: number) => {
          const IconComp = eventIcons[event.type] || DocumentTextIcon;
          const colorClass = eventColors[event.type] || 'bg-slate-100 text-slate-600';

          return (
            <div key={event.id || index} className="relative flex gap-3 p-2 rounded-lg hover:bg-slate-50/80 transition-colors">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${colorClass}`}>
                <IconComp className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-800 truncate">
                    {event.actor_name || 'Sistema'}
                  </span>
                  <span className="text-xs text-slate-400 shrink-0">
                    {event.created_at ? formatRelativeTime(event.created_at) : ''}
                  </span>
                </div>
                <p className="text-sm text-slate-600 mt-0.5 line-clamp-2">
                  {event.description || event.title || ''}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
