import { useState, useEffect } from 'react';
import { XMarkIcon, SparklesIcon } from '@heroicons/react/24/outline';
import { planWithAI, getWorkspaceOpenClawAgents, type OpenClawAgent } from '../../../api/client';
import { toast } from 'sonner';
import { useWorkspaceStore } from '../../../stores/workspaceStore';

interface Props {
  boardId: string;
  onClose: () => void;
  onCreated: () => void;
}

export default function PlanWithAIModal({ boardId, onClose, onCreated }: Props) {
  const [spec, setSpec] = useState('');
  const [agentId, setAgentId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<{ id: string; number: number; title: string }[] | null>(null);
  const [agents, setAgents] = useState<OpenClawAgent[]>([]);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const workspace = workspaces.find((w) => w.id === activeWorkspaceId);

  useEffect(() => {
    if (workspace?.id) {
      getWorkspaceOpenClawAgents(workspace.id).then((r) => setAgents(r.agents || [])).catch(() => {});
    }
  }, [workspace?.id]);

  const handlePlan = async () => {
    if (!spec.trim() || spec.trim().length < 10) {
      toast.error('El spec debe tener al menos 10 caracteres');
      return;
    }
    setLoading(true);
    try {
      const result = await planWithAI(boardId, spec, agentId || undefined);
      if (result.tasks.length === 0) {
        toast.error('La IA no genero tareas. Intenta con un spec mas detallado.');
        return;
      }
      setPreview(result.tasks);
      toast.success(`${result.count} tareas creadas`);
      onCreated();
    } catch {
      toast.error('Error al planificar con IA');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <SparklesIcon className="w-5 h-5 text-indigo-500" />
            <h2 className="text-[15px] font-semibold text-gray-900">Planificar con IA</h2>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {!preview ? (
            <>
              <div>
                <label className="block text-[12px] font-medium text-gray-600 mb-1.5">
                  Pega tu spec, requisitos o descripcion del proyecto
                </label>
                <textarea
                  value={spec}
                  onChange={(e) => setSpec(e.target.value)}
                  placeholder="# Spec del proyecto&#10;&#10;Describe las funcionalidades, modelos, flujos..."
                  rows={14}
                  className="w-full px-3 py-2.5 text-[13px] border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 resize-none font-mono"
                  autoFocus
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  La IA (GPT-5.4) descompondra esto en tareas ordenadas por dependencia.
                </p>
              </div>
              <div>
                <label className="block text-[12px] font-medium text-gray-600 mb-1.5">
                  Asignar agente a las tareas <span className="text-gray-400 font-normal">(opcional)</span>
                </label>
                <select
                  value={agentId}
                  onChange={(e) => setAgentId(e.target.value)}
                  className="w-full px-3 py-2 text-[13px] border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200"
                >
                  <option value="">Sin agente (manual)</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <p className="text-[13px] font-medium text-gray-700">
                {preview.length} tareas creadas en el tablero:
              </p>
              <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
                {preview.map((task, i) => (
                  <div key={task.id} className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg">
                    <span className="text-[11px] text-gray-400 font-mono w-6 text-right">{i + 1}.</span>
                    <span className="text-[12px] text-gray-400 font-mono">#{task.number}</span>
                    <span className="text-[13px] text-gray-800">{task.title}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
          {preview ? (
            <button onClick={onClose} className="px-4 py-2 text-[13px] font-medium text-white bg-gray-900 rounded-xl hover:bg-gray-800">
              Cerrar
            </button>
          ) : (
            <>
              <button onClick={onClose} className="px-4 py-2 text-[13px] font-medium text-gray-600 hover:text-gray-900">
                Cancelar
              </button>
              <button
                onClick={handlePlan}
                disabled={loading || spec.trim().length < 10}
                className="px-4 py-2 text-[13px] font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 disabled:opacity-40 flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    Planificando...
                  </>
                ) : (
                  <>
                    <SparklesIcon className="w-4 h-4" />
                    Planificar
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
