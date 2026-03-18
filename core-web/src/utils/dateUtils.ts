import {
  differenceInDays,
  isPast,
  isToday,
  isTomorrow,
  isYesterday,
  format,
  startOfDay,
} from 'date-fns';

export interface RelativeDateInfo {
  text: string;
  isOverdue: boolean;
  isSoon: boolean; // Due within 2 days
  isToday: boolean;
}

// Parse date string as local date (avoids UTC timezone issues)
// Handles both "YYYY-MM-DD" and full ISO timestamps like "2026-02-04T12:00:00Z"
function parseLocalDate(dateStr: string): Date {
  // Extract just the date portion (first 10 chars: YYYY-MM-DD)
  const datePart = dateStr.slice(0, 10);
  const [year, month, day] = datePart.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function getRelativeDate(dateString: string): RelativeDateInfo {
  const date = startOfDay(parseLocalDate(dateString));
  const now = startOfDay(new Date());
  const daysDiff = differenceInDays(date, now);

  // Check if overdue
  if (isPast(date) && !isToday(date)) {
    const daysOverdue = Math.abs(daysDiff);
    if (isYesterday(date)) {
      return { text: 'Overdue by 1 day', isOverdue: true, isSoon: false, isToday: false };
    }
    return {
      text: `Overdue by ${daysOverdue} days`,
      isOverdue: true,
      isSoon: false,
      isToday: false,
    };
  }

  // Due today
  if (isToday(date)) {
    return { text: 'Due today', isOverdue: false, isSoon: true, isToday: true };
  }

  // Due tomorrow
  if (isTomorrow(date)) {
    return { text: 'Due tomorrow', isOverdue: false, isSoon: true, isToday: false };
  }

  // Due within a week
  if (daysDiff <= 7) {
    return {
      text: `Due in ${daysDiff} days`,
      isOverdue: false,
      isSoon: daysDiff <= 2,
      isToday: false,
    };
  }

  // Due later - show formatted date
  return {
    text: format(date, 'MMM d'),
    isOverdue: false,
    isSoon: false,
    isToday: false,
  };
}

export function formatDateShort(dateString: string): string {
  return format(parseLocalDate(dateString), 'MMM d');
}

export function formatDateFull(dateString: string): string {
  return format(new Date(dateString), "MMM d, yyyy 'at' h:mma");
}
