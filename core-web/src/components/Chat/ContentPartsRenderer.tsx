import { useState, memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import {
  DocumentDuplicateIcon,
  DocumentTextIcon,
  CheckIcon,
  CalendarIcon,
  EnvelopeIcon,
  CheckCircleIcon,
  ClockIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  PlusIcon,
  XMarkIcon,
  ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/outline';
import { Link } from 'react-router-dom';
import type { Components } from 'react-markdown';
import type { ContentPart, Source } from '../../api/client';
import { executeAction } from '../../api/client';
import ChatAttachmentImage from './ChatAttachmentImage';

// ============================================================================
// Code Block (shared with ChatMessage)
// ============================================================================

function CodeBlock({ language, children }: { language: string | undefined; children: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group my-4 rounded-xl overflow-hidden bg-[#1e1e1e]">
      <div className="flex items-center justify-between px-4 py-2 bg-[#2d2d2d] text-text-tertiary text-xs">
        <span className="font-mono">{language || 'text'}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 hover:text-text-light transition-colors"
        >
          {copied ? (
            <>
              <CheckIcon className="w-3.5 h-3.5 stroke-2" />
              <span>Copied!</span>
            </>
          ) : (
            <>
              <DocumentDuplicateIcon className="w-3.5 h-3.5" />
              <span>Copy code</span>
            </>
          )}
        </button>
      </div>
      <SyntaxHighlighter
        language={language || 'text'}
        style={oneDark}
        customStyle={{
          margin: 0,
          padding: '16px',
          background: '#1e1e1e',
          fontSize: '13px',
          lineHeight: '1.5',
        }}
        codeTagProps={{ style: { fontFamily: 'var(--font-mono)' } }}
      >
        {children}
      </SyntaxHighlighter>
    </div>
  );
}

// ============================================================================
// Markdown renderer config (shared)
// ============================================================================

const markdownComponents: Components = {
  code({ className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || '');
    const codeString = String(children).replace(/\n$/, '');
    const isInline = !match && !codeString.includes('\n');

    if (isInline) {
      return (
        <code className="bg-[#EAEAEA] px-1.5 py-0.5 rounded text-sm font-mono text-text-body" {...props}>
          {children}
        </code>
      );
    }

    return <CodeBlock language={match?.[1]}>{codeString}</CodeBlock>;
  },
  p({ children }) {
    return <p className="mb-4 last:mb-0 leading-7">{children}</p>;
  },
  ul({ children }) {
    return <ul className="mb-4 last:mb-0 pl-6 list-disc space-y-2">{children}</ul>;
  },
  ol({ children }) {
    return <ol className="mb-4 last:mb-0 pl-6 list-decimal space-y-2">{children}</ol>;
  },
  li({ children }) {
    return <li className="leading-7">{children}</li>;
  },
  h1({ children }) {
    return <h1 className="text-2xl font-semibold mb-4 mt-6 first:mt-0">{children}</h1>;
  },
  h2({ children }) {
    return <h2 className="text-xl font-semibold mb-3 mt-5 first:mt-0">{children}</h2>;
  },
  h3({ children }) {
    return <h3 className="text-lg font-semibold mb-2 mt-4 first:mt-0">{children}</h3>;
  },
  blockquote({ children }) {
    return (
      <blockquote className="border-l-4 border-border-gray pl-4 my-4 text-text-secondary italic">
        {children}
      </blockquote>
    );
  },
  a({ href, children }) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
        {children}
      </a>
    );
  },
  table({ children }) {
    return (
      <div className="overflow-x-auto my-4">
        <table className="min-w-full border-collapse border border-border-gray">{children}</table>
      </div>
    );
  },
  th({ children }) {
    return <th className="border border-border-gray bg-bg-gray px-4 py-2 text-left font-semibold">{children}</th>;
  },
  td({ children }) {
    return <td className="border border-border-gray px-4 py-2">{children}</td>;
  },
  hr() {
    return <hr className="my-6 border-border-light" />;
  },
};

// ============================================================================
// Display Card Components
// ============================================================================

function CalendarEventCard({ item }: { item: Record<string, unknown> }) {
  const title = (item.title || item.summary || 'Untitled') as string;
  const startTime = item.start_time as string | undefined;
  const location = item.location as string | undefined;

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleString(undefined, {
        weekday: 'short', month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit',
      });
    } catch { return iso; }
  };

  return (
    <div className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-bg-gray/60 border border-border-light">
      <CalendarIcon className="w-4 h-4 mt-0.5 text-text-tertiary flex-shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-text-body truncate">{title}</p>
        {startTime && <p className="text-xs text-text-secondary mt-0.5">{formatTime(startTime)}</p>}
        {location && <p className="text-xs text-text-tertiary mt-0.5 truncate">{location}</p>}
      </div>
    </div>
  );
}

