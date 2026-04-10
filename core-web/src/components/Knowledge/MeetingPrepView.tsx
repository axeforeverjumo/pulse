import { useEffect, useState } from 'react';
import {
  CalendarDaysIcon,
  SparklesIcon,
  ClockIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline';
import { api, generateMeetingPrep } from '../../api/client';
import { toast } from 'sonner';

interface Props {
  workspaceId: string;
}

export default function MeetingPrepView({ workspaceId }: Props) {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);
  const [briefing, setBriefing] = useState<string>('');
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    fetchUpcomingEvents();
  }, [workspaceId]);

  const fetchUpcomingEvents = async () => {
    setLoading(true);
    try {
      const data = await api<{ events: any[] }>(`/calendar/events?workspace_id=${workspaceId}&upcoming=true&limit=20`);
      setEvents(data.events || data as any || []);
    } catch {
      // Try alternative endpoint
      try {
        const data = await api<any[]>(`/calendar/events?workspace_id=${workspaceId}`);
        setEvents(Array.isArray(data) ? data : []);
      } catch {
        setEvents([]);
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePrepare = async (event: any) => {
    setSelectedEvent(event);
    setGenerating(true);
    setBriefing('');
    toast.info('Generando briefing...');

    try {
      const result = await generateMeetingPrep(workspaceId, event.id);
      setBriefing(result.briefing || 'No se pudo generar el briefing.');
      toast.success(`Briefing listo — ${result.attendees_found || 0} asistentes encontrados`);
    } catch (e) {
      toast.error('Error al generar briefing');
      setBriefing('Error al generar el briefing. Verifica que el evento tiene asistentes.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="flex h-full">
      {/* Events list */}
      <div className="w-80 border-r border-zinc-200 dark:border-zinc-800 overflow-auto">
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <CalendarDaysIcon className="w-4 h-4 text-indigo-500" />
            Proximas Reuniones
          </h3>
          <p className="text-xs text-zinc-500 mt-1">Selecciona una reunion para preparar el briefing</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-500" />
          </div>
        ) : events.length === 0 ? (
          <div className="text-center py-12 px-4 text-sm text-zinc-500">
            No hay reuniones proximas.
            <br />
            <span className="text-xs text-zinc-400">Conecta tu Google Calendar para ver eventos.</span>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {events.map((event: any) => {
              const attendees = event.attendees || [];
              const startTime = event.start_time ? new Date(event.start_time) : null;
              return (
                <button
                  key={event.id}
                  onClick={() => handlePrepare(event)}
                  className={`w-full text-left p-3 rounded-lg transition-colors ${
                    selectedEvent?.id === event.id
                      ? 'bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/30'
                      : 'hover:bg-zinc-50 dark:hover:bg-zinc-900 border border-transparent'
                  }`}
                >
                  <h4 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                    {event.title || 'Sin titulo'}
                  </h4>
                  <div className="flex items-center gap-2 mt-1">
                    {startTime && (
                      <span className="flex items-center gap-1 text-[10px] text-zinc-500">
                        <ClockIcon className="w-3 h-3" />
                        {startTime.toLocaleDateString()} {startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                    {attendees.length > 0 && (
                      <span className="flex items-center gap-1 text-[10px] text-zinc-500">
                        <UserGroupIcon className="w-3 h-3" />
                        {attendees.length}
                      </span>
                    )}
                  </div>
                  {event.location && (
                    <p className="text-[10px] text-zinc-400 mt-1 truncate">{event.location}</p>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Briefing */}
      <div className="flex-1 overflow-auto">
        {generating ? (
          <div className="flex flex-col items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500 mb-3" />
            <p className="text-sm text-zinc-500">Generando briefing con contexto del Knowledge Graph...</p>
            <p className="text-xs text-zinc-400 mt-1">Buscando asistentes, emails recientes, CRM, decisiones...</p>
          </div>
        ) : briefing ? (
          <div className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <SparklesIcon className="w-5 h-5 text-amber-500" />
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                Briefing: {selectedEvent?.title}
              </h2>
            </div>
            <div className="prose prose-sm dark:prose-invert max-w-none bg-zinc-50 dark:bg-zinc-900 rounded-lg p-6 border border-zinc-200 dark:border-zinc-800 whitespace-pre-wrap">
              {briefing}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-sm text-zinc-500">
            <div className="text-center">
              <CalendarDaysIcon className="w-12 h-12 text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
              <p>Selecciona una reunion para generar un briefing</p>
              <p className="text-xs text-zinc-400 mt-1">
                El briefing incluye: contexto de asistentes, historial de emails,<br />
                decisiones pendientes, oportunidades CRM y talking points
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
