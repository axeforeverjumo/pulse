import { useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../stores/authStore";
import { usePresenceStore } from "../stores/presenceStore";
import {
  noteVisible,
  shouldResubscribeOnResume,
  markResubscribeAttempt,
} from "../lib/revalidation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  getPresenceSessionId,
  toWorkspacePresenceSnapshot,
  type PresenceTrackPayload,
} from "../lib/presence";

const TYPING_TIMEOUT_MS = 3000;
const TYPING_DEBOUNCE_MS = 2000;
const PRESENCE_RECONNECT_DELAY_MS = 1500;

interface ChannelContext {
  channel: RealtimeChannel;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
}

const presenceSessionId = getPresenceSessionId();
const presenceChannels = new Map<string, ChannelContext>();

let activeTypingWorkspaceId: string | null = null;
let activeTypingChannel: RealtimeChannel | null = null;
let lastTypingBroadcast = 0;

function clearReconnectTimer(workspaceId: string) {
  const context = presenceChannels.get(workspaceId);
  if (!context?.reconnectTimer) return;
  clearTimeout(context.reconnectTimer);
  context.reconnectTimer = null;
}

function teardownWorkspaceChannel(workspaceId: string) {
  const context = presenceChannels.get(workspaceId);
  if (!context) return;

  if (activeTypingWorkspaceId === workspaceId) {
    activeTypingWorkspaceId = null;
    activeTypingChannel = null;
  }
  clearReconnectTimer(workspaceId);
  void context.channel.unsubscribe().catch((error) => {
    console.warn(`[WorkspacePresence] Failed to unsubscribe ${workspaceId}:`, error);
  });
  presenceChannels.delete(workspaceId);
  usePresenceStore.getState().clearWorkspacePresence(workspaceId);
}

function teardownAllPresenceChannels() {
  for (const workspaceId of [...presenceChannels.keys()]) {
    teardownWorkspaceChannel(workspaceId);
  }
}

function isChannelBusy(channel: RealtimeChannel) {
  return channel.state === "joined" || channel.state === "joining" || channel.state === "leaving";
}

