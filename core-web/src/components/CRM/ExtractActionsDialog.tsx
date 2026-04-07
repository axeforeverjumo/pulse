import { useState } from 'react';
import {
  SparklesIcon,
  XMarkIcon,
  CheckIcon,
  UserPlusIcon,
  ArrowPathIcon,
  CalendarIcon,
  ListBulletIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';
import { extractCrmActions, applyCrmExtraction } from '../../api/client';
import { toast } from 'sonner';

interface ExtractActionsDialogProps {
  opportunityId: string;
  opportunityName: string;
  workspaceId: string;
  onClose: () => void;
  onApplied: () => void;
}

interface ActionItem {
  title: string;
  due_date: string | null;
  assignee_hint: string | null;
  priority: number;
  selected: boolean;
}

interface NewContact {
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  selected: boolean;
}

type Step = 'input' | 'analyzing' | 'review' | 'applying' | 'done';

const SOURCE_TYPES = [
  { id: 'transcription', label: 'Transcripcion de llamada/reunion' },
  { id: 'note', label: 'Nota / Resumen' },
  { id: 'email', label: 'Email copiado' },
  { id: 'paste', label: 'Otro texto' },
];

export default function ExtractActionsDialog({
  opportunityId,
  opportunityName,
  workspaceId,
  onClose,
  onApplied,
}: ExtractActionsDialogProps) {
  const [step, setStep] = useState<Step>('input');
  const [text, setText] = useState('');
  const [sourceType, setSourceType] = useState('transcription');
  const [extractionId, setExtractionId] = useState<string | null>(null);

  // Extraction results
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const [stageSuggestion, setStageSuggestion] = useState<{ new_stage: string | null; reason: string } | null>(null);
  const [newContacts, setNewContacts] = useState<NewContact[]>([]);
  const [followUpDate, setFollowUpDate] = useState<string | null>(null);
  const [summary, setSummary] = useState('');
  const [applyStage, setApplyStage] = useState(false);
  const [applyFollowup, setApplyFollowup] = useState(false);

  // Apply results
  const [applyResults, setApplyResults] = useState<any>(null);

  const handleAnalyze = async () => {
    if (text.trim().length < 10) {
      toast.error('El texto debe tener al menos 10 caracteres');
      return;
    }
    setStep('analyzing');
    try {
      const result = await extractCrmActions(opportunityId, {
        workspace_id: workspaceId,
        text,
        source_type: sourceType,
      });

      const ext = result.extraction || {};
      setExtractionId(result.extraction_id || null);
      setActionItems(
        (ext.action_items || []).map((item: any) => ({ ...item, selected: true }))
      );
      setStageSuggestion(ext.stage_suggestion || null);
      setNewContacts(
        (ext.new_contacts || []).map((c: any) => ({ ...c, selected: true }))
      );
      setFollowUpDate(ext.follow_up_date || null);
      setSummary(ext.summary || '');
      setApplyStage(!!ext.stage_suggestion?.new_stage);
      setApplyFollowup(!!ext.follow_up_date);
      setStep('review');
    } catch (err: any) {
      toast.error(err.message || 'Error al analizar el texto');
      setStep('input');
    }
  };

  const handleApply = async () => {
    setStep('applying');
    try {
      const result = await applyCrmExtraction(opportunityId, {
        workspace_id: workspaceId,
        extraction_id: extractionId || '',
        selected_tasks: actionItems.filter((t) => t.selected),
        apply_stage: applyStage,
        selected_contacts: newContacts.filter((c) => c.selected),
        apply_followup: applyFollowup,
      });
      setApplyResults(result);
      setStep('done');
      toast.success('Acciones aplicadas correctamente');
    } catch (err: any) {
      toast.error(err.message || 'Error al aplicar');
      setStep('review');
    }
  };

  const toggleTask = (idx: number) => {
    setActionItems((prev) => prev.map((t, i) => i === idx ? { ...t, selected: !t.selected } : t));
  };

  const toggleContact = (idx: number) => {
    setNewContacts((prev) => prev.map((c, i) => i === idx ? { ...c, selected: !c.selected } : c));
  };

  const STAGE_LABELS: Record<string, string> = {
    lead: 'Lead', qualified: 'Calificado', proposal: 'Propuesta',
    negotiation: 'Negociacion', won: 'Ganado', lost: 'Perdido',
  };

  const PRIORITY_LABELS: Record<number, { label: string; color: string }> = {
    1: { label: 'Urgente', color: 'text-red-600 bg-red-50' },
    2: { label: 'Alta', color: 'text-orange-600 bg-orange-50' },
    3: { label: 'Media', color: 'text-blue-600 bg-blue-50' },
    4: { label: 'Baja', color: 'text-slate-500 bg-slate-50' },
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <SparklesIcon className="w-5 h-5 text-violet-500" />
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Analizar con IA</h2>
              <p className="text-[11px] text-slate-400">{opportunityName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
            <XMarkIcon className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* Step: Input */}
          {step === 'input' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-500">
                Pega una transcripcion de llamada, notas de reunion, o email. La IA extraera tareas, contactos, y sugerencias automaticamente.
              </p>

              <div className="flex gap-1.5 flex-wrap">
                {SOURCE_TYPES.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSourceType(s.id)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors ${
                      sourceType === s.id
                        ? 'border-violet-300 bg-violet-50 text-violet-700'
                        : 'border-slate-200 text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Pega aqui el texto de la llamada, reunion, o email..."
                className="w-full h-60 text-sm p-3 rounded-xl border border-slate-200 bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400 resize-none placeholder:text-slate-300"
              />

              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-400">{text.length.toLocaleString()} caracteres</span>
                <button
                  onClick={handleAnalyze}
                  disabled={text.trim().length < 10}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <SparklesIcon className="w-4 h-4" />
                  Analizar con IA
                </button>
              </div>
            </div>
          )}

          {/* Step: Analyzing */}
          {step === 'analyzing' && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="w-10 h-10 border-3 border-violet-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-slate-600 font-medium">Analizando texto con IA...</p>
              <p className="text-xs text-slate-400">Extrayendo tareas, contactos y sugerencias</p>
            </div>
          )}

          {/* Step: Review */}
          {step === 'review' && (
            <div className="space-y-5">
              {/* Summary */}
              {summary && (
                <div className="p-3 bg-violet-50 rounded-xl border border-violet-200">
                  <p className="text-xs font-semibold text-violet-700 mb-1">Resumen</p>
                  <p className="text-xs text-violet-900 leading-relaxed">{summary}</p>
                </div>
              )}

              {/* Action Items */}
              {actionItems.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <ListBulletIcon className="w-4 h-4 text-blue-500" />
                    <h3 className="text-xs font-semibold text-slate-800">
                      Tareas ({actionItems.filter((t) => t.selected).length}/{actionItems.length})
                    </h3>
                  </div>
                  <div className="space-y-1.5">
                    {actionItems.map((task, idx) => (
                      <button
                        key={idx}
                        onClick={() => toggleTask(idx)}
                        className={`w-full flex items-start gap-2.5 p-2.5 rounded-xl border text-left transition-colors ${
                          task.selected
                            ? 'border-blue-200 bg-blue-50/50'
                            : 'border-slate-200 bg-slate-50/50 opacity-60'
                        }`}
                      >
                        <div className={`w-4 h-4 mt-0.5 rounded border flex items-center justify-center shrink-0 ${
                          task.selected ? 'bg-blue-500 border-blue-500' : 'border-slate-300'
                        }`}>
                          {task.selected && <CheckIcon className="w-3 h-3 text-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-slate-800">{task.title}</p>
                          <div className="flex items-center gap-2 mt-1">
                            {task.due_date && (
                              <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                                <CalendarIcon className="w-3 h-3" />{task.due_date}
                              </span>
                            )}
                            {task.assignee_hint && (
                              <span className="text-[10px] text-slate-400">{task.assignee_hint}</span>
                            )}
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${PRIORITY_LABELS[task.priority]?.color || ''}`}>
                              {PRIORITY_LABELS[task.priority]?.label || ''}
                            </span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Stage suggestion */}
              {stageSuggestion?.new_stage && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <ArrowPathIcon className="w-4 h-4 text-amber-500" />
                    <h3 className="text-xs font-semibold text-slate-800">Cambio de etapa sugerido</h3>
                  </div>
                  <button
                    onClick={() => setApplyStage(!applyStage)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-colors ${
                      applyStage ? 'border-amber-200 bg-amber-50/50' : 'border-slate-200 opacity-60'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                      applyStage ? 'bg-amber-500 border-amber-500' : 'border-slate-300'
                    }`}>
                      {applyStage && <CheckIcon className="w-3 h-3 text-white" />}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-slate-500">Mover a</span>
                      <ChevronRightIcon className="w-3 h-3 text-slate-400" />
                      <span className="text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                        {STAGE_LABELS[stageSuggestion.new_stage] || stageSuggestion.new_stage}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 ml-auto">{stageSuggestion.reason}</p>
                  </button>
                </div>
              )}

              {/* New contacts */}
              {newContacts.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <UserPlusIcon className="w-4 h-4 text-emerald-500" />
                    <h3 className="text-xs font-semibold text-slate-800">
                      Contactos nuevos ({newContacts.filter((c) => c.selected).length}/{newContacts.length})
                    </h3>
                  </div>
                  <div className="space-y-1.5">
                    {newContacts.map((contact, idx) => (
                      <button
                        key={idx}
                        onClick={() => toggleContact(idx)}
                        className={`w-full flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition-colors ${
                          contact.selected ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200 opacity-60'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                          contact.selected ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'
                        }`}>
                          {contact.selected && <CheckIcon className="w-3 h-3 text-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-slate-800">{contact.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {contact.role && <span className="text-[10px] text-slate-400">{contact.role}</span>}
                            {contact.email && <span className="text-[10px] text-blue-400">{contact.email}</span>}
                            {contact.phone && <span className="text-[10px] text-slate-400">{contact.phone}</span>}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Follow-up date */}
              {followUpDate && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <CalendarIcon className="w-4 h-4 text-violet-500" />
                    <h3 className="text-xs font-semibold text-slate-800">Fecha de seguimiento</h3>
                  </div>
                  <button
                    onClick={() => setApplyFollowup(!applyFollowup)}
                    className={`flex items-center gap-2.5 p-2.5 rounded-xl border transition-colors ${
                      applyFollowup ? 'border-violet-200 bg-violet-50/50' : 'border-slate-200 opacity-60'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                      applyFollowup ? 'bg-violet-500 border-violet-500' : 'border-slate-300'
                    }`}>
                      {applyFollowup && <CheckIcon className="w-3 h-3 text-white" />}
                    </div>
                    <span className="text-xs font-medium text-slate-700">{followUpDate}</span>
                  </button>
                </div>
              )}

              {/* No results */}
              {actionItems.length === 0 && !stageSuggestion?.new_stage && newContacts.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-sm text-slate-400">No se encontraron acciones en el texto</p>
                </div>
              )}
            </div>
          )}

          {/* Step: Applying */}
          {step === 'applying' && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="w-10 h-10 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-slate-600 font-medium">Aplicando acciones...</p>
            </div>
          )}

          {/* Step: Done */}
          {step === 'done' && applyResults && (
            <div className="flex flex-col items-center py-12 gap-4">
              <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center">
                <CheckIcon className="w-6 h-6 text-emerald-600" />
              </div>
              <h3 className="text-sm font-semibold text-slate-900">Acciones aplicadas</h3>
              <div className="flex flex-wrap gap-3 justify-center">
                {applyResults.tasks_created > 0 && (
                  <span className="text-xs bg-blue-50 text-blue-700 px-3 py-1 rounded-full font-medium">
                    {applyResults.tasks_created} tareas creadas
                  </span>
                )}
                {applyResults.contacts_created > 0 && (
                  <span className="text-xs bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full font-medium">
                    {applyResults.contacts_created} contactos creados
                  </span>
                )}
                {applyResults.stage_updated && (
                  <span className="text-xs bg-amber-50 text-amber-700 px-3 py-1 rounded-full font-medium">
                    Etapa actualizada
                  </span>
                )}
                {applyResults.followup_set && (
                  <span className="text-xs bg-violet-50 text-violet-700 px-3 py-1 rounded-full font-medium">
                    Seguimiento programado
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-end gap-2">
          {step === 'review' && (
            <>
              <button
                onClick={() => setStep('input')}
                className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors"
              >
                Volver
              </button>
              <button
                onClick={handleApply}
                disabled={
                  actionItems.filter((t) => t.selected).length === 0 &&
                  !applyStage &&
                  newContacts.filter((c) => c.selected).length === 0 &&
                  !applyFollowup
                }
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                <CheckIcon className="w-3.5 h-3.5" />
                Aplicar seleccionados
              </button>
            </>
          )}
          {step === 'done' && (
            <button
              onClick={() => { onApplied(); onClose(); }}
              className="px-4 py-1.5 rounded-xl bg-slate-800 text-white text-xs font-medium hover:bg-slate-900 transition-colors"
            >
              Cerrar
            </button>
          )}
          {step === 'input' && (
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors"
            >
              Cancelar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
