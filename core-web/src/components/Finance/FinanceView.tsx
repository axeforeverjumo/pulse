import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { PlusIcon } from '@heroicons/react/24/outline';
import { api } from '../../api/client';
import { toast } from 'sonner';
import ViewTopBar from '../ui/ViewTopBar';
import Modal from '../Modal/Modal';

interface ModuleDocument {
  id: string;
  module: string;
  doc_type: string;
  title: string;
  description?: string;
  status: string;
  amount?: number;
  currency: string;
  due_date?: string;
  created_at: string;
}

interface FinanceSummary {
  invoices_total: number;
  invoices_paid: number;
  invoices_pending: number;
  budgets_total: number;
  budgets_accepted: number;
  total_documents: number;
}

const statusLabels: Record<string, string> = {
  draft: 'Borrador',
  sent: 'Enviado',
  accepted: 'Aceptado',
  rejected: 'Rechazado',
  paid: 'Pagado',
  cancelled: 'Cancelado',
};

const statusColors: Record<string, string> = {
  draft: 'bg-bg-gray text-text-tertiary',
  sent: 'bg-blue-500/10 text-blue-600',
  accepted: 'bg-green-500/10 text-green-600',
  rejected: 'bg-red-500/10 text-red-600',
  paid: 'bg-emerald-500/10 text-emerald-700',
  cancelled: 'bg-bg-gray text-text-tertiary line-through',
};