export function useWorkspacePresence(
  activeWorkspaceId: string | undefined,
  workspaceIds: string[],
) {
  const typingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const activeWsRef = useRef<string | undefined>(activeWorkspaceId);
  activeWsRef.current = activeWorkspaceId;
  const currentUserId = useAuthStore((s) => s.user?.id);

  const normalizedWorkspaceIds = [...new Set(workspaceIds.filter(Boolean))].sort();
  const workspaceIdsKey = JSON.stringify(normalizedWorkspaceIds);

  // Subscribe to presence on ALL the user's workspaces simultaneously.
  useEffect(() => {
    const workspaceIdList: string[] = workspaceIdsKey ? JSON.parse(workspaceIdsKey) : [];

    if (!currentUserId || workspaceIdList.length === 0) {
      teardownAllPresenceChannels();
      usePresenceStore.getState().clearAll();
      return;
    }

    const targetWorkspaceIds = new Set(workspaceIdList);

    // Remove channels for workspaces we're no longer in
    for (const workspaceId of [...presenceChannels.keys()]) {
      if (!targetWorkspaceIds.has(workspaceId)) {
        teardownWorkspaceChannel(workspaceId);
      }
    }

    // Add channels for new workspaces
    for (const workspaceId of workspaceIdList) {
      if (presenceChannels.has(workspaceId)) continue;

      const channel = supabase.channel(`workspace:${workspaceId}`, {
        config: { presence: { key: presenceSessionId } },
      });
      const context: ChannelContext = {
        channel,
        reconnectTimer: null,
      };
      presenceChannels.set(workspaceId, context);

      channel
        .on("presence", { event: "sync" }, () => {
          const liveContext = presenceChannels.get(workspaceId);
          if (!liveContext || liveContext.channel !== channel) return;
          usePresenceStore
            .getState()
            .setWorkspacePresenceSnapshot(
              workspaceId,
              toWorkspacePresenceSnapshot(
                channel.presenceState<PresenceTrackPayload>(),
              ),
            );
        })
        // Typing listeners gated to active workspace only
        .on("broadcast", { event: "typing" }, (msg) => {
          if (activeWsRef.current !== workspaceId) return;
          const { userId, userName: name, channelId } = msg.payload;
          if (!channelId || userId === currentUserId) return;

          usePresenceStore.getState().addTypingUser({
            userId,
            userName: name,
            channelId,
            timestamp: Date.now(),
          });

          const timerKey = `${channelId}:${userId}`;
          const existing = typingTimersRef.current.get(timerKey);
          if (existing) clearTimeout(existing);

          const timer = setTimeout(() => {
            usePresenceStore.getState().removeTypingUser(channelId, userId);
            typingTimersRef.current.delete(timerKey);
          }, TYPING_TIMEOUT_MS);

          typingTimersRef.current.set(timerKey, timer);
        })
        .on("broadcast", { event: "stop_typing" }, (msg) => {
          if (activeWsRef.current !== workspaceId) return;
          const { userId, channelId } = msg.payload;
          if (!channelId) return;
          usePresenceStore.getState().removeTypingUser(channelId, userId);
          const timerKey = `${channelId}:${userId}`;
          const existing = typingTimersRef.current.get(timerKey);
          if (existing) {
            clearTimeout(existing);
            typingTimersRef.current.delete(timerKey);
          }
        })
        .subscribe(async (status) => {
          const liveContext = presenceChannels.get(workspaceId);
          if (!liveContext || liveContext.channel !== channel) return;

          console.log(`[WorkspacePresence] ${workspaceId} status:`, status);

          if (status === "SUBSCRIBED") {
            clearReconnectTimer(workspaceId);
            await channel.track({
              user_id: currentUserId,
              session_id: presenceSessionId,
              online_at: new Date().toISOString(),
            });
            return;
          }

          if (status !== "TIMED_OUT" && status !== "CHANNEL_ERROR" && status !== "CLOSED") {
            return;
          }

          // Clear stale snapshot immediately — if the channel is unhealthy, the
          // last-known presence data is unreliable. It will repopulate on the
          // next successful sync after reconnect.
          usePresenceStore.getState().clearWorkspacePresence(workspaceId);

          if (liveContext.reconnectTimer) return;

          liveContext.reconnectTimer = setTimeout(() => {
            const currentContext = presenceChannels.get(workspaceId);
            if (!currentContext || currentContext.channel !== channel) return;
            if (isChannelBusy(channel)) {
              currentContext.reconnectTimer = null;
              return;
            }

            console.log(`[WorkspacePresence] Reconnecting ${workspaceId} after ${status}`);
            markResubscribeAttempt();
            void channel
              .unsubscribe()
              .catch((error) => {
                console.warn(
                  `[WorkspacePresence] Failed to unsubscribe ${workspaceId} during reconnect:`,
                  error,
                );
              })
              .finally(() => {
                const latestContext = presenceChannels.get(workspaceId);
                if (!latestContext || latestContext.channel !== channel) return;
                if (channel.state === "joined" || channel.state === "joining") {
                  latestContext.reconnectTimer = null;
                  return;
                }
                channel.subscribe();
                latestContext.reconnectTimer = null;
              });
          }, PRESENCE_RECONNECT_DELAY_MS);
        });
    }
  }, [currentUserId, workspaceIdsKey]);

  // Update active typing channel when workspace switches
  useEffect(() => {
    typingTimersRef.current.forEach((timer) => clearTimeout(timer));
    typingTimersRef.current.clear();
    usePresenceStore.setState({ typingUsers: {} });

    if (!activeWorkspaceId || !currentUserId) {
      activeTypingWorkspaceId = null;
      activeTypingChannel = null;
      return;
    }

    const context = presenceChannels.get(activeWorkspaceId);
    if (!context) {
      activeTypingWorkspaceId = null;
      activeTypingChannel = null;
      return;
    }

    activeTypingWorkspaceId = activeWorkspaceId;
    activeTypingChannel = context.channel;
  }, [activeWorkspaceId, currentUserId]);

  // Resubscribe all channels on resume/focus
  useEffect(() => {
    const workspaceIdList: string[] = workspaceIdsKey ? JSON.parse(workspaceIdsKey) : [];
    if (!currentUserId || workspaceIdList.length === 0) return;

    const handleResume = () => {
      if (document.visibilityState === "hidden") return;
      noteVisible();
      if (!shouldResubscribeOnResume()) return;

      for (const [workspaceId, context] of presenceChannels.entries()) {
        if (context.channel.state === "joining" || context.channel.state === "leaving") {
          continue;
        }

        console.log(`[WorkspacePresence] Resubscribing ${workspaceId} on resume`);
        markResubscribeAttempt();
        void context.channel
          .unsubscribe()
          .catch((error) => {
            console.warn(`[WorkspacePresence] Failed to unsubscribe ${workspaceId} on resume:`, error);
          })
          .finally(() => {
            const liveContext = presenceChannels.get(workspaceId);
            if (!liveContext || liveContext.channel !== context.channel) return;
            context.channel.subscribe();
          });
      }
    };

    document.addEventListener("visibilitychange", handleResume);
    window.addEventListener("focus", handleResume);
    return () => {
      document.removeEventListener("visibilitychange", handleResume);
      window.removeEventListener("focus", handleResume);
    };
  }, [currentUserId, workspaceIdsKey]);

  // Cleanup on unmount
  useEffect(() => {
    const typingTimers = typingTimersRef.current;
    return () => {
      teardownAllPresenceChannels();
      typingTimers.forEach((timer) => clearTimeout(timer));
      typingTimers.clear();
      usePresenceStore.getState().clearAll();
    };
  }, []);
}

// Standalone broadcast functions — usable from any component
export function broadcastTyping(channelId: string) {
  if (!activeTypingChannel) return;
  const now = Date.now();
  if (now - lastTypingBroadcast < TYPING_DEBOUNCE_MS) return;
  lastTypingBroadcast = now;

  const state = useAuthStore.getState();
  const userId = state.user?.id;
  if (!userId) return;

  const payload = {
    userId,
    userName: state.userProfile?.name || state.user?.email || "Someone",
    channelId,
  };

  if (activeTypingChannel.state === "joined") {
    void activeTypingChannel.send({
      type: "broadcast",
      event: "typing",
      payload,
    });
    return;
  }

  void activeTypingChannel.httpSend("typing", payload).catch(() => {});
}

export function stopTyping(channelId: string) {
  if (!activeTypingChannel) return;
  const userId = useAuthStore.getState().user?.id;
  if (!userId) return;

  const payload = { userId, channelId };

  if (activeTypingChannel.state === "joined") {
    void activeTypingChannel.send({
      type: "broadcast",
      event: "stop_typing",
      payload,
    });
    return;
  }

  void activeTypingChannel.httpSend("stop_typing", payload).catch(() => {});
}
