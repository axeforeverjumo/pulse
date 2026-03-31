import { useState, useRef, useCallback, useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { TextSelection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import {
  PaperClipIcon,
  FaceSmileIcon,
  AtSymbolIcon,
  ArrowUpIcon,
  ArrowPathIcon,
  XMarkIcon,
  DocumentIcon,
  MicrophoneIcon,
} from "@heroicons/react/24/outline";
import type { ContentBlock } from "../../api/client";
import { UniversalMentionAutocomplete } from "../Mentions/UniversalMentionAutocomplete";
import { UniversalMentionMark } from "../Mentions/MentionMark";
import { MENTION_ICONS } from "../../types/mention";
import type { MentionData } from "../../types/mention";
import { sanitizeStrictHtml } from "../../utils/sanitizeHtml";
import { GoogleDrivePicker } from "./GoogleDrivePicker";
import GifPicker from "./GifPicker";
import type { GifResult } from "./GifPicker";

// Use a ref-based approach so the editor keydown handler always calls the latest send function
function useLatestCallback<T extends (...args: never[]) => unknown>(fn: T): T {
  const ref = useRef(fn);
  ref.current = fn;
  return useCallback((...args: Parameters<T>) => ref.current(...args), []) as T;
}

// Formatting toolbar icons as simple SVG components
function BoldIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M6 4h8a4 4 0 0 1 2.82 6.84A4 4 0 0 1 15 20H6V4zm3 7h5a1.5 1.5 0 0 0 0-3H9v3zm0 3v3h6a1.5 1.5 0 0 0 0-3H9z" />
    </svg>
  );
}

function ItalicIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M15 4H9v2h2.46l-3.92 12H5v2h6v-2H8.54l3.92-12H15V4z" />
    </svg>
  );
}

function UnderlineIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M7 4v7a5 5 0 0 0 10 0V4h-2v7a3 3 0 0 1-6 0V4H7zM5 20h14v2H5v-2z" />
    </svg>
  );
}

function StrikethroughIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M3 12h18v2H3v-2zm5-4h8a2 2 0 0 0 0-4H8a2 2 0 0 0-2 2h2a0 0 0 0 1 0 0h8v0H8V8zm0 8h8a2 2 0 0 1 0 4H8a2 2 0 0 1-2-2h2v0h8v0H8v-2z" />
    </svg>
  );
}

function BulletListIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="4" cy="7" r="1.5" />
      <circle cx="4" cy="12" r="1.5" />
      <circle cx="4" cy="17" r="1.5" />
      <rect x="8" y="6" width="13" height="2" rx="1" />
      <rect x="8" y="11" width="13" height="2" rx="1" />
      <rect x="8" y="16" width="13" height="2" rx="1" />
    </svg>
  );
}

function OrderedListIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <text x="2" y="9" fontSize="8" fontWeight="600" fontFamily="sans-serif">
        1
      </text>
      <text
        x="2"
        y="14.5"
        fontSize="8"
        fontWeight="600"
        fontFamily="sans-serif"
      >
        2
      </text>
      <text x="2" y="20" fontSize="8" fontWeight="600" fontFamily="sans-serif">
        3
      </text>
      <rect x="9" y="6" width="12" height="2" rx="1" />
      <rect x="9" y="11" width="12" height="2" rx="1" />
      <rect x="9" y="16" width="12" height="2" rx="1" />
    </svg>
  );
}

function BlockquoteIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="3" y="4" width="3" height="16" rx="1.5" />
      <rect x="9" y="6" width="12" height="2" rx="1" />
      <rect x="9" y="11" width="10" height="2" rx="1" />
      <rect x="9" y="16" width="8" height="2" rx="1" />
    </svg>
  );
}

function CodeIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
    >
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  );
}

function CodeBlockIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <polyline points="9 8 5 12 9 16" />
      <polyline points="15 8 19 12 15 16" />
    </svg>
  );
}

// Common emoji set
const COMPOSER_EMOJIS = [
  "👍",
  "❤️",
  "😂",
  "😮",
  "😢",
  "🎉",
  "🔥",
  "👀",
  "✅",
  "🙏",
  "👋",
  "🤔",
  "💯",
  "🚀",
  "😊",
];

