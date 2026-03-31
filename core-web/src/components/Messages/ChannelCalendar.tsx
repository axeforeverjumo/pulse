import { useState, useEffect, useMemo } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
  ClockIcon,
  MapPinIcon,
  VideoCameraIcon,
} from "@heroicons/react/24/outline";
import { getCalendarEvents, createCalendarEvent } from "../../api/client";
import type { CalendarEvent } from "../../api/client";

interface ChannelCalendarProps {
  channelId: string;
  channelName: string;
  memberEmails: string[];
}

export default function ChannelCalendar({
  channelId,
  channelName,
  memberEmails,
}: ChannelCalendarProps) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Create event form state
  const [newEventTitle, setNewEventTitle] = useState("");
  const [newEventDate, setNewEventDate] = useState("");
  const [newEventStartTime, setNewEventStartTime] = useState("10:00");
  const [newEventEndTime, setNewEventEndTime] = useState("11:00");
  const [newEventAddMeet, setNewEventAddMeet] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchEvents();
  }, [selectedDate, channelId]);

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const data = await getCalendarEvents();
      // Filter events that include any channel member as attendee
      const channelEvents = (data.events || []).filter(
        (event: CalendarEvent) => {
          if (!event.attendees?.length) return false;
          return event.attendees.some((a) =>
            memberEmails.includes(a.email)
          );
        }
      );
      setEvents(channelEvents);
    } catch (err) {
      console.error("Failed to fetch calendar events:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateEvent = async () => {
    if (!newEventTitle.trim() || !newEventDate) return;
    setCreating(true);
    try {
      const startTime = `${newEventDate}T${newEventStartTime}:00`;
      const endTime = `${newEventDate}T${newEventEndTime}:00`;

      await createCalendarEvent({
        title: newEventTitle,
        description: `Evento del canal #${channelName}`,
        start_time: startTime,
        end_time: endTime,
        add_google_meet: newEventAddMeet,
        attendees: memberEmails,
      });

      // Reset form and refresh
      setNewEventTitle("");
      setNewEventDate("");
      setNewEventStartTime("10:00");
      setNewEventEndTime("11:00");
      setShowCreateForm(false);
      await fetchEvents();
    } catch (err) {
      console.error("Failed to create event:", err);
    } finally {
      setCreating(false);
    }
  };

  // Get events for a specific date
  const getEventsForDate = (date: Date) => {
    const dateStr = date.toISOString().split("T")[0];
    return events.filter((e) => e.start_time?.startsWith(dateStr));
  };

  // Generate calendar days for current month
  const calendarDays = useMemo(() => {
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startPad = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1; // Monday start

    const days: Date[] = [];
    // Padding days from previous month
    for (let i = startPad - 1; i >= 0; i--) {
      days.push(new Date(year, month, -i));
    }
    // Current month days
    for (let d = 1; d <= lastDay.getDate(); d++) {
      days.push(new Date(year, month, d));
    }
    // Padding to fill last row
    while (days.length % 7 !== 0) {
      days.push(
        new Date(
          year,
          month + 1,
          days.length - startPad - lastDay.getDate() + 1
        )
      );
    }
    return days;
  }, [selectedDate]);

  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const selectedDateStr = selectedDate.toISOString().split("T")[0];

  // Upcoming events (next 7 days from today)
  const upcomingEvents = useMemo(() => {
    const now = new Date();
    const weekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    return events
      .filter((e) => {
        const start = new Date(e.start_time);
        return start >= now && start <= weekLater;
      })
      .sort(
        (a, b) =>
          new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
      );
  }, [events]);

  const formatTime = (isoStr: string) => {
    return new Date(isoStr).toLocaleTimeString("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDate = (isoStr: string) => {
    return new Date(isoStr).toLocaleDateString("es-ES", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  };

  const monthNames = [
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre",
  ];
  const dayNames = ["L", "M", "X", "J", "V", "S", "D"];

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            Calendario del canal
          </h2>
          <button
            onClick={() => {
              setShowCreateForm(!showCreateForm);
              setNewEventDate(todayStr);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-500 text-white text-sm font-medium rounded-lg hover:bg-violet-600 transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            Crear evento
          </button>
        </div>

        {/* Create Event Form */}
        {showCreateForm && (
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
            <input
              type="text"
              value={newEventTitle}
              onChange={(e) => setNewEventTitle(e.target.value)}
              placeholder="Titulo del evento..."
              autoFocus
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-300"
            />
            <div className="flex items-center gap-3">
              <input
                type="date"
                value={newEventDate}
                onChange={(e) => setNewEventDate(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-300"
              />
              <input
                type="time"
                value={newEventStartTime}
                onChange={(e) => setNewEventStartTime(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-300"
              />
              <span className="text-gray-400">{"\u2192"}</span>
              <input
                type="time"
                value={newEventEndTime}
                onChange={(e) => setNewEventEndTime(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-300"
              />
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newEventAddMeet}
                  onChange={(e) => setNewEventAddMeet(e.target.checked)}
                  className="rounded border-gray-300 text-violet-500 focus:ring-violet-300"
                />
                <VideoCameraIcon className="w-4 h-4" />
                Anadir Google Meet
              </label>
              <span className="text-xs text-gray-400">
                Se invitara a {memberEmails.length} miembros del canal
              </span>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setShowCreateForm(false)}
                className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateEvent}
                disabled={!newEventTitle.trim() || !newEventDate || creating}
                className="px-4 py-1.5 text-sm bg-violet-500 text-white rounded-lg font-medium hover:bg-violet-600 disabled:opacity-40 transition-colors"
              >
                {creating ? "Creando..." : "Crear evento"}
              </button>
            </div>
          </div>
        )}

        {/* Mini Calendar */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() =>
                setSelectedDate(
                  new Date(
                    selectedDate.getFullYear(),
                    selectedDate.getMonth() - 1,
                    1
                  )
                )
              }
              className="p-1 rounded hover:bg-gray-100"
            >
              <ChevronLeftIcon className="w-4 h-4 text-gray-600" />
            </button>
            <h3 className="text-sm font-medium text-gray-900">
              {monthNames[selectedDate.getMonth()]}{" "}
              {selectedDate.getFullYear()}
            </h3>
            <button
              onClick={() =>
                setSelectedDate(
                  new Date(
                    selectedDate.getFullYear(),
                    selectedDate.getMonth() + 1,
                    1
                  )
                )
              }
              className="p-1 rounded hover:bg-gray-100"
            >
              <ChevronRightIcon className="w-4 h-4 text-gray-600" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1">
            {dayNames.map((d) => (
              <div
                key={d}
                className="text-center text-[10px] font-medium text-gray-400 py-1"
              >
                {d}
              </div>
            ))}
            {calendarDays.map((day, i) => {
              const dayStr = day.toISOString().split("T")[0];
              const isCurrentMonth =
                day.getMonth() === selectedDate.getMonth();
              const isToday = dayStr === todayStr;
              const dayEvents = getEventsForDate(day);
              const hasEvents = dayEvents.length > 0;

              return (
                <button
                  key={i}
                  onClick={() => setSelectedDate(day)}
                  className={`relative p-1.5 text-[12px] rounded-lg transition-colors ${
                    isToday
                      ? "bg-violet-500 text-white font-medium"
                      : dayStr === selectedDateStr
                        ? "bg-violet-50 text-violet-700"
                        : isCurrentMonth
                          ? "text-gray-700 hover:bg-gray-50"
                          : "text-gray-300"
                  }`}
                >
                  {day.getDate()}
                  {hasEvents && (
                    <div
                      className={`absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full ${
                        isToday ? "bg-white" : "bg-violet-400"
                      }`}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Upcoming Events */}
        <div>
          <h3 className="text-sm font-medium text-gray-900 mb-3">
            Proximos eventos
          </h3>
          {loading ? (
            <div className="text-center py-8 text-gray-400 text-sm">
              Cargando eventos...
            </div>
          ) : upcomingEvents.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">
              No hay eventos proximos en este canal
            </div>
          ) : (
            <div className="space-y-2">
              {upcomingEvents.map((event) => (
                <div
                  key={event.id}
                  className="bg-white border border-gray-200 rounded-xl p-3 hover:border-gray-300 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-medium text-gray-900 truncate">
                        {event.title}
                      </h4>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="flex items-center gap-1 text-xs text-gray-500">
                          <ClockIcon className="w-3.5 h-3.5" />
                          {formatDate(event.start_time)} ·{" "}
                          {formatTime(event.start_time)} -{" "}
                          {formatTime(event.end_time)}
                        </span>
                        {event.location && (
                          <span className="flex items-center gap-1 text-xs text-gray-500">
                            <MapPinIcon className="w-3.5 h-3.5" />
                            {event.location}
                          </span>
                        )}
                      </div>
                      {event.attendees && event.attendees.length > 0 && (
                        <div className="flex items-center gap-1 mt-2">
                          {event.attendees.slice(0, 5).map((a, i) => (
                            <div
                              key={i}
                              className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center text-[9px] font-medium text-gray-600"
                              title={a.email}
                            >
                              {(a.display_name || a.email)?.[0]?.toUpperCase()}
                            </div>
                          ))}
                          {event.attendees.length > 5 && (
                            <span className="text-[10px] text-gray-400">
                              +{event.attendees.length - 5}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    {event.meeting_link && (
                      <a
                        href={event.meeting_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 rounded-lg text-xs font-medium hover:bg-green-100 transition-colors"
                      >
                        <VideoCameraIcon className="w-3.5 h-3.5" />
                        Meet
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Events for selected date */}
        {(() => {
          const selectedEvents = getEventsForDate(selectedDate);
          if (selectedEvents.length === 0) return null;
          return (
            <div>
              <h3 className="text-sm font-medium text-gray-900 mb-3">
                Eventos del{" "}
                {selectedDate.toLocaleDateString("es-ES", {
                  day: "numeric",
                  month: "long",
                })}
              </h3>
              <div className="space-y-2">
                {selectedEvents.map((event) => (
                  <div
                    key={event.id}
                    className="bg-violet-50 border border-violet-100 rounded-xl p-3"
                  >
                    <h4 className="text-sm font-medium text-violet-900">
                      {event.title}
                    </h4>
                    <span className="text-xs text-violet-600">
                      {formatTime(event.start_time)} -{" "}
                      {formatTime(event.end_time)}
                    </span>
                    {event.meeting_link && (
                      <a
                        href={event.meeting_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-2 text-xs text-violet-600 underline"
                      >
                        Unirse a Meet
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
