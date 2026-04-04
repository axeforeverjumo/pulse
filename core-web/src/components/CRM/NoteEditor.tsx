import { useState } from 'react';
import { toast } from 'sonner';
import { createCrmNote } from '../../api/client';

interface NoteEditorProps {
  workspaceId: string;
  targetType?: string;
  targetId?: string;
  onSaved?: () => void;
}

export default function NoteEditor({ workspaceId, targetType, targetId, onSaved }: NoteEditorProps) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [selectedTargetType, setSelectedTargetType] = useState(targetType || 'contact');
  const [selectedTargetId, setSelectedTargetId] = useState(targetId || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!body.trim()) {
      toast.error('El contenido de la nota es obligatorio');
      return;
    }
    setSaving(true);
    try {
      await createCrmNote({
        workspace_id: workspaceId,
        title: title.trim() || undefined,
        body: body.trim(),
        target_type: selectedTargetType,
        target_id: selectedTargetId || undefined,
      });
      toast.success('Nota guardada');
      setTitle('');
      setBody('');
      onSaved?.();
    } catch (err: any) {
      toast.error(err.message || 'Error al guardar la nota');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <input
        type="text"
        placeholder="Titulo (opcional)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white/80 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 transition-colors placeholder:text-slate-400"
      />

      <textarea
        placeholder="Escribe tu nota..."
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white/80 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 transition-colors resize-none placeholder:text-slate-400"
      />

      {!targetType && (
        <div className="flex gap-2">
          <select
            value={selectedTargetType}
            onChange={(e) => setSelectedTargetType(e.target.value)}
            className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white/80 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
          >
            <option value="contact">Contacto</option>
            <option value="company">Empresa</option>
            <option value="opportunity">Oportunidad</option>
          </select>
          <input
            type="text"
            placeholder="ID de entidad"
            value={selectedTargetId}
            onChange={(e) => setSelectedTargetId(e.target.value)}
            className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white/80 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 placeholder:text-slate-400"
          />
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving || !body.trim()}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? 'Guardando...' : 'Guardar nota'}
        </button>
      </div>
    </div>
  );
}
