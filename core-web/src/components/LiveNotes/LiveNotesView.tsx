import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  PlusIcon,
  ArrowPathIcon,
  EyeIcon,
  TrashIcon,
  ClockIcon,
  CheckCircleIcon,
  XMarkIcon,
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
  competitor: 'bg-red-100 text-red-600 dark:bg-red-500/10 dark:text-red-400',
  person: 'bg-blue-100 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400',
  project: 'bg-green-100 text-green-600 dark:bg-green-500/10 dark:text-green-400',
  topic: 'bg-amber-100 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
  custom: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400',
};

export default function LiveNotesView() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const { notes, selectedNote, isLoading, fetchNotes, fetchNote, createNote, deleteNote, refreshNote, setSelectedNote } = useLiveNotesStore();
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newType, setNewType] = useState('custom');
  const [newKeywords, setNewKeywords] = useState('');
  const [newFrequency, setNewFrequency] = useState('daily');

  useEffect(() => {
    if (workspaceId) fetchNotes(workspaceId);
  }, [workspaceId]);

  const handleCreate = async () => {
    if (!workspaceId || !newTitle.trim()) return;
    await createNote({
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
    setShowCreate(false);
    setNewTitle('');
    setNewDescription('');
    setNewKeywords('');
    toast.success('Live Note creada');
  };

  const handleRefresh = async (noteId: string) => {
    if (!workspaceId) return;
    toast.info('Actualizando...');
    const result = await refreshNote(noteId, workspaceId);
    if (result?.updated) {
      toast.success('Nota actualizada con nueva informacion');
      fetchNotes(workspaceId);
    } else {
      toast.info('No se encontro informacion nueva');
    }
  };

  const handleDelete = async (noteId: string) => {
    if (!workspaceId || !confirm('Eliminar esta Live Note?')) return;
    await deleteNote(noteId, workspaceId);
    toast.success('Live Note eliminada');
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-zinc-950">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          <ClockIcon className="w-5 h-5 text-amber-500" />
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Live Notes</h1>
          <span className="text-xs text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full">
            {notes.length} notas
          </span>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-400 dark:hover:bg-amber-500/20 transition-colors"
        >
          <PlusIcon className="w-3.5 h-3.5" />
          Nueva
        </button>
      </div>

      {/* Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* List */}
        <div className="w-80 border-r border-zinc-200 dark:border-zinc-800 overflow-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-amber-500" />
            </div>
          ) : notes.length === 0 ? (
            <div className="text-center py-12 px-4 text-sm text-zinc-500">
              No tienes Live Notes. Crea una para monitorizar temas automaticamente.
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {notes.map((note: any) => (
                <button
                  key={note.id}
                  onClick={() => { setSelectedNote(note); if (workspaceId) fetchNote(note.id, workspaceId); }}
                  className={`w-full text-left p-3 rounded-lg transition-colors ${
                    selectedNote?.id === note.id
                      ? 'bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30'
                      : 'hover:bg-zinc-50 dark:hover:bg-zinc-900 border border-transparent'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h4 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{note.title}</h4>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${noteTypeColors[note.note_type] || noteTypeColors.custom}`}>
                          {noteTypeLabels[note.note_type] || note.note_type}
                        </span>
                        <span className="text-[10px] text-zinc-400">
                          {note.monitor_config?.frequency || 'daily'}
                        </span>
                      </div>
                    </div>
                    {note.is_active ? (
                      <CheckCircleIcon className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" />
                    ) : (
                      <XMarkIcon className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0 mt-0.5" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Detail */}
        <div className="flex-1 overflow-auto">
          {selectedNote ? (
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{selectedNote.title}</h2>
                <div className="flex items-center gap-2">
                  <button onClick={() => handleRefresh(selectedNote.id)} className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800" title="Actualizar ahora">
                    <ArrowPathIcon className="w-4 h-4 text-zinc-500" />
                  </button>
                  <button onClick={() => handleDelete(selectedNote.id)} className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-500/10" title="Eliminar">
                    <TrashIcon className="w-4 h-4 text-zinc-500 hover:text-red-500" />
                  </button>
                </div>
              </div>

              {selectedNote.description && (
                <p className="text-sm text-zinc-500 mb-4">{selectedNote.description}</p>
              )}

              {/* Config */}
              <div className="flex flex-wrap gap-1.5 mb-4">
                {(selectedNote.monitor_config?.keywords || []).map((kw: string, i: number) => (
                  <span key={i} className="text-[10px] px-2 py-0.5 rounded bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
                    {kw}
                  </span>
                ))}
              </div>

              {/* Content */}
              <div className="prose prose-sm dark:prose-invert max-w-none">
                {selectedNote.content ? (
                  <div className="whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300 bg-zinc-50 dark:bg-zinc-900 rounded-lg p-4 border border-zinc-200 dark:border-zinc-800">
                    {selectedNote.content}
                  </div>
                ) : (
                  <p className="text-sm text-zinc-400 italic">
                    Sin contenido aun. Haz click en actualizar para generar el primer contenido.
                  </p>
                )}
              </div>

              {/* Updates history */}
              {selectedNote.updates && selectedNote.updates.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-xs font-semibold text-zinc-500 uppercase mb-2">Historial de actualizaciones</h3>
                  <div className="space-y-2">
                    {selectedNote.updates.map((update: any) => (
                      <div key={update.id} className="text-xs p-2 rounded bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                        <div className="flex items-center justify-between">
                          <span className="text-zinc-500">{new Date(update.created_at).toLocaleString()}</span>
                          <span className="text-zinc-400">{update.update_type}</span>
                        </div>
                        {update.summary && <p className="text-zinc-600 dark:text-zinc-400 mt-1">{update.summary}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedNote.last_updated_content_at && (
                <p className="text-[10px] text-zinc-400 mt-4">
                  Ultima actualizacion: {new Date(selectedNote.last_updated_content_at).toLocaleString()}
                </p>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-zinc-500">
              Selecciona una Live Note para ver su contenido
            </div>
          )}
        </div>
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Nueva Live Note</h3>
            <div className="space-y-3">
              <input type="text" placeholder="Titulo" value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100" />
              <input type="text" placeholder="Descripcion (que monitorizar)" value={newDescription} onChange={(e) => setNewDescription(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100" />
              <input type="text" placeholder="Keywords (separadas por coma)" value={newKeywords} onChange={(e) => setNewKeywords(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100" />
              <div className="flex gap-3">
                <select value={newType} onChange={(e) => setNewType(e.target.value)}
                  className="flex-1 px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100">
                  <option value="custom">Custom</option>
                  <option value="competitor">Competidor</option>
                  <option value="person">Persona</option>
                  <option value="project">Proyecto</option>
                  <option value="topic">Tema</option>
                </select>
                <select value={newFrequency} onChange={(e) => setNewFrequency(e.target.value)}
                  className="flex-1 px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100">
                  <option value="hourly">Cada hora</option>
                  <option value="daily">Diario</option>
                  <option value="weekly">Semanal</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg">Cancelar</button>
              <button onClick={handleCreate} disabled={!newTitle.trim()} className="px-4 py-2 text-xs font-medium bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50">Crear</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
