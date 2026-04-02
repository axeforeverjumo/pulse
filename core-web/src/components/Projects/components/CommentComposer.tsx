import { useState, useRef, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import * as ToggleGroup from '@radix-ui/react-toggle-group';
import * as Tooltip from '@radix-ui/react-tooltip';
import { Bold, Italic, Heading2, List, ListOrdered, Quote } from 'lucide-react';
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

  const activeToolbarValues = editor
    ? [
        editor.isActive('bold') ? 'bold' : null,
        editor.isActive('italic') ? 'italic' : null,
        editor.isActive('heading', { level: 2 }) ? 'h2' : null,
        editor.isActive('bulletList') ? 'bullet' : null,
        editor.isActive('orderedList') ? 'ordered' : null,
        editor.isActive('blockquote') ? 'quote' : null,
      ].filter((value): value is string => Boolean(value))
    : [];

  const runToggle = (command: 'bold' | 'italic' | 'h2' | 'bullet' | 'ordered' | 'quote') => {
    if (!editor) return;
    const chain = editor.chain().focus();
    if (command === 'bold') chain.toggleBold().run();
    if (command === 'italic') chain.toggleItalic().run();
    if (command === 'h2') chain.toggleHeading({ level: 2 }).run();
    if (command === 'bullet') chain.toggleBulletList().run();
    if (command === 'ordered') chain.toggleOrderedList().run();
    if (command === 'quote') chain.toggleBlockquote().run();
  };

  return (
    <div ref={composerRef} className="py-3 flex-shrink-0">
      {editor && (
        <Tooltip.Provider delayDuration={120}>
          <div className="mb-2 flex items-center">
            <ToggleGroup.Root
              type="multiple"
              value={activeToolbarValues}
              onValueChange={() => undefined}
              aria-label="Formato de comentario"
              className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-[#d9e4f2] bg-white/90 p-1 shadow-[0_8px_22px_-14px_rgba(15,23,42,0.35)]"
            >
              <Tooltip.Root>
                <Tooltip.Trigger asChild>
                  <ToggleGroup.Item
                    value="bold"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => runToggle('bold')}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 data-[state=on]:bg-slate-900 data-[state=on]:text-white"
                    aria-label="Negrita"
                  >
                    <Bold size={14} />
                  </ToggleGroup.Item>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content sideOffset={6} className="rounded-md bg-slate-900 px-2 py-1 text-[11px] text-white">
                    Negrita
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>

              <Tooltip.Root>
                <Tooltip.Trigger asChild>
                  <ToggleGroup.Item
                    value="italic"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => runToggle('italic')}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 data-[state=on]:bg-slate-900 data-[state=on]:text-white"
                    aria-label="Cursiva"
                  >
                    <Italic size={14} />
                  </ToggleGroup.Item>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content sideOffset={6} className="rounded-md bg-slate-900 px-2 py-1 text-[11px] text-white">
                    Cursiva
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>

              <Tooltip.Root>
                <Tooltip.Trigger asChild>
                  <ToggleGroup.Item
                    value="h2"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => runToggle('h2')}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 data-[state=on]:bg-slate-900 data-[state=on]:text-white"
                    aria-label="Subtítulo"
                  >
                    <Heading2 size={14} />
                  </ToggleGroup.Item>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content sideOffset={6} className="rounded-md bg-slate-900 px-2 py-1 text-[11px] text-white">
                    Subtítulo
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>

              <Tooltip.Root>
                <Tooltip.Trigger asChild>
                  <ToggleGroup.Item
                    value="bullet"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => runToggle('bullet')}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 data-[state=on]:bg-slate-900 data-[state=on]:text-white"
                    aria-label="Lista"
                  >
                    <List size={14} />
                  </ToggleGroup.Item>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content sideOffset={6} className="rounded-md bg-slate-900 px-2 py-1 text-[11px] text-white">
                    Lista con viñetas
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>

              <Tooltip.Root>
                <Tooltip.Trigger asChild>
                  <ToggleGroup.Item
                    value="ordered"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => runToggle('ordered')}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 data-[state=on]:bg-slate-900 data-[state=on]:text-white"
                    aria-label="Lista numerada"
                  >
                    <ListOrdered size={14} />
                  </ToggleGroup.Item>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content sideOffset={6} className="rounded-md bg-slate-900 px-2 py-1 text-[11px] text-white">
                    Lista numerada
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>

              <Tooltip.Root>
                <Tooltip.Trigger asChild>
                  <ToggleGroup.Item
                    value="quote"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => runToggle('quote')}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 data-[state=on]:bg-slate-900 data-[state=on]:text-white"
                    aria-label="Cita"
                  >
                    <Quote size={14} />
                  </ToggleGroup.Item>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content sideOffset={6} className="rounded-md bg-slate-900 px-2 py-1 text-[11px] text-white">
                    Cita
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
            </ToggleGroup.Root>
          </div>
        </Tooltip.Provider>
      )}
      <div className="flex gap-3 items-end">
        <div className="flex-1 rounded-xl border border-[#d9e4f2] bg-white/95 px-3 py-2 shadow-[0_10px_28px_-18px_rgba(15,23,42,0.35)]">
          <EditorContent editor={editor} />
        </div>
        {(hasContent || disabled) && (
          <button
            onClick={handleSend}
            disabled={disabled || !hasContent}
            className="h-10 rounded-xl bg-gradient-to-br from-slate-900 to-slate-700 px-3 text-[12px] font-semibold text-white shadow-[0_10px_24px_-14px_rgba(15,23,42,0.55)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
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
