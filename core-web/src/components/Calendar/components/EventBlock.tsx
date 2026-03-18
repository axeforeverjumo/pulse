import { useMemo } from "react";
import type { CalendarEvent } from "../../../api/client";
import type { EventLayoutInfo } from "../types/calendar.types";
import { formatTime } from "../utils/dateHelpers";
import {
  calculateEventPosition,
  calculateWeekEventPosition,
} from "../utils/eventLayout";
import { getAccountPalette } from "../../../utils/accountColors";

interface EventBlockProps {
  event: CalendarEvent;
  layout: EventLayoutInfo;
  containerWidth: number;
  dayIndex?: number; // For week view
  onClick: (event: CalendarEvent) => void;
  isWeekView?: boolean;
  hourHeight?: number;
  timeColumnWidth?: number;
}

export default function EventBlock({
  event,
  layout,
  containerWidth,
  dayIndex = 0,
  onClick,
  isWeekView = false,
  hourHeight = 60,
  timeColumnWidth = 53,
}: EventBlockProps) {
  const position = isWeekView
    ? calculateWeekEventPosition(
        event,
        layout,
        (containerWidth - timeColumnWidth) / 7,
        dayIndex,
        hourHeight,
        timeColumnWidth,
      )
    : calculateEventPosition(
        event,
        layout,
        containerWidth,
        hourHeight,
        timeColumnWidth,
      );

  // Show time for events >= 45 minutes (adjust threshold for week view)
  // Day view: only show if enough space (don't overlap with title)
  const isVeryShortEvent = position.height < 25;
  const isShortEvent = position.height < 40;
  const timeThreshold = isWeekView ? 35 : 50;
  const showTime = position.height >= timeThreshold && !isVeryShortEvent;
  const palette = useMemo(() => getAccountPalette(event.account_email), [event.account_email]);

  // For short events, reduce padding so title fits
  const getPadding = () => {
    if (isWeekView) return "2px 4px";
    if (isVeryShortEvent) return "1px 6px";
    if (isShortEvent) return "2px 8px";
    return "6px 8px";
  };

  return (
    <button
      onClick={() => onClick(event)}
      data-event-id={event.id}
      className="absolute text-left transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 rounded-md overflow-hidden"
      style={{
        top: position.top,
        left: position.left,
        width: position.width,
        height: position.height,
        borderRadius: isWeekView ? 4 : 6,
        backgroundColor: `${palette.bg}d9`,
        // @ts-expect-error CSS custom property for focus ring
        '--tw-ring-color': `${palette.accent}66`,
      }}
    >
      <div
        className={`h-full overflow-hidden ${isShortEvent ? 'flex items-center' : ''}`}
        style={{
          padding: getPadding(),
        }}
      >
        <p
          className="font-medium truncate"
          style={{
            fontSize: isVeryShortEvent ? 10 : isWeekView ? 11 : 13,
            lineHeight: 1.2,
            color: palette.title,
          }}
        >
          {event.title}
        </p>
        {showTime && (
          <p
            className="truncate mt-0.5"
            style={{
              fontSize: 11,
              color: palette.time,
            }}
          >
            {formatTime(event.start_time)}
          </p>
        )}
      </div>
    </button>
  );
}
