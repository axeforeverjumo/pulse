import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
  CalendarDaysIcon,
  ClockIcon,
  UserGroupIcon,
  MapPinIcon,
  SparklesIcon,
  ArrowPathIcon,
  ChevronRightIcon,
  LinkIcon,
} from '@heroicons/react/24/outline';
import { HeaderButtons } from '../MiniAppHeader';
import { generateMeetingPrep } from '../../api/client';
import { api } from '../../api/client';
import { toast } from 'sonner';

function parseBriefingSections(text: string) {
  if (!text) return [];
  const sections: { title: string; items: string[]; raw: string }[] = [];
  const lines = text.split('\n');
  let current = { title: '', items: [] as string[], raw: '' };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('### ') || trimmed.startsWith('## ')) {
      if (current.title || current.items.length || current.raw) sections.push({ ...current });
      current = { title: trimmed.replace(/^#+\s*/, ''), items: [], raw: '' };
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || /^\d+\.\s/.test(trimmed)) {
      current.items.push(trimmed.replace(/^[-*]\s*/, '').replace(/^\d+\.\s*/, ''));
    } else if (trimmed) {
      current.raw += (current.raw ? '\n' : '') + trimmed;
    }
  }
  if (current.title || current.items.length || current.raw) sections.push(current);
  return sections;
}

function renderBold(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-semibold text-slate-900">{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

export default function MeetingPrepPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);
  const [briefing, setBriefing] = useState('');
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!workspaceId) return;
    setLoading(true);
    api<any>(`/calendar/events?workspace_id=${workspaceId}`)
      .then((data) => setEvents(Array.isArray(data) ? data : data?.events || []))
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, [workspaceId]);

  const handlePrepare = async (event: any) => {
    if (!workspaceId) return;
    setSelectedEvent(event);
    setGenerating(true);
    setBriefing('');
    try {
      const result = await generateMeetingPrep(workspaceId, event.id);
      setBriefing(result.briefing || 'No se pudo generar el briefing.');
      toast.success(`Briefing listo`);
    } catch {
      toast.error('Error al generar briefing');
      setBriefing('Error al generar el briefing.');
    } finally {
      setGenerating(false);
    }
  };

  const sections = parseBriefingSections(briefing);

  return (
    <div className="flex-1 flex h-full min-w-0 overflow-hidden">
      <div className="relative flex-1 flex min-w-0 overflow-hidden rounded-[20px] bg-gradient-to-b from-[#f6fbff] to-[#edf4fb]">
        <div className="flex-1 flex min-w-0 overflow-hidden bg-white/92 md:rounded-[20px]">
          {/* Sidebar — event list */}
          <div className="w-[280px] shrink-0 flex flex-col overflow-hidden bg-[#F9F9F9] border-r border-black/5">
            <div className="h-14 flex items-center justify-between pl-4 pr-3 shrink-0 border-b border-[#e4edf8]">
              <div className="flex items-center gap-2">
                <CalendarDaysIcon className="w-[18px] h-[18px] text-slate-700" />
                <h1 className="text-sm font-semibold text-slate-900">Meeting Prep</h1>
              </div>
              <HeaderButtons settingsButtonRef={settingsButtonRef} />
            </div>

            <div className="px-3 py-2 border-b border-black/5">
              <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Proximas reuniones</p>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="space-y-2 p-3">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-16 rounded-lg bg-slate-100 animate-pulse" />
                  ))}
                </div>
              ) : events.length === 0 ? (
                <div className="p-6 text-center">
                  <CalendarDaysIcon className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">No hay reuniones</p>
                  <p className="text-xs text-slate-400 mt-1">Conecta tu Google Calendar</p>
                </div>
              ) : (
                <div className="p-2 space-y-1">
                  {events.map((event: any) => {
                    const isSelected = selectedEvent?.id === event.id;
                    const startTime = event.start_time ? new Date(event.start_time) : null;
                    const attendees = event.attendees || [];
                    return (
                      <button
                        key={event.id}
                        onClick={() => handlePrepare(event)}
                        className={`w-full text-left p-3 rounded-lg transition-all ${
                          isSelected
                            ? 'bg-white shadow-sm ring-1 ring-slate-200'
                            : 'hover:bg-white/60'
                        }`}
                      >
                        <h4 className="text-sm font-medium text-slate-900 truncate">
                          {event.title || 'Sin titulo'}
                        </h4>
                        <div className="flex items-center gap-3 mt-1.5">
                          {startTime && (
                            <span className="flex items-center gap-1 text-[11px] text-slate-500">
                              <ClockIcon className="w-3 h-3" />
                              {startTime.toLocaleDateString('es', { day: 'numeric', month: 'short' })} {startTime.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                          {attendees.length > 0 && (
                            <span className="flex items-center gap-1 text-[11px] text-slate-500">
                              <UserGroupIcon className="w-3 h-3" />
                              {attendees.length}
                            </span>
                          )}
                        </div>
                        {event.location && (
                          <span className="flex items-center gap-1 text-[10px] text-slate-400 mt-1 truncate">
                            <MapPinIcon className="w-3 h-3 shrink-0" />
                            {event.location}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Main — briefing */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {generating ? (
              <div className="flex-1 flex flex-col items-center justify-center">
                <div className="w-10 h-10 rounded-full border-2 border-slate-200 border-t-slate-600 animate-spin mb-4" />
                <p className="text-sm font-medium text-slate-700">Generando briefing...</p>
                <p className="text-xs text-slate-500 mt-1">Buscando contexto en Knowledge Graph, emails y CRM</p>
              </div>
            ) : briefing && selectedEvent ? (
              <div className="flex-1 overflow-auto">
                <div className="max-w-2xl mx-auto py-8 px-6">
                  {/* Briefing header */}
                  <div className="flex items-center gap-2 mb-1">
                    <SparklesIcon className="w-4 h-4 text-amber-500" />
                    <span className="text-xs font-medium text-amber-600 uppercase tracking-wider">Briefing</span>
                  </div>
                  <h2 className="text-xl font-bold text-slate-900 mb-6">{selectedEvent.title}</h2>

                  {/* Sections as cards */}
                  <div className="space-y-4">
                    {sections.map((section, i) => (
                      <div key={i} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                        {section.title && (
                          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/50">
                            <h3 className="text-sm font-semibold text-slate-800">{section.title}</h3>
                          </div>
                        )}
                        <div className="px-5 py-4">
                          {section.items.length > 0 ? (
                            <ul className="space-y-2.5">
                              {section.items.map((item, j) => (
                                <li key={j} className="flex items-start gap-2.5 text-sm text-slate-700 leading-relaxed">
                                  <ChevronRightIcon className="w-3.5 h-3.5 text-blue-500 mt-0.5 flex-shrink-0" />
                                  <span>{renderBold(item)}</span>
                                </li>
                              ))}
                            </ul>
                          ) : section.raw ? (
                            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{renderBold(section.raw)}</p>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center max-w-sm">
                  <CalendarDaysIcon className="w-16 h-16 text-slate-200 mx-auto mb-4" />
                  <h3 className="text-base font-semibold text-slate-700 mb-2">Preparacion de reuniones</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">
                    Selecciona una reunion para generar un briefing con contexto de asistentes, historial de emails, decisiones pendientes y talking points.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