function EmailCard({ item }: { item: Record<string, unknown> }) {
  const subject = (item.subject || 'No subject') as string;
  const from = (item.from_name || item.from_email || item.from || '') as string;
  const snippet = (item.snippet || '') as string;

  return (
    <Link to="/email" className="group/email block">
      <div className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-bg-gray/60 border border-border-light group-hover/email:bg-bg-gray/90 transition-colors cursor-pointer">
        <EnvelopeIcon className="w-4 h-4 mt-0.5 text-text-tertiary flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-text-body truncate">{subject}</p>
          {from && <p className="text-xs text-text-secondary mt-0.5">{from}</p>}
          {snippet && <p className="text-xs text-text-tertiary mt-0.5 line-clamp-1">{snippet}</p>}
        </div>
        <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5 mt-1 text-text-tertiary flex-shrink-0 opacity-0 group-hover/email:opacity-100 transition-opacity" />
      </div>
    </Link>
  );
}


// ============================================================================
// Part Renderers
// ============================================================================

function TextPartRenderer({ content }: { content: string }) {
  return (
    <div className="prose prose-gray max-w-none text-text-body text-[16px]">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

function DisplayPartRenderer({ part }: { part: ContentPart }) {
  const displayType = part.data.display_type as string;
  const items = (part.data.items || []) as Record<string, unknown>[];
  const totalCount = part.data.total_count as number | undefined;

  if (!items.length) return null;

  const renderCard = (item: Record<string, unknown>, i: number) => {
    switch (displayType) {
      case 'calendar_events': return <CalendarEventCard key={i} item={item} />;
      case 'emails': return <EmailCard key={i} item={item} />;
      default: return null;
    }
  };

  const label: Record<string, string> = {
    calendar_events: 'Events',
    emails: 'Emails',
  };

  return (
    <div className="my-3">
      <div className="space-y-1.5">
        {items.map((item, i) => renderCard(item, i))}
      </div>
      {totalCount != null && totalCount > items.length && (
        <p className="text-xs text-text-tertiary mt-1.5 pl-1">
          +{totalCount - items.length} more {label[displayType] || 'items'}
        </p>
      )}
    </div>
  );
}

function ActionPartRenderer({ part, messageId }: { part: ContentPart; messageId?: string }) {
  const action = part.data.action as string;
  const initialStatus = part.data.status as string;
  const description = part.data.description as string;
  const actionData = (part.data.data || part.data) as Record<string, unknown>;
  const [status, setStatus] = useState(initialStatus);
  const [isExecuting, setIsExecuting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [resultData, setResultData] = useState<Record<string, unknown> | null>(
    (part.data.result as Record<string, unknown>) || null
  );

  const isExecuted = status === 'executed' || status === 'confirmed';
  const isError = status === 'error';

  const handleConfirm = async () => {
    if (!messageId || isExecuted || isExecuting) return;
    setIsExecuting(true);
    setErrorMsg(null);
    try {
      const res = await executeAction(messageId, part.id);
      setStatus('executed');
      if (res.result) setResultData(res.result);
    } catch (err) {
      console.error('Failed to execute action:', err);
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setIsExecuting(false);
    }
  };

  // Calendar event action card
  if (action === 'create_calendar_event') {
    const summary = (actionData.summary || '') as string;
    const startTime = actionData.start_time as string | undefined;
    const endTime = actionData.end_time as string | undefined;
    const eventDescription = actionData.description as string | undefined;

    const formatTime = (iso: string) => {
      try {
        return new Date(iso).toLocaleString(undefined, {
          weekday: 'short', month: 'short', day: 'numeric',
          hour: 'numeric', minute: '2-digit',
        });
      } catch { return iso; }
    };

    return (
      <div className="my-3 rounded-xl border border-border-light overflow-hidden">
        <div className="flex items-start gap-3 px-4 py-3 bg-[#E9F7FF]/40">
          <CalendarIcon className="w-5 h-5 mt-0.5 text-[#4EAAE0] flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-text-body">{summary || description}</p>
            {startTime && (
              <p className="text-xs text-text-secondary mt-1">
                {formatTime(startTime)}
                {endTime && ` - ${new Date(endTime).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`}
              </p>
            )}
            {eventDescription && <p className="text-xs text-text-tertiary mt-1 line-clamp-2">{eventDescription}</p>}
          </div>
          {isExecuted ? (
            <span className="flex items-center gap-1 text-xs text-green-600 font-medium flex-shrink-0">
              <CheckCircleIcon className="w-4 h-4" />
              Created
            </span>
          ) : isError ? (
            <button
              onClick={handleConfirm}
              disabled={isExecuting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500 text-white text-xs font-medium hover:bg-red-600 transition-colors disabled:opacity-50 flex-shrink-0"
            >
              Retry
            </button>
          ) : (
            <button
              onClick={handleConfirm}
              disabled={isExecuting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#4EAAE0] text-white text-xs font-medium hover:bg-[#3d99cf] transition-colors disabled:opacity-50 flex-shrink-0"
            >
              {isExecuting ? (
                <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <PlusIcon className="w-3.5 h-3.5 stroke-2" />
              )}
              Create
            </button>
          )}
        </div>
        {errorMsg && <p className="px-4 pb-2 text-xs text-red-500">{errorMsg}</p>}
      </div>
    );
  }

  // Email action card
  if (action === 'send_email') {
    const to = (actionData.to || '') as string;
    const subject = (actionData.subject || '') as string;
    const body = (actionData.body || '') as string;

    return (
      <div className="my-3 rounded-xl border border-border-light overflow-hidden">
        <div className="flex items-start gap-3 px-4 py-3 bg-[#FCFCFC]">
          <EnvelopeIcon className="w-5 h-5 mt-0.5 text-text-tertiary flex-shrink-0" />
          <div className="min-w-0 flex-1">
            {to && <p className="text-xs text-text-secondary">To: {to}</p>}
            <p className="text-sm font-medium text-text-body mt-0.5">{subject || description}</p>
            {body && <p className="text-xs text-text-tertiary mt-1 line-clamp-3 italic">{body}</p>}
          </div>
          {isExecuted ? (
            <span className="flex items-center gap-1 text-xs text-green-600 font-medium flex-shrink-0">
              <CheckCircleIcon className="w-4 h-4" />
              Sent
            </span>
          ) : isError ? (
            <button
              onClick={handleConfirm}
              disabled={isExecuting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500 text-white text-xs font-medium hover:bg-red-600 transition-colors disabled:opacity-50 flex-shrink-0"
            >
              Retry
            </button>
          ) : (
            <button
              onClick={handleConfirm}
              disabled={isExecuting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-text-body text-white text-xs font-medium hover:bg-black/70 transition-colors disabled:opacity-50 flex-shrink-0"
            >
              {isExecuting ? (
                <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : null}
              Send
            </button>
          )}
        </div>
        {errorMsg && <p className="px-4 pb-2 text-xs text-red-500">{errorMsg}</p>}
      </div>
    );
  }

  // Document action card
  if (action === 'create_document') {
    const title = (actionData.title || '') as string;
    const content = (actionData.content || '') as string;
    const docId = resultData?.document_id as string | undefined;
    const wsId = (resultData?.workspace_id || actionData.workspace_id) as string | undefined;

    return (
      <div className="my-3 rounded-xl border border-border-light overflow-hidden">
        <div className="flex items-start gap-3 px-4 py-3 bg-[#F9F5FF]/40">
          <DocumentTextIcon className="w-5 h-5 mt-0.5 text-violet-500 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-text-body">{title || description}</p>
            {content && !isExecuted && (
              <div className="mt-2 max-h-[200px] overflow-y-auto rounded-lg bg-white/60 border border-border-light px-3 py-2">
                <div className="prose prose-sm prose-gray max-w-none text-xs text-text-secondary">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                    {content}
                  </ReactMarkdown>
                </div>
              </div>
            )}
            {isExecuted && docId && wsId && (
              <a
                href={`/workspace/${wsId}/files/${docId}`}
                className="inline-flex items-center gap-1 mt-1.5 text-xs text-violet-600 hover:text-violet-700 hover:underline transition-colors"
              >
                Open document
                <ArrowTopRightOnSquareIcon className="w-3 h-3" />
              </a>
            )}
          </div>
          {isExecuted ? (
            <span className="flex items-center gap-1 text-xs text-green-600 font-medium flex-shrink-0">
              <CheckCircleIcon className="w-4 h-4" />
              Created
            </span>
          ) : isError ? (
            <button
              onClick={handleConfirm}
              disabled={isExecuting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500 text-white text-xs font-medium hover:bg-red-600 transition-colors disabled:opacity-50 flex-shrink-0"
            >
              Retry
            </button>
          ) : (
            <button
              onClick={handleConfirm}
              disabled={isExecuting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-500 text-white text-xs font-medium hover:bg-violet-600 transition-colors disabled:opacity-50 flex-shrink-0"
            >
              {isExecuting ? (
                <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <PlusIcon className="w-3.5 h-3.5 stroke-2" />
              )}
              Create
            </button>
          )}
        </div>
        {errorMsg && <p className="px-4 pb-2 text-xs text-red-500">{errorMsg}</p>}
      </div>
    );
  }

  // Fallback for unknown action types
  return (
    <div className="my-3 flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-bg-gray/60 border border-border-light">
      {isExecuted ? (
        <CheckCircleIcon className="w-4 h-4 text-green-600 flex-shrink-0" />
      ) : (
        <ClockIcon className="w-4 h-4 text-blue-500 flex-shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm text-text-body">{description || action}</p>
      </div>
      {!isExecuted && (
        <button
          onClick={handleConfirm}
          disabled={isExecuting}
          className="text-xs text-blue-600 font-medium hover:underline flex-shrink-0 disabled:opacity-50"
        >
          {isExecuting ? 'Confirming...' : 'Confirm'}
        </button>
      )}
      {isExecuted && (
        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 flex-shrink-0">
          Done
        </span>
      )}
    </div>
  );
}

// Human-readable tool labels
const TOOL_LABELS: Record<string, string> = {
  semantic_search: 'Semantic search',
  search_messages: 'Searched messages',
  get_email_thread: 'Fetched email thread',
  get_calendar_events: 'Checked calendar',
  get_emails: 'Checked emails',
  create_calendar_event: 'Creating event',
  send_email: 'Drafting email',
  create_document: 'Creating document',
  update_document: 'Updating document',
  web_search: 'Searched the web',
};

function getSmartSearchTypesLabel(args?: Record<string, unknown>): string {
  const types = String(args?.types || 'emails,calendar,documents');
  const typeLabels: Record<string, string> = {
    emails: 'emails',
    calendar: 'calendar',
    documents: 'notes',
  };
  return types.split(',').map(t => typeLabels[t.trim()] || t.trim()).join(', ');
}

function getToolLabel(name: string, phase: string, args?: Record<string, unknown>): string {
  // Smart search: show what types are being searched
  if (name === 'smart_search') {
    const typesLabel = getSmartSearchTypesLabel(args);
    return phase === 'running' ? `Searching ${typesLabel}` : `Searched ${typesLabel}`;
  }

  if (phase === 'running') {
    // Use present tense for running
    const runningLabels: Record<string, string> = {
      semantic_search: 'Semantic search',
      search_messages: 'Searching messages',
      get_email_thread: 'Fetching email thread',
      get_calendar_events: 'Checking calendar',
      get_emails: 'Checking emails',
      web_search: 'Searching the web',
    };
    return runningLabels[name] || name.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase()) + '...';
  }
  return TOOL_LABELS[name] || name.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
}

function ToolCallPartRenderer({ part }: { part: ContentPart }) {
  const name = part.data.name as string;
  const phase = (part.data.phase || 'done') as string;
  const status = part.data.status as string | undefined;
  const durationMs = part.data.duration_ms as number | undefined;
  const args = part.data.args as Record<string, unknown> | undefined;

  // For smart_search, the types are already shown in the label — skip the raw query
  const query = name === 'smart_search' ? undefined : (args?.query || args?.search);

  return (
    <div className="flex items-center gap-2 py-1.5 my-0.5">
      {/* Status indicator */}
      {phase === 'running' ? (
        <span className="w-3.5 h-3.5 flex items-center justify-center shrink-0">
          <span className="w-2 h-2 rounded-full bg-text-body animate-pulse" />
        </span>
      ) : status === 'error' ? (
        <XMarkIcon className="w-3.5 h-3.5 text-red-500 shrink-0 stroke-2" />
      ) : (
        <CheckIcon className="w-3.5 h-3.5 text-text-tertiary shrink-0 stroke-2" />
      )}

      {/* Tool label */}
      <span className={`text-sm ${phase === 'running' ? 'text-text-body' : 'text-text-tertiary'}`}>
        {getToolLabel(name, phase, args)}
      </span>

      {/* Query inline */}
      {typeof query === 'string' && query && (
        <span className="text-sm text-text-tertiary truncate max-w-[200px]">
          &ldquo;{query.slice(0, 40)}&rdquo;
        </span>
      )}

      {/* Duration */}
      {phase === 'done' && durationMs != null && (
        <span className="text-xs text-text-tertiary shrink-0">
          {durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(1)}s`}
        </span>
      )}
    </div>
  );
}

function SourcesPartRenderer({ part }: { part: ContentPart }) {
  const sources = (part.data.sources || []) as Source[];
  if (!sources.length) return null;

  return (
    <div className="my-3 flex flex-wrap gap-2">
      {sources.map((source, i) => {
        const domain = source.domain || (() => { try { return new URL(source.url).hostname; } catch { return ''; } })();
        const favicon = source.favicon || `https://www.google.com/s2/favicons?domain=${domain}&sz=16`;
        return (
          <a
            key={i}
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-bg-gray/60 border border-border-light text-xs text-text-secondary hover:bg-bg-gray hover:text-text-body transition-colors"
          >
            <img src={favicon} alt="" className="w-3.5 h-3.5 rounded-sm" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            <span className="max-w-[120px] truncate">{source.title || domain}</span>
          </a>
        );
      })}
    </div>
  );
}

function SourceRefRenderer({ part, sources }: { part: ContentPart; sources: Source[] }) {
  const sourceIndex = (part.data.source_index as number) || 0;
  const source = sources[sourceIndex - 1]; // 1-based index

  if (!source) {
    return <sup className="text-xs text-text-tertiary">[{sourceIndex}]</sup>;
  }

  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-bg-gray text-[10px] font-medium text-text-secondary hover:bg-bg-gray-dark transition-colors align-super ml-0.5"
      title={source.title || source.url}
    >
      {sourceIndex}
    </a>
  );
}

function AttachmentPartRenderer({ part }: { part: ContentPart }) {
  const attachmentId = part.data.attachment_id as string;
  const width = part.data.width as number | undefined;
  const height = part.data.height as number | undefined;

  if (!attachmentId) return null;

  return (
    <div className="my-2">
      <ChatAttachmentImage attachmentId={attachmentId} width={width} height={height} />
    </div>
  );
}

function ReasoningPartRenderer({ part }: { part: ContentPart }) {
  const [isOpen, setIsOpen] = useState(false);
  const content = (part.data.content || '') as string;

  if (!content) return null;

  return (
    <div className="my-3 border border-border-light rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-text-tertiary hover:bg-bg-gray/50 transition-colors"
      >
        {isOpen ? <ChevronDownIcon className="w-3 h-3" /> : <ChevronRightIcon className="w-3 h-3" />}
        <span>Reasoning</span>
      </button>
      {isOpen && (
        <div className="px-3 pb-3 text-sm text-text-secondary">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {content}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}

function ToolResultPartRenderer({ part }: { part: ContentPart }) {
  // tool_result parts are similar to display parts
  return <DisplayPartRenderer part={{ ...part, type: 'display' }} />;
}

// ============================================================================
// Main Renderer
// ============================================================================

interface ContentPartsRendererProps {
  parts: ContentPart[];
  messageId?: string;
}

function ContentPartsRenderer({ parts, messageId }: ContentPartsRendererProps) {
  // Collect all sources for source_ref linking
  const allSources: Source[] = [];
  for (const part of parts) {
    if (part.type === 'sources' && Array.isArray(part.data.sources)) {
      allSources.push(...(part.data.sources as Source[]));
    }
  }

  return (
    <>
      {parts.map((part) => {
        switch (part.type) {
          case 'text':
            return <TextPartRenderer key={part.id} content={(part.data.content as string) || ''} />;
          case 'display':
            return <DisplayPartRenderer key={part.id} part={part} />;
          case 'tool_result':
            return <ToolResultPartRenderer key={part.id} part={part} />;
          case 'action':
            return <ActionPartRenderer key={part.id} part={part} messageId={messageId} />;
          case 'tool_call':
            return <ToolCallPartRenderer key={part.id} part={part} />;
          case 'sources':
            return <SourcesPartRenderer key={part.id} part={part} />;
          case 'source_ref':
            return <SourceRefRenderer key={part.id} part={part} sources={allSources} />;
          case 'attachment':
            return <AttachmentPartRenderer key={part.id} part={part} />;
          case 'reasoning':
            return <ReasoningPartRenderer key={part.id} part={part} />;
          default:
            return null;
        }
      })}
    </>
  );
}

export default memo(ContentPartsRenderer);

// Export shared markdown components for reuse
export { markdownComponents, CodeBlock };
