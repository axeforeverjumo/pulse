import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  PlusIcon,
  ArrowPathIcon,
  TrashIcon,
  ClockIcon,
  CheckCircleIcon,
  SparklesIcon,
  InboxIcon,
  ExclamationTriangleIcon,
  ListBulletIcon,
  BuildingOfficeIcon,
  ChevronRightIcon,
  PencilSquareIcon,
  EyeIcon,
  XMarkIcon,
  Cog6ToothIcon,
} from '@heroicons/react/24/outline';
import { useLiveNotesStore } from '../../stores/liveNotesStore';
import { toast } from 'sonner';

const noteTypeLabels: Record<string, string> = {
  competitor: 'Competidor',
  person: 'Persona',
  project: 'Proyecto',
  topic: 'Tema',
  custom: 'Custom',
};

const noteTypeColors: Record<string, string> = {
  competitor: 'text-red-500 bg-red-50 dark:bg-red-500/10',
  person: 'text-blue-500 bg-blue-50 dark:bg-blue-500/10',
  project: 'text-green-500 bg-green-50 dark:bg-green-500/10',
  topic: 'text-amber-500 bg-amber-50 dark:bg-amber-500/10',
  custom: 'text-zinc-500 bg-zinc-50 dark:bg-zinc-800',
};

const noteTypeIcons: Record<string, any> = {
  competitor: ExclamationTriangleIcon,
  person: InboxIcon,
  project: ListBulletIcon,
  topic: SparklesIcon,
  custom: PencilSquareIcon,
};

function parseMarkdownSections(content: string) {
  if (!content) return [];
  const sections: { title: string; items: string[]; raw: string }[] = [];
  const lines = content.split('\n');
  let currentSection = { title: '', items: [] as string[], raw: '' };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('### ') || trimmed.startsWith('## ')) {
      if (currentSection.title || currentSection.items.length) {
        sections.push({ ...currentSection });
      }
      currentSection = { title: trimmed.replace(/^#+\s*/, ''), items: [], raw: '' };
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || /^\d+\.\s/.test(trimmed)) {
      currentSection.items.push(trimmed.replace(/^[-*]\s*/, '').replace(/^\d+\.\s*/, ''));
    } else if (trimmed) {
      currentSection.raw += (currentSection.raw ? '\n' : '') + trimmed;
    }
  }
  if (currentSection.title || currentSection.items.length || currentSection.raw) {
    sections.push(currentSection);
  }
  return sections;
}

