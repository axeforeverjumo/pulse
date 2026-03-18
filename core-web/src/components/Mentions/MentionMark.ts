import { Mark, mergeAttributes } from '@tiptap/core';

/**
 * Shared TipTap Mark extension for universal @ mentions.
 *
 * Stores entity metadata (type, ID, display name) as data attributes
 * on a <span class="mention"> element. For markdown serialization
 * (NoteEditor), mentions are written as [@DisplayName](mention:type:id)
 * and parsed back on load.
 */
export const UniversalMentionMark = Mark.create({
  name: 'mention',
  inclusive: false,

  addAttributes() {
    return {
      entityType: {
        default: 'person',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-entity-type') || 'person',
      },
      entityId: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-entity-id'),
      },
      displayName: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-display-name'),
      },
      icon: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-icon'),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span.mention' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        class: 'mention',
        'data-entity-type': HTMLAttributes.entityType,
        'data-entity-id': HTMLAttributes.entityId,
        'data-display-name': HTMLAttributes.displayName,
        'data-icon': HTMLAttributes.icon,
      }),
      0,
    ];
  },

  // Markdown serialization for NoteEditor's @tiptap/markdown extension.
  // Serializes as [@DisplayName](mention:entityType:entityId)
  addStorage() {
    return {
      markdown: {
        serialize: {
          open(_state: unknown, mark: { attrs: { entityType?: string; entityId?: string } }) {
            const { entityType, entityId } = mark.attrs;
            if (entityType && entityId) {
              return '[';
            }
            return '';
          },
          close(_state: unknown, mark: { attrs: { entityType?: string; entityId?: string } }) {
            const { entityType, entityId } = mark.attrs;
            if (entityType && entityId) {
              return `](mention:${entityType}:${entityId})`;
            }
            return '';
          },
        },
        parse: {
          // Parsing mention: links is handled via content normalization
          // in NoteEditor before content is loaded into the editor
        },
      },
    };
  },
});