export default function FinanceView() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [budgets, setBudgets] = useState<ModuleDocument[]>([]);
  const [invoices, setInvoices] = useState<ModuleDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createType, setCreateType] = useState<'budget' | 'invoice'>('budget');
  const [formTitle, setFormTitle] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [creating, setCreating] = useState(false);

  const loadData = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const [summaryData, budgetData, invoiceData] = await Promise.all([
        api<FinanceSummary>(`/finance/workspaces/${workspaceId}/summary`),
        api<{ documents: ModuleDocument[] }>(`/finance/workspaces/${workspaceId}/documents?module=finance&doc_type=budget`),
        api<{ documents: ModuleDocument[] }>(`/finance/workspaces/${workspaceId}/documents?module=finance&doc_type=invoice`),
      ]);
      setSummary(summaryData);
      setBudgets(budgetData.documents);
      setInvoices(invoiceData.documents);
    } catch (e) {
      console.error('Failed to load finance data:', e);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleCreate = async () => {
    if (!workspaceId || !formTitle.trim()) return;
    setCreating(true);
    try {
      await api(`/finance/workspaces/${workspaceId}/documents`, {
        method: 'POST',
        body: JSON.stringify({
          module: 'finance',
          doc_type: createType,
          title: formTitle.trim(),
          description: formDesc.trim() || undefined,
          amount: formAmount ? parseFloat(formAmount) : undefined,
        }),
      });
      toast.success(`${createType === 'budget' ? 'Presupuesto' : 'Factura'} creado`);
      setShowCreate(false);
      setFormTitle('');
      setFormAmount('');
      setFormDesc('');
      loadData();
    } catch (e: any) {
      toast.error(e.message || 'Error al crear documento');
    } finally {
      setCreating(false);
    }
  };

  const handleStatusChange = async (docId: string, newStatus: string) => {
    try {
      await api(`/finance/documents/${docId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      toast.success(`Estado actualizado a ${statusLabels[newStatus]}`);
      loadData();
    } catch (e: any) {
      toast.error(e.message || 'Error');
    }
  };

  const fmt = (n?: number) => n != null ? `€${n.toLocaleString('es-ES', { minimumFractionDigits: 2 })}` : '€0';

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      <ViewTopBar
        title="Finanzas"
        pill={{ label: `${summary?.total_documents || 0} docs`, color: 'green' }}
        cta={{
          label: 'Nuevo',
          icon: <PlusIcon className="w-3.5 h-3.5" />,
          onClick: () => { setCreateType('budget'); setShowCreate(true); },
        }}
      />

      <div className="flex-1 overflow-auto p-5">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <div className="p-4 rounded-xl border border-border-light bg-bg-white">
            <p className="text-[10px] text-text-tertiary mb-1.5">Facturado total</p>
            <p className="text-xl font-bold text-green-500">{fmt(summary?.invoices_total)}</p>
            <p className="text-[9.5px] text-text-tertiary mt-0.5">{fmt(summary?.invoices_paid)} cobrado</p>
          </div>
          <div className="p-4 rounded-xl border border-border-light bg-bg-white">
            <p className="text-[10px] text-text-tertiary mb-1.5">Pendiente de cobro</p>
            <p className="text-xl font-bold text-amber-500">{fmt(summary?.invoices_pending)}</p>
            <p className="text-[9.5px] text-text-tertiary mt-0.5">Facturas enviadas</p>
          </div>
          <div className="p-4 rounded-xl border border-border-light bg-bg-white">
            <p className="text-[10px] text-text-tertiary mb-1.5">Presupuestos</p>
            <p className="text-xl font-bold text-text-dark">{fmt(summary?.budgets_total)}</p>
            <p className="text-[9.5px] text-text-tertiary mt-0.5">{fmt(summary?.budgets_accepted)} aceptados</p>
          </div>
          <div className="p-4 rounded-xl border border-border-light bg-bg-white">
            <p className="text-[10px] text-text-tertiary mb-1.5">Documentos</p>
            <p className="text-xl font-bold text-brand-primary">{summary?.total_documents || 0}</p>
            <p className="text-[9.5px] text-text-tertiary mt-0.5">Total en el modulo</p>
          </div>
        </div>

        {/* Document lists */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* Budgets */}
          <div className="p-4 rounded-xl border border-border-light bg-bg-white">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[12px] font-semibold text-text-dark flex items-center gap-2">
                <span>📄</span> Presupuestos
              </h3>
              <button
                onClick={() => { setCreateType('budget'); setShowCreate(true); }}
                className="text-[10px] text-brand-primary hover:underline"
              >
                + Nuevo
              </button>
            </div>
            {loading ? (
              <p className="text-[11px] text-text-tertiary text-center py-4">Cargando...</p>
            ) : budgets.length === 0 ? (
              <p className="text-[11px] text-text-tertiary text-center py-6">Sin presupuestos. Crea uno o pide al agente que lo haga.</p>
            ) : (
              <div className="space-y-1.5">
                {budgets.map((doc) => (
                  <DocRow key={doc.id} doc={doc} onStatusChange={handleStatusChange} />
                ))}
              </div>
            )}
          </div>

          {/* Invoices */}
          <div className="p-4 rounded-xl border border-border-light bg-bg-white">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[12px] font-semibold text-text-dark flex items-center gap-2">
                <span>🧾</span> Facturas
              </h3>
              <button
                onClick={() => { setCreateType('invoice'); setShowCreate(true); }}
                className="text-[10px] text-brand-primary hover:underline"
              >
                + Nueva
              </button>
            </div>
            {loading ? (
              <p className="text-[11px] text-text-tertiary text-center py-4">Cargando...</p>
            ) : invoices.length === 0 ? (
              <p className="text-[11px] text-text-tertiary text-center py-6">Sin facturas. Crea una o pide al agente que lo haga.</p>
            ) : (
              <div className="space-y-1.5">
                {invoices.map((doc) => (
                  <DocRow key={doc.id} doc={doc} onStatusChange={handleStatusChange} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create modal */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title={createType === 'budget' ? 'Nuevo presupuesto' : 'Nueva factura'}>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-text-secondary block mb-1">Titulo</label>
            <input
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              placeholder={createType === 'budget' ? 'Presupuesto SEO Q2' : 'Factura #001'}
              className="w-full px-3 py-2 text-sm rounded-lg border border-border-light bg-bg-white text-text-dark focus:outline-none focus:border-brand-primary"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary block mb-1">Importe (EUR)</label>
            <input
              type="number"
              value={formAmount}
              onChange={(e) => setFormAmount(e.target.value)}
              placeholder="0.00"
              className="w-full px-3 py-2 text-sm rounded-lg border border-border-light bg-bg-white text-text-dark focus:outline-none focus:border-brand-primary"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary block mb-1">Descripcion</label>
            <textarea
              value={formDesc}
              onChange={(e) => setFormDesc(e.target.value)}
              rows={2}
              placeholder="Detalles opcionales..."
              className="w-full px-3 py-2 text-sm rounded-lg border border-border-light bg-bg-white text-text-dark focus:outline-none focus:border-brand-primary resize-none"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setShowCreate(false)} className="px-3 py-1.5 text-sm text-text-secondary hover:text-text-dark">
              Cancelar
            </button>
            <button
              onClick={handleCreate}
              disabled={!formTitle.trim() || creating}
              className="px-4 py-1.5 text-sm font-medium bg-brand-primary text-white rounded-lg hover:opacity-90 disabled:opacity-50"
            >
              {creating ? 'Creando...' : 'Crear'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function DocRow({ doc, onStatusChange }: { doc: ModuleDocument; onStatusChange: (id: string, status: string) => void }) {
  const nextStatus: Record<string, string> = {
    draft: 'sent',
    sent: 'accepted',
    accepted: 'paid',
  };
  const next = nextStatus[doc.status];

  return (
    <div className="flex items-center justify-between p-2.5 rounded-lg border border-border-light hover:border-border-gray transition-colors">
      <div className="min-w-0">
        <p className="text-[12px] font-medium text-text-dark truncate">{doc.title}</p>
        {doc.description && <p className="text-[10px] text-text-tertiary truncate">{doc.description}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0 ml-2">
        {doc.amount != null && (
          <span className="text-[11px] font-bold text-text-dark">
            €{doc.amount.toLocaleString('es-ES', { minimumFractionDigits: 2 })}
          </span>
        )}
        <span className={`text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${statusColors[doc.status] || ''}`}>
          {statusLabels[doc.status] || doc.status}
        </span>
        {next && (
          <button
            onClick={() => onStatusChange(doc.id, next)}
            className="text-[9px] text-brand-primary hover:underline"
          >
            → {statusLabels[next]}
          </button>
        )}
      </div>
    </div>
  );
}
