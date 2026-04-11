import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Send, Loader2, ArrowLeft } from 'lucide-react';
import { api } from '../../api/client';
import ViewTopBar from '../ui/ViewTopBar';
import StreamingText from '../Chat/StreamingText';

interface Mentor {
  id: string;
  name: string;
  emoji: string;
  focus: string;
  gradient: string;
}

interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
}

const MENTOR_CHIPS: Record<string, string[]> = {
  estrategico: ['Analiza mi rentabilidad', 'Estructura de precios', 'Plan de crecimiento Q2'],
  growth: ['Analiza mi funnel', 'Ideas para reducir churn', 'Propuesta de experimentos'],
  cto: ['Revisa mi stack actual', 'Arquitectura para escalar', 'Prioridades tecnicas'],
  sales: ['Analiza mi pipeline', 'Deals que necesitan atencion', 'Estrategia de cierre'],
};

export default function MentorsView() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const [mentors, setMentors] = useState<Mentor[]>([]);
  const [activeMentor, setActiveMentor] = useState<Mentor | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<{ mentors: Mentor[] }>('/mentors/list').then((d) => setMentors(d.mentors)).catch(console.error);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, streamContent]);

  const sendMessage = useCallback(async (text?: string) => {
    const msg = (text || input).trim();
    if (!msg || !activeMentor || !workspaceId || streaming) return;
    setInput('');

    const userMsg: ChatMsg = { role: 'user', content: msg };
    setMessages((prev) => [...prev, userMsg]);
    setStreaming(true);
    setStreamContent('');

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || ''}/mentors/workspaces/${workspaceId}/${activeMentor.id}/consult`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await import('../../stores/authStore')).useAuthStore.getState().session?.access_token || ''}`,
        },
        body: JSON.stringify({
          message: msg,
          history: messages.slice(-10).map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!response.ok) throw new Error('Error en la consulta');

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;
              fullContent += data;
              setStreamContent(fullContent);
            }
          }
        }
      }

      setMessages((prev) => [...prev, { role: 'assistant', content: fullContent }]);
    } catch (e: any) {
      setMessages((prev) => [...prev, { role: 'assistant', content: `Error: ${e.message}` }]);
    } finally {
      setStreaming(false);
      setStreamContent('');
    }
  }, [input, activeMentor, workspaceId, streaming, messages]);

  // Mentor selection screen
  if (!activeMentor) {
    return (
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <ViewTopBar title="Mentores" pill={{ label: 'Board', color: 'violet' }} />
        <div className="flex-1 overflow-auto p-5">
          <div className="text-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-2xl mx-auto mb-3 shadow-lg">🧭</div>
            <h2 className="text-lg font-extrabold text-text-dark tracking-tight">Tu Board de Mentores</h2>
            <p className="text-sm text-text-tertiary mt-1">Asesores IA con acceso a tus datos reales de negocio</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl mx-auto">
            {mentors.map((m) => (
              <button
                key={m.id}
                onClick={() => { setActiveMentor(m); setMessages([]); }}
                className="text-left p-4 rounded-xl border border-border-light bg-bg-white hover:border-brand-primary/30 hover:shadow-md transition-all group"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${m.gradient} flex items-center justify-center text-xl shrink-0 relative shadow-sm`}>
                    {m.emoji}
                    <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-bg-white" />
                  </div>
                  <div>
                    <p className="text-[13px] font-bold text-text-dark group-hover:text-brand-primary transition-colors">{m.name}</p>
                    <span className="text-[10px] text-green-600 font-medium">Disponible</span>
                  </div>
                </div>
                <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-bg-gray text-text-tertiary">{m.focus}</span>
                <p className="text-[11px] text-text-secondary mt-2 leading-relaxed">
                  {m.id === 'estrategico' && 'Rentabilidad, precios, estrategia de crecimiento y estructura de negocio.'}
                  {m.id === 'growth' && 'Funnels, adquisicion, retencion, CAC/LTV y experimentos de crecimiento.'}
                  {m.id === 'cto' && 'Arquitectura, stack, infraestructura, prioridades tecnicas y escalabilidad.'}
                  {m.id === 'sales' && 'Pipeline, tecnicas de cierre, follow-ups y estrategia comercial.'}
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Chat with mentor
  const chips = MENTOR_CHIPS[activeMentor.id] || [];

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      {/* Header with back button */}
      <div className="h-[52px] flex items-center gap-3 border-b border-border-light px-4 shrink-0">
        <button onClick={() => setActiveMentor(null)} className="p-1.5 rounded-lg hover:bg-bg-gray text-text-tertiary hover:text-text-dark transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${activeMentor.gradient} flex items-center justify-center text-base shrink-0 relative`}>
          {activeMentor.emoji}
          <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-green-500 border-[1.5px] border-bg-white" />
        </div>
        <div>
          <h1 className="text-[14px] font-bold text-text-dark">{activeMentor.name}</h1>
          <p className="text-[10px] text-green-600 font-medium">Analizando datos de tu negocio</p>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !streaming && (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${activeMentor.gradient} flex items-center justify-center text-3xl shadow-lg`}>
              {activeMentor.emoji}
            </div>
            <div className="text-center">
              <p className="text-sm font-bold text-text-dark">{activeMentor.name}</p>
              <p className="text-xs text-text-tertiary mt-1">Tiene acceso a tus datos reales de CRM, proyectos y finanzas</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2 max-w-md">
              {chips.map((c) => (
                <button key={c} onClick={() => sendMessage(c)} className="px-3 py-1.5 rounded-full bg-bg-gray border border-border-gray text-[11px] text-text-secondary hover:bg-brand-primary/[.08] hover:border-brand-primary/20 hover:text-brand-primary transition-all">
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`mb-3 ${m.role === 'user' ? 'flex justify-end' : ''}`}>
            {m.role === 'user' ? (
              <div className="bg-text-dark text-white px-4 py-2 rounded-2xl rounded-br-md max-w-[80%] text-[13px]">{m.content}</div>
            ) : (
              <div className="max-w-[90%]">
                <StreamingText content={m.content} isStreaming={false} variant="compact" />
              </div>
            )}
          </div>
        ))}

        {streaming && streamContent && (
          <div className="mb-3 max-w-[90%]">
            <StreamingText content={streamContent} isStreaming={true} variant="compact" />
          </div>
        )}

        {streaming && !streamContent && (
          <div className="flex items-center gap-2 text-text-tertiary py-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-xs">{activeMentor.name} analizando datos...</span>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="px-4 pb-4 pt-2 border-t border-border-light">
        <div className="relative">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder={`Consulta al ${activeMentor.name}...`}
            disabled={streaming}
            className="w-full px-4 py-3 pr-12 text-[13px] rounded-xl border border-border-gray bg-bg-white text-text-dark focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary/40 transition-all placeholder:text-text-tertiary disabled:opacity-60"
          />
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || streaming}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg bg-text-dark text-white flex items-center justify-center hover:bg-brand-primary transition-colors disabled:opacity-30"
          >
            {streaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
