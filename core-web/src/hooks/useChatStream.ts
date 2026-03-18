import { useState, useRef, useCallback } from 'react';
import { streamMessage, regenerateMessage, type ContentPart } from '../api/client';
import { WebContentBuilder } from '../lib/WebContentBuilder';

interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  content_parts?: ContentPart[];
}

interface UseChatStreamParams {
  activeConversationRef: React.MutableRefObject<string | null>;
  messages: DisplayMessage[];
  setMessages: React.Dispatch<React.SetStateAction<DisplayMessage[]>>;
  selectedWorkspaceIds: string[];
  workspaceId?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StreamEvent = any;

/**
 * Processes a stream of events from the API, updating streaming state and
 * finalizing the assistant message when done.
 */
function processStreamEvents(
  stream: AsyncGenerator<StreamEvent>,
  convId: string,
  streamingConversationRef: React.MutableRefObject<string | null>,
  builderRef: React.MutableRefObject<WebContentBuilder | null>,
  setStreamingContent: React.Dispatch<React.SetStateAction<string>>,
  setStreamingParts: React.Dispatch<React.SetStateAction<ContentPart[]>>,
  setIsWaitingForResponse: React.Dispatch<React.SetStateAction<boolean>>,
  setStreamStatus: React.Dispatch<React.SetStateAction<string | null>>,
  setMessages: React.Dispatch<React.SetStateAction<DisplayMessage[]>>,
  _setLoading: React.Dispatch<React.SetStateAction<boolean>>,
  mark: (label: string) => void,
) {
  return (async () => {
    const builder = new WebContentBuilder();
    builderRef.current = builder;

    let fullContent = '';
    let firstEvent = true;
    let firstToken = true;

    for await (const event of stream) {
      // Check if we're still streaming for this conversation
      if (streamingConversationRef.current !== convId) {
        break; // User switched to new chat, abandon this stream
      }

      if (firstEvent) { mark('first_event (' + event.type + ')'); firstEvent = false; }

      switch (event.type) {
        case 'tool_call':
          if (event.name) {
            if (event.phase === 'start') {
              builder.addToolCallStart(event.name, event.args);
              setStreamingParts(builder.getSnapshot());
              setIsWaitingForResponse(false);
            } else if (event.phase === 'end') {
              builder.updateToolCallEnd(event.name, event.duration_ms, event.status);
              setStreamingParts(builder.getSnapshot());
            }
          }
          break;

        case 'content':
          if (event.delta) {
            if (firstToken) { mark('first_token'); firstToken = false; }
            builder.appendText(event.delta);
            fullContent += event.delta;
            setStreamingContent(fullContent);
            setStreamingParts(builder.getSnapshot());
            setIsWaitingForResponse(false);
          }
          break;

        case 'display':
          builder.addDisplay(event);
          setStreamingParts(builder.getSnapshot());
          setIsWaitingForResponse(false);
          break;

        case 'action':
          builder.addAction(event);
          setStreamingParts(builder.getSnapshot());
          setIsWaitingForResponse(false);
          break;

        case 'sources':
          if (event.sources) {
            builder.addSources(event.sources);
            setStreamingParts(builder.getSnapshot());
          }
          break;

        case 'status':
          setStreamStatus(event.message || event.description || null);
          break;

        case 'done': {
          mark('done');
          const finalParts = builder.finalize();
          const finalText = builder.getFullText();

          setMessages((prev) => [
            ...prev,
            {
              id: event.message_id || `assistant-${Date.now()}`,
              role: 'assistant',
              content: finalText || fullContent,
              content_parts: finalParts.length > 0 ? finalParts : undefined,
            },
          ]);
          builderRef.current = null;
          setStreamingContent('');
          setStreamingParts([]);
          setStreamStatus(null);
          setIsWaitingForResponse(false);
          break;
        }

        case 'error': {
          const errorMsg = event.error || event.message || 'Sorry, there was an error processing your request.';
          console.error('Stream error:', errorMsg);
          streamingConversationRef.current = null;
          builderRef.current = null;
          setStreamingContent('');
          setStreamingParts([]);
          setStreamStatus(null);
          setIsWaitingForResponse(false);
          setMessages((prev) => [
            ...prev,
            {
              id: `error-${Date.now()}`,
              role: 'assistant',
              content: errorMsg,
            },
          ]);
          break;
        }

        // ping events are ignored
      }
    }

    // Clear streaming ref when done
    if (streamingConversationRef.current === convId) {
      streamingConversationRef.current = null;
    }
  })();
}

export function useChatStream({
  activeConversationRef,
  messages: _messages,
  setMessages,
  selectedWorkspaceIds,
  workspaceId,
}: UseChatStreamParams) {
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingParts, setStreamingParts] = useState<ContentPart[]>([]);
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);
  const [streamStatus, setStreamStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const streamingConversationRef = useRef<string | null>(null);
  const builderRef = useRef<WebContentBuilder | null>(null);

  const hasStreamingContent = streamingParts.length > 0 || streamingContent.length > 0 || isWaitingForResponse;

  const handleStopStreaming = useCallback(() => {
    // Clear the streaming ref to signal the stream loop to stop
    streamingConversationRef.current = null;

    // Commit partial content from builder
    const builder = builderRef.current;
    const finalParts = builder?.finalize();
    const finalText = builder?.getFullText() || streamingContent;

    if (finalText || (finalParts && finalParts.length > 0)) {
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: finalText,
          content_parts: finalParts,
        },
      ]);
    }

    // Reset streaming state
    builderRef.current = null;
    setStreamingContent('');
    setStreamingParts([]);
    setStreamStatus(null);
    setIsWaitingForResponse(false);
    setLoading(false);
  }, [streamingContent, setMessages]);

  const sendMessage = useCallback(async (
    userMessage: string,
    convId: string,
    attachmentIds?: string[],
    attachmentParts?: ContentPart[],
  ) => {
    const t0 = performance.now();
    const mark = (label: string) => console.log(`⏱ ${label}: ${(performance.now() - t0).toFixed(0)}ms`);

    setLoading(true);
    setIsWaitingForResponse(true);
    setStreamingContent('');
    setStreamingParts([]);
    setStreamStatus(null);

    // Add user message immediately
    const tempUserId = `temp-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: tempUserId,
        role: 'user',
        content: userMessage,
        ...(attachmentParts && attachmentParts.length > 0 ? { content_parts: attachmentParts } : {}),
      },
    ]);

    try {
      // Track which conversation this stream belongs to
      streamingConversationRef.current = convId;

      const stream = streamMessage(convId, userMessage, {
        attachmentIds,
        workspaceIds: selectedWorkspaceIds.length > 0 ? selectedWorkspaceIds : workspaceId ? [workspaceId] : undefined,
      });

      await processStreamEvents(
        stream,
        convId,
        streamingConversationRef,
        builderRef,
        setStreamingContent,
        setStreamingParts,
        setIsWaitingForResponse,
        setStreamStatus,
        setMessages,
        setLoading,
        mark,
      );
    } catch (err) {
      console.error('Failed to send message:', err);
      builderRef.current = null;
      setStreamingContent('');
      setStreamingParts([]);
      setStreamStatus(null);
      setIsWaitingForResponse(false);
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: 'Sorry, there was an error connecting to the server.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, [selectedWorkspaceIds, workspaceId, setMessages]);

  const handleRegenerate = useCallback(async (messageId: string) => {
    const convId = activeConversationRef.current;
    if (!convId || loading) return;

    const t0 = performance.now();
    const mark = (label: string) => console.log(`⏱ regen ${label}: ${(performance.now() - t0).toFixed(0)}ms`);

    // Remove the target message and any messages after it
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === messageId);
      if (idx === -1) return prev;
      return prev.slice(0, idx);
    });

    setLoading(true);
    setIsWaitingForResponse(true);
    setStreamingContent('');
    setStreamingParts([]);
    setStreamStatus(null);

    try {
      streamingConversationRef.current = convId;

      const stream = regenerateMessage(convId, messageId, {
        workspaceIds: selectedWorkspaceIds.length > 0 ? selectedWorkspaceIds : workspaceId ? [workspaceId] : undefined,
      });

      await processStreamEvents(
        stream,
        convId,
        streamingConversationRef,
        builderRef,
        setStreamingContent,
        setStreamingParts,
        setIsWaitingForResponse,
        setStreamStatus,
        setMessages,
        setLoading,
        mark,
      );
    } catch (err) {
      console.error('Failed to regenerate message:', err);
      builderRef.current = null;
      setStreamingContent('');
      setStreamingParts([]);
      setStreamStatus(null);
      setIsWaitingForResponse(false);
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: 'Sorry, there was an error regenerating the response.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, [activeConversationRef, loading, selectedWorkspaceIds, workspaceId, setMessages]);

  return {
    streamingContent,
    streamingParts,
    isWaitingForResponse,
    streamStatus,
    loading,
    hasStreamingContent,
    sendMessage,
    handleStopStreaming,
    handleRegenerate,
    streamingConversationRef,
    builderRef,
    // Expose setters needed by ChatView for reset scenarios
    setStreamingContent,
    setStreamingParts,
    setStreamStatus,
    setIsWaitingForResponse,
    setLoading,
  };
}
