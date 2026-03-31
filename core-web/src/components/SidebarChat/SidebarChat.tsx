import { useState, useRef, useEffect, useCallback } from "react";
import {
  XMarkIcon,
  ArrowDownIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import { motion, AnimatePresence } from "motion/react";
import { streamMessage, createConversation } from "../../api/client";
import { useConversationStore } from "../../stores/conversationStore";
import { useUIStore } from "../../stores/uiStore";
import { useSidebarChatStore } from "../../stores/sidebarChatStore";
import { useChatAttachments } from "../../hooks/useChatAttachments";
import { usePageContext } from "../../hooks/usePageContext";
import type { MentionData } from "../../types/mention";
import ChatMessage from "./SidebarChatMessage";
import SidebarChatInput from "./SidebarChatInput";
import { useViewContextStore } from "../../stores/viewContextStore";

export default function SidebarChat() {
  const setSidebarChatOpen = useUIStore((s) => s.setSidebarChatOpen);
  const addConversation = useConversationStore(
    (state) => state.addConversation,
  );

  // Persisted state from store
  const messages = useSidebarChatStore((s) => s.messages);
  const activeConversationId = useSidebarChatStore((s) => s.activeConversationId);
  const addMessage = useSidebarChatStore((s) => s.addMessage);
  const setActiveConversationId = useSidebarChatStore((s) => s.setActiveConversationId);
  const setStreamingConversationId = useSidebarChatStore((s) => s.setStreamingConversationId);
  const clearChat = useSidebarChatStore((s) => s.clearChat);

  // Local state (transient, doesn't need to persist)
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  // Mentions
  const [mentions, setMentions] = useState<MentionData[]>([]);
  const { contextMention, workspaceId } = usePageContext();
  const lastAppliedContextRef = useRef<string | null>(null);

  // Auto-@ the current page context when it changes (only for new/empty tabs)
  useEffect(() => {
    if (!contextMention) {
      lastAppliedContextRef.current = null;
      return;
    }
    const contextKey = `${contextMention.entityType}:${contextMention.entityId}`;
    // Only auto-add if this is a different context and it's a fresh conversation
    if (lastAppliedContextRef.current !== contextKey && messages.length === 0) {
      lastAppliedContextRef.current = contextKey;
      setMentions((prev) => {
        // Don't duplicate
        if (prev.some((m) => m.entityId === contextMention.entityId)) return prev;
        return [contextMention];
      });
    }
  }, [contextMention, messages.length]);

  const handleMentionSelect = useCallback((data: MentionData) => {
    setMentions((prev) => {
      if (prev.some((m) => m.entityId === data.entityId)) return prev;
      return [...prev, data];
    });
  }, []);

  const handleRemoveMention = useCallback((entityId: string) => {
    setMentions((prev) => prev.filter((m) => m.entityId !== entityId));
  }, []);

  // Attachments
  const { attachments: pendingAttachments, isUploading, addFiles, removeAttachment, uploadAll, clearAll } = useChatAttachments();

  // Refs
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Scroll state
  const [showScrollButton, setShowScrollButton] = useState(false);

  // Subscribe to view context for visual indicator
  const currentView = useViewContextStore((s) => s.currentView);
  const currentEmailContext = useViewContextStore((s) => s.currentEmail);
  const currentProjectContext = useViewContextStore((s) => s.currentProject);
  const currentTaskContext = useViewContextStore((s) => s.currentTask);

  const hasStreamingContent =
    streamingContent.length > 0 || isWaitingForResponse;
  const isEmpty = messages.length === 0 && !hasStreamingContent;

  // Check scroll position
  const checkScrollPosition = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const threshold = 100;
    const isNearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight <
      threshold;
    setShowScrollButton(!isNearBottom);
  }, []);

  const scrollToBottom = useCallback(() => {
    const container = scrollContainerRef.current;
    if (container) {
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    }
  }, []);

  // Listen to scroll events
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    container.addEventListener("scroll", checkScrollPosition);
    checkScrollPosition();
    return () => container.removeEventListener("scroll", checkScrollPosition);
  }, [checkScrollPosition, messages, streamingContent]);

  // Auto-scroll when new content arrives (use instant scroll during streaming to avoid jitter)
  useEffect(() => {
    if (hasStreamingContent) {
      const container = scrollContainerRef.current;
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    }
  }, [streamingContent, hasStreamingContent]);

  // Handle stop streaming
  const handleStopStreaming = useCallback(() => {
    setStreamingConversationId(null);
    if (streamingContent) {
      addMessage({
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: streamingContent,
      });
    }
    setStreamingContent("");
    setIsWaitingForResponse(false);
    setLoading(false);
  }, [streamingContent, setStreamingConversationId, addMessage]);

  // Send message
  const sendMessage = async () => {
    const hasText = input.trim().length > 0;
    const hasAttachments = pendingAttachments.length > 0;
    if ((!hasText && !hasAttachments) || loading) return;

    // Separate display text from API text (hints are for AI only, not shown in UI)
    const displayText = input.trim();
    let apiMessage = displayText;
    // Inject view context (email, project, task) for AI awareness
    const viewCtx = useViewContextStore.getState();
    if (viewCtx.currentEmail) {
      const emailCtx = viewCtx.currentEmail;
      const emailPrefix = "[Contexto: El usuario tiene abierto un email]\n" +
        "De: " + emailCtx.from + "\n" +
        "Para: " + emailCtx.to.join(", ") + "\n" +
        "Asunto: " + emailCtx.subject + "\n" +
        "Fecha: " + emailCtx.date + "\n" +
        "Contenido del email:\n" + emailCtx.body.substring(0, 2000) + "\n" +
        "---\nMensaje del usuario: ";
      apiMessage = emailPrefix + apiMessage;
    } else if (viewCtx.currentView === "projects" && viewCtx.currentTask) {
      const proj = viewCtx.currentProject;
      const task = viewCtx.currentTask;
      const projPrefix = "[Contexto: El usuario est\u00e1 en Proyectos]\n" +
        "Proyecto: " + (proj?.name || "Sin nombre") + "\n" +
        "Tarea actual: " + task.title + "\n" +
        "Estado: " + task.state + "\n" +
        "Descripci\u00f3n: " + (task.description || "Sin descripci\u00f3n") + "\n" +
        "Asignado a: " + (task.assignee || "Sin asignar") + "\n" +
        "---\nMensaje del usuario: ";
      apiMessage = projPrefix + apiMessage;
    } else if (viewCtx.currentView === "projects" && viewCtx.currentProject) {
      const proj = viewCtx.currentProject;
      const projPrefix = "[Contexto: El usuario est\u00e1 en el proyecto \"" + proj.name + "\"]\n---\nMensaje del usuario: ";
      apiMessage = projPrefix + apiMessage;
    }

    if (mentions.length > 0) {
      const mentionHints = mentions
        .map((m) => `[User referenced: ${m.displayName} (${m.entityType}, id: ${m.entityId})]`)
        .join('\n');
      apiMessage = displayText ? `${displayText}\n\n${mentionHints}` : mentionHints;
    }
    setInput("");
    setMentions([]);
    setLoading(true);
    setIsWaitingForResponse(true);
    setStreamingContent("");

    // Add user message immediately (display text only, no hint metadata)
    const tempUserId = `temp-${Date.now()}`;
    addMessage({ id: tempUserId, role: "user", content: displayText || "📎 Image" });

    try {
      // Create conversation if needed
      let convId = activeConversationId;
      if (!convId) {
        const conversation = await createConversation();
        convId = conversation.id;
        setActiveConversationId(convId);
        addConversation(conversation);
      }

      // Upload attachments if any
      let attachmentIds: string[] | undefined;
      if (hasAttachments) {
        const result = await uploadAll(convId);
        attachmentIds = result.attachmentIds.length > 0 ? result.attachmentIds : undefined;
        clearAll();
        if (result.hadErrors) {
          setLoading(false);
          setIsWaitingForResponse(false);
          return;
        }
      }

      setStreamingConversationId(convId);

      // Stream response — word-based reveal matching main chat timing
      let storedContent = "";
      let revealedContent = "";
      let pendingSegments: string[] = [];
      let doneReceived = false;
      let doneMessageId: string | undefined;
      let didFinalize = false;
      let flushScheduled = false;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;

      const splitIntoSegments = (input: string): string[] => input.match(/\s+|[^\s]+/g) ?? [];

      const clearScheduledFlush = () => {
        flushScheduled = false;
        if (timeoutId != null) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      };

      // Word-based reveal count (matches main chat approach)
      const getRevealWordCount = (): number => {
        if (doneReceived) {
          if (pendingSegments.length > 80) return 12;
          if (pendingSegments.length > 40) return 8;
          if (pendingSegments.length > 20) return 4;
          return 2;
        }
        if (pendingSegments.length > 60) return 4;
        if (pendingSegments.length > 30) return 2;
        return 1;
      };

      const drainQueuedText = (maxWords: number | null): string => {
        if (!pendingSegments.length) return "";

        let wordsRevealed = 0;
        const limit = maxWords ?? Number.MAX_SAFE_INTEGER;
        let drained = "";

        while (pendingSegments.length > 0 && wordsRevealed < limit) {
          const next = pendingSegments.shift()!;
          drained += next;
          if (next.trim()) wordsRevealed++;
        }

        return drained;
      };

      const finalizeAssistantMessage = () => {
        if (didFinalize) return;
        didFinalize = true;
        clearScheduledFlush();
        pendingSegments = [];

        addMessage({
          id: doneMessageId || `assistant-${Date.now()}`,
          role: "assistant",
          content: storedContent,
        });
        setStreamingContent("");
        setIsWaitingForResponse(false);

        const currentStreamingId = useSidebarChatStore.getState().streamingConversationId;
        if (currentStreamingId === convId) {
          setStreamingConversationId(null);
        }
      };

      const runRevealFrame = () => {
        timeoutId = null;
        flushScheduled = false;

        const currentStreamingId = useSidebarChatStore.getState().streamingConversationId;
        if (currentStreamingId !== convId) {
          clearScheduledFlush();
          return;
        }

        const drained = drainQueuedText(getRevealWordCount());
        if (drained) {
          revealedContent += drained;
          setStreamingContent(revealedContent);
        }

        if (pendingSegments.length > 0) {
          scheduleSnapshotFlush();
          return;
        }

        if (doneReceived) {
          finalizeAssistantMessage();
        }
      };

      // 35ms interval (~28 updates/sec) for smooth per-word animation
      const scheduleSnapshotFlush = () => {
        if (flushScheduled) return;
        flushScheduled = true;
        timeoutId = setTimeout(runRevealFrame, 35);
      };

      for await (const event of streamMessage(convId, apiMessage, { attachmentIds, workspaceIds: workspaceId ? [workspaceId] : undefined })) {
        // Check if streaming was cancelled
        const currentStreamingId = useSidebarChatStore.getState().streamingConversationId;
        if (currentStreamingId !== convId) {
          break;
        }

        if (event.type === "content" && event.delta) {
          storedContent += event.delta;
          const segments = splitIntoSegments(event.delta);
          if (segments.length > 0) {
            pendingSegments.push(...segments);
            scheduleSnapshotFlush();
          }
          setIsWaitingForResponse(false);
        } else if (event.type === "done") {
          doneReceived = true;
          doneMessageId = typeof event.message_id === "string" ? event.message_id : undefined;
          setIsWaitingForResponse(false);
          if (pendingSegments.length > 0) {
            scheduleSnapshotFlush();
          } else {
            finalizeAssistantMessage();
          }
        } else if (event.type === "error") {
          console.error("Stream error:", event.error);
          clearScheduledFlush();
          pendingSegments = [];
          didFinalize = true;
          doneReceived = false;
          setStreamingContent("");
          setIsWaitingForResponse(false);
          const latestStreamingId = useSidebarChatStore.getState().streamingConversationId;
          if (latestStreamingId === convId) {
            setStreamingConversationId(null);
          }
          addMessage({
            id: `error-${Date.now()}`,
            role: "assistant",
            content: "Lo sentimos, hubo un error al procesar tu solicitud.",
          });
        }
      }

      if (doneReceived && !didFinalize) {
        const currentStreamingId = useSidebarChatStore.getState().streamingConversationId;
        if (currentStreamingId === convId) {
          if (pendingSegments.length > 0) {
            scheduleSnapshotFlush();
          } else {
            finalizeAssistantMessage();
          }
        } else {
          clearScheduledFlush();
          pendingSegments = [];
          setStreamingContent("");
          setIsWaitingForResponse(false);
        }
      } else {
        clearScheduledFlush();
        pendingSegments = [];

        const currentStreamingId = useSidebarChatStore.getState().streamingConversationId;
        if (currentStreamingId === convId) {
          setStreamingConversationId(null);
        }
      }
    } catch (err) {
      console.error("Failed to send message:", err);
      setStreamingContent("");
      setIsWaitingForResponse(false);
      addMessage({
        id: `error-${Date.now()}`,
        role: "assistant",
        content: "Lo sentimos, hubo un error al conectar con el servidor.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-white overflow-hidden min-w-[340px]">
      {/* Header */}
      <div className="shrink-0">
        <div className="h-12 flex items-center justify-between pl-4 pr-2">
          <h2 className="text-base font-semibold text-text-body">Chat</h2>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => {
                if (isEmpty || isClearing) return;
                setStreamingContent("");
                setIsWaitingForResponse(false);
                setLoading(false);
                setIsClearing(true);
              }}
              className="p-1.5 text-text-tertiary hover:text-text-body hover:bg-bg-gray rounded-lg transition-colors"
              title="Reset chat"
              aria-label="Reset chat"
            >
              <ArrowPathIcon className="w-4 h-4 stroke-2" />
            </button>
            <button
              onClick={() => setSidebarChatOpen(false)}
              className="p-1.5 text-text-tertiary hover:text-text-body hover:bg-bg-gray rounded-lg transition-colors"
              title="Cerrar"
              aria-label="Close chat sidebar"
            >
              <XMarkIcon className="w-4 h-4 stroke-2" />
            </button>
          </div>
        </div>
      </div>

      {/* Context indicator (email, project, task) */}
      {(currentEmailContext || (currentView === "projects" && (currentTaskContext || currentProjectContext))) && (
        <div className="flex items-center gap-1.5 px-4 pb-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 border border-blue-200 rounded-full text-xs text-blue-700 max-w-full">
            {currentEmailContext ? (
              <>
                <span className="shrink-0">✉️</span>
                <span className="truncate font-medium">
                  Viendo: {currentEmailContext.subject.length > 35
                    ? currentEmailContext.subject.substring(0, 35) + "..."
                    : currentEmailContext.subject}
                </span>
              </>
            ) : currentTaskContext ? (
              <>
                <span className="shrink-0">📋</span>
                <span className="truncate font-medium">
                  Tarea: {currentTaskContext.title.length > 35
                    ? currentTaskContext.title.substring(0, 35) + "..."
                    : currentTaskContext.title}
                </span>
              </>
            ) : currentProjectContext ? (
              <>
                <span className="shrink-0">📋</span>
                <span className="truncate font-medium">
                  Proyecto: {currentProjectContext.name.length > 30
                    ? currentProjectContext.name.substring(0, 30) + "..."
                    : currentProjectContext.name}
                </span>
              </>
            ) : null}
            <button
              onClick={() => {
                useViewContextStore.getState().setCurrentEmail(null);
                useViewContextStore.getState().setCurrentProject(null);
                useViewContextStore.getState().setCurrentTask(null);
              }}
              className="shrink-0 text-blue-400 hover:text-blue-600 ml-0.5"
              title="Quitar contexto"
            >
              <XMarkIcon className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
        <AnimatePresence
          onExitComplete={() => {
            if (isClearing) {
              clearChat();
              setIsClearing(false);
            }
          }}
        >
          {/* Empty state */}
          {isEmpty && !isClearing && (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex-1 flex items-center justify-center"
            >
              <p className="text-sm text-text-tertiary">Pregunta lo que quieras</p>
            </motion.div>
          )}

          {/* Messages */}
          {!isEmpty && !isClearing && (
            <motion.div
              key="messages"
              exit={{ opacity: 0, y: -30, transition: { duration: 0.12, ease: [0.4, 0, 1, 1] } }}
              ref={scrollContainerRef}
              className="flex-1 overflow-y-auto"
            >
              <div className="py-4">
                {messages.map((message) => (
                  <div key={message.id}>
                    <ChatMessage role={message.role} content={message.content} />
                  </div>
                ))}

                {/* Streaming content */}
                {hasStreamingContent && (
                  <div>
                    {isWaitingForResponse ? (
                      <div className="py-2 px-4">
                        <div className="flex items-center gap-2 text-sm text-text-tertiary">
                          <span className="flex gap-0.5 text-lg leading-none">
                            <span className="animate-bounce inline-block" style={{ animationDelay: "0ms" }}>&middot;</span>
                            <span className="animate-bounce inline-block" style={{ animationDelay: "150ms" }}>&middot;</span>
                            <span className="animate-bounce inline-block" style={{ animationDelay: "300ms" }}>&middot;</span>
                          </span>
                          <span className="text-xs">Pensando...</span>
                        </div>
                      </div>
                    ) : (
                      <ChatMessage
                        role="assistant"
                        content={streamingContent}
                        isStreaming
                      />
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Scroll to bottom button */}
        {showScrollButton && !isEmpty && (
          <button
            onClick={scrollToBottom}
            className="absolute bottom-20 left-1/2 -translate-x-1/2 w-7 h-7 rounded-full bg-bg-white border border-border-gray shadow-sm flex items-center justify-center text-text-tertiary hover:text-text-body hover:bg-bg-gray-light transition-colors"
            aria-label="Scroll to bottom"
          >
            <ArrowDownIcon className="w-3.5 h-3.5 stroke-2" />
          </button>
        )}

        {/* Input */}
        <div className="px-3 pb-6 pt-2">
          <SidebarChatInput
            value={input}
            onChange={setInput}
            onSubmit={sendMessage}
            onStop={handleStopStreaming}
            onAddFiles={addFiles}
            onRemoveAttachment={removeAttachment}
            pendingAttachments={pendingAttachments}
            isUploading={isUploading}
            disabled={loading}
            isStreaming={hasStreamingContent}
            placeholder="Pregunta lo que quieras..."
            mentions={mentions}
            onMentionSelect={handleMentionSelect}
            onRemoveMention={handleRemoveMention}
            workspaceId={workspaceId}
          />
        </div>
      </div>
    </div>
  );
}
