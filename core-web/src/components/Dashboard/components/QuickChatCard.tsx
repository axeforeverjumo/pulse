import { useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChatBubbleOvalLeftIcon, HashtagIcon } from '@heroicons/react/24/outline';
import { useMessagesStore } from '../../../stores/messagesStore';
import { useWorkspaceStore } from '../../../stores/workspaceStore';
import BentoCard from './BentoCard';

const MAX_ITEMS = 5;

function getAvatarColor(str: string): string {
  const colors = [
    'from-blue-400 to-blue-500',
    'from-purple-400 to-purple-500',
    'from-green-400 to-green-500',
    'from-amber-400 to-amber-500',
    'from-rose-400 to-rose-500',
    'from-cyan-400 to-cyan-500',
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

interface ConversationItem {
  id: string;
  type: 'channel' | 'dm';
  name: string;
  avatarUrl?: string;
  unreadCount: number;
  workspaceId: string;
}

export default function QuickChatCard() {
  const navigate = useNavigate();
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const workspaces = useWorkspaceStore((state) => state.workspaces);

  const {
    channels,
    dms,
    unreadCounts,
    fetchChannels,
    fetchDMs,
    fetchUnreadCounts,
    setWorkspaceAppId,
  } = useMessagesStore();

  // Build a map from workspace_app_id to workspaceId
  const appToWorkspaceMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const ws of workspaces) {
      for (const app of ws.apps) {
        map[app.id] = ws.id;
      }
    }
    return map;
  }, [workspaces]);

  // Find all messages apps across all workspaces
  const allMessagesApps = useMemo(() => {
    return workspaces.flatMap((ws) =>
      ws.apps.filter((app) => app.type === 'messages').map((app) => ({
        appId: app.id,
        workspaceId: ws.id,
      }))
    );
  }, [workspaces]);

  // Fetch channels for the first messages app we find (store caches per workspace)
  useEffect(() => {
    if (allMessagesApps.length > 0) {
      // For now, fetch from the first available messages app
      // The store will have cached data from previous navigations
      const firstApp = allMessagesApps[0];
      setWorkspaceAppId(firstApp.appId);
      fetchChannels();
      fetchDMs();
      fetchUnreadCounts();
    }
  }, [allMessagesApps, setWorkspaceAppId, fetchChannels, fetchDMs, fetchUnreadCounts]);

  // Combine channels and DMs into a unified list with workspace info
  const conversations: ConversationItem[] = [
    ...channels.map((ch) => ({
      id: ch.id,
      type: 'channel' as const,
      name: ch.name,
      unreadCount: unreadCounts[ch.id] || 0,
      workspaceId: appToWorkspaceMap[ch.workspace_app_id] || workspaceId || '',
    })),
    ...dms.map((dm) => {
      const participant = dm.participants?.[0];
      return {
        id: dm.id,
        type: 'dm' as const,
        name: participant?.name || participant?.email || 'Direct Message',
        avatarUrl: participant?.avatar_url,
        unreadCount: unreadCounts[dm.id] || 0,
        workspaceId: appToWorkspaceMap[dm.workspace_app_id] || workspaceId || '',
      };
    }),
  ];

  // Sort by unread count (unread first), then take top items
  const displayItems = conversations
    .sort((a, b) => b.unreadCount - a.unreadCount)
    .slice(0, MAX_ITEMS);

  const totalUnread = Object.values(unreadCounts).reduce((sum, count) => sum + count, 0);

  const handleItemClick = (item: ConversationItem) => {
    // Navigate to the correct workspace's messages app
    navigate(`/workspace/${item.workspaceId}/messages`);
  };

  const handleViewAll = () => {
    // Find first workspace with messages app
    const firstWithMessages = allMessagesApps[0];
    if (firstWithMessages) {
      navigate(`/workspace/${firstWithMessages.workspaceId}/messages`);
    } else if (workspaceId) {
      navigate(`/workspace/${workspaceId}/messages`);
    }
  };

  return (
    <BentoCard
      title="Messages"
      icon={<ChatBubbleOvalLeftIcon className="w-[18px] h-[18px]" />}
      headerAction={
        totalUnread > 0 ? (
          <span className="bg-brand-primary text-white text-[11px] font-medium px-2 py-0.5 rounded-full">
            {totalUnread}
          </span>
        ) : (
          <button
            onClick={handleViewAll}
            className="text-[12px] font-medium text-text-secondary hover:text-text-body transition-colors"
          >
            View all
          </button>
        )
      }
    >
      {displayItems.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-12 text-text-tertiary">
          <ChatBubbleOvalLeftIcon className="w-8 h-8 mb-2 opacity-40" />
          <p className="text-[13px]">No conversations yet</p>
        </div>
      ) : (
        <div>
          {displayItems.map((item) => (
            <button
              key={item.id}
              onClick={() => handleItemClick(item)}
              className="w-full flex items-center gap-3 px-5 py-3 hover:bg-bg-gray/50 transition-colors text-left"
            >
              {/* Icon or Avatar */}
              {item.type === 'channel' ? (
                <div className="w-8 h-8 rounded-lg bg-bg-gray flex items-center justify-center flex-shrink-0">
                  <HashtagIcon className="w-4 h-4 text-text-tertiary" />
                </div>
              ) : item.avatarUrl ? (
                <img
                  src={item.avatarUrl}
                  alt=""
                  className="w-8 h-8 rounded-full flex-shrink-0 object-cover"
                />
              ) : (
                <div
                  className={`w-8 h-8 rounded-full bg-gradient-to-br ${getAvatarColor(
                    item.name
                  )} flex items-center justify-center flex-shrink-0`}
                >
                  <span className="text-[11px] font-medium text-white">
                    {item.name.slice(0, 2).toUpperCase()}
                  </span>
                </div>
              )}

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-medium text-text-body truncate">
                    {item.type === 'channel' ? `#${item.name}` : item.name}
                  </span>
                  {item.unreadCount > 0 && (
                    <span className="bg-brand-primary text-white text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0">
                      {item.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </BentoCard>
  );
}
