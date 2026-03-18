import { useNavigate } from 'react-router-dom';
import { EnvelopeIcon } from '@heroicons/react/24/outline';
import { useEmailStore } from '../../../stores/emailStore';
import { useEmailFolder, useEmailCounts, flattenEmailPages } from '../../../hooks/queries/useEmails';
import BentoCard from './BentoCard';

const MAX_ITEMS = 5;

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) {
    return `${diffMins}m`;
  } else if (diffHours < 24) {
    return `${diffHours}h`;
  } else if (diffDays < 7) {
    return `${diffDays}d`;
  } else {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}

function getInitials(name: string | undefined, email: string): string {
  if (name) {
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

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

export default function EmailsCard() {
  const navigate = useNavigate();
  const setSelectedEmailId = useEmailStore((s) => s.setSelectedEmailId);

  // Use React Query for data fetching
  const { data: emailsData } = useEmailFolder('INBOX', []);
  const { data: counts } = useEmailCounts([]);

  // Get inbox emails from React Query
  const inboxEmails = flattenEmailPages(emailsData);
  const displayEmails = inboxEmails.slice(0, MAX_ITEMS);
  const unreadCount = counts?.inbox_unread || 0;

  const handleEmailClick = (emailId: string) => {
    setSelectedEmailId(emailId);
    navigate('/email');
  };

  const handleViewAll = () => {
    navigate('/email');
  };

  return (
    <BentoCard
      title="Emails"
      icon={<EnvelopeIcon className="w-[18px] h-[18px]" />}
      headerAction={
        unreadCount > 0 ? (
          <span className="bg-blue-600 text-white text-[11px] font-medium px-2 py-0.5 rounded-full">
            {unreadCount}
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
      {displayEmails.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-12 text-text-tertiary">
          <EnvelopeIcon className="w-8 h-8 mb-2 opacity-40" />
          <p className="text-[13px]">No emails yet</p>
        </div>
      ) : (
        <div>
          {displayEmails.map((email) => (
            <button
              key={email.id}
              onClick={() => handleEmailClick(email.id)}
              className="w-full flex items-center gap-3 px-5 py-3 hover:bg-bg-gray/50 transition-colors text-left"
            >
              {/* Unread indicator */}
              {!email.is_read && (
                <div className="w-2 h-2 rounded-full bg-blue-600 shrink-0" />
              )}

              {/* Avatar */}
              <div
                className={`w-8 h-8 rounded-full bg-linear-to-br ${getAvatarColor(
                  email.from_email
                )} flex items-center justify-center shrink-0`}
              >
                <span className="text-[11px] font-medium text-white">
                  {getInitials(email.from_name, email.from_email)}
                </span>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className={`text-[13px] truncate ${
                        !email.is_read ? 'font-semibold text-text-body' : 'text-text-body'
                      }`}
                    >
                      {email.from_name || email.from_email}
                    </span>
                    {email.account_email && (
                      <span className="text-[11px] text-text-tertiary shrink-0">
                        → {email.account_email}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-text-tertiary shrink-0">
                    {formatDate(email.date)}
                  </span>
                </div>
                <p className="text-[12px] text-text-secondary truncate">{email.subject}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </BentoCard>
  );
}
