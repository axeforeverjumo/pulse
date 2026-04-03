import { useState, useEffect, useRef } from 'react';
import { getAgentLog } from '../../../api/client';

interface AgentLogPanelProps {
  jobId: string;
}

export default function AgentLogPanel({ jobId }: AgentLogPanelProps) {
  const [logs, setLogs] = useState<string[]>([]);
  const [status, setStatus] = useState<string>('active');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!jobId) return;

    let active = true;

    const fetchLogs = async () => {
      try {
        const data = await getAgentLog(jobId, 60);
        if (!active) return;
        setLogs(data.lines || []);
        setStatus(data.status);
      } catch {
        // silently ignore fetch errors
      }
    };

    fetchLogs();
    const interval = setInterval(fetchLogs, 3000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [jobId]);

  // Auto-scroll to bottom when logs update
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const isActive = status === 'active';

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
        className="bg-gray-950 p-3 font-mono text-[11px] leading-relaxed text-green-400 max-h-60 overflow-y-auto"
      >
        {logs.length === 0 ? (
          <div className="text-gray-600">
            {status === 'no_log'
              ? 'Sin logs disponibles para este job.'
              : 'Esperando actividad del agente...'}
          </div>
        ) : (
          logs.map((line, i) => (
            <div key={i} className="whitespace-pre-wrap break-all">
              {line}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
