import { useState, useEffect } from 'react';
import {
  XMarkIcon,
  PencilIcon,
  TrashIcon,
  GlobeAltIcon,
  BuildingOfficeIcon,
  UsersIcon,
  CurrencyDollarIcon,
} from '@heroicons/react/24/outline';
import { toast } from 'sonner';
import { updateCrmCompany, deleteCrmCompany, getCrmContacts, getCrmNotes } from '../../api/client';
import { useCrmStore } from '../../stores/crmStore';
import TimelinePanel from './TimelinePanel';
import NoteEditor from './NoteEditor';

interface CompanyDetailProps {
  company: any;
  workspaceId: string;
  onClose: () => void;
}

export default function CompanyDetail({ company, workspaceId, onClose }: CompanyDetailProps) {
  const { fetchCompanies, setSelectedCompany, setSelectedContact } = useCrmStore();
  const [companyContacts, setCompanyContacts] = useState<any[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({
    name: company.name || '',
    domain: company.domain || '',
    industry: company.industry || '',
  });
  const [saving, setSaving] = useState(false);
  const [showNoteEditor, setShowNoteEditor] = useState(false);

  useEffect(() => {
    // Load contacts for this company
    if (company.id) {
      getCrmContacts(workspaceId, company.name)
        .then((data) => setCompanyContacts(data.contacts || []))
        .catch(() => setCompanyContacts([]));
      getCrmNotes(workspaceId, 'company', company.id)
        .then((data) => setNotes(data.notes || []))
        .catch(() => setNotes([]));
    }
  }, [company.id, company.name, workspaceId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateCrmCompany(company.id, editData);
      toast.success('Empresa actualizada');
      setIsEditing(false);
      fetchCompanies(workspaceId);
      setSelectedCompany({ ...company, ...editData });
    } catch (err: any) {
      toast.error(err.message || 'Error al actualizar');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Seguro que quieres eliminar esta empresa?')) return;
    try {
      await deleteCrmCompany(company.id);
      toast.success('Empresa eliminada');
      setSelectedCompany(null);
      fetchCompanies(workspaceId);
    } catch (err: any) {
      toast.error(err.message || 'Error al eliminar');
    }
  };

  return (
    <div className="flex flex-col h-full bg-white/60">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200/60">
        <div className="flex items-center gap-2">
          <BuildingOfficeIcon className="w-5 h-5 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-800 truncate">{company.name}</h3>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setIsEditing(!isEditing)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors" title="Editar">
            <PencilIcon className="w-4 h-4" />
          </button>
          <button onClick={handleDelete} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-500 hover:text-red-500 transition-colors" title="Eliminar">
            <TrashIcon className="w-4 h-4" />
          </button>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-4 py-4 space-y-5">
        {/* Company Info */}
        {isEditing ? (
          <div className="space-y-3">
            <input value={editData.name} onChange={(e) => setEditData({ ...editData, name: e.target.value })} placeholder="Nombre" className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200" />
            <input value={editData.domain} onChange={(e) => setEditData({ ...editData, domain: e.target.value })} placeholder="Dominio" className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200" />
            <input value={editData.industry} onChange={(e) => setEditData({ ...editData, industry: e.target.value })} placeholder="Industria" className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setIsEditing(false)} className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">Cancelar</button>
              <button onClick={handleSave} disabled={saving} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 transition-colors">{saving ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            {company.domain && (
              <div className="flex items-center gap-2.5 text-sm">
                <GlobeAltIcon className="w-4 h-4 text-slate-400 shrink-0" />
                <a href={`https://${company.domain}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{company.domain}</a>
              </div>
            )}
            {company.industry && (
              <div className="flex items-center gap-2.5 text-sm">
                <BuildingOfficeIcon className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="text-slate-700">{company.industry}</span>
              </div>
            )}
            {company.employee_count && (
              <div className="flex items-center gap-2.5 text-sm">
                <UsersIcon className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="text-slate-700">{company.employee_count} empleados</span>
              </div>
            )}
            {company.revenue && (
              <div className="flex items-center gap-2.5 text-sm">
                <CurrencyDollarIcon className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="text-slate-700">${Number(company.revenue).toLocaleString()}</span>
              </div>
            )}
          </div>
        )}

        {/* Contacts at this company */}
        {companyContacts.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Contactos</h4>
            <div className="space-y-1">
              {companyContacts.map((c: any) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedContact(c)}
                  className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 text-left transition-colors"
                >
                  <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-xs font-medium shrink-0">
                    {(c.first_name?.[0] || c.email?.[0] || 'U').toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">
                      {[c.first_name, c.last_name].filter(Boolean).join(' ') || c.email}
                    </p>
                    <p className="text-xs text-slate-500 truncate">{c.job_title || c.email || ''}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Notas</h4>
            <button onClick={() => setShowNoteEditor(!showNoteEditor)} className="text-xs text-blue-600 hover:underline">
              {showNoteEditor ? 'Cerrar' : '+ Agregar nota'}
            </button>
          </div>
          {showNoteEditor && (
            <div className="mb-3">
              <NoteEditor
                workspaceId={workspaceId}
                targetType="company"
                targetId={company.id}
                onSaved={() => {
                  setShowNoteEditor(false);
                  getCrmNotes(workspaceId, 'company', company.id)
                    .then((data) => setNotes(data.notes || []))
                    .catch(() => {});
                }}
              />
            </div>
          )}
          {notes.length > 0 ? (
            <div className="space-y-2">
              {notes.map((note: any) => (
                <div key={note.id} className="p-3 rounded-lg border border-slate-100 bg-white/80">
                  {note.title && <p className="text-sm font-medium text-slate-800 mb-1">{note.title}</p>}
                  <p className="text-sm text-slate-600">{note.body}</p>
                  <p className="text-xs text-slate-400 mt-1.5">
                    {note.created_at ? new Date(note.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                  </p>
                </div>
              ))}
            </div>
          ) : !showNoteEditor ? (
            <p className="text-xs text-slate-400">Sin notas</p>
          ) : null}
        </div>

        {/* Timeline */}
        <div>
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Actividad</h4>
          <TimelinePanel entityType="company" entityId={company.id} />
        </div>
      </div>
    </div>
  );
}
