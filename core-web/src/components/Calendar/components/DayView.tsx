import { useRef, useEffect, useState } from 'react';
import type { CalendarEvent } from '../../../api/client';
import TimelineGrid from './TimelineGrid';

interface DayViewProps {
  selectedDate: Date;
  onEventClick: (event: CalendarEvent, element: HTMLDivElement) => void;
  onTimeSlotClick: (date: Date, hour: number, triggerRect: DOMRect) => void;
  swipeableDays: Date[];
  currentDayIndex: number;
  onDayIndexChange: (index: number) => void;
  onDateChange: (date: Date) => void;
}

export default function DayView({
  selectedDate,
  onEventClick,
  onTimeSlotClick,
  swipeableDays,
  currentDayIndex,
  onDayIndexChange,
  onDateChange
}: DayViewProps) {
  console.log('[DayView] Rendered with onEventClick:', typeof onEventClick);

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    if (containerRef.current) {
      setContainerWidth(containerRef.current.offsetWidth);

      const resizeObserver = new ResizeObserver(entries => {
        for (const entry of entries) {
          setContainerWidth(entry.contentRect.width);
        }
      });

      resizeObserver.observe(containerRef.current);
      return () => resizeObserver.disconnect();
    }
  }, []);

  // Handle horizontal swipe
  useEffect(() => {
    const container = containerRef.current;
    if (!container || containerWidth === 0) return;

    let startX = 0;
    let currentX = 0;
    let isDragging = false;

    const handleTouchStart = (e: TouchEvent) => {
      startX = e.touches[0].clientX;
      isDragging = true;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDragging) return;
      currentX = e.touches[0].clientX;
    };

    const handleTouchEnd = () => {
      if (!isDragging) return;
      isDragging = false;

      const diff = startX - currentX;
      const threshold = containerWidth * 0.2;

      if (Math.abs(diff) > threshold) {
        if (diff > 0 && currentDayIndex < swipeableDays.length - 1) {
          // Swipe left - next day
          const newIndex = currentDayIndex + 1;
          onDayIndexChange(newIndex);
          onDateChange(swipeableDays[newIndex]);
        } else if (diff < 0 && currentDayIndex > 0) {
          // Swipe right - previous day
          const newIndex = currentDayIndex - 1;
          onDayIndexChange(newIndex);
          onDateChange(swipeableDays[newIndex]);
        }
      }
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: true });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [containerWidth, currentDayIndex, swipeableDays, onDayIndexChange, onDateChange]);

  return (
    <div ref={containerRef} className="flex-1 flex flex-col overflow-hidden">
      <TimelineGrid
        date={selectedDate}
        onEventClick={onEventClick}
        onTimeSlotClick={onTimeSlotClick}
      />
    </div>
  );
}
