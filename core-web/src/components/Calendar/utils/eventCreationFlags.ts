// Shared refs for managing event creation race conditions
// These refs track when popovers/events are closing to prevent new events from being created
// while a dismiss action is in flight

export const eventCreationFlags = {
  popoverIsClosing: false,
  pendingEventIsClosing: false
};
