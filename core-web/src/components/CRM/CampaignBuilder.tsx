import { useState, useEffect, useCallback } from 'react';
import {
  PlusIcon,
  TrashIcon,
  PaperAirplaneIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline';
import { getCrmCampaigns, createCrmCampaign, updateCrmCampaign, deleteCrmCampaign, getCrmCampaign, populateCampaignRecipients, sendCrmCampaign } from '../../api/client';
import { toast } from 'sonner';

interface CampaignBuilderProps {
  workspaceId: string;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: 'Borrador', color: 'bg-slate-100 text-slate-600' },
  scheduled: { label: 'Programada', color: 'bg-blue-100 text-blue-700' },
  sending: { label: 'Enviando', color: 'bg-amber-100 text-amber-700' },
  sent: { label: 'Enviada', color: 'bg-emerald-100 text-emerald-700' },
  cancelled: { label: 'Cancelada', color: 'bg-red-100 text-red-600' },
};

export default function CampaignBuilder({ workspaceId }: CampaignBuilderProps) {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [campaignStatus, setCampaignStatus] = useState('draft');
  const [stats, setStats] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const fetchCampaigns = useCallback(async () => {
    try {
      const data = await getCrmCampaigns(workspaceId);
      setCampaigns(data.campaigns || []);
    } catch {}
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => { fetchCampaigns(); }, [fetchCampaigns]);

  const handleSelect = async (id: string) => {
    try {
      const data = await getCrmCampaign(id);
      const c = data.campaign;
      setSelectedId(id);
      setName(c.name);
      setSubject(c.subject || '');
      setBodyHtml(c.body_html || '');
      setFilterTags(c.filter_tags || []);
      setCampaignStatus(c.status);
      setStats(c.recipient_stats || null);
    } catch { toast.error('Error al cargar campaña'); }
  };

  const handleNew = () => {
    setSelectedId(null);
    setName('');
    setSubject('');
    setBodyHtml('');
    setFilterTags([]);
    setCampaignStatus('draft');
    setStats(null);
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Nombre requerido'); return; }
    setSaving(true);
    try {
      const data = { workspace_id: workspaceId, name, subject, body_html: bodyHtml, filter_tags: filterTags };
      if (selectedId) {
        await updateCrmCampaign(selectedId, data);
        toast.success('Campaña actualizada');
      } else {
        const result = await createCrmCampaign(data);
        setSelectedId(result.campaign.id);
        toast.success('Campaña creada');
      }
      fetchCampaigns();
    } catch (err: any) { toast.error(err.message || 'Error'); }
    setSaving(false);
  };

  const handlePopulate = async () => {
    if (!selectedId) return;
    try {
      const result = await populateCampaignRecipients(selectedId, workspaceId);
      toast.success(`${result.recipients_added} destinatarios añadidos`);
      handleSelect(selectedId);
    } catch { toast.error('Error al poblar destinatarios'); }
  };

  const handleSend = async () => {
    if (!selectedId) return;
    try {
      const result = await sendCrmCampaign(selectedId);
      toast.success(`Campaña enviada: ${result.sent} emails`);
      handleSelect(selectedId);
      fetchCampaigns();
    } catch { toast.error('Error al enviar'); }
  };

  const handleDelete = async () => {
    if (!selectedId) return;
    try {
      await deleteCrmCampaign(selectedId);
      handleNew();
      fetchCampaigns();
      toast.success('Campaña eliminada');
    } catch { toast.error('Error al eliminar'); }
  };

  if (loading) return <div className="p-6 text-sm text-slate-400">Cargando campañas...</div>;

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div className="w-56 shrink-0 border-r border-slate-200 flex flex-col">
        <div className="p-3 border-b border-slate-100">
          <button onClick={handleNew} className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors">
            <PlusIcon className="w-3.5 h-3.5" /> Nueva campaña
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {campaigns.map((c) => {
            const st = STATUS_LABELS[c.status] || STATUS_LABELS.draft;
            return (
              <button key={c.id} onClick={() => handleSelect(c.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${selectedId === c.id ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}>
                <span className="truncate block">{c.name}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        <div className="flex items-center justify-between">
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre de la campaña..."
            className="text-lg font-semibold text-slate-900 bg-transparent border-none focus:outline-none flex-1 placeholder:text-slate-300" />
          <div className="flex items-center gap-2">
            {selectedId && campaignStatus === 'draft' && (
              <button onClick={handleDelete} className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg"><TrashIcon className="w-4 h-4" /></button>
            )}
            <button onClick={handleSave} disabled={saving} className="px-4 py-1.5 text-xs font-medium rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>

        <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Asunto del email..."
          className="w-full text-sm px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-300" />

        <textarea value={bodyHtml} onChange={(e) => setBodyHtml(e.target.value)} placeholder="Cuerpo del email (HTML o texto)..."
          rows={10} className="w-full text-sm px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-300 resize-none font-mono" />

        {/* Actions */}
        {selectedId && campaignStatus === 'draft' && (
          <div className="flex gap-2">
            <button onClick={handlePopulate} className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200">
              <UserGroupIcon className="w-4 h-4" /> Poblar destinatarios
            </button>
            <button onClick={handleSend} className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-xl bg-emerald-600 text-white hover:bg-emerald-700">
              <PaperAirplaneIcon className="w-4 h-4" /> Enviar campaña
            </button>
          </div>
        )}

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-4 gap-3">
            {Object.entries(stats).map(([status, count]) => (
              <div key={status} className="bg-slate-50 rounded-xl p-3 text-center">
                <div className="text-lg font-bold text-slate-900">{count as number}</div>
                <div className="text-[10px] text-slate-400">{status}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
