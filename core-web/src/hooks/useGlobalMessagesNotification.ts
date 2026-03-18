import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { useMessagesStore } from '../stores/messagesStore';
import { getChannelMessage, getChannel } from '../api/client';
import { playMessageNotification } from '../lib/notificationSound';
import { showMessageNotification } from '../lib/messageNotification';
import type { RealtimeChannel } from '@supabase/supabase-js';

/**
 * Global hook to subscribe to message notifications across all channels in all workspaces.
 * This should be used at the App level to ensure notifications work regardless of current route.
 */
export function useGlobalMessagesNotification() {
  const subscriptionRef = useRef<RealtimeChannel | null>(null);
  const notifiedMessageIds = useRef<Set<string>>(new Set());
  const navigate = useNavigate();
  const currentUserId = useAuthStore((state) => state.user?.id);
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const setActiveChannel = useMessagesStore((state) => state.setActiveChannel);

  useEffect(() => {
    if (!currentUserId) {
      // Not logged in, cleanup any existing subscription
      if (subscriptionRef.current) {
        subscriptionRef.current.unsubscribe();
        subscriptionRef.current = null;
      }
      return;
    }

    // Get all message app IDs from workspaces
    const messageAppIds: string[] = [];
    workspaces.forEach((workspace) => {
      const messagesApp = workspace.apps?.find((app) => app.type === 'messages');
      if (messagesApp?.id) {
        messageAppIds.push(messagesApp.id);
      }
    });

    if (messageAppIds.length === 0) {
      console.log('[GlobalNotification] No message apps found in workspaces');
      return;
    }

    console.log('[GlobalNotification] Setting up global message notification subscription');

    // Subscribe to all new messages (without channel filter)
    const channel = supabase
      .channel('global-messages-notification')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'channel_messages',
        },
        async (payload) => {
          const newMessage = payload.new as any;

          // Skip thread replies for now (they have their own notification logic)
          if (newMessage.thread_parent_id) return;

          // Skip our own messages
          if (newMessage.user_id === currentUserId) {
            console.log('[GlobalNotification] Skipping own message');
            return;
          }

          // Skip if we've already notified for this message (prevents duplicates)
          if (notifiedMessageIds.current.has(newMessage.id)) {
            console.log('[GlobalNotification] Already notified for message, skipping:', newMessage.id);
            return;
          }
          notifiedMessageIds.current.add(newMessage.id);
          // Clean up after 30 seconds to prevent memory leak
          setTimeout(() => {
            notifiedMessageIds.current.delete(newMessage.id);
          }, 30000);

          console.log('[GlobalNotification] New message from another user:', newMessage.id);

          // Fetch full message with user info and channel info
          try {
            const [messageResult, channelResult] = await Promise.all([
              getChannelMessage(newMessage.id),
              getChannel(newMessage.channel_id),
            ]);
            const message = messageResult.message;
            const channel = channelResult.channel;

            // Find the workspace that owns this channel's app
            const workspace = workspaces.find((ws) =>
              ws.apps?.some((app) => app.id === channel.workspace_app_id)
            );

            console.log('[GlobalNotification] Showing notification for message');
            playMessageNotification();
            showMessageNotification({
              senderName: message.user?.name || message.user?.email || 'Someone',
              senderAvatar: message.user?.avatar_url,
              content: message.content || '',
              channelName: channel.name,
              onClick: workspace ? () => {
                // Set the active channel first so it's selected when we navigate
                setActiveChannel(channel.id);
                navigate(`/workspace/${workspace.id}/messages`);
              } : undefined,
            });
          } catch (err) {
            console.error('[GlobalNotification] Failed to fetch message:', err);
          }
        }
      )
      .subscribe((status) => {
        console.log('[GlobalNotification] Subscription status:', status);
      });

    subscriptionRef.current = channel;

    return () => {
      console.log('[GlobalNotification] Unsubscribing from global messages');
      channel.unsubscribe();
      subscriptionRef.current = null;
    };
  }, [currentUserId, workspaces, navigate, setActiveChannel]);
}
