import { RRule, Frequency, type WeekdayStr } from 'rrule';

export type RecurrenceFrequency = 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
export type RecurrenceEndType = 'NEVER' | 'ON_DATE' | 'AFTER_COUNT';

export interface RecurrenceConfig {
  frequency: RecurrenceFrequency;
  interval?: number;
  weekDays?: number[]; // 0=Sun, 1=Mon, ..., 6=Sat (RRULE standard)
  monthDay?: number;
  endType: RecurrenceEndType;
  endDate?: Date;
  count?: number;
}

/**
 * Convert RecurrenceConfig (UI format) to RRULE string array (API format)
 */
export function recurrenceConfigToRRule(config: RecurrenceConfig): string[] {
  if (config.frequency === 'NONE') {
    return [];
  }

  const frequencyMap: Record<RecurrenceFrequency, Frequency> = {
    'NONE': Frequency.DAILY, // Placeholder, won't be used
    'DAILY': Frequency.DAILY,
    'WEEKLY': Frequency.WEEKLY,
    'MONTHLY': Frequency.MONTHLY,
    'YEARLY': Frequency.YEARLY
  };

  const options: any = {
    freq: frequencyMap[config.frequency],
    interval: config.interval || 1
  };

  // Handle week days for weekly recurrence
  if (config.frequency === 'WEEKLY' && config.weekDays && config.weekDays.length > 0) {
    // Convert from 0=Sun (our format) to RRule WeekdayStr format
    // We use: 0=Sun, 1=Mon, ..., 6=Sat
    const dayMap: Record<number, WeekdayStr> = {
      0: 'SU',
      1: 'MO',
      2: 'TU',
      3: 'WE',
      4: 'TH',
      5: 'FR',
      6: 'SA'
    };
    const rruleWeekDays = config.weekDays.map(day => dayMap[day] || 'MO');
    options.byweekday = rruleWeekDays;
  }

  // Handle month day for monthly recurrence
  if (config.frequency === 'MONTHLY' && config.monthDay) {
    options.bymonthday = config.monthDay;
  }

  // Handle end conditions
  if (config.endType === 'ON_DATE' && config.endDate) {
    // Set end date to end of day for proper cutoff
    const endDate = new Date(config.endDate);
    endDate.setHours(23, 59, 59, 999);
    options.until = endDate;
  } else if (config.endType === 'AFTER_COUNT' && config.count) {
    options.count = config.count;
  }

  const rrule = new RRule(options);
  return [rrule.toString()];
}

/**
 * Parse RRULE string array to RecurrenceConfig (for editing)
 */
export function rruleToRecurrenceConfig(rruleArray: string[] | undefined): RecurrenceConfig | undefined {
  if (!rruleArray || rruleArray.length === 0) {
    return undefined;
  }

  const rruleString = rruleArray[0];

  try {
    const rrule = RRule.fromString(rruleString);
    const options = rrule.options;

    // Map frequency
    const frequencyMap: Record<Frequency, RecurrenceFrequency> = {
      [Frequency.DAILY]: 'DAILY',
      [Frequency.WEEKLY]: 'WEEKLY',
      [Frequency.MONTHLY]: 'MONTHLY',
      [Frequency.YEARLY]: 'YEARLY',
      [Frequency.HOURLY]: 'DAILY', // Fallback
      [Frequency.MINUTELY]: 'DAILY', // Fallback
      [Frequency.SECONDLY]: 'DAILY' // Fallback
    };

    const frequency = frequencyMap[options.freq] || 'DAILY';

    // Map week days from RRule format to our format
    // RRule internally stores byweekday as numbers: 0=MO, 1=TU, 2=WE, 3=TH, 4=FR, 5=SA, 6=SU
    // We use: 0=Sun, 1=Mon, ..., 6=Sat
    let weekDays: number[] | undefined;
    if (options.byweekday && options.byweekday.length > 0) {
      // RRule: 0=MO, 1=TU, 2=WE, 3=TH, 4=FR, 5=SA, 6=SU
      // Ours:  0=SU, 1=MO, 2=TU, 3=WE, 4=TH, 5=FR, 6=SA
      const rruleToOurs: Record<number, number> = {
        0: 1, // MO -> 1
        1: 2, // TU -> 2
        2: 3, // WE -> 3
        3: 4, // TH -> 4
        4: 5, // FR -> 5
        5: 6, // SA -> 6
        6: 0, // SU -> 0
      };
      weekDays = options.byweekday.map((day: number) => rruleToOurs[day] ?? day).sort();
    }

    // Get month day if present
    const monthDay = options.bymonthday ? options.bymonthday[0] : undefined;

    // Determine end condition
    let endType: RecurrenceEndType = 'NEVER';
    let endDate: Date | undefined;
    let count: number | undefined;

    if (options.until) {
      endType = 'ON_DATE';
      endDate = new Date(options.until);
    } else if (options.count) {
      endType = 'AFTER_COUNT';
      count = options.count;
    }

    return {
      frequency,
      interval: options.interval || 1,
      weekDays,
      monthDay: monthDay as number | undefined,
      endType,
      endDate,
      count
    };
  } catch (error) {
    console.error('Failed to parse RRULE:', error);
    return undefined;
  }
}

/**
 * Generate human-readable description of recurrence
 */
export function recurrenceDescription(config: RecurrenceConfig | undefined): string {
  if (!config || config.frequency === 'NONE') {
    return 'Does not repeat';
  }

  let description = '';

  // Frequency
  switch (config.frequency) {
    case 'DAILY':
      description = config.interval && config.interval > 1
        ? `Every ${config.interval} days`
        : 'Daily';
      break;
    case 'WEEKLY':
      if (config.weekDays && config.weekDays.length > 0) {
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const days = config.weekDays.map(d => dayNames[d]).join(', ');
        description = config.interval && config.interval > 1
          ? `Every ${config.interval} weeks on ${days}`
          : `Weekly on ${days}`;
      } else {
        description = 'Weekly';
      }
      break;
    case 'MONTHLY':
      if (config.monthDay) {
        const suffix = config.monthDay === 1 ? 'st' :
                      config.monthDay === 2 ? 'nd' :
                      config.monthDay === 3 ? 'rd' : 'th';
        description = `Monthly on the ${config.monthDay}${suffix}`;
      } else {
        description = 'Monthly';
      }
      break;
    case 'YEARLY':
      description = config.interval && config.interval > 1
        ? `Every ${config.interval} years`
        : 'Yearly';
      break;
  }

  // End condition
  if (config.endType === 'ON_DATE' && config.endDate) {
    const dateStr = config.endDate.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
    description += `, until ${dateStr}`;
  } else if (config.endType === 'AFTER_COUNT' && config.count) {
    description += `, ${config.count} ${config.count === 1 ? 'time' : 'times'}`;
  }

  return description;
}
