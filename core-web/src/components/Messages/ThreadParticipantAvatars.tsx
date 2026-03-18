import { useEffect } from 'react';
import { useMessagesStore } from '../../stores/messagesStore';

interface ThreadParticipantAvatarsProps {
  messageId: string;
  replyCount: number;
}

export function ThreadParticipantAvatars({ messageId, replyCount }: ThreadParticipantAvatarsProps) {
  const threadParticipants = useMessagesStore((state) => state.threadParticipants);
  const fetchThreadParticipants = useMessagesStore((state) => state.fetchThreadParticipants);

  // Fetch participants on mount if not cached
  useEffect(() => {
    const participants = threadParticipants[messageId];
    if (!participants && replyCount > 0) {
      fetchThreadParticipants(messageId);
    }
  }, [messageId, replyCount, threadParticipants, fetchThreadParticipants]);

  const participants = threadParticipants[messageId] || [];

  if (participants.length === 0) {
    // Return empty space with width to prevent layout shift
    return <div className="w-20 h-5" />;
  }

  // Show up to 3 avatars, with +N indicator if more
  const displayParticipants = participants.slice(0, 3);
  const remainingCount = participants.length - 3;

  return (
    <div className="flex flex-row-reverse -space-x-1.5 items-center">
      {displayParticipants.map((participant, index) => (
        <div key={participant.id} style={{ zIndex: displayParticipants.length - index }}>
          {participant.avatar_url ? (
            <img
              src={participant.avatar_url}
              alt={participant.name || participant.email || 'User'}
              className="w-6 h-6 rounded-lg ring-2 ring-white flex-shrink-0 object-cover"
            />
          ) : (
            <div
              className="w-6 h-6 rounded-lg ring-2 ring-white flex-shrink-0 flex items-center justify-center text-xs font-semibold text-white"
              style={{ background: 'linear-gradient(135deg, #5A7864 0%, #607E98 100%)' }}
            >
              {participant.name?.charAt(0) || participant.email?.charAt(0) || '?'}
            </div>
          )}
        </div>
      ))}

      {/* Show +N indicator if more than 3 participants */}
      {remainingCount > 0 && (
        <div className="w-6 h-6 rounded-lg ring-2 ring-white bg-gray-400 flex items-center justify-center text-xs font-semibold text-white flex-shrink-0">
          +{remainingCount}
        </div>
      )}
    </div>
  );
}
