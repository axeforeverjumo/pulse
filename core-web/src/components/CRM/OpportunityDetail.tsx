import { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeftIcon,
  CurrencyDollarIcon,
  CalendarIcon,
  UserIcon,
  BuildingOfficeIcon,
  EnvelopeIcon,
  PhoneIcon,
  CheckCircleIcon,
  PlusIcon,
  PaperAirplaneIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  TagIcon,
  TrophyIcon,
  XCircleIcon,
  ClockIcon,
  DocumentTextIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckCircleSolid } from '@heroicons/react/24/solid';
import { toast } from 'sonner';
import {
  getCrmOpportunityFull,
  updateCrmOpportunity,
  updateOpportunityStage,
  postOpportunityMessage,
  createOpportunityTask,
  updateOpportunityTask,
  createCrmNote,
  refreshOpportunityContext,
} from '../../api/client';
import { SparklesIcon } from '@heroicons/react/24/outline';
import ScoreBadge from './ScoreBadge';
import ExtractActionsDialog from './ExtractActionsDialog';
import SalesCoachPanel from './SalesCoachPanel';
import SentimentBadge from './SentimentBadge';

const PIPELINE_STAGES = [
  { id: 'lead', label: 'Lead', color: '#EF4444' },
  { id: 'qualified', label: 'Calificado', color: '#3B82F6' },
  { id: 'proposal', label: 'Propuesta', color: '#F59E0B' },
  { id: 'negotiation', label: 'Negociacion', color: '#8B5CF6' },
  { id: 'won', label: 'Ganado', color: '#10B981' },
];

// Filter out 'lost' from pipeline bar; it's a separate action
const ACTIVE_STAGES = PIPELINE_STAGES.filter((s) => s.id !== 'lost');

interface OpportunityDetailProps {
  opportunityId: string;
  workspaceId: string;
  onBack: () => void;
}

