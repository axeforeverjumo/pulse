// Date formatting and manipulation utilities

export function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

export function startOfWeek(date: Date): Date {
  const result = new Date(date);
  const day = result.getDay();
  result.setDate(result.getDate() - day);
  result.setHours(0, 0, 0, 0);
  return result;
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function addWeeks(date: Date, weeks: number): Date {
  return addDays(date, weeks * 7);
}

export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

export function addYears(date: Date, years: number): Date {
  const result = new Date(date);
  result.setFullYear(result.getFullYear() + years);
  return result;
}

export function startOfYear(date: Date): Date {
  return new Date(date.getFullYear(), 0, 1);
}

export function formatYearHeader(date: Date): string {
  return date.getFullYear().toString();
}

export function getMonthsInYear(year: number): Date[] {
  return Array.from({ length: 12 }, (_, i) => new Date(year, i, 1));
}

export function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

// Parse date from ISO string, handling timezone conversion appropriately
// For UTC times (Z suffix), converts to local date
// For local times (no suffix), extracts date directly
export function parseDateFromISO(dateString: string): Date {
  const isUTC = dateString.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(dateString);

  if (isUTC) {
    // UTC time - convert to local date
    const date = new Date(dateString);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  // Local time - extract date directly from string
  const dateMatch = dateString.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateMatch) {
    const year = parseInt(dateMatch[1], 10);
    const month = parseInt(dateMatch[2], 10) - 1; // months are 0-indexed
    const day = parseInt(dateMatch[3], 10);
    return new Date(year, month, day);
  }

  // Fallback
  return new Date(dateString);
}

// Parse date for all-day events - always extracts date directly from string
// without timezone conversion (all-day events represent calendar dates, not moments in time)
export function parseDateForAllDayEvent(dateString: string): Date {
  const dateMatch = dateString.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateMatch) {
    const year = parseInt(dateMatch[1], 10);
    const month = parseInt(dateMatch[2], 10) - 1; // months are 0-indexed
    const day = parseInt(dateMatch[3], 10);
    return new Date(year, month, day);
  }
  // Fallback - shouldn't happen for properly formatted all-day events
  return new Date(dateString);
}

export function isToday(date: Date): boolean {
  return isSameDay(date, new Date());
}

export function getMinutesFromMidnight(dateString: string): number {
  // Check if the time is in UTC (has Z suffix or +00:00 offset)
  // If so, convert to local time. Otherwise, use the time as-is.
  const isUTC = dateString.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(dateString);

  if (isUTC) {
    // UTC time - convert to local time for display
    const date = new Date(dateString);
    return date.getHours() * 60 + date.getMinutes();
  }

  // Local time (no timezone indicator) - parse directly from string
  const timeMatch = dateString.match(/T(\d{2}):(\d{2})/);
  if (timeMatch) {
    const hours = parseInt(timeMatch[1], 10);
    const minutes = parseInt(timeMatch[2], 10);
    return hours * 60 + minutes;
  }

  // Fallback
  const date = new Date(dateString);
  return date.getHours() * 60 + date.getMinutes();
}

export function getDurationMinutes(startTime: string, endTime: string): number {
  const start = new Date(startTime);
  const end = new Date(endTime);
  return Math.round((end.getTime() - start.getTime()) / 60000);
}

export function formatDayHeader(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });
}

export function formatWeekHeader(startDate: Date): string {
  const endDate = addDays(startDate, 6);
  const startMonth = startDate.toLocaleDateString('en-US', { month: 'short' });
  const endMonth = endDate.toLocaleDateString('en-US', { month: 'short' });

  if (startMonth === endMonth) {
    return `${startMonth} ${startDate.getDate()}-${endDate.getDate()}`;
  }
  return `${startMonth} ${startDate.getDate()} - ${endMonth} ${endDate.getDate()}`;
}

export function formatMonthHeader(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export function formatTime(dateString: string): string {
  // Check if the time is in UTC (has Z suffix or timezone offset)
  const isUTC = dateString.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(dateString);

  let hours: number;
  let minutes: number;

  if (isUTC) {
    // UTC time - convert to local time for display
    const date = new Date(dateString);
    hours = date.getHours();
    minutes = date.getMinutes();
  } else {
    // Local time - parse directly from string
    const timeMatch = dateString.match(/T(\d{2}):(\d{2})/);
    if (timeMatch) {
      hours = parseInt(timeMatch[1], 10);
      minutes = parseInt(timeMatch[2], 10);
    } else {
      // Fallback
      const date = new Date(dateString);
      hours = date.getHours();
      minutes = date.getMinutes();
    }
  }

  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
}

export function formatTimeRange(startTime: string, endTime: string): string {
  return `${formatTime(startTime)} - ${formatTime(endTime)}`;
}

// Compact time range format: "9 - 10AM" or "9:30 - 10:30AM"
export function formatTimeRangeCompact(startTime: string, endTime: string): string {
  const parseTime = (dateString: string) => {
    const isUTC = dateString.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(dateString);
    let hours: number;
    let minutes: number;

    if (isUTC) {
      const date = new Date(dateString);
      hours = date.getHours();
      minutes = date.getMinutes();
    } else {
      const timeMatch = dateString.match(/T(\d{2}):(\d{2})/);
      if (timeMatch) {
        hours = parseInt(timeMatch[1], 10);
        minutes = parseInt(timeMatch[2], 10);
      } else {
        const date = new Date(dateString);
        hours = date.getHours();
        minutes = date.getMinutes();
      }
    }

    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
    return { displayHours, minutes, period, hours };
  };

  const start = parseTime(startTime);
  const end = parseTime(endTime);

  const formatWithMinutes = (h: number, m: number) =>
    m === 0 ? `${h}` : `${h}:${m.toString().padStart(2, '0')}`;

  const startStr = formatWithMinutes(start.displayHours, start.minutes);
  const endStr = formatWithMinutes(end.displayHours, end.minutes);

  // If same period, only show it once at the end
  if (start.period === end.period) {
    return `${startStr} - ${endStr}${end.period}`;
  }

  // Different periods, show both
  return `${startStr}${start.period} - ${endStr}${end.period}`;
}

export function formatHour(hour: number): string {
  if (hour === 0) return '12 AM';
  if (hour === 12) return '12 PM';
  if (hour < 12) return `${hour} AM`;
  return `${hour - 12} PM`;
}

export function getDaysInMonth(date: Date): (Date | null)[] {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startingDay = firstDay.getDay();

  const days: (Date | null)[] = [];

  // Add empty slots for days before the first of the month
  for (let i = 0; i < startingDay; i++) {
    days.push(null);
  }

  // Add all days of the month
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(new Date(year, month, i));
  }

  return days;
}

export function getWeekDays(startDate: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(startDate, i));
}

// Generate array of dates for swipeable day navigation (±180 days)
export function generateSwipeableDays(): Date[] {
  const today = startOfDay(new Date());
  return Array.from({ length: 361 }, (_, i) => addDays(today, i - 180));
}

// Generate array of week start dates for swipeable week navigation (±52 weeks)
export function generateSwipeableWeeks(): Date[] {
  const currentWeekStart = startOfWeek(new Date());
  return Array.from({ length: 105 }, (_, i) => addWeeks(currentWeekStart, i - 52));
}

// Get the index for today in the swipeable days array
export function getTodayDayIndex(): number {
  return 180;
}

// Get the index for current week in the swipeable weeks array
export function getCurrentWeekIndex(): number {
  return 52;
}
