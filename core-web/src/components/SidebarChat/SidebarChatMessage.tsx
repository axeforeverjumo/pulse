import { useState, memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { DocumentDuplicateIcon, CheckIcon } from '@heroicons/react/24/outline';

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
}

function CodeBlock({
  language,
  children
}: {
  language: string | undefined;
  children: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group my-2 rounded-lg overflow-hidden bg-[#1e1e1e]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#2d2d2d] text-text-tertiary text-xs">
        <span className="font-mono">{language || 'text'}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 hover:text-text-light transition-colors"
        >
          {copied ? (
            <CheckIcon className="w-3 h-3 stroke-2" />
          ) : (
            <DocumentDuplicateIcon className="w-3 h-3" />
          )}
        </button>
      </div>
      {/* Code */}
      <SyntaxHighlighter
        language={language || 'text'}
        style={oneDark}
        customStyle={{
          margin: 0,
          padding: '12px',
          background: '#1e1e1e',
          fontSize: '12px',
          lineHeight: '1.4',
        }}
        codeTagProps={{
          style: {
            fontFamily: 'var(--font-mono)',
          }
        }}
      >
        {children}
      </SyntaxHighlighter>
    </div>
  );
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
        {/* Message content */}
        <div className="prose prose-sm prose-gray max-w-none text-text-body text-sm">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              code({ className, children, ...props }) {
                const match = /language-(\w+)/.exec(className || '');
                const codeString = String(children).replace(/\n$/, '');
                const isInline = !match && !codeString.includes('\n');

                if (isInline) {
                  return (
                    <code
                      className="bg-[#EAEAEA] px-1 py-0.5 rounded text-xs font-mono text-text-body"
                      {...props}
                    >
                      {children}
                    </code>
                  );
                }

                return (
                  <CodeBlock language={match?.[1]}>
                    {codeString}
                  </CodeBlock>
                );
              },
              p({ children }) {
                return <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>;
              },
              ul({ children }) {
                return <ul className="mb-2 last:mb-0 pl-4 list-disc space-y-1">{children}</ul>;
              },
              ol({ children }) {
                return <ol className="mb-2 last:mb-0 pl-4 list-decimal space-y-1">{children}</ol>;
              },
              li({ children }) {
                return <li className="leading-relaxed">{children}</li>;
              },
              h1({ children }) {
                return <h1 className="text-base font-semibold mb-2 mt-3 first:mt-0">{children}</h1>;
              },
              h2({ children }) {
                return <h2 className="text-sm font-semibold mb-2 mt-3 first:mt-0">{children}</h2>;
              },
              h3({ children }) {
                return <h3 className="text-sm font-semibold mb-1.5 mt-2 first:mt-0">{children}</h3>;
              },
              blockquote({ children }) {
                return (
                  <blockquote className="border-l-2 border-border-gray pl-3 my-2 text-text-secondary italic text-sm">
                    {children}
                  </blockquote>
                );
              },
              a({ href, children }) {
                return (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    {children}
                  </a>
                );
              },
              table({ children }) {
                return (
                  <div className="overflow-x-auto my-2">
                    <table className="min-w-full border-collapse border border-border-gray text-xs">
                      {children}
                    </table>
                  </div>
                );
              },
              th({ children }) {
                return (
                  <th className="border border-border-gray bg-bg-gray px-2 py-1 text-left font-semibold">
                    {children}
                  </th>
                );
              },
              td({ children }) {
                return (
                  <td className="border border-border-gray px-2 py-1">
                    {children}
                  </td>
                );
              },
              hr() {
                return <hr className="my-3 border-border-light" />;
              },
            }}
          >
            {content}
          </ReactMarkdown>
        </div>

        {/* Copy button - only show on hover when not streaming */}
        {!isStreaming && (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity mt-1">
            <button
              onClick={handleCopyMessage}
              className="p-1 text-text-tertiary hover:text-text-body hover:bg-bg-gray rounded transition-colors"
              title="Copy"
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

function SidebarChatMessage({ role, content, isStreaming }: ChatMessageProps) {
  if (role === 'user') {
    return <UserMessage content={content} />;
  }
  return <AssistantMessage content={content} isStreaming={isStreaming} />;
}

export default memo(SidebarChatMessage);
