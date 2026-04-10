import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
  PlusIcon,
  ArrowPathIcon,
  TrashIcon,
  ClockIcon,
  Cog6ToothIcon,
  SparklesIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { Eye, FileText } from 'lucide-react';
import NoteEditor from '../Files/NoteEditor';
import { HeaderButtons } from '../MiniAppHeader';
import { useLiveNotesStore } from '../../stores/liveNotesStore';
import { toast } from 'sonner';

const SIDEBAR = {
  bg: 'bg-[#F9F9F9]',
  item: 'text-[#323232]',
  selected: 'bg-[#EAEAEA] text-black font-medium',
};

const noteTypeLabels: Record<string, string> = {
  competitor: 'Competidor',
  person: 'Persona',
  project: 'Proyecto',
  topic: 'Tema',
  custom: 'Custom',
};

const noteTypeBadge: Record<string, string> = {
  competitor: 'bg-red-50 text-red-600',
  person: 'bg-blue-50 text-blue-600',
  project: 'bg-green-50 text-green-600',
  topic: 'bg-amber-50 text-amber-600',
  custom: 'bg-slate-100 text-slate-600',
};

export default function LiveNotesView() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const {
    notes, selectedNote, isLoading,
    fetchNotes, fetchNote, createNote, updateNote, deleteNote, refreshNote,
    setSelectedNote,
  } = useLiveNotesStore();

  const [showCreate, setShowCreate] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [editedContent, setEditedContent] = useState('');

  // Create form
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newType, setNewType] = useState('custom');
  const [newKeywords, setNewKeywords] = useState('');
  const [newFrequency, setNewFrequency] = useState('daily');

  useEffect(() => {
    if (workspaceId) fetchNotes(workspaceId);
  }, [workspaceId]);

  useEffect(() => {
    if (notes.length > 0 && !selectedNote) {
      setSelectedNote(notes[0]);
      if (workspaceId) fetchNote(notes[0].id, workspaceId);
    }
  }, [notes]);

  useEffect(() => {
    if (selectedNote) {
      setEditedContent(selectedNote.content || '');
    }
  }, [selectedNote?.id, selectedNote?.content]);

  const handleSelectNote = (note: any) => {
    setSelectedNote(note);
    if (workspaceId) fetchNote(note.id, workspaceId);
    setShowConfig(false);
  };

  const handleContentChange = useCallback((markdown: string) => {
    setEditedContent(markdown);
    // Auto-save content after edit (debounced in a real implementation)
    if (workspaceId && selectedNote) {
      updateNote(selectedNote.id, workspaceId, { content: markdown });
    }
  }, [workspaceId, selectedNote?.id]);

  const handleCreate = async () => {
    if (!workspaceId || !newTitle.trim()) return;
    const note = await createNote({
      workspace_id: workspaceId,
      title: newTitle,
      description: newDescription,
      note_type: newType,
      monitor_config: {
        keywords: newKeywords.split(',').map(k => k.trim()).filter(Boolean),
        entity_ids: [],
        sources: ['email', 'knowledge', 'crm'],
        frequency: newFrequency,
      },
    });
    if (note) {
      setShowCreate(false);
      setNewTitle(''); setNewDescription(''); setNewKeywords('');
      handleSelectNote(note);
      toast.success('Live Note creada');
    }
  };

  const handleRefresh = async () => {
    if (!workspaceId || !selectedNote) return;
    setRefreshing(true);
    const result = await refreshNote(selectedNote.id, workspaceId);
    if (result?.updated) {
      toast.success('Actualizada con nueva informacion');
      fetchNote(selectedNote.id, workspaceId);
    } else {
      toast.info('No hay informacion nueva');
    }
    setRefreshing(false);
  };

  const handleDelete = async () => {
    if (!workspaceId || !selectedNote || !confirm('Eliminar esta Live Note?')) return;
    await deleteNote(selectedNote.id, workspaceId);
    toast.success('Eliminada');
  };

  const config = selectedNote?.monitor_config || {};

  return (
    <div className="flex-1 flex h-full min-w-0 overflow-hidden">
      <div className="relative flex-1 flex min-w-0 overflow-hidden rounded-[20px] bg-gradient-to-b from-[#f6fbff] to-[#edf4fb]">
        <div className="flex-1 flex min-w-0 overflow-hidden bg-white/92 md:rounded-[20px]">

          {/* Sidebar — note list (Files pattern) */}
          <div className={`w-[240px] shrink-0 flex flex-col overflow-hidden ${SIDEBAR.bg} border-r border-black/5`}>
            <div className="h-14 flex items-center justify-between pl-4 pr-2 shrink-0 border-b border-[#e4edf8]">
              <div className="flex items-center gap-2">
                <SparklesIcon className="w-[18px] h-[18px] text-amber-500" />
                <h2 className="text-sm font-semibold text-slate-900">Live Notes</h2>
              </div>
              <button
                onClick={() => setShowCreate(true)}
                className="p-1 rounded bg-white border border-black/10 hover:border-black/20 text-slate-500 hover:text-slate-900 transition-colors"
                title="Nueva Live Note"
              >
                <PlusIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {isLoading ? (
                <div className="space-y-1 p-2">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="h-[32px] rounded-md bg-slate-100 animate-pulse" />
                  ))}
                </div>
              ) : notes.length === 0 ? (
                <div className="p-6 text-center">
                  <SparklesIcon className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">Sin notas</p>
                  <button
                    onClick={() => setShowCreate(true)}
                    className="mt-2 text-xs text-blue-600 hover:underline"
                  >
                    Crear primera Live Note
                  </button>
                </div>
              ) : (
                <div className="p-2 space-y-0.5">
                  {notes.map((note: any) => {
                    const isActive = selectedNote?.id === note.id;
                    return (
                      <button
                        key={note.id}
                        onClick={() => handleSelectNote(note)}
                        className={`w-full flex items-center pr-3 h-[32px] rounded-md text-sm transition-colors group cursor-pointer ${
                          isActive ? SIDEBAR.selected : `${SIDEBAR.item} hover:bg-black/5`
                        }`}
                      >
                        <span className="shrink-0 ml-3 mr-2">
                          <FileText className="w-4 h-4" />
                        </span>
                        <span className="flex-1 text-left truncate">{note.title}</span>
                        {note.is_active && (
                          <ClockIcon className="w-3 h-3 text-amber-500 shrink-0 opacity-60" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Main content — editor area */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-white">
            {selectedNote ? (
              <>
                {/* Top bar */}
                <div className="h-12 shrink-0 flex items-center justify-between px-6 border-b border-[#e4edf8]">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${noteTypeBadge[selectedNote.note_type] || noteTypeBadge.custom}`}>
                      {noteTypeLabels[selectedNote.note_type] || selectedNote.note_type}
                    </span>
                    {config.keywords && config.keywords.length > 0 && (
                      <div className="flex items-center gap-1 overflow-hidden">
                        {config.keywords.slice(0, 3).map((kw: string, i: number) => (
                          <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 truncate max-w-20">
                            {kw}
                          </span>
                        ))}
                        {config.keywords.length > 3 && (
                          <span className="text-[10px] text-slate-400">+{config.keywords.length - 3}</span>
                        )}
                      </div>
                    )}
                    <span className="text-[10px] text-slate-400">
                      {config.frequency === 'hourly' ? 'Cada hora' : config.frequency === 'weekly' ? 'Semanal' : 'Diario'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {selectedNote.last_updated_content_at && (
                      <span className="text-[10px] text-slate-400 hidden sm:inline">
                        Actualizado {new Date(selectedNote.last_updated_content_at).toLocaleString('es')}
                      </span>
                    )}
                    <button
                      onClick={handleRefresh}
                      disabled={refreshing}
                      className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
                      title="Actualizar con IA"
                    >
                      <ArrowPathIcon className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                      <span className="hidden sm:inline">Actualizar</span>
                    </button>
                    <button
                      onClick={() => setShowConfig(!showConfig)}
                      className={`p-1.5 rounded-lg transition-colors ${showConfig ? 'bg-slate-100 text-slate-700' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
                      title="Configuracion"
                    >
                      <Cog6ToothIcon className="w-4 h-4" />
                    </button>
                    <button onClick={handleDelete} className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Eliminar">
                      <TrashIcon className="w-4 h-4" />
                    </button>
                    <HeaderButtons settingsButtonRef={settingsButtonRef} />
                  </div>
                </div>

                {/* Content area */}
                <div className="flex flex-1 min-h-0 overflow-hidden">
                  {/* Editor */}
                  <div className="flex-1 overflow-auto">
                    <div className="w-[min(800px,90%)] mx-auto">
                      <div className="px-6 pt-4 pb-1">
                        <textarea
                          rows={1}
                          className="w-full text-[28px] font-semibold text-slate-900 bg-transparent border-0 focus:outline-none placeholder:text-slate-300 resize-none overflow-hidden"
                          placeholder="Sin titulo"
                          value={selectedNote.title}
                          onChange={(e) => {
                            if (workspaceId) updateNote(selectedNote.id, workspaceId, { title: e.target.value });
                          }}
                          style={{ height: '42px' }}
                        />
                      </div>
                      <div className="px-6 pb-4">
                        <NoteEditor
                          content={editedContent}
                          onChange={handleContentChange}
                          placeholder="El contenido se generara automaticamente cuando hagas click en 'Actualizar'..."
                        />
                        <div className="h-[40vh]" />
                      </div>
                    </div>
                  </div>

                  {/* Config sidebar */}
                  {showConfig && (
                    <div className="w-[260px] shrink-0 border-l border-[#e4edf8] overflow-auto bg-[#F9F9F9]">
                      <div className="p-4">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-sm font-semibold text-slate-900">Configuracion</h3>
                          <button onClick={() => setShowConfig(false)} className="p-1 rounded hover:bg-slate-200">
                            <XMarkIcon className="w-4 h-4 text-slate-400" />
                          </button>
                        </div>
                        <div className="space-y-4 text-xs">
                          <div>
                            <label className="font-medium text-slate-500 uppercase tracking-wider block mb-1">Descripcion</label>
                            <p className="text-slate-700">{selectedNote.description || 'Sin descripcion'}</p>
                          </div>
                          <div>
                            <label className="font-medium text-slate-500 uppercase tracking-wider block mb-1">Keywords</label>
                            <div className="flex flex-wrap gap-1">
                              {(config.keywords || []).map((k: string, i: number) => (
                                <span key={i} className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 text-[10px]">{k}</span>
                              ))}
                              {(!config.keywords || config.keywords.length === 0) && (
                                <span className="text-slate-400">Sin keywords</span>
                              )}
                            </div>
                          </div>
                          <div>
                            <label className="font-medium text-slate-500 uppercase tracking-wider block mb-1">Fuentes</label>
                            <div className="flex flex-wrap gap-1">
                              {(config.sources || []).map((s: string) => (
                                <span key={s} className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px]">{s}</span>
                              ))}
                            </div>
                          </div>
                          <div>
                            <label className="font-medium text-slate-500 uppercase tracking-wider block mb-1">Frecuencia</label>
                            <p className="text-slate-700">{config.frequency === 'hourly' ? 'Cada hora' : config.frequency === 'weekly' ? 'Semanal' : 'Diario'}</p>
                          </div>
                          {selectedNote.last_updated_content_at && (
                            <div>
                              <label className="font-medium text-slate-500 uppercase tracking-wider block mb-1">Ultima actualizacion</label>
                              <p className="text-slate-700">{new Date(selectedNote.last_updated_content_at).toLocaleString('es')}</p>
                            </div>
                          )}
                          {/* Update history */}
                          {selectedNote.updates && selectedNote.updates.length > 0 && (
                            <div>
                              <label className="font-medium text-slate-500 uppercase tracking-wider block mb-2">Historial</label>
                              <div className="space-y-1.5">
                                {selectedNote.updates.slice(0, 5).map((u: any) => (
                                  <div key={u.id} className="flex items-center gap-2 text-[10px] text-slate-500">
                                    <ClockIcon className="w-3 h-3 shrink-0" />
                                    <span>{new Date(u.created_at).toLocaleDateString('es')}</span>
                                    <span className="text-slate-400">—</span>
                                    <span className="truncate">{u.summary || u.update_type}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center max-w-sm">
                  <SparklesIcon className="w-16 h-16 text-slate-200 mx-auto mb-4" />
                  <h3 className="text-base font-semibold text-slate-700 mb-2">Live Notes</h3>
                  <p className="text-sm text-slate-500 leading-relaxed mb-4">
                    Notas que se actualizan automaticamente con IA. Monitoriza competidores, personas, proyectos o cualquier tema.
                  </p>
                  <button
                    onClick={() => setShowCreate(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors"
                  >
                    <PlusIcon className="w-4 h-4" />
                    Crear Live Note
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="text-base font-semibold text-slate-900">Nueva Live Note</h3>
              <p className="text-xs text-slate-500 mt-0.5">Monitoriza un tema automaticamente con IA</p>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Titulo</label>
                <input type="text" placeholder="ej: Competencia IA, Pipeline Q2..." value={newTitle} onChange={(e) => setNewTitle(e.target.value)} autoFocus
                  className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 placeholder:text-slate-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Que monitorizar</label>
                <input type="text" placeholder="ej: Nuevas funcionalidades de competidores..." value={newDescription} onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 placeholder:text-slate-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Keywords (separadas por coma)</label>
                <input type="text" placeholder="ej: OpenAI, Claude, Gemini" value={newKeywords} onChange={(e) => setNewKeywords(e.target.value)}
                  className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 placeholder:text-slate-400" />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">Tipo</label>
                  <select value={newType} onChange={(e) => setNewType(e.target.value)}
                    className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200">
                    <option value="custom">Custom</option>
                    <option value="competitor">Competidor</option>
                    <option value="person">Persona</option>
                    <option value="project">Proyecto</option>
                    <option value="topic">Tema</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">Frecuencia</label>
                  <select value={newFrequency} onChange={(e) => setNewFrequency(e.target.value)}
                    className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200">
                    <option value="hourly">Cada hora</option>
                    <option value="daily">Diario</option>
                    <option value="weekly">Semanal</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">Cancelar</button>
              <button onClick={handleCreate} disabled={!newTitle.trim()} className="px-5 py-2 text-sm font-medium bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 transition-colors">Crear</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