function ToolbarButton({
  active,
  onClick,
  children,
  title,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      className={`p-1 rounded transition-colors ${
        active
          ? "bg-bg-gray text-text-body"
          : "text-text-tertiary hover:text-text-body hover:bg-bg-gray"
      }`}
      title={title}
    >
      {children}
    </button>
  );
}


// Google Drive triangle icon
function GoogleDriveIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
      <path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3L27.5 55H0c0 1.55.4 3.1 1.2 4.5z" fill="#0066DA"/>
      <path d="M43.65 25L29.85 0c-1.35.8-2.5 1.9-3.3 3.3L1.2 44.5C.4 45.9 0 47.45 0 49h27.5z" fill="#00AC47"/>
      <path d="M43.65 25L57.45 0c-1.35-.8-2.85-1.2-4.35-1.2H34.55c-1.5 0-3 .45-4.35 1.2z" fill="#EA4335"/>
      <path d="M59.8 55H27.5l-13.75 21.8c1.35.8 2.85 1.2 4.35 1.2h50.6c1.5 0 3-.45 4.35-1.2z" fill="#00832D"/>
      <path d="M73.55 26.5L57.45 0l-13.8 25 16.2 28h27.5c0-1.55-.4-3.1-1.2-4.5z" fill="#2684FC"/>
      <path d="M86.1 49H59.8l13.75 21.8c1.35-.8 2.5-1.9 3.3-3.3L86.1 49z" fill="#FFBA00"/>
    </svg>
  );
}

interface MessageComposerProps {
  placeholder?: string;
  onSend: (blocks: ContentBlock[]) => void;
  workspaceId: string;
  channelId: string;
  pendingFiles: { file: File; preview?: string }[];
  onFileSelect: (files?: File[]) => void;
  onRemovePendingFile: (index: number) => void;
  isUploading: boolean;
  disabled?: boolean;
  onTyping?: () => void;
  onSendAudio?: (file: File) => void;
}

// Module-level storage for drafts to persist across component re-renders
const channelDrafts = new Map<string, string>();

