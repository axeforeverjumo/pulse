import { MENTION_ICONS } from '../../types/mention';
import type { MentionEntityType } from '../../types/mention';

interface MentionPillProps {
  entityType: MentionEntityType;
  entityId: string;
  displayName: string;
  onClick?: () => void;
}

export function MentionPill({ entityType, entityId, displayName, onClick }: MentionPillProps) {
  const icon = MENTION_ICONS[entityType] || '👤';

  return (
    <span
      className="mention"
      data-entity-type={entityType}
      data-entity-id={entityId}
      data-display-name={displayName}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {icon} {displayName}
    </span>
  );
}
