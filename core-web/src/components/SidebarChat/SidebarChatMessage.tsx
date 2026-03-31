import { useState, memo } from 'react';
import { DocumentDuplicateIcon, CheckIcon } from '@heroicons/react/24/outline';
import StreamingText from '../Chat/StreamingText';

interface ChatMessageProps {
  role: 'user' | 'assistant' | 'agent';
  content: string;
  isStreaming?: boolean;
  agentName?: string;
  agentAvatar?: string;
}

// User message - right aligned bubble (compact)
function UserMessage({ content }: { content: string }) {
  const isShort = content.length <= 60 && !content.includes('\n');
  return (
    <div className="py-1.5 px-3">
      <div className="flex justify-end">
        <div className={`bg-[#F7F8FA] px-4 py-2 max-w-[85%] ${isShort ? 'rounded-full' : 'rounded-2xl'}`}>
          <p className="text-text-body whitespace-pre-wrap text-sm leading-relaxed">
            {content}
          </p>
        </div>
      </div>
    </div>
  );
}

// Assistant message - left aligned (compact)
function AssistantMessage({ content, isStreaming }: { content: string; isStreaming?: boolean }) {
  const [copied, setCopied] = useState(false);

  const handleCopyMessage = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="group py-1.5 px-4">
      <div className="max-w-[95%]">
        {/* Message content - use StreamingText for animation */}
        <StreamingText
          content={content}
          isStreaming={isStreaming ?? false}
          variant="compact"
        />

        {/* Copy button - only show on hover when not streaming */}
        {!isStreaming && (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity mt-1">
            <button
              onClick={handleCopyMessage}
              className="p-1 text-text-tertiary hover:text-text-body hover:bg-bg-gray rounded transition-colors"
              title="Copiar"
            >
              {copied ? (
                <CheckIcon className="w-3.5 h-3.5 stroke-2" />
              ) : (
                <DocumentDuplicateIcon className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Agent message - left aligned with avatar and name
function AgentMessage({ content, agentName, agentAvatar }: { content: string; agentName?: string; agentAvatar?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopyMessage = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="group py-1.5 px-4">
      <div className="flex gap-2 items-start max-w-[95%]">
        {agentAvatar ? (
          <img src={agentAvatar} alt={agentName || "Agente"} className="w-6 h-6 rounded-full shrink-0 mt-0.5" />
        ) : (
          <div className="w-6 h-6 rounded-full bg-violet-100 flex items-center justify-center shrink-0 mt-0.5">
            <span className="text-xs text-violet-600 font-semibold">{(agentName || "A")[0]}</span>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <span className="text-xs font-semibold text-violet-700 block mb-0.5">{agentName || "Agente"}</span>
          <StreamingText
            content={content}
            isStreaming={false}
            variant="compact"
          />
          <div className="opacity-0 group-hover:opacity-100 transition-opacity mt-1">
            <button
              onClick={handleCopyMessage}
              className="p-1 text-text-tertiary hover:text-text-body hover:bg-bg-gray rounded transition-colors"
              title="Copiar"
            >
              {copied ? (
                <CheckIcon className="w-3.5 h-3.5 stroke-2" />
              ) : (
                <DocumentDuplicateIcon className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SidebarChatMessage({ role, content, isStreaming, agentName, agentAvatar }: ChatMessageProps) {
  if (role === 'user') {
    return <UserMessage content={content} />;
  }
  if (role === 'agent') {
    return <AgentMessage content={content} agentName={agentName} agentAvatar={agentAvatar} />;
  }
  return <AssistantMessage content={content} isStreaming={isStreaming} />;
}

export default memo(SidebarChatMessage);
