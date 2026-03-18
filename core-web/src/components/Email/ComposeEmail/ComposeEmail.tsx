import { useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  XMarkIcon,
  MinusIcon,
  ChevronUpIcon,
  PaperAirplaneIcon,
  LinkIcon,
  ListBulletIcon,
} from "@heroicons/react/24/outline";
import { useEmailStore } from "../../../stores/emailStore";
import { emailKeys } from "../../../hooks/queries/keys";
import ChipInput, { type ChipInputRef } from "./ChipInput";

const COMPOSE_WIDTH = 520;

export default function ComposeEmail() {
  const {
    compose,
    closeCompose,
    toggleComposeMinimize,
    updateComposeDraft,
    updateComposeBody,
    sendComposedEmail,
    discardCompose,
  } = useEmailStore();

  const { isOpen, isMinimized, draft, isSending, sendError } = compose;
  const queryClient = useQueryClient();

  // Refs for Tab navigation between fields
  const ccInputRef = useRef<ChipInputRef>(null);
  const subjectInputRef = useRef<HTMLInputElement>(null);

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
            class: "border-l-3 border-gray-300 pl-3 text-gray-600",
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
    content: draft.bodyHtml || "",
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none focus:outline-none min-h-[200px] px-4 py-2 text-sm",
      },
    },
    onUpdate: ({ editor }) => {
      // Mark that this update came from the editor to prevent sync loop
      isEditorUpdateRef.current = true;
      // Use batched update to avoid double re-renders
      updateComposeBody(editor.getHTML(), editor.getText());
    },
  });

  // Update editor content when draft changes externally (e.g., loading a saved draft)
  useEffect(() => {
    // Skip if this was triggered by the editor itself
    if (isEditorUpdateRef.current) {
      isEditorUpdateRef.current = false;
      return;
    }
    if (editor && draft.bodyHtml !== editor.getHTML()) {
      editor.commands.setContent(draft.bodyHtml || "");
    }
  }, [draft.bodyHtml, editor]);

  const handleSend = useCallback(() => {
    if (isSending) return;

    // Validate before closing
    if (draft.to.length === 0) {
      toast.error("Please add at least one recipient");
      return;
    }

    // Use toast.promise - compose closes immediately, toast handles lifecycle
    toast.promise(
      sendComposedEmail().then(() => {
        // Invalidate all folder queries + counts after successful send
        queryClient.invalidateQueries({ queryKey: emailKeys.folders() });
        queryClient.invalidateQueries({ queryKey: [...emailKeys.all, 'counts'] });
      }),
      {
        loading: "Sending...",
        success: "Email sent",
        error: (err) => err?.message || "Failed to send email",
      }
    );
  }, [sendComposedEmail, draft.to.length, isSending, queryClient]);

  const handleClose = useCallback(async () => {
    await closeCompose();
    // Invalidate DRAFT folder + counts so sidebar reflects new/updated draft
    queryClient.invalidateQueries({ queryKey: emailKeys.folders() });
    queryClient.invalidateQueries({ queryKey: [...emailKeys.all, 'counts'] });
  }, [closeCompose, queryClient]);

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

      // Escape to minimize
      if (e.key === "Escape" && !isMinimized) {
        e.preventDefault();
        toggleComposeMinimize();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isMinimized, handleSend, toggleComposeMinimize]);

  if (!isOpen) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 100, scale: 0.95 }}
        animate={{
          opacity: 1,
          y: 0,
          scale: 1,
          height: isMinimized ? 48 : "auto",
        }}
        exit={{ opacity: 0, y: 100, scale: 0.95 }}
        transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
        style={{
          position: "fixed",
          bottom: 16,
          right: 16,
          width: COMPOSE_WIDTH,
          maxHeight: isMinimized ? 48 : "calc(100vh - 100px)",
          zIndex: 9999,
        }}
        className="bg-bg-white rounded-lg border border-border-gray shadow-xl overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-2.5 bg-white cursor-pointer"
          onClick={() => isMinimized && toggleComposeMinimize()}
        >
          <span className="text-sm font-medium text-text-body">
            {isMinimized && draft.subject ? draft.subject : "New Message"}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleComposeMinimize();
              }}
              className="p-1.5 text-text-secondary hover:text-text-body hover:bg-bg-gray-dark/50 rounded transition-colors"
            >
              {isMinimized ? <ChevronUpIcon className="w-4 h-4" /> : <MinusIcon className="w-4 h-4" />}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleClose();
              }}
              className="p-1.5 text-text-secondary hover:text-text-body hover:bg-bg-gray-dark/50 rounded transition-colors"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body - hidden when minimized */}
        {!isMinimized && (
          <>
            {/* Error message */}
            {sendError && (
              <div className="px-4 py-2 bg-red-50 border-b border-red-200 text-red-600 text-sm">
                {sendError}
              </div>
            )}

            {/* Recipients */}
            <div>
              <ChipInput
                value={draft.to}
                onChange={(value) => updateComposeDraft("to", value)}
                placeholder="Recipients"
                onTabToNext={() => ccInputRef.current?.focus()}
              />
              <div className="mx-4 border-t border-border-gray" />
              <ChipInput
                ref={ccInputRef}
                value={draft.cc}
                onChange={(value) => updateComposeDraft("cc", value)}
                placeholder="CC"
                onTabToNext={() => subjectInputRef.current?.focus()}
              />
            </div>
            <div className="mx-4 border-t border-border-gray" />

            {/* Subject */}
            <div className="flex items-center px-4 py-2 gap-2">
              <input
                ref={subjectInputRef}
                type="text"
                value={draft.subject}
                onChange={(e) => updateComposeDraft("subject", e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Tab' && !e.shiftKey) {
                    e.preventDefault();
                    editor?.commands.focus();
                  }
                }}
                placeholder="Subject"
                className="flex-1 text-sm text-text-body bg-transparent outline-none placeholder:text-text-tertiary"
              />
            </div>
            <div className="mx-4 border-t border-border-gray" />

            {/* Editor */}
            <div className="flex-1 overflow-y-auto min-h-[200px] max-h-[300px]">
              <EditorContent editor={editor} />
            </div>

            {/* Formatting toolbar */}
            <div className="flex items-center gap-1 px-3 py-1.5 bg-white">
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
                onClick={() =>
                  editor?.chain().focus().toggleOrderedList().run()
                }
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

            {/* Footer */}
            <div className="flex items-center justify-between px-4 py-3  bg-brand-secondary">
              <button
                onClick={handleSend}
                disabled={isSending}
                className="flex items-center gap-2 px-4 py-2 bg-brand-primary text-text-light rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                <PaperAirplaneIcon className="w-4 h-4" />
                {isSending ? 'Sending...' : 'Send'}
              </button>
              <button
                onClick={() => {
                  discardCompose();
                  queryClient.invalidateQueries({ queryKey: emailKeys.folders() });
                  queryClient.invalidateQueries({ queryKey: [...emailKeys.all, 'counts'] });
                }}
                className="text-sm text-text-secondary hover:text-red-500 transition-colors"
              >
                Discard
              </button>
            </div>
          </>
        )}
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
