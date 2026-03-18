import { useRef, useEffect, useState, useCallback } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowLeft01Icon, ArrowRight01Icon } from '@hugeicons-pro/core-stroke-standard';
import type { ViewMode } from '../types/calendar.types';

// Inject keyframes once for smooth animations
const KEYFRAMES_ID = 'calendar-header-keyframes';
if (typeof document !== 'undefined' && !document.getElementById(KEYFRAMES_ID)) {
  const style = document.createElement('style');
  style.id = KEYFRAMES_ID;
  style.textContent = `
    @keyframes calendarSlideInFromBelow {
      from { transform: translateY(100%); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    @keyframes calendarSlideInFromAbove {
      from { transform: translateY(-100%); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    @keyframes calendarSlideOutToAbove {
      from { transform: translateY(0); opacity: 1; }
      to { transform: translateY(-100%); opacity: 0; }
    }
    @keyframes calendarSlideOutToBelow {
      from { transform: translateY(0); opacity: 1; }
      to { transform: translateY(100%); opacity: 0; }
    }
  `;
  document.head.appendChild(style);
}

interface HeaderText {
  month: string;
  year: string;
}

interface CalendarHeaderProps {
  date: Date;
  viewMode: ViewMode;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
}

export default function CalendarHeader({
  date,
  viewMode,
  onPrevious,
  onNext,
  onToday
}: CalendarHeaderProps) {
  const [items, setItems] = useState<Array<{ text: HeaderText; id: number }>>([]);
  const [direction, setDirection] = useState<'up' | 'down'>('down');
  const idRef = useRef(0);
  const prevDateRef = useRef(date);
  const prevViewModeRef = useRef(viewMode);

  const getHeaderText = useCallback((d: Date, mode: ViewMode) => {
    if (mode === 'year') return { month: '', year: d.getFullYear().toString() };
    const monthName = d.toLocaleDateString('en-US', { month: 'long' });
    const year = d.getFullYear().toString();
    return { month: monthName, year };
  }, []);

  // Initialize
  useEffect(() => {
    setItems([{ text: getHeaderText(date, viewMode), id: idRef.current++ }]);
  }, []);

  // Handle date or viewMode changes
  useEffect(() => {
    const prevDate = prevDateRef.current;
    const prevMode = prevViewModeRef.current;
    const newText = getHeaderText(date, viewMode);
    const currentText = items[items.length - 1]?.text;

    // Check if we need to update (date changed OR viewMode changed)
    const dateChanged = date.getTime() !== prevDate.getTime();
    const viewModeChanged = viewMode !== prevMode;
    const textChanged = !currentText || newText.month !== currentText.month || newText.year !== currentText.year;

    if (items.length > 0 && (dateChanged || viewModeChanged) && textChanged) {
      // Determine animation direction
      let newDirection: 'up' | 'down' = 'down';
      if (dateChanged) {
        newDirection = date > prevDate ? 'down' : 'up';
      }
      setDirection(newDirection);

      // Add new item (triggers enter animation via unique key)
      setItems(prev => [...prev, { text: newText, id: idRef.current++ }]);

      // Remove old item after animation completes
      const timer = setTimeout(() => {
        setItems(prev => prev.slice(-1));
      }, 200);

      prevDateRef.current = date;
      prevViewModeRef.current = viewMode;
      return () => clearTimeout(timer);
    }
  }, [date, viewMode, items, getHeaderText]);

  return (
    <div className="flex items-center gap-4">
      <div className="relative h-10 min-w-[240px] overflow-hidden">
        {items.map((item, index) => {
          const isLatest = index === items.length - 1;
          const isAnimating = items.length > 1;

          let animation = 'none';
          if (isAnimating) {
            if (isLatest) {
              // Entering text
              animation = direction === 'down'
                ? 'calendarSlideInFromBelow 200ms ease-out forwards'
                : 'calendarSlideInFromAbove 200ms ease-out forwards';
            } else {
              // Exiting text
              animation = direction === 'down'
                ? 'calendarSlideOutToAbove 200ms ease-out forwards'
                : 'calendarSlideOutToBelow 200ms ease-out forwards';
            }
          }

          const headerText = item.text as HeaderText;
          return (
            <h1
              key={item.id}
              className="absolute inset-0 text-3xl font-semibold text-gray-900 whitespace-nowrap"
              style={{ animation }}
            >
              {headerText.month}
              {headerText.month && headerText.year && ' '}
              <span className="font-normal">{headerText.year}</span>
            </h1>
          );
        })}
      </div>
      <button
        onClick={onToday}
        className="px-2 py-0.5 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
      >
        Today
      </button>
      {viewMode !== 'year' && (
        <div className="flex items-center gap-1">
          <button
            onClick={onPrevious}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="Previous"
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} size={16} strokeWidth={2} />
          </button>
          <button
            onClick={onNext}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="Next"
          >
            <HugeiconsIcon icon={ArrowRight01Icon} size={16} strokeWidth={2} />
          </button>
        </div>
      )}
    </div>
  );
}
