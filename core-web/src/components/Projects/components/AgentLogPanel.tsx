import { useState, useEffect, useRef, useCallback } from 'react';
import { getAgentLog } from '../../../api/client';

interface AgentLogPanelProps {
  jobId: string;
}

export default function AgentLogPanel({ jobId }: AgentLogPanelProps) {
  const [logs, setLogs] = useState<string[]>([]);
  const [status, setStatus] = useState<string>('connecting');
  const scrollRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Fallback to polling if SSE fails
  const startPolling = useCallback((jid: string) => {
    let active = true;
    const fetchLogs = async () => {
      try {
        const data = await getAgentLog(jid, 200);
        if (!active) return;
        setLogs(data.lines || []);
        setStatus(data.status);
      } catch { /* ignore */ }
    };
    fetchLogs();
    const interval = setInterval(fetchLogs, 3000);
    return () => { active = false; clearInterval(interval); };
  }, []);

  useEffect(() => {
    if (!jobId) return;

    // Get JWT from localStorage for SSE auth
    const token = localStorage.getItem('supabase_access_token') || '';
    const baseUrl = import.meta.env.VITE_API_URL || '';
    const sseUrl = `${baseUrl}/projects/agent-log/${jobId}/stream?token=${encodeURIComponent(token)}`;

    let cleanupPolling: (() => void) | null = null;

    try {
      const es = new EventSource(sseUrl);
      eventSourceRef.current = es;

      es.onopen = () => {
        setStatus('active');
      };

      es.onmessage = (event) => {
        const line = event.data;
        if (line === '[DONE]' || line === '[TIMEOUT]') {
          setStatus('done');
          es.close();
          return;
        }
        setLogs((prev) => [...prev, line]);
      };

      es.onerror = () => {
        // SSE failed — fall back to polling
        es.close();
        eventSourceRef.current = null;
        cleanupPolling = startPolling(jobId);
      };
    } catch {
      // EventSource not supported or URL issue — fall back to polling
      cleanupPolling = startPolling(jobId);
    }

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (cleanupPolling) cleanupPolling();
    };
  }, [jobId, startPolling]);

  // Auto-scroll to bottom when logs update
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const isActive = status === 'active' || status === 'connecting';

  return (
    <div className="rounded-lg overflow-hidden border border-gray-800">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-900 border-b border-gray-800">
        <span className="text-[12px] font-medium text-gray-300">
          Pulse Agent — Log en vivo
        </span>
        {isActive && (
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
          </span>
        )}
        {!isActive && status !== 'no_log' && (
          <span className="text-[10px] text-gray-500 ml-auto">Finalizado</span>
        )}
      </div>

      {/* Log content */}
      <div
        ref={scrollRef}
        className="bg-gray-950 p-3 font-mono text-[11px] leading-relaxed text-green-400 max-h-80 overflow-y-auto"
      >
        {logs.length === 0 ? (
          <div className="text-gray-600">
            {status === 'no_log'
              ? 'Sin logs disponibles para este job.'
              : status === 'connecting'
                ? 'Conectando al stream del agente...'
                : 'Esperando actividad del agente...'}
          </div>
        ) : (
          logs.map((line, i) => (
            <div key={i} className={`whitespace-pre-wrap break-all ${
              line.startsWith('[tool]') ? 'text-cyan-400' :
              line.startsWith('[error]') ? 'text-red-400' :
              line.startsWith('[git]') ? 'text-yellow-400' :
              line.startsWith('[fin]') ? 'text-emerald-300 font-semibold' :
              line.startsWith('[inicio]') ? 'text-violet-400' :
              ''
            }`}>
              {line}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