export default function LiveNotesView() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const { notes, selectedNote, isLoading, fetchNotes, fetchNote, createNote, deleteNote, refreshNote, setSelectedNote } = useLiveNotesStore();
  const [showCreate, setShowCreate] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [refreshing, setRefreshing] = useState<string | null>(null);

  // Create form
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newType, setNewType] = useState('custom');
  const [newKeywords, setNewKeywords] = useState('');
  const [newFrequency, setNewFrequency] = useState('daily');
  const [newSources, setNewSources] = useState(['email', 'knowledge', 'crm']);

  useEffect(() => {
    if (workspaceId) fetchNotes(workspaceId);
  }, [workspaceId]);

  // Auto-select first note
  useEffect(() => {
    if (notes.length > 0 && !selectedNote) {
      setSelectedNote(notes[0]);
      if (workspaceId) fetchNote(notes[0].id, workspaceId);
    }
  }, [notes]);

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
        sources: newSources,
        frequency: newFrequency,
      },
    });
    if (note) {
      setShowCreate(false);
      setNewTitle(''); setNewDescription(''); setNewKeywords('');
      setSelectedNote(note);
      toast.success('Live Note creada — haz click en actualizar para generar contenido');
    }
  };

  const handleRefresh = async (noteId: string) => {
    if (!workspaceId) return;
    setRefreshing(noteId);
    const result = await refreshNote(noteId, workspaceId);
    if (result?.updated) {
      toast.success('Nota actualizada con nueva informacion');
      fetchNote(noteId, workspaceId);
      fetchNotes(workspaceId);
    } else {
      toast.info('No se encontro informacion nueva');
    }
    setRefreshing(null);
  };

  const handleDelete = async (noteId: string) => {
    if (!workspaceId || !confirm('Eliminar esta Live Note?')) return;
    await deleteNote(noteId, workspaceId);
    toast.success('Eliminada');
  };

  const activeNote = selectedNote;
  const sections = activeNote ? parseMarkdownSections(activeNote.content || '') : [];
  const config = activeNote?.monitor_config || {};

  // Split sections into main (left) and sidebar (right)
  const mainSections = sections.filter((_, i) => i % 3 !== 2 || sections.length <= 3);
  const sidebarSections = sections.length > 3 ? sections.filter((_, i) => i % 3 === 2) : [];

  return (
    <div className="flex flex-col h-full bg-zinc-50 dark:bg-zinc-950">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          <SparklesIcon className="w-5 h-5 text-amber-500" />
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Live Notes</h1>
        </div>
        <div className="flex items-center gap-2">
          {/* Note tabs */}
          <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-0.5">
            {notes.map((note: any) => {
              const Icon = noteTypeIcons[note.note_type] || SparklesIcon;
              return (
                <button
                  key={note.id}
                  onClick={() => { setSelectedNote(note); if (workspaceId) fetchNote(note.id, workspaceId); }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                    activeNote?.id === note.id
                      ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                      : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                  }`}
                >
                  <Icon className="w-3 h-3" />
                  <span className="max-w-24 truncate">{note.title}</span>
                </button>
              );
            })}
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors"
          >
            <PlusIcon className="w-3.5 h-3.5" />
            Nueva
          </button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center flex-1">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500" />
        </div>
      ) : !activeNote ? (
        <div className="flex items-center justify-center flex-1">
          <div className="text-center max-w-md">
            <SparklesIcon className="w-16 h-16 text-zinc-200 dark:text-zinc-700 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Daily Intelligence</h2>
            <p className="text-sm text-zinc-500 mb-6">
              Crea Live Notes para monitorizar automaticamente temas, competidores, personas y proyectos.
              Se actualizan solas con informacion de tus emails, CRM y Knowledge Graph.
            </p>
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors"
            >
              <PlusIcon className="w-4 h-4" />
              Crear primera Live Note
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {/* Main content — Rowboat style */}
          <div className="flex-1 overflow-auto">
            <div className="max-w-3xl mx-auto py-6 px-8">
              {/* Note title + actions */}
              <div className="flex items-start justify-between mb-6">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${noteTypeColors[activeNote.note_type] || noteTypeColors.custom}`}>
                      {noteTypeLabels[activeNote.note_type] || activeNote.note_type}
                    </span>
                    <span className="text-[10px] text-zinc-400">
                      {config.frequency === 'hourly' ? 'Cada hora' : config.frequency === 'weekly' ? 'Semanal' : 'Diario'}
                    </span>
                    {activeNote.last_updated_content_at && (
                      <span className="text-[10px] text-zinc-400">
                        Actualizado {new Date(activeNote.last_updated_content_at).toLocaleString()}
                      </span>
                    )}
                  </div>
                  <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{activeNote.title}</h2>
                  {activeNote.description && (
                    <p className="text-sm text-zinc-500 mt-1">{activeNote.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleRefresh(activeNote.id)}
                    disabled={refreshing === activeNote.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-400 disabled:opacity-50 transition-colors"
                  >
                    <ArrowPathIcon className={`w-3.5 h-3.5 ${refreshing === activeNote.id ? 'animate-spin' : ''}`} />
                    {refreshing === activeNote.id ? 'Actualizando...' : 'Actualizar'}
                  </button>
                  <button onClick={() => setShowConfig(!showConfig)} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800">
                    <Cog6ToothIcon className="w-4 h-4 text-zinc-400" />
                  </button>
                  <button onClick={() => handleDelete(activeNote.id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10">
                    <TrashIcon className="w-4 h-4 text-zinc-400 hover:text-red-500" />
                  </button>
                </div>
              </div>

              {/* Keywords */}
              {config.keywords && config.keywords.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-6">
                  {config.keywords.map((kw: string, i: number) => (
                    <span key={i} className="text-[11px] px-2.5 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-medium">
                      {kw}
                    </span>
                  ))}
                </div>
              )}

              {/* Content sections — Rowboat style cards */}
              {activeNote.content ? (
                <div className="space-y-6">
                  {sections.length > 0 ? sections.map((section, i) => (
                    <div key={i} className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                      {section.title && (
                        <div className="px-5 py-3 border-b border-zinc-100 dark:border-zinc-800">
                          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{section.title}</h3>
                        </div>
                      )}
                      <div className="px-5 py-4">
                        {section.items.length > 0 ? (
                          <ul className="space-y-2.5">
                            {section.items.map((item, j) => (
                              <li key={j} className="flex items-start gap-2.5 text-sm text-zinc-700 dark:text-zinc-300">
                                <ChevronRightIcon className="w-3.5 h-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
                                <span>{renderBoldText(item)}</span>
                              </li>
                            ))}
                          </ul>
                        ) : section.raw ? (
                          <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">{renderBoldText(section.raw)}</p>
                        ) : null}
                      </div>
                    </div>
                  )) : (
                    /* Raw content fallback */
                    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5">
                      <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">
                        {activeNote.content}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-8 text-center">
                  <SparklesIcon className="w-10 h-10 text-zinc-200 dark:text-zinc-700 mx-auto mb-3" />
                  <p className="text-sm text-zinc-500 mb-3">Sin contenido aun.</p>
                  <button
                    onClick={() => handleRefresh(activeNote.id)}
                    disabled={refreshing === activeNote.id}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50"
                  >
                    <ArrowPathIcon className={`w-4 h-4 ${refreshing === activeNote.id ? 'animate-spin' : ''}`} />
                    Generar primer contenido
                  </button>
                </div>
              )}

              {/* Update history */}
              {activeNote.updates && activeNote.updates.length > 0 && (
                <div className="mt-8">
                  <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Historial</h3>
                  <div className="space-y-2">
                    {activeNote.updates.slice(0, 5).map((update: any) => (
                      <div key={update.id} className="flex items-center gap-3 text-xs text-zinc-500">
                        <ClockIcon className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>{new Date(update.created_at).toLocaleString()}</span>
                        <span className="text-zinc-400">—</span>
                        <span>{update.summary || update.update_type}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Config sidebar (collapsible) */}
          {showConfig && (
            <div className="w-72 border-l border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-auto">
              <div className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Configuracion</h3>
                  <button onClick={() => setShowConfig(false)} className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800">
                    <XMarkIcon className="w-4 h-4 text-zinc-500" />
                  </button>
                </div>
                <div className="space-y-4 text-xs">
                  <div>
                    <label className="font-medium text-zinc-500 uppercase tracking-wider">Tipo</label>
                    <p className="mt-1 text-zinc-700 dark:text-zinc-300">{noteTypeLabels[activeNote.note_type] || activeNote.note_type}</p>
                  </div>
                  <div>
                    <label className="font-medium text-zinc-500 uppercase tracking-wider">Frecuencia</label>
                    <p className="mt-1 text-zinc-700 dark:text-zinc-300">{config.frequency || 'daily'}</p>
                  </div>
                  <div>
                    <label className="font-medium text-zinc-500 uppercase tracking-wider">Fuentes</label>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {(config.sources || []).map((s: string) => (
                        <span key={s} className="px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">{s}</span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="font-medium text-zinc-500 uppercase tracking-wider">Keywords</label>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {(config.keywords || []).map((k: string, i: number) => (
                        <span key={i} className="px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400">{k}</span>
                      ))}
                    </div>
                  </div>
                  {activeNote.last_updated_content_at && (
                    <div>
                      <label className="font-medium text-zinc-500 uppercase tracking-wider">Ultima actualizacion</label>
                      <p className="mt-1 text-zinc-700 dark:text-zinc-300">{new Date(activeNote.last_updated_content_at).toLocaleString()}</p>
                    </div>
                  )}
                  <div>
                    <label className="font-medium text-zinc-500 uppercase tracking-wider">Estado</label>
                    <p className="mt-1 flex items-center gap-1.5">
                      {activeNote.is_active ? (
                        <><CheckCircleIcon className="w-3.5 h-3.5 text-green-500" /> Activa</>
                      ) : (
                        <><XMarkIcon className="w-3.5 h-3.5 text-zinc-400" /> Pausada</>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-lg p-0 overflow-hidden">
            {/* Modal header */}
            <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Nueva Live Note</h3>
              <p className="text-xs text-zinc-500 mt-0.5">Monitoriza automaticamente un tema con IA</p>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Title */}
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1.5">Titulo</label>
                <input
                  type="text"
                  placeholder="ej: Competencia en IA, Pipeline Q2, Seguimiento cliente X..."
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-4 py-2.5 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                  autoFocus
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1.5">Que monitorizar</label>
                <input
                  type="text"
                  placeholder="ej: Nuevas funcionalidades de competidores, menciones en emails..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full px-4 py-2.5 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                />
              </div>

              {/* Keywords */}
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1.5">Keywords</label>
                <input
                  type="text"
                  placeholder="ej: OpenAI, Claude, Gemini, competencia"
                  value={newKeywords}
                  onChange={(e) => setNewKeywords(e.target.value)}
                  className="w-full px-4 py-2.5 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                />
                <p className="text-[10px] text-zinc-400 mt-1">Separadas por coma</p>
              </div>

              {/* Type + Frequency */}
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-zinc-500 mb-1.5">Tipo</label>
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value)}
                    className="w-full px-4 py-2.5 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                  >
                    <option value="custom">Custom</option>
                    <option value="competitor">Competidor</option>
                    <option value="person">Persona</option>
                    <option value="project">Proyecto</option>
                    <option value="topic">Tema</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-zinc-500 mb-1.5">Frecuencia</label>
                  <select
                    value={newFrequency}
                    onChange={(e) => setNewFrequency(e.target.value)}
                    className="w-full px-4 py-2.5 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                  >
                    <option value="hourly">Cada hora</option>
                    <option value="daily">Diario</option>
                    <option value="weekly">Semanal</option>
                  </select>
                </div>
              </div>

              {/* Sources */}
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1.5">Fuentes de datos</label>
                <div className="flex flex-wrap gap-2">
                  {['email', 'knowledge', 'crm', 'calendar'].map((source) => (
                    <button
                      key={source}
                      onClick={() => setNewSources(prev =>
                        prev.includes(source) ? prev.filter(s => s !== source) : [...prev, source]
                      )}
                      className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                        newSources.includes(source)
                          ? 'bg-amber-50 border-amber-300 text-amber-700 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-400'
                          : 'bg-zinc-50 border-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:border-zinc-700'
                      }`}
                    >
                      {source === 'email' ? 'Email' : source === 'knowledge' ? 'Knowledge Graph' : source === 'crm' ? 'CRM' : 'Calendario'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Modal footer */}
            <div className="px-6 py-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 flex justify-end gap-2">
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreate}
                disabled={!newTitle.trim()}
                className="px-5 py-2 text-sm font-medium bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 transition-colors"
              >
                Crear Live Note
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function renderBoldText(text: string) {
  // Convert **bold** markdown to <strong>
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-semibold text-zinc-900 dark:text-zinc-100">{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}
