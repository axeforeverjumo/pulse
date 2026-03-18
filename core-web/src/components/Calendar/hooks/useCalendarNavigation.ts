import { useState, useMemo, useCallback } from 'react';
import {
  startOfDay,
  startOfWeek,
  addDays,
  addWeeks,
  addMonths,
  generateSwipeableDays,
  generateSwipeableWeeks,
  getTodayDayIndex,
  getCurrentWeekIndex
} from '../utils/dateHelpers';
import type { ViewMode } from '../types/calendar.types';

export function useCalendarNavigation(initialDate = new Date()) {
  const [selectedDate, setSelectedDate] = useState(startOfDay(initialDate));
  const [dayIndex, setDayIndex] = useState(getTodayDayIndex());
  const [weekIndex, setWeekIndex] = useState(getCurrentWeekIndex());

  // Memoized arrays for swipeable navigation
  const swipeableDays = useMemo(() => generateSwipeableDays(), []);
  const swipeableWeeks = useMemo(() => generateSwipeableWeeks(), []);

  const goToToday = useCallback(() => {
    const today = startOfDay(new Date());
    setSelectedDate(today);
    setDayIndex(getTodayDayIndex());
    setWeekIndex(getCurrentWeekIndex());
  }, []);

  const navigateDay = useCallback((direction: 1 | -1) => {
    setSelectedDate(prev => addDays(prev, direction));
    setDayIndex(prev => Math.max(0, Math.min(prev + direction, swipeableDays.length - 1)));
  }, [swipeableDays.length]);

  const navigateWeek = useCallback((direction: 1 | -1) => {
    setSelectedDate(prev => addWeeks(prev, direction));
    setWeekIndex(prev => Math.max(0, Math.min(prev + direction, swipeableWeeks.length - 1)));
  }, [swipeableWeeks.length]);

  const navigateMonth = useCallback((direction: 1 | -1) => {
    setSelectedDate(prev => addMonths(prev, direction));
  }, []);

  const navigate = useCallback((viewMode: ViewMode, direction: 1 | -1) => {
    switch (viewMode) {
      case 'day':
        navigateDay(direction);
        break;
      case 'week':
        navigateWeek(direction);
        break;
      case 'month':
        navigateMonth(direction);
        break;
    }
  }, [navigateDay, navigateWeek, navigateMonth]);

  const selectDate = useCallback((date: Date) => {
    const newDate = startOfDay(date);
    setSelectedDate(newDate);

    // Update day index to match the selected date
    const today = startOfDay(new Date());
    const diffDays = Math.round((newDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const newDayIndex = getTodayDayIndex() + diffDays;
    setDayIndex(Math.max(0, Math.min(newDayIndex, swipeableDays.length - 1)));

    // Update week index to match the selected date
    const currentWeekStart = startOfWeek(today);
    const selectedWeekStart = startOfWeek(newDate);
    const diffWeeks = Math.round((selectedWeekStart.getTime() - currentWeekStart.getTime()) / (1000 * 60 * 60 * 24 * 7));
    const newWeekIndex = getCurrentWeekIndex() + diffWeeks;
    setWeekIndex(Math.max(0, Math.min(newWeekIndex, swipeableWeeks.length - 1)));
  }, [swipeableDays.length, swipeableWeeks.length]);

  return {
    selectedDate,
    setSelectedDate: selectDate,
    dayIndex,
    setDayIndex,
    weekIndex,
    setWeekIndex,
    swipeableDays,
    swipeableWeeks,
    goToToday,
    navigate
  };
}
