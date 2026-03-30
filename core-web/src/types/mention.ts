export type MentionEntityType =
  | 'person'
  | 'file'
  | 'folder'
  | 'channel'
  | 'project_board'
  | 'project_issue'
  | 'todo'
  | 'agent';

/** Data stored on a mention mark / content block */
export interface MentionData {
  entityType: MentionEntityType;
  entityId: string;
  displayName: string;
  icon?: string;
}

/** A single row in the autocomplete dropdown */
export interface MentionMenuItem {
  id: string;
  entityType: MentionEntityType;
  displayName: string;
  icon?: string;
  avatarUrl?: string;
  subtitle?: string;
  hasChildren?: boolean;
  /** For drill-down: the workspace app ID this item belongs to */
  appId?: string;
  /** For drill-down: the app type (files, projects, messages, tasks) */
  appType?: string;
}

/** One level of the drill-down menu stack */
export interface MentionMenuLevel {
  title: string;
  items: MentionMenuItem[];
}

export const MENTION_ICONS: Record<MentionEntityType, string> = {
  person: '👤',
  file: '📄',
  folder: '📁',
  channel: '💬',
  project_board: '📋',
  project_issue: '📋',
  todo: '✓',
  agent: '🤖',
};
