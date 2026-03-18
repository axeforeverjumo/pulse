import { useEffect, useCallback, useState, useRef } from "react";
import { motion } from "motion/react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  XMarkIcon,
  PaperAirplaneIcon,
  LinkIcon,
  ListBulletIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from "@heroicons/react/24/outline";
import { useEmailStore } from "../../../stores/emailStore";
import { emailKeys } from "../../../hooks/queries/keys";
import ChipInput from "../ComposeEmail/ChipInput";

export default function InlineReplyComposer() {
  const queryClient = useQueryClient();
  const {
    inlineReply,
    updateInlineReplyDraft,
    updateInlineReplyBody,
    sendInlineReply,
    discardInlineReply,
    clearOptimisticReply,
  } = useEmailStore();

  const { isOpen, draft, isSending, sendError } = inlineReply;
  const [showQuoted, setShowQuoted] = useState(false);

  // Track if the editor itself triggered the update to avoid sync loops
  const isEditorUpdateRef = useRef(false);

  // Initialize Tiptap editor
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        code: false,
        link: false,
        underline: false,
        blockquote: {
          HTMLAttributes: {
            class: "border-l-2 border-gray-300 pl-3 text-gray-600",
          },
        },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "text-blue-600 underline",
        },
      }),
      Underline,
    ],
    content: "",
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none focus:outline-none min-h-[100px] px-4 py-2 text-sm",
      },
    },
    onUpdate: ({ editor }) => {
      // Mark that this update came from the editor to prevent sync loop
      isEditorUpdateRef.current = true;
      // Use batched update to avoid double re-renders
      updateInlineReplyBody(editor.getHTML(), editor.getText());
    },
  });

  // Set initial content when draft changes
  useEffect(() => {
    // Skip if this was triggered by the editor itself
    if (isEditorUpdateRef.current) {
      isEditorUpdateRef.current = false;
      return;
    }
    if (editor && draft?.bodyHtml && editor.isEmpty) {
      editor.commands.setContent(draft.bodyHtml);
      // Focus at start (before quoted content)
      editor.commands.focus("start");
    }
  }, [draft?.bodyHtml, editor]);

  // Focus editor when opened
  useEffect(() => {
    if (isOpen && editor) {
      setTimeout(() => {
        editor.commands.focus("start");
      }, 100);
    }
  }, [isOpen, editor]);

  const handleSend = useCallback(() => {
    if (isSending) return;

    // Validate before sending
    if (!draft || draft.to.length === 0) {
      toast.error('Please add at least one recipient');
      return;
    }

    // Capture threadId before sending for post-send refetch
    const threadId = draft.threadId;

    toast.promise(
      sendInlineReply().then(async (success) => {
        if (!success) throw new Error('Failed to send');
        // Refetch thread query so real email loads, then clear optimistic reply
        if (threadId) {
          await queryClient.refetchQueries({ queryKey: emailKeys.thread(threadId) });
          clearOptimisticReply();
        } else {
          clearOptimisticReply();
        }
        return success;
      }),
      {
        loading: 'Sending...',
        success: 'Email sent',
        error: 'Failed to send reply',
      }
    );
  }, [draft, sendInlineReply, queryClient, clearOptimisticReply, isSending]);

  const addLink = useCallback(() => {
    if (!editor) return;
    const url = window.prompt("Enter URL:");
    if (url) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  }, [editor]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      // Cmd/Ctrl + Enter to send
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleSend();
      }

      // Escape to close
      if (e.key === "Escape") {
        e.preventDefault();
        discardInlineReply();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleSend, discardInlineReply]);

  if (!isOpen || !draft) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      transition={{ duration: 0.15 }}
      className="bg-bg-white rounded-lg border border-border-gray shadow-sm overflow-hidden"
    >
      {/* Error message */}
      {sendError && (
        <div className="px-4 py-2 bg-red-50 text-red-600 text-sm border-b border-red-100">
          {sendError}
        </div>
      )}

      {/* Recipients */}
      <div className="relative">
        <button
          onClick={discardInlineReply}
          className="absolute right-3 top-2 p-1 text-text-secondary hover:text-text-body rounded transition-colors"
          title="Discard"
        >
          <XMarkIcon className="w-4 h-4" />
        </button>
        <ChipInput
          label="To:"
          value={draft.to}
          onChange={(value) => updateInlineReplyDraft("to", value)}
          placeholder="Add recipients"
        />
        {draft.cc.length > 0 && (
          <>
            <div className="mx-4 border-t border-border-gray" />
            <ChipInput
              label="Cc:"
              value={draft.cc}
              onChange={(value) => updateInlineReplyDraft("cc", value)}
              placeholder="Add CC recipients"
            />
          </>
        )}
      </div>
      <div className="mx-4 border-t border-border-gray" />

      {/* Editor */}
      <div className="min-h-[100px] max-h-[250px] overflow-y-auto">
        <EditorContent editor={editor} />
      </div>

      {/* Quoted content toggle */}
      <button
        onClick={() => setShowQuoted(!showQuoted)}
        className="flex items-center gap-1 px-4 py-2 text-sm text-text-secondary hover:text-text-body transition-colors w-full text-left border-t border-border-gray"
      >
        {showQuoted ? <ChevronUpIcon className="w-3.5 h-3.5" /> : <ChevronDownIcon className="w-3.5 h-3.5" />}
        {showQuoted ? "Hide" : "Show"} {draft.replyType === "forward" ? "forwarded message" : "quoted text"}
      </button>

      {/* Formatting toolbar + Send button */}
      <div className="flex items-center justify-between px-3 py-2 bg-brand-secondary border-t border-border-gray">
        <div className="flex items-center gap-3">
          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={isSending}
            className="flex items-center gap-2 px-4 py-1.5 bg-brand-primary text-text-light rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            <PaperAirplaneIcon className="w-4 h-4" />
            {isSending ? 'Sending...' : 'Send'}
          </button>

          {/* Formatting buttons */}
          <div className="flex items-center gap-1">
          <button
            onClick={() => editor?.chain().focus().toggleBold().run()}
            className={`p-1.5 rounded transition-colors ${
              editor?.isActive("bold")
                ? "bg-bg-gray-dark text-text-body"
                : "text-text-secondary hover:text-text-body hover:bg-bg-gray-dark/50"
            }`}
            title="Bold (Cmd+B)"
          >
            <span className={`text-sm font-bold ${editor?.isActive("bold") ? "text-text-body" : ""}`}>B</span>
          </button>
          <button
            onClick={() => editor?.chain().focus().toggleItalic().run()}
            className={`p-1.5 rounded transition-colors ${
              editor?.isActive("italic")
                ? "bg-bg-gray-dark text-text-body"
                : "text-text-secondary hover:text-text-body hover:bg-bg-gray-dark/50"
            }`}
            title="Italic (Cmd+I)"
          >
            <span className={`text-sm italic ${editor?.isActive("italic") ? "font-bold" : ""}`}>I</span>
          </button>
          <button
            onClick={() => editor?.chain().focus().toggleUnderline().run()}
            className={`p-1.5 rounded transition-colors ${
              editor?.isActive("underline")
                ? "bg-bg-gray-dark text-text-body"
                : "text-text-secondary hover:text-text-body hover:bg-bg-gray-dark/50"
            }`}
            title="Underline (Cmd+U)"
          >
            <span className={`text-sm underline ${editor?.isActive("underline") ? "font-bold" : ""}`}>U</span>
          </button>
          <div className="w-px h-4 bg-border-gray mx-1" />
          <button
            onClick={addLink}
            className={`p-1.5 rounded transition-colors ${
              editor?.isActive("link")
                ? "bg-bg-gray-dark text-text-body"
                : "text-text-secondary hover:text-text-body hover:bg-bg-gray-dark/50"
            }`}
            title="Add Link"
          >
            <LinkIcon className="w-4 h-4" />
          </button>
          <div className="w-px h-4 bg-border-gray mx-1" />
          <button
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
            className={`p-1.5 rounded transition-colors ${
              editor?.isActive("bulletList")
                ? "bg-bg-gray-dark text-text-body"
                : "text-text-secondary hover:text-text-body hover:bg-bg-gray-dark/50"
            }`}
            title="Bullet List"
          >
            <ListBulletIcon className="w-4 h-4" />
          </button>
            <button
              onClick={() => editor?.chain().focus().toggleOrderedList().run()}
              className={`p-1.5 rounded transition-colors ${
                editor?.isActive("orderedList")
                  ? "bg-bg-gray-dark text-text-body"
                  : "text-text-secondary hover:text-text-body hover:bg-bg-gray-dark/50"
              }`}
              title="Numbered List"
            >
              <span className="text-sm font-medium">1.</span>
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
