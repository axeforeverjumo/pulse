import { useMemo } from 'react';
import { getDaysInMonth, isToday, getMonthsInYear } from '../utils/dateHelpers';
import { useCalendarStore } from '../../../stores/calendarStore';

interface YearViewProps {
  selectedDate: Date;
  onMonthSelect: (date: Date) => void;
  onDaySelect: (date: Date) => void;
}

const WEEK_DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function YearView({
  selectedDate,
  onMonthSelect,
  onDaySelect
}: YearViewProps) {
  const year = selectedDate.getFullYear();
  const months = useMemo(() => getMonthsInYear(year), [year]);

  // Use the store's indexed selector for O(1) event lookups
  // Subscribe to events and selectedAccountIds to re-render when either changes
  useCalendarStore((state) => state.events);
  useCalendarStore((state) => state.selectedAccountIds);
  const getEventsForDate = useCalendarStore((state) => state.getEventsForDate);

  const hasEventsOnDate = (date: Date): boolean => {
    return getEventsForDate(date).length > 0;
  };

  return (
    <div className="flex-1 overflow-y-auto px-8 py-6 bg-white">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-10 gap-y-8">
        {months.map((month, monthIndex) => {
          const days = getDaysInMonth(month);

          return (
            <div key={monthIndex}>
              {/* Month header - clickable */}
              <button
                onClick={() => onMonthSelect(month)}
                className="w-full text-left text-lg font-normal text-gray-900 mb-3 hover:text-blue-600 transition-colors"
              >
                {MONTH_NAMES[monthIndex]}
              </button>

              {/* Week day headers */}
              <div className="grid grid-cols-7 mb-1">
                {WEEK_DAYS.map((day, i) => (
                  <div
                    key={i}
                    className="text-center text-gray-400 font-medium text-[11px]"
                  >
                    {day}
                  </div>
                ))}
              </div>

              {/* Days grid */}
              <div className="grid grid-cols-7 gap-y-0.5">
                {days.map((date, index) => {
                  if (!date) {
                    return <div key={index} className="h-7" />;
                  }

                  const dayIsToday = isToday(date);
                  const hasEvents = hasEventsOnDate(date);

                  return (
                    <button
                      key={index}
                      onClick={() => onDaySelect(date)}
                      className="h-7 flex flex-col items-center justify-center relative transition-colors hover:bg-gray-100 rounded"
                    >
                      <span
                        className={`
                          w-6 h-6 flex items-center justify-center rounded-full text-sm
                          ${dayIsToday
                            ? 'bg-blue-500 text-white font-medium'
                            : 'text-gray-700'
                          }
                        `}
                      >
                        {date.getDate()}
                      </span>
                      {/* Event indicator dot */}
                      {hasEvents && !dayIsToday && (
                        <div
                          className="absolute rounded-full bg-orange-500"
                          style={{
                            width: 3,
                            height: 3,
                            bottom: 1
                          }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
