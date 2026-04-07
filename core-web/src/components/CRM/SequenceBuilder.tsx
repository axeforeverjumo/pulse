import { useState, useEffect, useCallback } from 'react';
import {
  PlusIcon,
  TrashIcon,
  ClockIcon,
  SparklesIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  PlayIcon,
  PauseIcon,
} from '@heroicons/react/24/outline';
import { getCrmSequences, createCrmSequence, updateCrmSequence, deleteCrmSequence, getCrmSequence } from '../../api/client';
import { toast } from 'sonner';

interface SequenceBuilderProps {
  workspaceId: string;
}

interface Step {
  step_type: 'email' | 'wait';
  subject_template: string;
  body_template: string;
  delay_days: number;
  ai_personalize: boolean;
}

const EMPTY_STEP: Step = {
  step_type: 'email',
  subject_template: '',
  body_template: '',
  delay_days: 1,
  ai_personalize: false,
};

export default function SequenceBuilder({ workspaceId }: SequenceBuilderProps) {
  const [sequences, setSequences] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Editor state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState<Step[]>([]);
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchSequences = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const data = await getCrmSequences(workspaceId);
      setSequences(data.sequences || []);
    } catch {}
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => { fetchSequences(); }, [fetchSequences]);

  const handleSelect = async (id: string) => {
    try {
      const data = await getCrmSequence(id);
      const seq = data.sequence;
      setSelectedId(id);
      setName(seq.name);
      setDescription(seq.description || '');
      setIsActive(seq.is_active);
      setSteps((seq.steps || []).map((s: any) => ({
        step_type: s.step_type || 'email',
        subject_template: s.subject_template || '',
        body_template: s.body_template || '',
        delay_days: s.delay_days || 1,
        ai_personalize: s.ai_personalize || false,
      })));
    } catch { toast.error('Error al cargar secuencia'); }
  };

  const handleNew = () => {
    setSelectedId(null);
    setName('');
    setDescription('');
    setSteps([{ ...EMPTY_STEP }]);
    setIsActive(true);
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Nombre requerido'); return; }
    setSaving(true);
    try {
      const data = { workspace_id: workspaceId, name, description, is_active: isActive, steps };
      if (selectedId) {
        await updateCrmSequence(selectedId, data);
        toast.success('Secuencia actualizada');
      } else {
        const result = await createCrmSequence(data);
        setSelectedId(result.sequence.id);
        toast.success('Secuencia creada');
      }
      fetchSequences();
    } catch (err: any) {
      toast.error(err.message || 'Error al guardar');
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!selectedId) return;
    try {
      await deleteCrmSequence(selectedId);
      setSelectedId(null);
      setName('');
      setSteps([]);
      fetchSequences();
      toast.success('Secuencia eliminada');
    } catch { toast.error('Error al eliminar'); }
  };

  const addStep = () => setSteps([...steps, { ...EMPTY_STEP }]);
  const removeStep = (i: number) => setSteps(steps.filter((_, idx) => idx !== i));
  const updateStep = (i: number, partial: Partial<Step>) => {
    setSteps(steps.map((s, idx) => idx === i ? { ...s, ...partial } : s));
  };
  const moveStep = (i: number, dir: -1 | 1) => {
    const next = [...steps];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setSteps(next);
  };

  if (loading) {
    return <div className="p-6 text-sm text-slate-400">Cargando secuencias...</div>;
  }

  return (
    <div className="flex h-full">
      {/* Sidebar: sequence list */}
      <div className="w-56 shrink-0 border-r border-slate-200 flex flex-col">
        <div className="p-3 border-b border-slate-100">
          <button
            onClick={handleNew}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl bg-violet-600 text-white hover:bg-violet-700 transition-colors"
          >
            <PlusIcon className="w-3.5 h-3.5" />
            Nueva secuencia
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {sequences.map((seq) => (
            <button
              key={seq.id}
              onClick={() => handleSelect(seq.id)}
              className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${
                selectedId === seq.id ? 'bg-violet-50 text-violet-700 font-semibold' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-1.5">
                {seq.is_active ? (
                  <PlayIcon className="w-3 h-3 text-emerald-500" />
                ) : (
                  <PauseIcon className="w-3 h-3 text-slate-400" />
                )}
                <span className="truncate">{seq.name}</span>
              </div>
              <span className="text-[10px] text-slate-400">{seq.step_count || 0} pasos</span>
            </button>
          ))}
          {sequences.length === 0 && (
            <p className="text-[11px] text-slate-400 text-center py-4">Sin secuencias</p>
          )}
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre de la secuencia..."
            className="text-lg font-semibold text-slate-900 bg-transparent border-none focus:outline-none placeholder:text-slate-300 flex-1"
          />
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="rounded text-violet-600 focus:ring-violet-400"
              />
              Activa
            </label>
            {selectedId && (
              <button onClick={handleDelete} className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors">
                <TrashIcon className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-1.5 text-xs font-medium rounded-xl bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>

        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Descripcion (opcional)"
          className="w-full text-sm text-slate-600 bg-transparent border-none focus:outline-none placeholder:text-slate-300"
        />

        {/* Steps */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Pasos de la secuencia</h3>
          {steps.map((step, i) => (
            <div key={i} className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center text-[11px] font-bold">
                    {i + 1}
                  </span>
                  <select
                    value={step.step_type}
                    onChange={(e) => updateStep(i, { step_type: e.target.value as any })}
                    className="text-xs px-2 py-1 rounded-lg border border-slate-200 bg-white"
                  >
                    <option value="email">Email</option>
                    <option value="wait">Esperar</option>
                  </select>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => moveStep(i, -1)} disabled={i === 0} className="p-1 rounded hover:bg-slate-200 disabled:opacity-30">
                    <ChevronUpIcon className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => moveStep(i, 1)} disabled={i === steps.length - 1} className="p-1 rounded hover:bg-slate-200 disabled:opacity-30">
                    <ChevronDownIcon className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => removeStep(i)} className="p-1 rounded hover:bg-red-100 text-red-400 hover:text-red-600">
                    <TrashIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {step.step_type === 'email' ? (
                <>
                  <input
                    type="text"
                    value={step.subject_template}
                    onChange={(e) => updateStep(i, { subject_template: e.target.value })}
                    placeholder="Asunto del email... (usa {{nombre}} para personalizar)"
                    className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-violet-300"
                  />
                  <textarea
                    value={step.body_template}
                    onChange={(e) => updateStep(i, { body_template: e.target.value })}
                    placeholder="Cuerpo del email..."
                    rows={4}
                    className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-violet-300 resize-none"
                  />
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-1.5 text-xs text-slate-500">
                      <ClockIcon className="w-3.5 h-3.5" />
                      Enviar despues de
                      <input
                        type="number"
                        value={step.delay_days}
                        onChange={(e) => updateStep(i, { delay_days: Number(e.target.value) })}
                        min={0}
                        className="w-12 px-1.5 py-0.5 text-xs rounded border border-slate-200 text-center"
                      />
                      dias
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={step.ai_personalize}
                        onChange={(e) => updateStep(i, { ai_personalize: e.target.checked })}
                        className="rounded text-violet-600 focus:ring-violet-400"
                      />
                      <SparklesIcon className="w-3.5 h-3.5 text-violet-500" />
                      IA personalizar
                    </label>
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-2 py-2">
                  <ClockIcon className="w-4 h-4 text-slate-400" />
                  <span className="text-xs text-slate-500">Esperar</span>
                  <input
                    type="number"
                    value={step.delay_days}
                    onChange={(e) => updateStep(i, { delay_days: Number(e.target.value) })}
                    min={1}
                    className="w-16 px-2 py-1 text-xs rounded border border-slate-200 text-center"
                  />
                  <span className="text-xs text-slate-500">dias antes del siguiente paso</span>
                </div>
              )}
            </div>
          ))}

          <button
            onClick={addStep}
            className="w-full flex items-center justify-center gap-1.5 py-3 text-xs font-medium text-violet-600 border-2 border-dashed border-violet-200 rounded-xl hover:bg-violet-50 transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            Agregar paso
          </button>
        </div>
      </div>
    </div>
  );
}
