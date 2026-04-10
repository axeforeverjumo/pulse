import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  SparklesIcon,
  ArrowPathIcon,
  Cog6ToothIcon,
  PlusIcon,
  XMarkIcon,
  ClockIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
import { LocalFilesView } from '../Files/FilesView';
import { useLiveNotesStore } from '../../stores/liveNotesStore';
import { toast } from 'sonner';

const frequencyLabels: Record<string, string> = {
  hourly: 'Cada hora',
  daily: 'Diario',
  weekly: 'Semanal',
};

const typeLabels: Record<string, string> = {
  competitor: 'Competidor',
  person: 'Persona',
  project: 'Proyecto',
  topic: 'Tema',
  custom: 'Custom',
};

const typeBadge: Record<string, string> = {
  competitor: 'bg-red-50 text-red-600 border-red-200',
  person: 'bg-blue-50 text-blue-600 border-blue-200',
  project: 'bg-green-50 text-green-600 border-green-200',
  topic: 'bg-amber-50 text-amber-600 border-amber-200',
  custom: 'bg-slate-50 text-slate-600 border-slate-200',
};

export default function LiveNotesView() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const { notes, fetchNotes, createNote, refreshNote } = useLiveNotesStore();
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedMonitor, setSelectedMonitor] = useState<any>(null);

  // Create form
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newType, setNewType] = useState('custom');
  const [newKeywords, setNewKeywords] = useState('');
  const [newFreq, setNewFreq] = useState('daily');

  useEffect(() => {
    if (workspaceId) fetchNotes(workspaceId);
  }, [workspaceId]);

  const handleCreateMonitor = async () => {
    if (!workspaceId || !newTitle.trim()) return;
    await createNote({
      workspace_id: workspaceId,
      title: newTitle,
      description: newDesc,
      note_type: newType,
      monitor_config: {
        keywords: newKeywords.split(',').map(k => k.trim()).filter(Boolean),
        entity_ids: [],
        sources: ['email', 'knowledge', 'crm'],
        frequency: newFreq,
      },
    });
    setShowCreate(false);
    setNewTitle(''); setNewDesc(''); setNewKeywords('');
    toast.success('Monitor IA creado — se actualizara automaticamente');
    fetchNotes(workspaceId);
  };

  const handleRefreshAll = async () => {
    if (!workspaceId) return;
    setRefreshing(true);
    toast.info('Actualizando notas con IA...');
    for (const note of notes) {
      try {
        await refreshNote(note.id, workspaceId);
      } catch {}
    }
    toast.success('Notas actualizadas');
    setRefreshing(false);
    fetchNotes(workspaceId);
  };

  const handleRefreshOne = async (noteId: string) => {
    if (!workspaceId) return;
    setRefreshing(true);
    const result = await refreshNote(noteId, workspaceId);
    if (result?.updated) {
      toast.success('Nota actualizada con nueva informacion');
    } else {
      toast.info('No hay informacion nueva');
    }
    setRefreshing(false);
    fetchNotes(workspaceId);
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* AI Feature Bar */}
      <div className="shrink-0 px-4 py-2 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-200/50 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-1.5">
            <SparklesIcon className="w-4 h-4 text-amber-500" />
            <span className="text-xs font-semibold text-amber-800">IA Activa</span>
          </div>

          {/* Active monitors pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {notes.slice(0, 5).map((note: any) => {
              const config = note.monitor_config || {};
              return (
                <button
                  key={note.id}
                  onClick={() => setSelectedMonitor(selectedMonitor?.id === note.id ? null : note)}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors whitespace-nowrap ${
                    selectedMonitor?.id === note.id
                      ? typeBadge[note.note_type] || typeBadge.custom
                      : 'bg-white/80 text-slate-600 border-slate-200 hover:border-amber-300'
                  }`}
                >
                  <ClockIcon className="w-2.5 h-2.5" />
                  {note.title}
                </button>
              );
            })}
            {notes.length === 0 && (
              <span className="text-[10px] text-amber-600/70">Sin monitores — crea uno para auto-actualizar notas</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={handleRefreshAll}
            disabled={refreshing || notes.length === 0}
            className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-lg bg-white border border-amber-200 text-amber-700 hover:bg-amber-50 disabled:opacity-50 transition-colors"
          >
            <ArrowPathIcon className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
            Actualizar todo
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors"
          >
            <PlusIcon className="w-3 h-3" />
            Nuevo monitor
          </button>
        </div>
      </div>

      {/* Monitor detail bar (when a monitor is selected) */}
      {selectedMonitor && (
        <div className="shrink-0 px-4 py-2 bg-white border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full border ${typeBadge[selectedMonitor.note_type] || typeBadge.custom}`}>
              {typeLabels[selectedMonitor.note_type] || selectedMonitor.note_type}
            </span>
            <span className="text-xs text-slate-700 font-medium">{selectedMonitor.title}</span>
            {selectedMonitor.description && (
              <span className="text-xs text-slate-400 truncate">— {selectedMonitor.description}</span>
            )}
            <div className="flex items-center gap-1">
              {(selectedMonitor.monitor_config?.keywords || []).map((kw: string, i: number) => (
                <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                  {kw}
                </span>
              ))}
            </div>
            <span className="text-[10px] text-slate-400">
              {frequencyLabels[selectedMonitor.monitor_config?.frequency] || 'Diario'}
            </span>
            {selectedMonitor.last_updated_content_at && (
              <span className="text-[10px] text-slate-400">
                Ultima: {new Date(selectedMonitor.last_updated_content_at).toLocaleString('es')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => handleRefreshOne(selectedMonitor.id)}
              disabled={refreshing}
              className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50 transition-colors"
            >
              <ArrowPathIcon className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
              Actualizar
            </button>
            <button onClick={() => setSelectedMonitor(null)} className="p-1 rounded hover:bg-slate-100">
              <XMarkIcon className="w-3.5 h-3.5 text-slate-400" />
            </button>
          </div>
        </div>
      )}

      {/* Editor */}
      <LocalFilesView basePath="live-notes" />

      {/* Create Monitor Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-amber-50 to-orange-50">
              <div className="flex items-center gap-2">
                <SparklesIcon className="w-5 h-5 text-amber-500" />
                <h3 className="text-base font-semibold text-slate-900">Nuevo Monitor IA</h3>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">La IA buscara y actualizara automaticamente esta nota</p>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Titulo del monitor</label>
                <input type="text" placeholder="ej: Competencia IA, Estado pipeline Q2, Seguimiento cliente X..." value={newTitle} onChange={(e) => setNewTitle(e.target.value)} autoFocus
                  className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-400 placeholder:text-slate-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Que debe monitorizar</label>
                <input type="text" placeholder="ej: Nuevas funcionalidades de competidores, menciones en emails..." value={newDesc} onChange={(e) => setNewDesc(e.target.value)}
                  className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-amber-200 placeholder:text-slate-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Keywords de busqueda</label>
                <input type="text" placeholder="ej: OpenAI, Claude, Gemini, competencia" value={newKeywords} onChange={(e) => setNewKeywords(e.target.value)}
                  className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-amber-200 placeholder:text-slate-400" />
                <p className="text-[10px] text-slate-400 mt-1">Separadas por coma. La IA buscara en emails, CRM y Knowledge Graph.</p>
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">Tipo</label>
                  <select value={newType} onChange={(e) => setNewType(e.target.value)}
                    className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-amber-200">
                    <option value="custom">Custom</option>
                    <option value="competitor">Competidor</option>
                    <option value="person">Persona</option>
                    <option value="project">Proyecto</option>
                    <option value="topic">Tema</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">Frecuencia</label>
                  <select value={newFreq} onChange={(e) => setNewFreq(e.target.value)}
                    className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-amber-200">
                    <option value="hourly">Cada hora</option>
                    <option value="daily">Diario</option>
                    <option value="weekly">Semanal</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">Cancelar</button>
              <button onClick={handleCreateMonitor} disabled={!newTitle.trim()} className="px-5 py-2 text-sm font-medium bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 transition-colors">
                <span className="flex items-center gap-1.5"><SparklesIcon className="w-4 h-4" /> Crear Monitor</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
