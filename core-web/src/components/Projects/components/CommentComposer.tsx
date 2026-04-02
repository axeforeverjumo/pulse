import { useState, useRef, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import type { ContentBlock } from '../../../api/client';
import { UniversalMentionMark } from '../../Mentions/MentionMark';
import { UniversalMentionAutocomplete } from '../../Mentions/UniversalMentionAutocomplete';
import { MENTION_ICONS } from '../../../types/mention';
import type { MentionData } from '../../../types/mention';
import { useProjectsStore } from '../../../stores/projectsStore';

interface CommentComposerProps {
  onSend: (blocks: ContentBlock[]) => void;
  disabled?: boolean;
  placeholder?: string;
}

export default function CommentComposer({
  onSend,
  disabled = false,
  placeholder = 'Add a comment...',
}: CommentComposerProps) {
  const workspaceId = useProjectsStore((s) => s.workspaceId);
  const [showMentionAutocomplete, setShowMentionAutocomplete] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionCursorCoords, setMentionCursorCoords] = useState<{ top: number; bottom: number; left: number } | undefined>();
  const [hasContent, setHasContent] = useState(false);
  const composerRef = useRef<HTMLDivElement>(null);

  const handleSend = useCallback(() => {
    if (!editor || editor.isEmpty || disabled) return;

    const text = editor.getText();
    if (!text.trim()) return;

    const html = editor.getHTML();
    const isFormatted = html !== `<p>${text}</p>`;
    const blocks: ContentBlock[] = [
      {
        type: 'text',
        data: isFormatted ? { content: text.trim(), html } : { content: text.trim() },
      },
    ];

    onSend(blocks);
    editor.commands.clearContent();
    setHasContent(false);
  }, [onSend, disabled]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        horizontalRule: false,
        dropcursor: false,
        gapcursor: false,
      }),
      UniversalMentionMark,
      Placeholder.configure({ placeholder }),
    ],
    editorProps: {
      attributes: {
        class:
          'outline-none text-[13px] text-gray-700 min-h-[24px] max-h-[140px] overflow-y-auto ' +
          '[&_ul]:list-disc [&_ul]:ml-4 [&_ol]:list-decimal [&_ol]:ml-4 [&_h2]:text-[14px] [&_h2]:font-semibold [&_blockquote]:border-l-2 [&_blockquote]:pl-2 [&_blockquote]:text-gray-500',
      },
      handleKeyDown: (_view, event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          handleSend();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: ed }) => {
      setHasContent(!ed.isEmpty);

      // Mention detection
      const { from } = ed.state.selection;
      const textBefore = ed.state.doc.textBetween(
        Math.max(0, from - 50),
        from,
        '\n',
      );
      const mentionMatch = textBefore.match(/(^|[\s])@(\w*)$/);
      if (mentionMatch) {
        setMentionQuery(mentionMatch[2]);
        setShowMentionAutocomplete(true);
        try {
          const coords = ed.view.coordsAtPos(from);
          setMentionCursorCoords({ top: coords.top, bottom: coords.bottom, left: coords.left });
        } catch {
          // coordsAtPos can fail if pos is out of view
        }
      } else {
        setShowMentionAutocomplete(false);
        setMentionQuery('');
        if (ed.isActive('mention')) {
          ed.commands.unsetMark('mention');
        }
      }
    },
  });

  const handleMentionSelect = useCallback(
    (data: MentionData) => {
      if (!editor) return;
      const icon = data.icon || MENTION_ICONS[data.entityType] || '';
      const { from } = editor.state.selection;
      const textBefore = editor.state.doc.textBetween(
        Math.max(0, from - 50),
        from,
        '\n',
      );
      const mentionMatch = textBefore.match(/(^|[\s])@(\w*)$/);

      if (mentionMatch) {
        const prefixLen = mentionMatch[1].length; // leading whitespace
        const start = from - mentionMatch[0].length + prefixLen;
        editor
          .chain()
          .focus()
          .deleteRange({ from: start, to: from })
          .insertContent([
            {
              type: 'text',
              text: `${icon} ${data.displayName}`,
              marks: [
                {
                  type: 'mention',
                  attrs: {
                    entityType: data.entityType,
                    entityId: data.entityId,
                    displayName: data.displayName,
                    icon,
                  },
                },
              ],
            },
            { type: 'text', text: ' ' },
          ])
          .run();
      }

      setShowMentionAutocomplete(false);
      setMentionQuery('');
    },
    [editor],
  );

  return (
    <div ref={composerRef} className="py-3 flex-shrink-0">
      {editor && (
        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`px-2 py-1 text-[11px] border rounded-md ${editor.isActive('bold') ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 hover:bg-gray-50'}`}
          >
            B
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`px-2 py-1 text-[11px] border rounded-md italic ${editor.isActive('italic') ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 hover:bg-gray-50'}`}
          >
            I
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            className={`px-2 py-1 text-[11px] border rounded-md ${editor.isActive('heading', { level: 2 }) ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 hover:bg-gray-50'}`}
          >
            H2
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={`px-2 py-1 text-[11px] border rounded-md ${editor.isActive('bulletList') ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 hover:bg-gray-50'}`}
          >
            • Lista
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={`px-2 py-1 text-[11px] border rounded-md ${editor.isActive('orderedList') ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 hover:bg-gray-50'}`}
          >
            1. Lista
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            className={`px-2 py-1 text-[11px] border rounded-md ${editor.isActive('blockquote') ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 hover:bg-gray-50'}`}
          >
            "
          </button>
        </div>
      )}
      <div className="flex gap-3 items-end">
        <div className="flex-1 border border-gray-200 rounded-lg px-3 py-2 bg-white">
          <EditorContent editor={editor} />
        </div>
        {(hasContent || disabled) && (
          <button
            onClick={handleSend}
            disabled={disabled || !hasContent}
            className="px-3 py-2 text-[12px] font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {disabled ? 'Posting...' : 'Post'}
          </button>
        )}
      </div>
      {showMentionAutocomplete && workspaceId && (
        <UniversalMentionAutocomplete
          query={mentionQuery}
          workspaceId={workspaceId}
          onSelect={handleMentionSelect}
          onClose={() => {
            setShowMentionAutocomplete(false);
            setMentionQuery('');
          }}
          anchorRef={composerRef}
          cursorCoords={mentionCursorCoords}
          position="auto"
        />
      )}
    </div>
  );
}
