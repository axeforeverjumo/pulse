import { useState, useEffect, useCallback } from 'react';
import { DocumentTextIcon } from '@heroicons/react/24/outline';
import { getCrmNotes } from '../../api/client';
import NoteEditor from './NoteEditor';

interface NotesViewProps {
  workspaceId: string;
}

export default function NotesView({ workspaceId }: NotesViewProps) {
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEditor, setShowEditor] = useState(false);

  const loadNotes = useCallback(() => {
    setLoading(true);
    getCrmNotes(workspaceId)
      .then((data) => setNotes(data.notes || []))
      .catch(() => setNotes([]))
      .finally(() => setLoading(false));
  }, [workspaceId]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  const targetLabel = (type: string) => {
    switch (type) {
      case 'contact': return 'Contacto';
      case 'company': return 'Empresa';
      case 'opportunity': return 'Oportunidad';
      default: return type;
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200/60">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-800">Notas</h3>
          <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">{notes.length}</span>
        </div>
        <button
          onClick={() => setShowEditor(!showEditor)}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-colors"
        >
          {showEditor ? 'Cerrar' : '+ Nueva nota'}
        </button>
      </div>

      <div className="flex-1 overflow-auto px-4 py-3 space-y-3">
        {showEditor && (
          <div className="p-3 rounded-xl border border-slate-200 bg-white/80">
            <NoteEditor
              workspaceId={workspaceId}
              onSaved={() => {
                setShowEditor(false);
                loadNotes();
              }}
            />
          </div>
        )}

        {loading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="p-3 rounded-lg border border-slate-100 animate-pulse">
                <div className="h-3.5 w-32 bg-slate-200 rounded mb-2" />
                <div className="h-3 w-full bg-slate-100 rounded mb-1" />
                <div className="h-3 w-3/4 bg-slate-100 rounded" />
              </div>
            ))}
          </div>
        ) : notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400">
            <DocumentTextIcon className="w-10 h-10 mb-3 text-slate-300" />
            <p className="text-sm font-medium">Sin notas</p>
            <p className="text-xs mt-1">Crea tu primera nota</p>
          </div>
        ) : (
          notes.map((note: any) => (
            <div key={note.id} className="p-3.5 rounded-xl border border-slate-100 bg-white/80 hover:border-slate-200 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  {note.title && <p className="text-sm font-medium text-slate-800 mb-1">{note.title}</p>}
                  <p className="text-sm text-slate-600 line-clamp-3">{note.body}</p>
                </div>
                {note.target_type && (
                  <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">
                    {targetLabel(note.target_type)}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-2">
                {note.created_at ? new Date(note.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
