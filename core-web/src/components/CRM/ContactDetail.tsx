import { useState } from 'react';
import {
  XMarkIcon,
  PencilIcon,
  TrashIcon,
  EnvelopeIcon,
  PhoneIcon,
  BuildingOfficeIcon,
  BriefcaseIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import { toast } from 'sonner';
import { updateCrmContact, deleteCrmContact } from '../../api/client';
import { useCrmStore } from '../../stores/crmStore';
import TimelinePanel from './TimelinePanel';

interface ContactDetailProps {
  contact: any;
  workspaceId: string;
  onClose: () => void;
}

export default function ContactDetail({ contact, workspaceId, onClose }: ContactDetailProps) {
  const { fetchContacts, setSelectedContact } = useCrmStore();
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({
    first_name: contact.first_name || '',
    last_name: contact.last_name || '',
    email: contact.email || '',
    phone: contact.phone || '',
    job_title: contact.job_title || '',
  });
  const [saving, setSaving] = useState(false);

  const fullName = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || 'Sin nombre';

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateCrmContact(contact.id, editData);
      toast.success('Contacto actualizado');
      setIsEditing(false);
      fetchContacts(workspaceId);
      setSelectedContact({ ...contact, ...editData });
    } catch (err: any) {
      toast.error(err.message || 'Error al actualizar');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Seguro que quieres eliminar este contacto?')) return;
    try {
      await deleteCrmContact(contact.id);
      toast.success('Contacto eliminado');
      setSelectedContact(null);
      fetchContacts(workspaceId);
    } catch (err: any) {
      toast.error(err.message || 'Error al eliminar');
    }
  };

  return (
    <div className="flex flex-col h-full bg-white/60">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200/60">
        <h3 className="text-sm font-semibold text-slate-800 truncate">{fullName}</h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsEditing(!isEditing)}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
            title="Editar"
          >
            <PencilIcon className="w-4 h-4" />
          </button>
          <button
            onClick={handleDelete}
            className="p-1.5 rounded-lg hover:bg-red-50 text-slate-500 hover:text-red-500 transition-colors"
            title="Eliminar"
          >
            <TrashIcon className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-4 py-4 space-y-5">
        {/* Contact Info */}
        {isEditing ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <input
                value={editData.first_name}
                onChange={(e) => setEditData({ ...editData, first_name: e.target.value })}
                placeholder="Nombre"
                className="px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
              <input
                value={editData.last_name}
                onChange={(e) => setEditData({ ...editData, last_name: e.target.value })}
                placeholder="Apellido"
                className="px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
            <input
              value={editData.email}
              onChange={(e) => setEditData({ ...editData, email: e.target.value })}
              placeholder="Email"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
            <input
              value={editData.phone}
              onChange={(e) => setEditData({ ...editData, phone: e.target.value })}
              placeholder="Telefono"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
            <input
              value={editData.job_title}
              onChange={(e) => setEditData({ ...editData, job_title: e.target.value })}
              placeholder="Cargo"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setIsEditing(false)}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            {contact.email && (
              <div className="flex items-center gap-2.5 text-sm">
                <EnvelopeIcon className="w-4 h-4 text-slate-400 shrink-0" />
                <a href={`mailto:${contact.email}`} className="text-blue-600 hover:underline truncate">{contact.email}</a>
              </div>
            )}
            {contact.phone && (
              <div className="flex items-center gap-2.5 text-sm">
                <PhoneIcon className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="text-slate-700">{contact.phone}</span>
              </div>
            )}
            {contact.company_name && (
              <div className="flex items-center gap-2.5 text-sm">
                <BuildingOfficeIcon className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="text-slate-700">{contact.company_name}</span>
              </div>
            )}
            {contact.job_title && (
              <div className="flex items-center gap-2.5 text-sm">
                <BriefcaseIcon className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="text-slate-700">{contact.job_title}</span>
              </div>
            )}
          </div>
        )}

        {/* AI Relationship Summary */}
        {contact.ai_summary && (
          <div className="rounded-xl border border-purple-200/60 bg-gradient-to-br from-purple-50/80 to-blue-50/60 p-3.5">
            <div className="flex items-center gap-2 mb-2">
              <SparklesIcon className="w-4 h-4 text-purple-500" />
              <span className="text-xs font-semibold text-purple-700 uppercase tracking-wider">Resumen IA</span>
            </div>
            <p className="text-sm text-slate-700 leading-relaxed">{contact.ai_summary}</p>
          </div>
        )}

        {/* Timeline */}
        <div>
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Actividad</h4>
          <TimelinePanel entityType="contact" entityId={contact.id} />
        </div>
      </div>
    </div>
  );
}
