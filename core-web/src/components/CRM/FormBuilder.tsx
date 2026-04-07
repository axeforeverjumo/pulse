import { useState, useEffect, useCallback } from 'react';
import {
  PlusIcon,
  TrashIcon,
  GlobeAltIcon,
  EyeIcon,
  DocumentDuplicateIcon,
} from '@heroicons/react/24/outline';
import { getCrmForms, createCrmForm, updateCrmForm, deleteCrmForm, getCrmForm } from '../../api/client';
import { toast } from 'sonner';

interface FormBuilderProps {
  workspaceId: string;
}

interface FormField {
  name: string;
  type: 'text' | 'email' | 'tel' | 'textarea' | 'select';
  label: string;
  required: boolean;
  options?: string[];
}

const DEFAULT_FIELDS: FormField[] = [
  { name: 'nombre', type: 'text', label: 'Nombre', required: true },
  { name: 'email', type: 'email', label: 'Email', required: true },
  { name: 'telefono', type: 'tel', label: 'Teléfono', required: false },
  { name: 'mensaje', type: 'textarea', label: 'Mensaje', required: false },
];

export default function FormBuilder({ workspaceId }: FormBuilderProps) {
  const [forms, setForms] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [fields, setFields] = useState<FormField[]>([...DEFAULT_FIELDS]);
  const [thankYou, setThankYou] = useState('Gracias por tu interés.');
  const [isPublished, setIsPublished] = useState(false);
  const [createOpp, setCreateOpp] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchForms = useCallback(async () => {
    try {
      const data = await getCrmForms(workspaceId);
      setForms(data.forms || []);
    } catch {}
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => { fetchForms(); }, [fetchForms]);

  const handleSelect = async (id: string) => {
    try {
      const data = await getCrmForm(id);
      const f = data.form;
      setSelectedId(id);
      setName(f.name);
      setSlug(f.slug);
      setFields(f.fields || DEFAULT_FIELDS);
      setThankYou(f.thank_you_message || '');
      setIsPublished(f.is_published);
      setCreateOpp(f.create_opportunity);
    } catch { toast.error('Error al cargar formulario'); }
  };

  const handleNew = () => {
    setSelectedId(null);
    setName('');
    setSlug('');
    setFields([...DEFAULT_FIELDS]);
    setThankYou('Gracias por tu interés.');
    setIsPublished(false);
    setCreateOpp(true);
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Nombre requerido'); return; }
    setSaving(true);
    try {
      const data = { workspace_id: workspaceId, name, slug: slug || undefined, fields, thank_you_message: thankYou, is_published: isPublished, create_opportunity: createOpp };
      if (selectedId) {
        await updateCrmForm(selectedId, data);
        toast.success('Formulario actualizado');
      } else {
        const result = await createCrmForm(data);
        setSelectedId(result.form.id);
        setSlug(result.form.slug);
        toast.success('Formulario creado');
      }
      fetchForms();
    } catch (err: any) { toast.error(err.message || 'Error'); }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!selectedId) return;
    try { await deleteCrmForm(selectedId); handleNew(); fetchForms(); toast.success('Eliminado'); }
    catch { toast.error('Error'); }
  };

  const addField = () => setFields([...fields, { name: '', type: 'text', label: '', required: false }]);
  const removeField = (i: number) => setFields(fields.filter((_, idx) => idx !== i));
  const updateField = (i: number, partial: Partial<FormField>) => setFields(fields.map((f, idx) => idx === i ? { ...f, ...partial } : f));

  const publicUrl = slug ? `${window.location.origin}/api/crm/public/forms/${workspaceId}/${slug}` : '';

  if (loading) return <div className="p-6 text-sm text-slate-400">Cargando formularios...</div>;

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div className="w-56 shrink-0 border-r border-slate-200 flex flex-col">
        <div className="p-3 border-b border-slate-100">
          <button onClick={handleNew} className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl bg-emerald-600 text-white hover:bg-emerald-700">
            <PlusIcon className="w-3.5 h-3.5" /> Nuevo formulario
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {forms.map((f) => (
            <button key={f.id} onClick={() => handleSelect(f.id)}
              className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${selectedId === f.id ? 'bg-emerald-50 text-emerald-700 font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}>
              <div className="flex items-center gap-1.5">
                {f.is_published ? <GlobeAltIcon className="w-3 h-3 text-emerald-500" /> : <EyeIcon className="w-3 h-3 text-slate-400" />}
                <span className="truncate">{f.name}</span>
              </div>
              <span className="text-[10px] text-slate-400">{f.submission_count || 0} envios</span>
            </button>
          ))}
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        <div className="flex items-center justify-between">
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre del formulario..."
            className="text-lg font-semibold text-slate-900 bg-transparent border-none focus:outline-none flex-1 placeholder:text-slate-300" />
          <div className="flex items-center gap-2">
            {selectedId && (
              <button onClick={handleDelete} className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg"><TrashIcon className="w-4 h-4" /></button>
            )}
            <button onClick={handleSave} disabled={saving} className="px-4 py-1.5 text-xs font-medium rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>

        {/* Settings */}
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
            <input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} className="rounded text-emerald-600" />
            Publicado
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
            <input type="checkbox" checked={createOpp} onChange={(e) => setCreateOpp(e.target.checked)} className="rounded text-emerald-600" />
            Crear oportunidad
          </label>
        </div>

        {/* Public URL */}
        {slug && (
          <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
            <GlobeAltIcon className="w-4 h-4 text-slate-400 shrink-0" />
            <code className="text-[11px] text-slate-600 truncate flex-1">{publicUrl}</code>
            <button onClick={() => { navigator.clipboard.writeText(publicUrl); toast.success('URL copiada'); }}
              className="p-1 rounded hover:bg-slate-200"><DocumentDuplicateIcon className="w-3.5 h-3.5 text-slate-500" /></button>
          </div>
        )}

        {/* Fields editor */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Campos del formulario</h3>
          {fields.map((field, i) => (
            <div key={i} className="flex items-center gap-2 p-2 bg-slate-50 rounded-xl">
              <input type="text" value={field.label} onChange={(e) => updateField(i, { label: e.target.value, name: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                placeholder="Label" className="flex-1 text-xs px-2 py-1.5 rounded-lg border border-slate-200 bg-white" />
              <select value={field.type} onChange={(e) => updateField(i, { type: e.target.value as any })}
                className="text-xs px-2 py-1.5 rounded-lg border border-slate-200 bg-white">
                <option value="text">Texto</option>
                <option value="email">Email</option>
                <option value="tel">Teléfono</option>
                <option value="textarea">Texto largo</option>
                <option value="select">Selección</option>
              </select>
              <label className="flex items-center gap-1 text-[10px] text-slate-500">
                <input type="checkbox" checked={field.required} onChange={(e) => updateField(i, { required: e.target.checked })} className="rounded text-emerald-600" />
                Req
              </label>
              <button onClick={() => removeField(i)} className="p-1 text-red-400 hover:bg-red-50 rounded"><TrashIcon className="w-3.5 h-3.5" /></button>
            </div>
          ))}
          <button onClick={addField} className="w-full py-2 text-xs font-medium text-emerald-600 border-2 border-dashed border-emerald-200 rounded-xl hover:bg-emerald-50">
            <PlusIcon className="w-4 h-4 inline mr-1" />Agregar campo
          </button>
        </div>

        <textarea value={thankYou} onChange={(e) => setThankYou(e.target.value)} placeholder="Mensaje de agradecimiento..."
          rows={2} className="w-full text-sm px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-300 resize-none" />
      </div>
    </div>
  );
}
