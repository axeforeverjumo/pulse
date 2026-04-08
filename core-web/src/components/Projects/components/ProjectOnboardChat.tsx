import { useState, useRef, useEffect, useCallback } from 'react';
import { PaperAirplaneIcon } from '@heroicons/react/24/solid';
import { SparklesIcon } from '@heroicons/react/24/outline';
import { api } from '../../../api/client';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ProjectConfig {
  ready: boolean;
  name: string;
  description?: string;
  is_development?: boolean;
  repository_url?: string;
  repository_full_name?: string;
  deploy_mode?: 'local' | 'external' | 'dedicated';
  server_ip?: string;
  server_user?: string;
  server_port?: number;
  project_url?: string;
  project_type?: string;
}

interface ProjectOnboardChatProps {
  workspaceAppId: string | null;
  onProjectReady: (config: ProjectConfig) => void;
  onCancel: () => void;
}

export default function ProjectOnboardChat({
  workspaceAppId,
  onProjectReady,
  onCancel,
}: ProjectOnboardChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [extractedConfig, setExtractedConfig] = useState<ProjectConfig | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Send initial greeting
  useEffect(() => {
    const greeting: ChatMessage = {
      role: 'assistant',
      content: 'Hola! Vamos a configurar tu nuevo proyecto. Cuentame, como se llama el proyecto y de que se trata?',
    };
    setMessages([greeting]);
  }, []);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input
  useEffect(() => {
    if (!isLoading) inputRef.current?.focus();
  }, [isLoading]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: ChatMessage = { role: 'user', content: text };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInput('');
    setIsLoading(true);

    try {
      const result = await api<{
        reply: string;
        project_config: ProjectConfig | null;
      }>('/projects/onboard-chat', {
        method: 'POST',
        body: JSON.stringify({
          message: text,
          history: messages.map((m) => ({ role: m.role, content: m.content })),
          workspace_app_id: workspaceAppId,
        }),
      });

      // Strip the JSON config block from the display text
      let displayReply = result.reply;
      displayReply = displayReply.replace(/```json:project_config\s*\n[\s\S]*?```/g, '').trim();
      displayReply = displayReply.replace(/```json\s*\n\{[\s\S]*?"ready"\s*:\s*true[\s\S]*?\}```/g, '').trim();

      const assistantMsg: ChatMessage = { role: 'assistant', content: displayReply };
      setMessages((prev) => [...prev, assistantMsg]);

      if (result.project_config?.ready) {
        setExtractedConfig(result.project_config);
      }
    } catch (err) {
      const errorMsg: ChatMessage = {
        role: 'assistant',
        content: 'Hubo un error procesando tu mensaje. Intenta de nuevo.',
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, messages, workspaceAppId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-[480px]">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] px-3 py-2 rounded-xl text-[13px] leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-gray-900 text-white rounded-br-sm'
                  : 'bg-gray-100 text-gray-800 rounded-bl-sm'
              }`}
            >
              {msg.role === 'assistant' && (
                <SparklesIcon className="inline w-3.5 h-3.5 mr-1 text-gray-400 -mt-0.5" />
              )}
              {msg.content.split('\n').map((line, j) => (
                <span key={j}>
                  {line}
                  {j < msg.content.split('\n').length - 1 && <br />}
                </span>
              ))}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 text-gray-400 px-3 py-2 rounded-xl rounded-bl-sm text-[13px]">
              <span className="inline-flex gap-1">
                <span className="animate-bounce" style={{ animationDelay: '0ms' }}>.</span>
                <span className="animate-bounce" style={{ animationDelay: '150ms' }}>.</span>
                <span className="animate-bounce" style={{ animationDelay: '300ms' }}>.</span>
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Config preview + confirm */}
      {extractedConfig && (
        <div className="mx-4 mb-2 p-3 bg-green-50 border border-green-200 rounded-xl">
          <p className="text-[12px] font-medium text-green-800 mb-2">
            Proyecto listo para crear:
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-green-700">
            <div><span className="font-medium">Nombre:</span> {extractedConfig.name}</div>
            {extractedConfig.description && (
              <div className="col-span-2"><span className="font-medium">Desc:</span> {extractedConfig.description}</div>
            )}
            {extractedConfig.is_development && (
              <>
                <div><span className="font-medium">Modo:</span> {extractedConfig.deploy_mode || 'local'}</div>
                <div><span className="font-medium">Tipo:</span> {extractedConfig.project_type || 'auto'}</div>
                {extractedConfig.repository_full_name && (
                  <div className="col-span-2"><span className="font-medium">Repo:</span> {extractedConfig.repository_full_name}</div>
                )}
                {extractedConfig.server_ip && (
                  <div><span className="font-medium">Server:</span> {extractedConfig.server_ip}</div>
                )}
              </>
            )}
          </div>
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => onProjectReady(extractedConfig)}
              className="flex-1 px-3 py-1.5 text-[12px] font-medium bg-green-700 text-white rounded-lg hover:bg-green-800 transition-colors"
            >
              Crear proyecto
            </button>
            <button
              onClick={() => setExtractedConfig(null)}
              className="px-3 py-1.5 text-[12px] font-medium text-green-700 hover:bg-green-100 rounded-lg transition-colors"
            >
              Ajustar
            </button>
          </div>
        </div>
      )}

      {/* Input area */}
      <div className="border-t border-gray-100 px-4 py-3">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe tu proyecto..."
            disabled={isLoading}
            className="flex-1 px-3 py-2 text-[13px] text-gray-900 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400 placeholder:text-gray-400 disabled:opacity-50"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || isLoading}
            className="p-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <PaperAirplaneIcon className="w-4 h-4" />
          </button>
        </div>
        <div className="flex justify-between mt-2">
          <p className="text-[10px] text-gray-400">
            Enter para enviar
          </p>
          <button
            onClick={onCancel}
            className="text-[11px] text-gray-400 hover:text-gray-600 transition-colors"
          >
            Usar formulario clasico
          </button>
        </div>
      </div>
    </div>
  );
}
