import { useState, useEffect, useCallback } from 'react';
import { PlusIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import { getCrmQuotations, createCrmQuotation } from '../../api/client';
import { toast } from 'sonner';

interface QuotationsListProps {
  workspaceId: string;
  opportunityId?: string;
  onSelect: (quotation: any) => void;
}

const statusLabels: Record<string, string> = {
  draft: 'Borrador',
  sent: 'Enviado',
  accepted: 'Aceptado',
  rejected: 'Rechazado',
  cancelled: 'Cancelado',
};

const statusColors: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  sent: 'bg-blue-100 text-blue-700',
  accepted: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
  cancelled: 'bg-slate-100 text-slate-400',
};

export default function QuotationsList({ workspaceId, opportunityId, onSelect }: QuotationsListProps) {
  const [quotations, setQuotations] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadQuotations = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getCrmQuotations(workspaceId, opportunityId);
      setQuotations(data.quotations || []);
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId, opportunityId]);

  useEffect(() => {
    loadQuotations();
  }, [loadQuotations]);

  const handleCreate = async () => {
    try {
      const data: any = { workspace_id: workspaceId };
      if (opportunityId) data.opportunity_id = opportunityId;
      const result = await createCrmQuotation(data);
      toast.success('Presupuesto creado');
      onSelect(result.quotation);
      loadQuotations();
    } catch (err: any) {
      toast.error(err.message || 'Error al crear presupuesto');
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(price || 0);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  if (isLoading && quotations.length === 0) {
    return (
      <div className="space-y-2 p-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-16 bg-slate-100 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-700">Presupuestos</h3>
        <button
          onClick={handleCreate}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-colors"
        >
          <PlusIcon className="w-4 h-4" />
          Nuevo
        </button>
      </div>

      {quotations.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 p-8 text-center">
          <DocumentTextIcon className="w-10 h-10 text-slate-300 mb-2" />
          <p className="text-sm text-slate-500 mb-1">Sin presupuestos</p>
          <p className="text-xs text-slate-400">Crea un presupuesto para esta oportunidad</p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto divide-y divide-slate-50">
          {quotations.map((q) => (
            <button
              key={q.id}
              onClick={() => onSelect(q)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50/50 transition-colors text-left"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-900">{q.quotation_number || 'Borrador'}</span>
                  <span className={`inline-flex px-2 py-0.5 text-[10px] font-medium rounded-full ${statusColors[q.status] || statusColors.draft}`}>
                    {statusLabels[q.status] || q.status}
                  </span>
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  {formatDate(q.created_at)}
                </div>
              </div>
              <div className="text-sm font-semibold text-slate-900">
                {formatPrice(q.total)}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
