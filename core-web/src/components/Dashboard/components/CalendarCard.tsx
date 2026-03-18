import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDaysIcon } from '@heroicons/react/24/outline';
import { useCalendarStore } from '../../../stores/calendarStore';
import { getAccountPalette } from '../../../utils/accountColors';
import BentoCard from './BentoCard';

const MAX_ITEMS = 4;

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function formatEventDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (dateOnly.getTime() === today.getTime()) {
    return 'Today';
  } else if (dateOnly.getTime() === tomorrow.getTime()) {
    return 'Tomorrow';
  } else {
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }
}

function isAllDay(event: { start_time: string; end_time: string; all_day?: boolean }): boolean {
  if (event.all_day) return true;

  const start = new Date(event.start_time);
  const end = new Date(event.end_time);
  const durationHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);

  return durationHours >= 23;
}

export default function CalendarCard() {
  const navigate = useNavigate();
  const { events, fetchEvents, getEventsForDate } = useCalendarStore();

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Get upcoming events (today and future)
  const now = new Date();
  const upcomingEvents = events
    .filter((event) => {
      const eventDate = new Date(event.start_time);
      return eventDate >= new Date(now.getFullYear(), now.getMonth(), now.getDate());
    })
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
    .slice(0, MAX_ITEMS);

  // Count today's events
  const todayEvents = getEventsForDate(now);
  const todayCount = todayEvents.length;

  const handleEventClick = () => {
    navigate('/calendar');
  };

  const handleViewAll = () => {
    navigate('/calendar');
  };

  return (
    <BentoCard
      title="Calendar"
      icon={<CalendarDaysIcon className="w-[18px] h-[18px]" />}
      headerAction={
        todayCount > 0 ? (
          <span className="text-[12px] text-text-tertiary">{todayCount} today</span>
        ) : (
          <button
            onClick={handleViewAll}
            className="text-[12px] font-medium text-text-secondary hover:text-text-body transition-colors"
          >
            View all
          </button>
        )
      }
    >
      {upcomingEvents.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-12 text-text-tertiary">
          <CalendarDaysIcon className="w-8 h-8 mb-2 opacity-40" />
          <p className="text-[13px]">No upcoming events</p>
        </div>
      ) : (
        <div>
          {upcomingEvents.map((event) => (
            <button
              key={event.id}
              onClick={handleEventClick}
              className="w-full flex items-start gap-3 px-5 py-3 hover:bg-bg-gray/50 transition-colors text-left"
            >
              {/* Time block */}
              <div className="w-14 flex-shrink-0 text-right">
                {isAllDay(event) ? (
                  <span className="text-[11px] font-medium text-text-tertiary">All day</span>
                ) : (
                  <span className="text-[12px] font-medium text-text-body">
                    {formatTime(event.start_time)}
                  </span>
                )}
              </div>

              {/* Color indicator - uses account color */}
              <div
                className="w-0.5 min-h-[32px] rounded-full flex-shrink-0"
                style={{ backgroundColor: getAccountPalette(event.account_email).accent }}
              />

              {/* Content */}
              <div className="flex-1 min-w-0">
                <span className="text-[13px] font-medium text-text-body truncate block">
                  {event.title}
                </span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[11px] text-text-tertiary">
                    {formatEventDate(event.start_time)}
                  </span>
                  {event.account_email && (
                    <span className="text-[11px] text-text-tertiary truncate">
                      · {event.account_email.split('@')[0]}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </BentoCard>
  );
}
