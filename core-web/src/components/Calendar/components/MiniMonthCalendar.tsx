import { useMemo, useState, useEffect, type ReactElement } from 'react';
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek
} from 'date-fns';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';

interface MiniMonthCalendarProps {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  className?: string;
}

export default function MiniMonthCalendar({
  selectedDate,
  onSelectDate,
  className = ''
}: MiniMonthCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(selectedDate));

  useEffect(() => {
    setCurrentMonth(startOfMonth(selectedDate));
  }, [selectedDate]);

  const monthLabel = useMemo(() => format(currentMonth, 'MMMM yyyy'), [currentMonth]);

  const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  const cells = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);

    const rows: ReactElement[] = [];
    let day = startDate;

    while (day <= endDate) {
      const row: ReactElement[] = [];
      for (let i = 0; i < 7; i++) {
        const cellDate = day;
        const isSelected = isSameDay(cellDate, selectedDate);
        const isCurrentMonth = isSameMonth(cellDate, monthStart);
        const isTodayDate = isToday(cellDate);

        row.push(
          <button
            key={cellDate.toISOString()}
            type="button"
            onClick={() => onSelectDate(cellDate)}
            className={[
              'w-6 h-6 text-xs rounded-full transition-colors flex items-center justify-center',
              isCurrentMonth ? 'text-text-body' : 'text-text-tertiary',
              // Today always gets black circle
              isTodayDate ? 'bg-black text-white' : '',
              // Selected (but not today) gets light gray circle
              isSelected && !isTodayDate ? 'bg-gray-200' : '',
              // Hover state for non-selected, non-today dates
              !isSelected && !isTodayDate ? 'hover:bg-bg-gray-dark/30' : ''
            ].join(' ')}
          >
            {format(cellDate, 'd')}
          </button>
        );

        day = addDays(day, 1);
      }
      rows.push(
        <div key={day.toISOString()} className="grid grid-cols-7 gap-1 justify-items-center">
          {row}
        </div>
      );
    }

    return rows;
  }, [currentMonth, onSelectDate, selectedDate]);

  return (
    <div className={`rounded-lg ${className}`}>
      <div className="grid grid-cols-[24px_1fr_24px] items-center py-1.5">
        <button
          type="button"
          onClick={() => setCurrentMonth(addMonths(currentMonth, -1))}
          className="w-6 h-6 inline-flex items-center justify-center rounded-md hover:bg-bg-gray-dark/50 transition-colors"
          aria-label="Previous month"
        >
          <ChevronLeftIcon className="w-4 h-4 text-text-tertiary" />
        </button>
        <div className="text-sm font-medium text-text-body text-center">{monthLabel}</div>
        <button
          type="button"
          onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
          className="w-6 h-6 inline-flex items-center justify-center rounded-md hover:bg-bg-gray-dark/50 transition-colors"
          aria-label="Next month"
        >
          <ChevronRightIcon className="w-4 h-4 text-text-tertiary" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 pb-1 text-[10px] uppercase tracking-wide text-text-tertiary justify-items-center">
        {days.map((day, index) => (
          <div key={index} className="text-center">
            {day}
          </div>
        ))}
      </div>
      <div className="pb-2 space-y-1">{cells}</div>
    </div>
  );
}