export function MessageComposer({
  placeholder = "Escribe un mensaje...",
  onSend,
  workspaceId,
  channelId,
  pendingFiles,
  onFileSelect,
  onRemovePendingFile,
  isUploading,
  disabled,
  onTyping,
  onSendAudio,
}: MessageComposerProps) {
  const prevChannelIdRef = useRef<string>(channelId);
  const [showFormatting, setShowFormatting] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showDrivePicker, setShowDrivePicker] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [showMentionAutocomplete, setShowMentionAutocomplete] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [hasContent, setHasContent] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const composerRef = useRef<HTMLDivElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const drivePickerRef = useRef<HTMLDivElement>(null);
  const dragCounter = useRef(0);
  const placeholderRef = useRef(placeholder);

  // Audio recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const sendAudioMessage = useCallback(
    async (blob: Blob) => {
      const file = new File([blob], `audio-message-${Date.now()}.webm`, {
        type: "audio/webm",
      });
      if (onSendAudio) {
        onSendAudio(file);
      } else {
        // Fallback: add as pending file and trigger send
        onFileSelect([file]);
      }
    },
    [onSendAudio, onFileSelect],
  );

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        if (chunksRef.current.length > 0) {
          await sendAudioMessage(blob);
        }
      };

      mediaRecorder.start(100);
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(
        () => setRecordingTime((t) => t + 1),
        1000,
      );
    } catch (err) {
      console.error("Microphone access denied:", err);
    }
  }, [sendAudioMessage]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) clearInterval(timerRef.current);
    setIsRecording(false);
    setRecordingTime(0);
  }, []);

  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      if (mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
      }
      mediaRecorderRef.current.stream
        .getTracks()
        .forEach((t) => t.stop());
    }
    if (timerRef.current) clearInterval(timerRef.current);
    chunksRef.current = [];
    setIsRecording(false);
    setRecordingTime(0);
  }, []);

  // Cleanup recording on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current.stream
          .getTracks()
          .forEach((t) => t.stop());
      }
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Shift+Enter inside a list should create a new bullet, not a <br>.
  // splitListItem handles non-empty items; for empty items it returns false
  // (ProseMirror's default is to exit the list). We catch that case and
  // manually insert a new list item so the user stays in the list.
  const handleShiftEnterInList = useLatestCallback((): boolean => {
    if (!editor) return false;
    if (!editor.isActive("bulletList") && !editor.isActive("orderedList")) return false;

    if (editor.commands.splitListItem("listItem")) return true;

    // Empty list item — insert a new one after the current item
    return editor.chain().command(({ tr, state }) => {
      const { $from } = state.selection;
      for (let d = $from.depth; d > 0; d--) {
        if ($from.node(d).type.name === "listItem") {
          const after = $from.after(d);
          const itemType = state.schema.nodes.listItem;
          const paraType = state.schema.nodes.paragraph;
          const newItem = itemType.create(null, paraType.create());
          tr.insert(after, newItem);
          tr.setSelection(TextSelection.create(tr.doc, after + 2));
          return true;
        }
      }
      return false;
    }).run();
  });

  const handleSend = useLatestCallback(() => {
    if (!editor || isUploading) return;

    const isEmpty = editor.isEmpty;
    if (isEmpty && pendingFiles.length === 0) return;

    const blocks: ContentBlock[] = [];

    if (!isEmpty) {
      const text = editor.getText().replace(/\u00A0/g, ' ');
      if (text.trim()) {
        const html = editor.getHTML().replace(/&nbsp;/g, ' ');
        // Include html when formatting is used (not just a plain <p> wrap)
        const isFormatted = html !== `<p>${text}</p>`;
        blocks.push({
          type: "text",
          data: isFormatted
            ? { content: text.trim(), html }
            : { content: text.trim() },
        });
      }
    }

    if (blocks.length > 0 || pendingFiles.length > 0) {
      onSend(blocks);
      editor.commands.clearContent();
      // Clear draft for this channel after sending
      channelDrafts.delete(channelId);
    }
  });

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        horizontalRule: false,
        dropcursor: false,
        gapcursor: false,
        link: false,
        underline: false,
      }),
      UniversalMentionMark,
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "text-blue-600 underline",
        },
      }),
      Placeholder.configure({
        placeholder: () => placeholderRef.current,
      }),
    ],
    editorProps: {
      attributes: {
        class:
          "outline-none text-[15px] leading-6 text-text-body min-h-[24px] max-h-[200px] overflow-y-auto pl-4 pr-3 pt-2 pb-0",
      },
      handleKeyDown: (_view, event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          handleSend();
          return true;
        }
        if (event.key === "Enter" && event.shiftKey && handleShiftEnterInList()) {
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: ed }) => {
      onTyping?.();
      // Track content state for send button
      setHasContent(!ed.isEmpty);

      const { from } = ed.state.selection;
      const textBefore = ed.state.doc.textBetween(
        Math.max(0, from - 50),
        from,
        "\n",
      );
      const mentionMatch = textBefore.match(/(^|[\s])@(\w*)$/);
      if (mentionMatch) {
        setMentionQuery(mentionMatch[2]);
        setShowMentionAutocomplete(true);
      } else {
        setShowMentionAutocomplete(false);
        setMentionQuery("");
        // Clear stored mention mark when not actively typing a mention
        // This fixes the bug where deleting a mention leaves the mark active
        if (ed.isActive("mention")) {
          ed.commands.unsetMark("mention");
        }
      }
    },
  });

  // Update placeholder ref and force re-render when it changes (e.g., switching channels)
  useEffect(() => {
    placeholderRef.current = placeholder;
    if (editor) {
      // Force re-render to show updated placeholder
      editor.view.dispatch(editor.state.tr);
    }
  }, [editor, placeholder]);

  // Save and restore drafts per channel
  useEffect(() => {
    if (!editor) return;

    const prevChannelId = prevChannelIdRef.current;
    if (prevChannelId !== channelId) {
      // Save draft from previous channel (if any content)
      const currentContent = editor.getHTML();
      const hasText = !editor.isEmpty;
      if (hasText) {
        channelDrafts.set(prevChannelId, currentContent);
      } else {
        channelDrafts.delete(prevChannelId);
      }

      // Restore draft for new channel (or clear)
      const newDraft = channelDrafts.get(channelId);
      if (newDraft) {
        editor.commands.setContent(newDraft);
        setHasContent(true);
      } else {
        editor.commands.clearContent();
        setHasContent(false);
      }

      prevChannelIdRef.current = channelId;
    }
  }, [channelId, editor]);

  const canSubmit = (hasContent || pendingFiles.length > 0) && !isUploading;

  const handleMentionSelect = useCallback(
    (data: MentionData) => {
      if (!editor) return;
      const icon = data.icon || MENTION_ICONS[data.entityType] || "";
      const { from } = editor.state.selection;
      const textBefore = editor.state.doc.textBetween(
        Math.max(0, from - 50),
        from,
        "\n",
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
              type: "text",
              text: `${icon} ${data.displayName}`,
              marks: [
                {
                  type: "mention",
                  attrs: {
                    entityType: data.entityType,
                    entityId: data.entityId,
                    displayName: data.displayName,
                    icon,
                  },
                },
              ],
            },
            { type: "text", text: " " },
          ])
          .run();
      }

      setShowMentionAutocomplete(false);
      setMentionQuery("");
    },
    [editor],
  );

  const insertEmoji = useCallback(
    (emoji: string) => {
      if (!editor) return;
      editor.chain().focus().insertContent(emoji).run();
      setShowEmojiPicker(false);
    },
    [editor],
  );


  const handleDriveFileSelect = useCallback(
    (file: { id: string; name: string; mimeType: string; webViewLink?: string }) => {
      if (!editor || !file.webViewLink) return;
      const link = file.webViewLink;
      const name = file.name;
      // Insert as a rich HTML link with Drive icon
      editor
        .chain()
        .focus()
        .insertContent({
          type: "text",
          text: `\u{1F4C4} ${name}`,
          marks: [
            {
              type: "link",
              attrs: { href: link, target: "_blank" },
            },
          ],
        })
        .insertContent({ type: "text", text: " " })
        .run();
      setShowDrivePicker(false);
    },
    [editor],
  );

  const handleGifSelect = useCallback(
    (gif: GifResult) => {
      setShowGifPicker(false);
      const blocks: ContentBlock[] = [
        {
          type: "embed",
          data: {
            url: gif.url,
            type: "gif",
            title: gif.title,
            width: gif.width,
            height: gif.height,
            preview_url: gif.preview,
          },
        },
      ];
      onSend(blocks);
    },
    [onSend],
  );

  const triggerMention = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().insertContent("@").run();
    setShowMentionAutocomplete(true);
    setMentionQuery("");
  }, [editor]);

  // Handle paste events to capture images from clipboard
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const imageFiles: File[] = [];
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            // Generate a filename for pasted images
            const ext = item.type.split("/")[1] || "png";
            const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
            const namedFile = new File([file], `pasted-image-${timestamp}.${ext}`, {
              type: file.type,
            });
            imageFiles.push(namedFile);
          }
        }
      }

      if (imageFiles.length > 0) {
        e.preventDefault();
        onFileSelect(imageFiles);
      }
    },
    [onFileSelect],
  );

  // Handle drag and drop events
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.types.includes("Files")) {
      setIsDragging(true);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      dragCounter.current = 0;

      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        onFileSelect(files);
      }
    },
    [onFileSelect],
  );

  // Close emoji picker on outside click
  useEffect(() => {
    if (!showEmojiPicker) return;
    const handleClick = (e: MouseEvent) => {
      if (
        emojiPickerRef.current &&
        !emojiPickerRef.current.contains(e.target as Node)
      ) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showEmojiPicker]);

  return (
    <div
      ref={composerRef}
      className="relative"
      onPaste={handlePaste}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div
        className={`border rounded-lg bg-bg-white transition-all relative ${
          isDragging
            ? "border-brand-primary border-2 bg-blue-50/30"
            : "border-border-gray focus-within:border-gray-300"
        } ${disabled ? "opacity-50 pointer-events-none" : ""}`}
      >
        {/* Drag overlay */}
        {isDragging && (
          <div className="absolute inset-0 bg-brand-primary/10 rounded-lg flex items-center justify-center pointer-events-none z-10">
            <div className="bg-white rounded-lg px-4 py-2 shadow-lg border border-brand-primary">
              <p className="text-sm font-medium text-brand-primary">
                Drop files here
              </p>
            </div>
          </div>
        )}

        {/* Top formatting toolbar */}
        {showFormatting && (
          <div className="flex items-center gap-0.5 px-2.5 py-1.5 bg-bg-gray/50 rounded-t-lg">
            <ToolbarButton
              active={editor?.isActive("bold")}
              onClick={() => editor?.chain().focus().toggleBold().run()}
              title="Bold (Cmd+B)"
            >
              <BoldIcon className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton
              active={editor?.isActive("italic")}
              onClick={() => editor?.chain().focus().toggleItalic().run()}
              title="Italic (Cmd+I)"
            >
              <ItalicIcon className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton
              active={editor?.isActive("underline")}
              onClick={() => editor?.chain().focus().toggleUnderline().run()}
              title="Underline (Cmd+U)"
            >
              <UnderlineIcon className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton
              active={editor?.isActive("strike")}
              onClick={() => editor?.chain().focus().toggleStrike().run()}
              title="Strikethrough (Cmd+Shift+X)"
            >
              <StrikethroughIcon className="w-4 h-4" />
            </ToolbarButton>

            <div className="w-px h-4 bg-border-gray/50 mx-1" />

            <ToolbarButton
              active={editor?.isActive("code")}
              onClick={() => editor?.chain().focus().toggleCode().run()}
              title="Inline code"
            >
              <CodeIcon className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton
              active={editor?.isActive("codeBlock")}
              onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
              title="Code block"
            >
              <CodeBlockIcon className="w-4 h-4" />
            </ToolbarButton>

            <div className="w-px h-4 bg-border-gray/50 mx-1" />

            <ToolbarButton
              active={editor?.isActive("bulletList")}
              onClick={() => editor?.chain().focus().toggleBulletList().run()}
              title="Bulleted list"
            >
              <BulletListIcon className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton
              active={editor?.isActive("orderedList")}
              onClick={() => editor?.chain().focus().toggleOrderedList().run()}
              title="Numbered list"
            >
              <OrderedListIcon className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton
              active={editor?.isActive("blockquote")}
              onClick={() => editor?.chain().focus().toggleBlockquote().run()}
              title="Blockquote"
            >
              <BlockquoteIcon className="w-4 h-4" />
            </ToolbarButton>
          </div>
        )}

        {/* Pending files preview */}
        {pendingFiles.length > 0 && (
          <div className="px-3 pt-2 pb-2 flex flex-wrap gap-2">
            {pendingFiles.map((pf, index) => (
              <div key={index} className="relative group">
                {pf.preview && pf.file.type.startsWith("video/") ? (
                  <video
                    src={pf.preview}
                    muted
                    className="w-16 h-16 object-cover rounded-lg border border-border-gray"
                  />
                ) : pf.preview ? (
                  <img
                    src={pf.preview}
                    alt={pf.file.name}
                    className="w-16 h-16 object-cover rounded-lg border border-border-gray"
                  />
                ) : (
                  <div className="w-16 h-16 bg-bg-gray rounded-lg border border-border-gray flex items-center justify-center">
                    <DocumentIcon className="w-6 h-6 text-text-tertiary" />
                  </div>
                )}
                <button
                  onClick={() => onRemovePendingFile(index)}
                  className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <XMarkIcon className="w-3 h-3 stroke-2" />
                </button>
                <span className="absolute bottom-0 left-0 right-0 text-[10px] text-center text-text-tertiary truncate px-1">
                  {pf.file.name.length > 10
                    ? pf.file.name.slice(0, 8) + "..."
                    : pf.file.name}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Editor area */}
        <EditorContent editor={editor} />

        {/* Recording indicator */}
        {isRecording && (
          <div className="flex items-center gap-3 px-4 py-2 bg-red-50 border-t border-red-100">
            <button
              type="button"
              onClick={cancelRecording}
              className="text-gray-500 hover:text-gray-700 transition-colors"
              title="Cancelar grabación"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 flex-1">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-sm text-red-600 font-medium">
                {Math.floor(recordingTime / 60)}:
                {(recordingTime % 60).toString().padStart(2, "0")}
              </span>
            </div>
            <button
              type="button"
              onClick={stopRecording}
              className="px-3 py-1 bg-red-500 text-white rounded-full text-sm font-medium hover:bg-red-600 transition-colors"
            >
              Enviar
            </button>
          </div>
        )}

        {/* Bottom action bar */}
        {!isRecording && (
        <div className="flex items-center justify-between px-2.5 py-1.5">
          <div className="flex items-center gap-0.5">
            {/* Attach file */}
            <button
              type="button"
              onClick={() => onFileSelect()}
              disabled={isUploading}
              className="p-1.5 text-text-tertiary hover:text-text-body hover:bg-bg-gray rounded transition-colors disabled:opacity-50"
              title="Adjuntar archivo"
            >
              <PaperClipIcon className="w-4.5 h-4.5" />
            </button>

            {/* Google Drive */}
            <div className="relative" ref={drivePickerRef}>
              <button
                type="button"
                onClick={() => setShowDrivePicker(!showDrivePicker)}
                className="p-1.5 text-text-tertiary hover:text-text-body hover:bg-bg-gray rounded transition-colors"
                title="Adjuntar desde Google Drive"
              >
                <GoogleDriveIcon className="w-4 h-4" />
              </button>
              <GoogleDrivePicker
                isOpen={showDrivePicker}
                onClose={() => setShowDrivePicker(false)}
                onFileSelect={handleDriveFileSelect}
              />
            </div>

            {/* Emoji */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="p-1.5 text-text-tertiary hover:text-text-body hover:bg-bg-gray rounded transition-colors"
                title="Add emoji"
              >
                <FaceSmileIcon className="w-4.5 h-4.5" />
              </button>
              {showEmojiPicker && (
                <div
                  ref={emojiPickerRef}
                  className="absolute bottom-full left-0 mb-2 bg-white rounded-lg shadow-lg border border-border-gray p-2 z-50 w-max"
                >
                  <div className="grid grid-cols-5 gap-1">
                    {COMPOSER_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => insertEmoji(emoji)}
                        className="w-8 h-8 flex items-center justify-center text-lg hover:bg-bg-gray rounded transition-colors"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* GIF */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowGifPicker(!showGifPicker)}
                className="p-1.5 text-text-tertiary hover:text-text-body hover:bg-bg-gray rounded transition-colors"
                title="GIF"
              >
                <span className="text-[10px] font-bold leading-none px-0.5">GIF</span>
              </button>
              {showGifPicker && (
                <GifPicker
                  onSelect={handleGifSelect}
                  onClose={() => setShowGifPicker(false)}
                />
              )}
            </div>

            {/* Mention */}
            <button
              type="button"
              onClick={triggerMention}
              className="p-1.5 text-text-tertiary hover:text-text-body hover:bg-bg-gray rounded transition-colors"
              title="Mención"
            >
              <AtSymbolIcon className="w-4.5 h-4.5" />
            </button>

            {/* Audio recording */}
            <button
              type="button"
              onClick={startRecording}
              disabled={isUploading}
              className="p-1.5 text-text-tertiary hover:text-text-body hover:bg-bg-gray rounded transition-colors disabled:opacity-50"
              title="Grabar mensaje de voz"
            >
              <MicrophoneIcon className="w-4.5 h-4.5" />
            </button>

            {/* Toggle formatting toolbar */}
            <button
              type="button"
              onClick={() => setShowFormatting(!showFormatting)}
              className={`px-1.5 py-0.5 text-xs font-medium rounded transition-colors ${
                showFormatting
                  ? "bg-bg-gray text-text-body"
                  : "text-text-tertiary hover:text-text-body hover:bg-bg-gray"
              }`}
              title={showFormatting ? "Hide formatting" : "Show formatting"}
            >
              Aa
            </button>
          </div>

          {/* Send button */}
          <button
            type="button"
            onClick={handleSend}
            disabled={!canSubmit}
            className={`w-8 h-8 flex items-center justify-center rounded-lg flex-shrink-0 transition-all duration-200 ${
              canSubmit
                ? "bg-brand-primary text-text-light hover:opacity-90"
                : "bg-border-gray text-text-tertiary cursor-not-allowed"
            }`}
          >
            {isUploading ? (
              <ArrowPathIcon className="w-4 h-4 animate-spin" />
            ) : (
              <ArrowUpIcon className="w-4.5 h-4.5 stroke-2" />
            )}
          </button>
        </div>
        )}
      </div>

      {/* Mention autocomplete dropdown */}
      {showMentionAutocomplete && (
        <UniversalMentionAutocomplete
          query={mentionQuery}
          workspaceId={workspaceId}
          onSelect={handleMentionSelect}
          onClose={() => {
            setShowMentionAutocomplete(false);
            setMentionQuery("");
          }}
          anchorRef={composerRef}
          position="above"
        />
      )}
    </div>
  );
}

// Inline rich text editor for editing existing messages
interface InlineEditEditorProps {
  initialContent: string;
  initialHtml?: string;
  onSave: (content: string, html?: string) => void;
  onCancel: () => void;
}

export function InlineEditEditor({
  initialContent,
  initialHtml,
  onSave,
  onCancel,
}: InlineEditEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        horizontalRule: false,
        dropcursor: false,
        gapcursor: false,
        link: false,
        underline: false,
      }),
      UniversalMentionMark,
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "text-blue-600 underline",
        },
      }),
      Placeholder.configure({
        placeholder: "Edit message...",
      }),
    ],
    content: sanitizeStrictHtml(initialHtml || `<p>${initialContent}</p>`),
    editorProps: {
      attributes: {
        class:
          "outline-none text-[15px] leading-6 text-text-body min-h-[24px] max-h-[200px] overflow-y-auto px-3 py-2",
      },
      handleKeyDown: (_view, event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          handleSave();
          return true;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
          return true;
        }
        return false;
      },
    },
    autofocus: "end",
  });

  const handleSave = useLatestCallback(() => {
    if (!editor) return;
    const text = editor.getText().trim();
    if (!text) return;
    const html = editor.getHTML();
    const isFormatted = html !== `<p>${text}</p>`;
    onSave(text, isFormatted ? html : undefined);
  });

  const [showFormatting, setShowFormatting] = useState(false);

  return (
    <div className="mt-1">
      <div className="border border-border-gray rounded-lg bg-blue-50/30 focus-within:border-gray-300 transition-colors">
        {/* Formatting toolbar */}
        {showFormatting && (
          <div className="flex items-center gap-0.5 px-2.5 py-1.5 border-b border-border-gray/50">
            <ToolbarButton
              active={editor?.isActive("bold")}
              onClick={() => editor?.chain().focus().toggleBold().run()}
              title="Bold"
            >
              <BoldIcon className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton
              active={editor?.isActive("italic")}
              onClick={() => editor?.chain().focus().toggleItalic().run()}
              title="Italic"
            >
              <ItalicIcon className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton
              active={editor?.isActive("underline")}
              onClick={() => editor?.chain().focus().toggleUnderline().run()}
              title="Underline"
            >
              <UnderlineIcon className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton
              active={editor?.isActive("strike")}
              onClick={() => editor?.chain().focus().toggleStrike().run()}
              title="Strikethrough"
            >
              <StrikethroughIcon className="w-4 h-4" />
            </ToolbarButton>
            <div className="w-px h-4 bg-border-gray/50 mx-1" />
            <ToolbarButton
              active={editor?.isActive("code")}
              onClick={() => editor?.chain().focus().toggleCode().run()}
              title="Code"
            >
              <CodeIcon className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton
              active={editor?.isActive("bulletList")}
              onClick={() => editor?.chain().focus().toggleBulletList().run()}
              title="List"
            >
              <BulletListIcon className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton
              active={editor?.isActive("blockquote")}
              onClick={() => editor?.chain().focus().toggleBlockquote().run()}
              title="Quote"
            >
              <BlockquoteIcon className="w-4 h-4" />
            </ToolbarButton>
          </div>
        )}

        {/* Editor area */}
        <EditorContent editor={editor} />

        {/* Bottom action bar */}
        <div className="flex items-center justify-between px-2.5 py-1.5 border-t border-border-gray/50">
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              setShowFormatting(!showFormatting);
            }}
            className={`px-1.5 py-0.5 text-xs font-medium rounded transition-colors ${
              showFormatting
                ? "bg-bg-gray text-text-body"
                : "text-text-tertiary hover:text-text-body hover:bg-bg-gray"
            }`}
            title={showFormatting ? "Hide formatting" : "Show formatting"}
          >
            Aa
          </button>
          <div className="flex items-center gap-2">
            <button
              onMouseDown={(e) => {
                e.preventDefault();
                onCancel();
              }}
              className="px-3 py-1 text-sm text-text-secondary hover:text-text-body rounded transition-colors"
            >
              Cancel
            </button>
            <button
              onMouseDown={(e) => {
                e.preventDefault();
                handleSave();
              }}
              className="px-3 py-1 text-sm bg-brand-primary text-white rounded hover:opacity-90 transition-opacity"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
