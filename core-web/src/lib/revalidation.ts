import { useMessagesStore } from '../stores/messagesStore';
import { useNotificationStore } from '../stores/notificationStore';
import { useFilesStore } from '../stores/filesStore';
import { useCalendarStore } from '../stores/calendarStore';

const RESUME_REVALIDATE_THRESHOLD_MS = 30_000;
const RESUME_RESUBSCRIBE_THRESHOLD_MS = 60_000;
const REALTIME_STALE_THRESHOLD_MS = 60_000;
const REVALIDATE_THROTTLE_MS = 10_000;
const RESUBSCRIBE_THROTTLE_MS = 10_000;
const NOTIFICATION_STALE_MS = 5 * 60 * 1000;

let lastHiddenAt: number | null = null;
let lastVisibleAt: number | null = null;
let lastRevalidateAt: number | null = null;
let lastResubscribeAt: number | null = null;
let lastRealtimeEventAt: number | null = null;

function getAwayDuration(): number | null {
  if (lastHiddenAt === null || lastVisibleAt === null) return null;
  if (lastVisibleAt < lastHiddenAt) return null;
  return lastVisibleAt - lastHiddenAt;
}

export function noteHidden() {
  lastHiddenAt = Date.now();
}

export function noteVisible() {
  lastVisibleAt = Date.now();
}

export function markRealtimeEvent() {
  lastRealtimeEventAt = Date.now();
}

export function shouldRevalidateOnResume(): boolean {
  const now = Date.now();
  const awayDuration = getAwayDuration();
  if (awayDuration !== null) {
    return awayDuration >= RESUME_REVALIDATE_THRESHOLD_MS;
  }

  if (lastRevalidateAt === null) return false;
  return now - lastRevalidateAt >= RESUME_REVALIDATE_THRESHOLD_MS;
}

export function shouldResubscribeOnResume(): boolean {
  const now = Date.now();
  if (lastResubscribeAt && now - lastResubscribeAt < RESUBSCRIBE_THROTTLE_MS) {
    return false;
  }

  const awayDuration = getAwayDuration();
  const realtimeStale = !lastRealtimeEventAt || now - lastRealtimeEventAt >= REALTIME_STALE_THRESHOLD_MS;

  if (awayDuration !== null) {
    if (awayDuration >= RESUME_RESUBSCRIBE_THRESHOLD_MS) return true;
    if (awayDuration >= RESUME_REVALIDATE_THRESHOLD_MS && realtimeStale) return true;
    return false;
  }

  return realtimeStale;
}

export function markResubscribeAttempt() {
  lastResubscribeAt = Date.now();
}

export function revalidateActiveData(reason: string) {
  const now = Date.now();
  console.log('[Revalidation]', reason);
  if (lastRevalidateAt && now - lastRevalidateAt < REVALIDATE_THROTTLE_MS) {
    return;
  }
  lastRevalidateAt = now;

  const messagesStore = useMessagesStore.getState();
  if (messagesStore.activeChannelId) {
    void messagesStore.fetchMessages(messagesStore.activeChannelId, true);
  }
  void messagesStore.fetchUnreadCounts();
  void messagesStore.fetchChannels(true);
  if (messagesStore.dms.length > 0) {
    void messagesStore.fetchDMs();
  }

  const filesStore = useFilesStore.getState();
  if (filesStore.workspaceAppId) {
    void filesStore.fetchDocuments(filesStore.currentFolderId, { background: true });
  }

  const notificationStore = useNotificationStore.getState();
  void notificationStore.fetchUnreadCount();
  const notificationStale =
    !notificationStore.lastFetched || now - notificationStore.lastFetched > NOTIFICATION_STALE_MS;
  if (notificationStore.isOpen || notificationStale) {
    void notificationStore.fetchNotifications();
  }

  const calendarStore = useCalendarStore.getState();
  if (calendarStore.events.length > 0 || calendarStore.lastFetched) {
    void calendarStore.refreshEvents();
  }
}