export default function OpportunityDetail({ opportunityId, workspaceId, onBack }: OpportunityDetailProps) {
  const [opp, setOpp] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'notes' | 'info' | 'pulse'>('notes');
  const [pulseContext, setPulseContext] = useState<string | null>(null);
  const [pulseUpdatedAt, setPulseUpdatedAt] = useState<string | null>(null);
  const [refreshingPulse, setRefreshingPulse] = useState(false);

  // Inline editing states
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');

  // Chat
  const [chatMessage, setChatMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Tasks
  const [showCompletedTasks, setShowCompletedTasks] = useState(false);
  const [addingTask, setAddingTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDueDate, setNewTaskDueDate] = useState('');
  const [creatingTask, setCreatingTask] = useState(false);

  // Notes
  const [noteContent, setNoteContent] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  // AI Extraction dialog
  const [showExtractDialog, setShowExtractDialog] = useState(false);
  // Sales Coach panel
  const [showCoach, setShowCoach] = useState(false);

  // Email popup
  const [emailPopup, setEmailPopup] = useState<any | null>(null);

  const loadOpportunity = useCallback(async () => {
    try {
      const data = await getCrmOpportunityFull(opportunityId, workspaceId);
      setOpp(data.opportunity);
      setNameValue(data.opportunity?.name || data.opportunity?.title || '');
      if (data.opportunity?.pulse_context) {
        setPulseContext(data.opportunity.pulse_context);
        setPulseUpdatedAt(data.opportunity.pulse_context_updated_at || null);
      }
    } catch (err: any) {
      toast.error('Error al cargar oportunidad');
    } finally {
      setLoading(false);
    }
  }, [opportunityId, workspaceId]);

  useEffect(() => {
    loadOpportunity();
  }, [loadOpportunity]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [opp?.messages]);

  // Handlers
  const handleStageChange = async (newStage: string) => {
    if (!opp || opp.stage === newStage) return;
    try {
      await updateOpportunityStage(opportunityId, newStage, workspaceId);
      toast.success(`Etapa cambiada a ${PIPELINE_STAGES.find((s) => s.id === newStage)?.label || newStage}`);
      loadOpportunity();
    } catch (err: any) {
      toast.error(err.message || 'Error al cambiar etapa');
    }
  };

  const handleMarkWon = () => handleStageChange('won');
  const handleMarkLost = async () => {
    try {
      await updateOpportunityStage(opportunityId, 'lost', workspaceId);
      toast.success('Oportunidad marcada como perdida');
      loadOpportunity();
    } catch (err: any) {
      toast.error(err.message || 'Error');
    }
  };

  const handleNameSave = async () => {
    if (!nameValue.trim() || nameValue === (opp?.name || opp?.title)) {
      setEditingName(false);
      return;
    }
    try {
      await updateCrmOpportunity(opportunityId, { title: nameValue.trim() });
      setEditingName(false);
      loadOpportunity();
    } catch {
      toast.error('Error al actualizar nombre');
    }
  };

  const handleSendMessage = async () => {
    if (!chatMessage.trim()) return;
    setSendingMessage(true);
    try {
      await postOpportunityMessage(opportunityId, { workspace_id: workspaceId, content: chatMessage.trim() });
      setChatMessage('');
      loadOpportunity();
    } catch {
      toast.error('Error al enviar mensaje');
    } finally {
      setSendingMessage(false);
    }
  };

  const handleCreateTask = async () => {
    if (!newTaskTitle.trim()) return;
    setCreatingTask(true);
    try {
      await createOpportunityTask(opportunityId, {
        workspace_id: workspaceId,
        title: newTaskTitle.trim(),
        ...(newTaskDueDate ? { due_date: newTaskDueDate } : {}),
      });
      setNewTaskTitle('');
      setNewTaskDueDate('');
      setAddingTask(false);
      toast.success('Tarea creada');
      loadOpportunity();
    } catch {
      toast.error('Error al crear tarea');
    } finally {
      setCreatingTask(false);
    }
  };

  const handleToggleTask = async (task: any) => {
    const newStatus = task.status === 'done' ? 'pending' : 'done';
    try {
      await updateOpportunityTask(task.id, { status: newStatus });
      loadOpportunity();
    } catch {
      toast.error('Error al actualizar tarea');
    }
  };

  const handleRefreshPulse = async () => {
    setRefreshingPulse(true);
    try {
      const result = await refreshOpportunityContext(opportunityId, workspaceId);
      setPulseContext(result.pulse_context);
      setPulseUpdatedAt(result.pulse_context_updated_at);
      toast.success('Contexto Pulse actualizado');
    } catch {
      toast.error('Error al generar contexto');
    } finally {
      setRefreshingPulse(false);
    }
  };

  const handleSaveNote = async () => {
    if (!noteContent.trim()) return;
    setSavingNote(true);
    try {
      await createCrmNote({
        workspace_id: workspaceId,
        content: noteContent.trim(),
        entity_type: 'opportunity',
        entity_id: opportunityId,
      });
      setNoteContent('');
      toast.success('Nota guardada');
      loadOpportunity();
    } catch {
      toast.error('Error al guardar nota');
    } finally {
      setSavingNote(false);
    }
  };

  // Task color helpers
  const getTaskDueColor = (task: any) => {
    if (task.status === 'done') return 'text-slate-400';
    if (!task.due_date) return 'text-slate-500';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(task.due_date + 'T00:00:00');
    const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return 'text-red-500';
    if (diffDays <= 1) return 'text-amber-500';
    return 'text-emerald-500';
  };

  const getTaskDueBg = (task: any) => {
    if (task.status === 'done') return 'bg-slate-50';
    if (!task.due_date) return 'bg-white';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(task.due_date + 'T00:00:00');
    const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return 'bg-red-50/50';
    if (diffDays <= 1) return 'bg-amber-50/50';
    return 'bg-white';
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col h-full bg-white/92 md:rounded-[20px] overflow-hidden">
        <div className="h-14 flex items-center gap-3 px-5 border-b border-[#e4edf8]">
          <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
            <ArrowLeftIcon className="w-5 h-5" />
          </button>
          <div className="h-4 w-48 bg-slate-200 rounded animate-pulse" />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-pulse space-y-4 w-full max-w-2xl px-8">
            <div className="h-12 bg-slate-100 rounded-xl" />
            <div className="h-32 bg-slate-100 rounded-xl" />
            <div className="h-48 bg-slate-100 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!opp) {
    return (
      <div className="flex-1 flex flex-col h-full bg-white/92 md:rounded-[20px] overflow-hidden">
        <div className="h-14 flex items-center gap-3 px-5 border-b border-[#e4edf8]">
          <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
            <ArrowLeftIcon className="w-5 h-5" />
          </button>
          <span className="text-sm text-slate-500">Oportunidad no encontrada</span>
        </div>
      </div>
    );
  }

  const currentStageIdx = ACTIVE_STAGES.findIndex((s) => s.id === opp.stage);
  const isWon = opp.stage === 'won';
  const isLost = opp.stage === 'lost';
  const pendingTasks = (opp.tasks || []).filter((t: any) => t.status === 'pending');
  const completedTasks = (opp.tasks || []).filter((t: any) => t.status === 'done');
  const messages = opp.messages || [];
  const notes = opp.notes || [];

  return (
    <>
    <div className="flex-1 flex flex-col h-full bg-white/92 md:rounded-[20px] overflow-hidden">
      {/* ── Header ───────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-[#e4edf8]">
        {/* Top row: back + name + actions */}
        <div className="h-14 flex items-center justify-between px-4 sm:px-5 gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 shrink-0 transition-colors">
              <ArrowLeftIcon className="w-5 h-5" />
            </button>
            {editingName ? (
              <input
                autoFocus
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onBlur={handleNameSave}
                onKeyDown={(e) => { if (e.key === 'Enter') handleNameSave(); if (e.key === 'Escape') setEditingName(false); }}
                className="flex-1 text-base font-semibold text-slate-900 bg-transparent border-b-2 border-blue-400 focus:outline-none px-1 py-0.5"
              />
            ) : (
              <h1
                onClick={() => setEditingName(true)}
                className="text-base font-semibold text-slate-900 truncate cursor-pointer hover:text-blue-600 transition-colors"
                title="Clic para editar"
              >
                {opp.name || opp.title || 'Sin nombre'}
              </h1>
            )}
            {opp.lead_score > 0 && <ScoreBadge score={opp.lead_score} size="md" showLabel />}
            {opp.health_score != null && opp.health_score !== 50 && (
              <SentimentBadge healthScore={opp.health_score} sentiment={opp.sentiment_data?.overall_sentiment} size="md" />
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!isWon && !isLost && (
              <>
                <button
                  onClick={handleMarkWon}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                >
                  <TrophyIcon className="w-3.5 h-3.5" />
                  Ganado
                </button>
                <button
                  onClick={handleMarkLost}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                >
                  <XCircleIcon className="w-3.5 h-3.5" />
                  Perdido
                </button>
                <button
                  onClick={() => setShowExtractDialog(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-violet-50 text-violet-700 hover:bg-violet-100 transition-colors"
                >
                  <SparklesIcon className="w-3.5 h-3.5" />
                  Analizar con IA
                </button>
                <button
                  onClick={() => setShowCoach(!showCoach)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                    showCoach ? 'bg-violet-600 text-white' : 'bg-violet-50 text-violet-700 hover:bg-violet-100'
                  }`}
                >
                  <SparklesIcon className="w-3.5 h-3.5" />
                  Coach
                </button>
              </>
            )}
            {(isWon || isLost) && (
              <span className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg ${isWon ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                {isWon ? <TrophyIcon className="w-3.5 h-3.5" /> : <XCircleIcon className="w-3.5 h-3.5" />}
                {isWon ? 'Ganado' : 'Perdido'}
              </span>
            )}
          </div>
        </div>

        {/* Stage pipeline bar */}
        <div className="px-4 sm:px-5 pb-3">
          <div className="flex items-center gap-1">
            {ACTIVE_STAGES.map((stage, idx) => {
              const isCurrent = stage.id === opp.stage;
              const isPast = currentStageIdx >= 0 && idx < currentStageIdx;
              const isClickable = !isWon && !isLost;
              return (
                <button
                  key={stage.id}
                  onClick={() => isClickable && handleStageChange(stage.id)}
                  disabled={!isClickable}
                  className={`flex-1 relative py-2 text-[11px] font-medium rounded-lg transition-all duration-200 ${
                    isCurrent
                      ? 'text-white shadow-sm'
                      : isPast
                        ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        : 'bg-slate-50 text-slate-400 hover:bg-slate-100'
                  } ${isClickable ? 'cursor-pointer' : 'cursor-default'}`}
                  style={isCurrent ? { backgroundColor: stage.color } : undefined}
                >
                  {stage.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
        {/* Left: Info + Tabs */}
        <div className="flex-1 min-w-0 overflow-y-auto px-4 sm:px-6 py-5 space-y-5">
          {/* Info Cards Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Revenue */}
            <div className="rounded-xl border border-slate-200/60 bg-white p-3.5">
              <div className="flex items-center gap-2 mb-1.5">
                <CurrencyDollarIcon className="w-4 h-4 text-emerald-500" />
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Ingresos esperados</span>
              </div>
              <p className="text-lg font-bold text-slate-900">
                {opp.amount ? `${Number(opp.amount).toLocaleString('es-ES')} ${opp.currency_code || 'EUR'}` : '--'}
              </p>
            </div>
            {/* Probability */}
            <div className="rounded-xl border border-slate-200/60 bg-white p-3.5">
              <div className="flex items-center gap-2 mb-1.5">
                <CheckCircleIcon className="w-4 h-4 text-blue-500" />
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Probabilidad</span>
              </div>
              <p className="text-lg font-bold text-slate-900">
                {opp.probability != null ? `${opp.probability}%` : '--'}
              </p>
            </div>
            {/* Close Date */}
            <div className="rounded-xl border border-slate-200/60 bg-white p-3.5">
              <div className="flex items-center gap-2 mb-1.5">
                <CalendarIcon className="w-4 h-4 text-amber-500" />
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Cierre esperado</span>
              </div>
              <p className="text-lg font-bold text-slate-900">
                {opp.close_date || opp.expected_close_date
                  ? new Date(opp.close_date || opp.expected_close_date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
                  : '--'}
              </p>
            </div>
          </div>

          {/* Contact & Company Info */}
          <div className="rounded-xl border border-slate-200/60 bg-white p-4 space-y-3">
            <h3 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Contacto y empresa</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {opp.contact && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-sm">
                    <UserIcon className="w-4 h-4 text-slate-400" />
                    <span className="text-slate-700 font-medium">{opp.contact.name || 'Sin nombre'}</span>
                  </div>
                  {opp.contact.email && (
                    <div className="flex items-center gap-2 text-sm pl-6">
                      <EnvelopeIcon className="w-3.5 h-3.5 text-slate-400" />
                      <a href={`mailto:${opp.contact.email}`} className="text-blue-600 hover:underline text-xs">{opp.contact.email}</a>
                    </div>
                  )}
                  {opp.contact.phone && (
                    <div className="flex items-center gap-2 text-sm pl-6">
                      <PhoneIcon className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-slate-600 text-xs">{opp.contact.phone}</span>
                    </div>
                  )}
                </div>
              )}
              {opp.company && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-sm">
                    <BuildingOfficeIcon className="w-4 h-4 text-slate-400" />
                    <span className="text-slate-700 font-medium">{opp.company.name}</span>
                  </div>
                  {opp.company.domain && (
                    <div className="flex items-center gap-2 text-sm pl-6">
                      <span className="text-slate-500 text-xs">{opp.company.domain}</span>
                    </div>
                  )}
                </div>
              )}
              {!opp.contact && !opp.company && (
                <p className="text-xs text-slate-400 col-span-2">Sin contacto ni empresa vinculados</p>
              )}
            </div>
            {/* Owner / Tags */}
            <div className="flex items-center gap-4 pt-2 border-t border-slate-100">
              {opp.owner_id && (
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <UserIcon className="w-3.5 h-3.5" />
                  <span>Responsable: {opp.owner_id.slice(0, 8)}...</span>
                </div>
              )}
              {opp.tags && opp.tags.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <TagIcon className="w-3.5 h-3.5 text-slate-400" />
                  {opp.tags.map((tag: string) => (
                    <span key={tag} className="px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-slate-100 text-slate-600">{tag}</span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Tabs: Notes / Additional Info */}
          <div>
            <div className="flex gap-1 p-0.5 rounded-xl bg-slate-100/80 mb-4">
              <button
                onClick={() => setActiveTab('notes')}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeTab === 'notes' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <DocumentTextIcon className="w-3.5 h-3.5" />
                Notas
              </button>
              <button
                onClick={() => setActiveTab('info')}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeTab === 'info' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <InformationCircleIcon className="w-3.5 h-3.5" />
                Info
              </button>
              <button
                onClick={() => setActiveTab('pulse')}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeTab === 'pulse' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <SparklesIcon className="w-3.5 h-3.5" />
                Pulse
              </button>
            </div>

            {activeTab === 'notes' && (
              <div className="space-y-3">
                <textarea
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  placeholder="Escribe una nota interna..."
                  rows={3}
                  className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none placeholder:text-slate-400"
                />
                <div className="flex justify-end">
                  <button
                    onClick={handleSaveNote}
                    disabled={!noteContent.trim() || savingNote}
                    className="px-4 py-1.5 text-xs font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-40 transition-colors"
                  >
                    {savingNote ? 'Guardando...' : 'Guardar nota'}
                  </button>
                </div>
                {notes.length > 0 && (
                  <div className="space-y-2 pt-2">
                    {notes.map((note: any) => (
                      <div key={note.id} className="rounded-lg border border-slate-100 bg-slate-50/50 p-3">
                        <p className="text-sm text-slate-700 whitespace-pre-wrap">{note.content}</p>
                        <p className="text-[10px] text-slate-400 mt-2">
                          {new Date(note.created_at).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'info' && (
              <div className="rounded-xl border border-slate-200/60 bg-white p-4">
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  <div>
                    <dt className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Descripcion</dt>
                    <dd className="text-slate-700 mt-0.5">{opp.description || '--'}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Moneda</dt>
                    <dd className="text-slate-700 mt-0.5">{opp.currency_code || opp.currency || 'EUR'}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Creado</dt>
                    <dd className="text-slate-700 mt-0.5">
                      {opp.created_at ? new Date(opp.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '--'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Ultima actualizacion</dt>
                    <dd className="text-slate-700 mt-0.5">
                      {opp.updated_at ? new Date(opp.updated_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '--'}
                    </dd>
                  </div>
                  {opp.custom_fields && Object.keys(opp.custom_fields).length > 0 && (
                    <>
                      {Object.entries(opp.custom_fields).map(([key, val]) => (
                        <div key={key}>
                          <dt className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{key}</dt>
                          <dd className="text-slate-700 mt-0.5">{String(val)}</dd>
                        </div>
                      ))}
                    </>
                  )}
                </dl>
              </div>
            )}

            {activeTab === 'pulse' && (
              <div className="space-y-3">
                {/* Header + refresh button */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-slate-700">Contexto Pulse</p>
                    {pulseUpdatedAt && (
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        Actualizado: {new Date(pulseUpdatedAt).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={handleRefreshPulse}
                    disabled={refreshingPulse}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 transition-colors"
                  >
                    <SparklesIcon className={`w-3.5 h-3.5 ${refreshingPulse ? 'animate-spin' : ''}`} />
                    {refreshingPulse ? 'Generando...' : 'Actualizar'}
                  </button>
                </div>

                {pulseContext ? (
                  <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-4">
                    <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{pulseContext}</p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center">
                    <SparklesIcon className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm text-slate-500 font-medium">Sin contexto generado</p>
                    <p className="text-xs text-slate-400 mt-1">Pulsa "Actualizar" para que la IA analice esta oportunidad</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Tasks Section ────────────────────────────────── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Tareas ({pendingTasks.length} pendientes)
              </h3>
              <button
                onClick={() => setAddingTask(true)}
                className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
              >
                <PlusIcon className="w-3.5 h-3.5" />
                Agregar
              </button>
            </div>

            {/* Add task form */}
            {addingTask && (
              <div className="rounded-xl border border-blue-200 bg-blue-50/30 p-3 space-y-2">
                <input
                  autoFocus
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCreateTask(); if (e.key === 'Escape') setAddingTask(false); }}
                  placeholder="Titulo de la tarea..."
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={newTaskDueDate}
                    onChange={(e) => setNewTaskDueDate(e.target.value)}
                    className="px-2 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-blue-200"
                  />
                  <div className="flex-1" />
                  <button
                    onClick={() => setAddingTask(false)}
                    className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleCreateTask}
                    disabled={!newTaskTitle.trim() || creatingTask}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-40 transition-colors"
                  >
                    {creatingTask ? 'Creando...' : 'Crear'}
                  </button>
                </div>
              </div>
            )}

            {/* Pending tasks */}
            {pendingTasks.length > 0 ? (
              <div className="space-y-1">
                {pendingTasks.map((task: any) => (
                  <div
                    key={task.id}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border border-slate-100 ${getTaskDueBg(task)} transition-colors`}
                  >
                    <button onClick={() => handleToggleTask(task)} className="shrink-0 text-slate-300 hover:text-emerald-500 transition-colors">
                      <CheckCircleIcon className="w-5 h-5" />
                    </button>
                    <span className="flex-1 text-sm text-slate-700">{task.title}</span>
                    {task.due_date && (
                      <span className={`text-[11px] font-medium ${getTaskDueColor(task)} flex items-center gap-1`}>
                        <ClockIcon className="w-3.5 h-3.5" />
                        {new Date(task.due_date + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              !addingTask && (
                <p className="text-xs text-slate-400 text-center py-3">Sin tareas pendientes</p>
              )
            )}

            {/* Completed tasks (collapsed) */}
            {completedTasks.length > 0 && (
              <div>
                <button
                  onClick={() => setShowCompletedTasks(!showCompletedTasks)}
                  className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showCompletedTasks ? <ChevronUpIcon className="w-3.5 h-3.5" /> : <ChevronDownIcon className="w-3.5 h-3.5" />}
                  {completedTasks.length} completada{completedTasks.length !== 1 ? 's' : ''}
                </button>
                {showCompletedTasks && (
                  <div className="space-y-1 mt-2">
                    {completedTasks.map((task: any) => (
                      <div
                        key={task.id}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-50 border border-slate-100/50"
                      >
                        <button onClick={() => handleToggleTask(task)} className="shrink-0 text-emerald-500 hover:text-slate-400 transition-colors">
                          <CheckCircleSolid className="w-5 h-5" />
                        </button>
                        <span className="flex-1 text-sm text-slate-400 line-through">{task.title}</span>
                        {task.due_date && (
                          <span className="text-[11px] text-slate-400">
                            {new Date(task.due_date + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Correos vinculados ────────────────────────────── */}
          {opp.linked_emails && opp.linked_emails.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Correos ({opp.linked_emails.length})
              </h3>
              <div className="space-y-1">
                {opp.linked_emails.map((em: any) => (
                  <button
                    key={em.id}
                    onClick={() => setEmailPopup(em)}
                    className="w-full flex items-start gap-2 px-3 py-2.5 rounded-lg border border-slate-100 bg-white hover:border-blue-200 hover:bg-blue-50/20 transition-all text-left cursor-pointer"
                  >
                    <EnvelopeIcon className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-700 truncate">{em.email_subject || '(Sin asunto)'}</p>
                      <p className="text-[10px] text-slate-400 truncate">{em.email_from_name || em.email_from}</p>
                    </div>
                    {em.email_date && (
                      <span className="text-[10px] text-slate-400 shrink-0">
                        {new Date(em.email_date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Chats WhatsApp vinculados ──────────────────────── */}
          {opp.linked_chats && opp.linked_chats.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                WhatsApp ({opp.linked_chats.length})
              </h3>
              <div className="space-y-1">
                {opp.linked_chats.map((chat: any) => (
                  <a
                    key={chat.id}
                    href={`/${workspaceId}/messaging?chatId=${chat.chat_id}`}
                    className="w-full flex items-start gap-2 px-3 py-2.5 rounded-lg border border-slate-100 bg-white hover:border-emerald-200 hover:bg-emerald-50/20 transition-all text-left cursor-pointer"
                  >
                    <PhoneIcon className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-700 truncate">{chat.contact_name || 'Chat'}</p>
                      <p className="text-[10px] text-slate-400 truncate">{chat.contact_phone || chat.remote_jid}</p>
                    </div>
                    {chat.is_group && (
                      <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 uppercase">Grupo</span>
                    )}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Right: Chat / Messages ─────────────────────────── */}
        <div className="w-full lg:w-[360px] shrink-0 border-t lg:border-t-0 lg:border-l border-[#e4edf8] flex flex-col bg-white/60">
          <div className="h-11 flex items-center px-4 border-b border-[#e4edf8] shrink-0">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Mensajes</h3>
            <span className="ml-2 text-[11px] text-slate-400">{messages.length}</span>
          </div>

          {/* Messages list */}
          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 && (
              <p className="text-xs text-slate-400 text-center py-8">Sin mensajes aun. Inicia la conversacion.</p>
            )}
            {messages.map((msg: any) => (
              <div key={msg.id} className="group">
                <div className="bg-slate-50 rounded-xl px-3 py-2.5">
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{msg.description || msg.metadata?.content || ''}</p>
                </div>
                <p className="text-[10px] text-slate-400 mt-1 px-1">
                  {new Date(msg.occurred_at).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Message input */}
          <div className="shrink-0 px-3 pb-3 pt-2 border-t border-[#e4edf8]">
            <div className="flex items-end gap-2">
              <textarea
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder="Escribe un mensaje..."
                rows={1}
                className="flex-1 px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none placeholder:text-slate-400"
              />
              <button
                onClick={handleSendMessage}
                disabled={!chatMessage.trim() || sendingMessage}
                className="p-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-40 transition-colors shrink-0"
              >
                <PaperAirplaneIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    {emailPopup && createPortal(
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
        onClick={() => setEmailPopup(null)}
      >
        <div
          className="bg-white rounded-2xl shadow-2xl w-[560px] max-h-[80vh] flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-5 pt-5 pb-3 border-b border-slate-100 flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-semibold text-slate-900 line-clamp-2">{emailPopup.email_subject || '(Sin asunto)'}</h2>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-xs text-slate-500">{emailPopup.email_from_name || emailPopup.email_from}</span>
                {emailPopup.email_date && (
                  <span className="text-xs text-slate-400">
                    {new Date(emailPopup.email_date).toLocaleString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
            </div>
            <button onClick={() => setEmailPopup(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors shrink-0">
              <XCircleIcon className="w-5 h-5" />
            </button>
          </div>
          {/* Info */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">De</dt>
                <dd className="text-slate-700">{emailPopup.email_from_name ? `${emailPopup.email_from_name} <${emailPopup.email_from}>` : emailPopup.email_from}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Asunto</dt>
                <dd className="text-slate-700">{emailPopup.email_subject || '(Sin asunto)'}</dd>
              </div>
              {emailPopup.email_date && (
                <div>
                  <dt className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Fecha</dt>
                  <dd className="text-slate-700">{new Date(emailPopup.email_date).toLocaleString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</dd>
                </div>
              )}
              <div>
                <dt className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Thread ID</dt>
                <dd className="text-[11px] text-slate-400 font-mono">{emailPopup.email_thread_id}</dd>
              </div>
            </dl>
            <div className="mt-4 rounded-xl bg-amber-50 border border-amber-100 px-3 py-2.5">
              <p className="text-xs text-amber-700 flex items-center gap-1.5">
                <EnvelopeIcon className="w-3.5 h-3.5 shrink-0" />
                Para ver el contenido completo abre este correo en la bandeja de entrada
              </p>
            </div>
          </div>
          {/* Footer */}
          <div className="px-5 py-3 border-t border-slate-100 flex justify-end">
            <button onClick={() => setEmailPopup(null)} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700 transition-colors">Cerrar</button>
          </div>
        </div>
      </div>,
      document.body
    )}
    {showCoach && (
      <div className="fixed right-0 top-0 bottom-0 w-[360px] z-40 shadow-2xl">
        <SalesCoachPanel
          opportunityId={opportunityId}
          workspaceId={workspaceId}
          onClose={() => setShowCoach(false)}
        />
      </div>
    )}
    {showExtractDialog && (
      <ExtractActionsDialog
        opportunityId={opportunityId}
        opportunityName={opp?.name || opp?.title || 'Sin nombre'}
        workspaceId={workspaceId}
        onClose={() => setShowExtractDialog(false)}
        onApplied={() => loadOpportunity()}
      />
    )}
    </>
  );
}
