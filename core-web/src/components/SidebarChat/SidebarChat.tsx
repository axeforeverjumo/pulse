import { useState, useRef, useEffect, useCallback } from "react";
import {
  XMarkIcon,
  ArrowDownIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";
import { streamMessage, createConversation, getMessages } from "../../api/client";
import { useConversationStore } from "../../stores/conversationStore";
import { useUIStore } from "../../stores/uiStore";
import { useSidebarChatStore, type TabId, createNewTabId, isNewTab } from "../../stores/sidebarChatStore";
import { useChatAttachments } from "../../hooks/useChatAttachments";
import { usePageContext } from "../../hooks/usePageContext";
import type { MentionData } from "../../types/mention";
import ChatTabBar from "./ChatTabBar";
import ChatMessage from "./SidebarChatMessage";
import SidebarChatInput from "./SidebarChatInput";

export default function SidebarChat() {
  const setSidebarChatOpen = useUIStore((s) => s.setSidebarChatOpen);
  const addConversation = useConversationStore(
    (state) => state.addConversation,
  );

  // Persisted state from store
  const messages = useSidebarChatStore((s) => s.messages);
  const activeConversationId = useSidebarChatStore((s) => s.activeConversationId);
  const activeTabId = useSidebarChatStore((s) => s.activeTabId);
  const showTabBar = useSidebarChatStore((s) => s.showTabBar);
  const addMessage = useSidebarChatStore((s) => s.addMessage);
  const setMessages = useSidebarChatStore((s) => s.setMessages);
  const setActiveConversationId = useSidebarChatStore((s) => s.setActiveConversationId);
  const setStreamingConversationId = useSidebarChatStore((s) => s.setStreamingConversationId);
  const addTab = useSidebarChatStore((s) => s.addTab);
  const replaceTab = useSidebarChatStore((s) => s.replaceTab);

  // Local state (transient, doesn't need to persist)
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);

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

  // Auto-scroll when new content arrives
  useEffect(() => {
    if (hasStreamingContent) {
      scrollToBottom();
    }
  }, [streamingContent, hasStreamingContent, scrollToBottom]);

  // Load messages when tab changes
  const handleTabChange = useCallback(async (tabId: TabId) => {
    // Clear streaming state
    setStreamingContent("");
    setIsWaitingForResponse(false);
    setLoading(false);

    // If it's a new empty tab, messages are already cleared by the store
    if (isNewTab(tabId) || !tabId) return;

    // Load messages for the conversation
    try {
      const fetchedMessages = await getMessages(tabId);
      // Map API messages to DisplayMessage format
      const displayMessages = fetchedMessages.map((msg) => ({
        id: msg.id,
        role: msg.role as 'user' | 'assistant',
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
      }));
      setMessages(displayMessages);
    } catch (err) {
      console.error("Failed to load messages:", err);
    }
  }, [setMessages]);

  // Handle new tab from header button (when tab bar is hidden)
  const handleNewTab = useCallback(() => {
    const newTabId = createNewTabId();
    addTab(newTabId);
  }, [addTab]);

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
        // Replace the temp tab with the new conversation ID
        replaceTab(activeTabId, convId);
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

      // Stream response
      let fullContent = "";
      for await (const event of streamMessage(convId, apiMessage, { attachmentIds, workspaceIds: workspaceId ? [workspaceId] : undefined })) {
        // Check if streaming was cancelled
        const currentStreamingId = useSidebarChatStore.getState().streamingConversationId;
        if (currentStreamingId !== convId) {
          break;
        }

        if (event.type === "content" && event.delta) {
          fullContent += event.delta;
          setStreamingContent(fullContent);
          setIsWaitingForResponse(false);
        } else if (event.type === "done") {
          addMessage({
            id: event.message_id || `assistant-${Date.now()}`,
            role: "assistant",
            content: fullContent,
          });
          setStreamingContent("");
          setIsWaitingForResponse(false);
        } else if (event.type === "error") {
          console.error("Stream error:", event.error);
          setStreamingContent("");
          setIsWaitingForResponse(false);
          addMessage({
            id: `error-${Date.now()}`,
            role: "assistant",
            content: "Sorry, there was an error processing your request.",
          });
        }
      }

      const currentStreamingId = useSidebarChatStore.getState().streamingConversationId;
      if (currentStreamingId === convId) {
        setStreamingConversationId(null);
      }
    } catch (err) {
      console.error("Failed to send message:", err);
      setStreamingContent("");
      setIsWaitingForResponse(false);
      addMessage({
        id: `error-${Date.now()}`,
        role: "assistant",
        content: "Sorry, there was an error connecting to the server.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-white overflow-hidden">
      {/* Header */}
      <div className="shrink-0">
        <div className="h-12 flex items-center justify-between pl-4 pr-2">
          <h2 className="text-base font-semibold text-text-body">Chat</h2>
          <div className="flex items-center gap-0.5">
            {/* Show + button when tab bar is hidden (only 1 tab) */}
            <button
              onClick={handleNewTab}
              className={`p-1.5 text-text-tertiary hover:text-text-body hover:bg-bg-gray rounded-lg transition-all duration-200 overflow-hidden ${
                !showTabBar
                  ? 'w-7 opacity-100'
                  : 'w-0 opacity-0 p-0'
              }`}
              title="New chat"
              aria-label="New chat"
            >
              <PlusIcon className="w-4 h-4 stroke-2" />
            </button>
            <button
              onClick={() => setSidebarChatOpen(false)}
              className="p-1.5 text-text-tertiary hover:text-text-body hover:bg-bg-gray rounded-lg transition-colors"
              title="Close"
              aria-label="Close chat sidebar"
            >
              <XMarkIcon className="w-4 h-4 stroke-2" />
            </button>
          </div>
        </div>
        <ChatTabBar onTabChange={handleTabChange} />
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
        {/* Empty state - takes up space when no messages */}
        {isEmpty && (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-text-tertiary">Ask anything</p>
          </div>
        )}

        {/* Messages */}
        {!isEmpty && (
          <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
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
                      <span className="inline-block w-2.5 h-2.5 bg-text-body rounded-full animate-pulse" />
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
          </div>
        )}

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
        <div className="px-3 pb-4 pt-2">
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
            placeholder="Ask anything..."
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
