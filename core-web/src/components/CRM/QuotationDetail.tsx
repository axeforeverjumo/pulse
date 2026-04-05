import { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeftIcon,
  PlusIcon,
  TrashIcon,
  CheckCircleIcon,
  PaperAirplaneIcon,
  XCircleIcon,
  EyeIcon,
} from '@heroicons/react/24/outline';
import {
  getCrmQuotation,
  updateCrmQuotation,
  addCrmQuotationLine,
  updateCrmQuotationLine,
  deleteCrmQuotationLine,
  getCrmProducts,
} from '../../api/client';
import { toast } from 'sonner';

interface QuotationDetailProps {
  quotationId: string;
  workspaceId: string;
  onBack: () => void;
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

export default function QuotationDetail({ quotationId, workspaceId, onBack }: QuotationDetailProps) {
  const [quotation, setQuotation] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [products, setProducts] = useState<any[]>([]);
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [editingLine, setEditingLine] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<any>({});

  const loadQuotation = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getCrmQuotation(quotationId);
      setQuotation(data.quotation);
    } catch {
      toast.error('Error al cargar presupuesto');
    } finally {
      setIsLoading(false);
    }
  }, [quotationId]);

  const loadProducts = useCallback(async () => {
    try {
      const data = await getCrmProducts(workspaceId);
      setProducts(data.products || []);
    } catch {
      // ignore
    }
  }, [workspaceId]);

  useEffect(() => {
    loadQuotation();
    loadProducts();
  }, [loadQuotation, loadProducts]);

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: quotation?.currency_code || 'EUR',
    }).format(price || 0);
  };

  const handleStatusChange = async (newStatus: string) => {
    try {
      await updateCrmQuotation(quotationId, { status: newStatus });
      toast.success(`Estado cambiado a ${statusLabels[newStatus]}`);
      loadQuotation();
    } catch (err: any) {
      toast.error(err.message || 'Error al cambiar estado');
    }
  };

  const handleAddProduct = async (product: any) => {
    setShowProductPicker(false);
    try {
      await addCrmQuotationLine(quotationId, {
        line_type: 'product',
        product_id: product.id,
        name: product.name,
        description: product.description || '',
        quantity: 1,
        unit_price: product.unit_price || 0,
        unit_of_measure: product.unit_of_measure || 'Unidad',
        tax_rate: product.tax_rate ?? 21,
        discount: 0,
      });
      toast.success('Producto anadido');
      loadQuotation();
    } catch (err: any) {
      toast.error(err.message || 'Error al anadir producto');
    }
  };

  const handleAddSection = async () => {
    try {
      await addCrmQuotationLine(quotationId, {
        line_type: 'section',
        name: 'Nueva seccion',
        quantity: 0,
        unit_price: 0,
      });
      loadQuotation();
    } catch (err: any) {
      toast.error(err.message || 'Error al anadir seccion');
    }
  };

  const handleAddNote = async () => {
    try {
      await addCrmQuotationLine(quotationId, {
        line_type: 'note',
        name: 'Nota',
        description: '',
        quantity: 0,
        unit_price: 0,
      });
      loadQuotation();
    } catch (err: any) {
      toast.error(err.message || 'Error al anadir nota');
    }
  };

  const handleDeleteLine = async (lineId: string) => {
    try {
      await deleteCrmQuotationLine(lineId);
      toast.success('Linea eliminada');
      loadQuotation();
    } catch (err: any) {
      toast.error(err.message || 'Error al eliminar linea');
    }
  };

  const startEditLine = (line: any) => {
    setEditingLine(line.id);
    setEditValues({
      name: line.name || '',
      description: line.description || '',
      quantity: line.quantity || 1,
      unit_price: line.unit_price || 0,
      discount: line.discount || 0,
      tax_rate: line.tax_rate ?? 21,
    });
  };

  const saveEditLine = async () => {
    if (!editingLine) return;
    try {
      await updateCrmQuotationLine(editingLine, editValues);
      setEditingLine(null);
      loadQuotation();
    } catch (err: any) {
      toast.error(err.message || 'Error al actualizar linea');
    }
  };

  const cancelEdit = () => {
    setEditingLine(null);
    setEditValues({});
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <div className="h-14 bg-slate-50 animate-pulse" />
        <div className="flex-1 p-4 space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-12 bg-slate-100 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!quotation) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <p className="text-sm text-slate-500">Presupuesto no encontrado</p>
        <button onClick={onBack} className="mt-2 text-sm text-blue-600 hover:underline">Volver</button>
      </div>
    );
  }

  const lines = quotation.lines || [];
  const isDraft = quotation.status === 'draft';

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b border-slate-100 bg-white">
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={onBack} className="p-1 rounded-lg hover:bg-slate-100">
            <ArrowLeftIcon className="w-5 h-5 text-slate-500" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-slate-900">
                {quotation.quotation_number || 'Nuevo presupuesto'}
              </h2>
              <span className={`inline-flex px-2 py-0.5 text-[10px] font-medium rounded-full ${statusColors[quotation.status] || statusColors.draft}`}>
                {statusLabels[quotation.status] || quotation.status}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
              {quotation.company?.name && <span>{quotation.company.name}</span>}
              {quotation.contact?.name && <span>{quotation.contact.name}</span>}
              {quotation.expiry_date && (
                <span>Vence: {new Date(quotation.expiry_date).toLocaleDateString('es-ES')}</span>
              )}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 px-4 pb-3">
          {isDraft && (
            <>
              <button
                onClick={() => handleStatusChange('sent')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              >
                <PaperAirplaneIcon className="w-3.5 h-3.5" />
                Enviar por email
              </button>
              <button
                onClick={() => handleStatusChange('accepted')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
              >
                <CheckCircleIcon className="w-3.5 h-3.5" />
                Confirmar
              </button>
            </>
          )}
          {quotation.status === 'sent' && (
            <button
              onClick={() => handleStatusChange('accepted')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
            >
              <CheckCircleIcon className="w-3.5 h-3.5" />
              Confirmar
            </button>
          )}
          {(isDraft || quotation.status === 'sent') && (
            <button
              onClick={() => handleStatusChange('cancelled')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <XCircleIcon className="w-3.5 h-3.5" />
              Cancelar
            </button>
          )}
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <EyeIcon className="w-3.5 h-3.5" />
            Vista previa
          </button>
        </div>
      </div>

      {/* Lines table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-50 z-10">
            <tr className="text-left">
              <th className="px-4 py-2 font-medium text-slate-500 text-xs uppercase tracking-wider w-[30%]">Producto</th>
              <th className="px-3 py-2 font-medium text-slate-500 text-xs uppercase tracking-wider text-right w-16">Cant.</th>
              <th className="px-3 py-2 font-medium text-slate-500 text-xs uppercase tracking-wider hidden sm:table-cell w-20">UdM</th>
              <th className="px-3 py-2 font-medium text-slate-500 text-xs uppercase tracking-wider text-right w-24">Precio ud.</th>
              <th className="px-3 py-2 font-medium text-slate-500 text-xs uppercase tracking-wider text-right hidden md:table-cell w-16">IVA</th>
              <th className="px-3 py-2 font-medium text-slate-500 text-xs uppercase tracking-wider text-right hidden md:table-cell w-16">Desc%</th>
              <th className="px-3 py-2 font-medium text-slate-500 text-xs uppercase tracking-wider text-right w-24">Importe</th>
              {isDraft && <th className="px-2 py-2 w-8" />}
            </tr>
          </thead>
          <tbody>
            {lines.map((line: any) => {
              if (line.line_type === 'section') {
                return (
                  <tr key={line.id} className="bg-slate-50/80 border-t border-slate-100">
                    <td
                      colSpan={isDraft ? 8 : 7}
                      className="px-4 py-2"
                    >
                      <div className="flex items-center justify-between">
                        {editingLine === line.id ? (
                          <input
                            value={editValues.name}
                            onChange={(e) => setEditValues({ ...editValues, name: e.target.value })}
                            onBlur={saveEditLine}
                            onKeyDown={(e) => e.key === 'Enter' && saveEditLine()}
                            autoFocus
                            className="flex-1 px-2 py-1 text-sm font-semibold rounded border border-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-400"
                          />
                        ) : (
                          <span
                            className="font-semibold text-slate-800 cursor-pointer"
                            onClick={() => isDraft && startEditLine(line)}
                          >
                            {line.name}
                          </span>
                        )}
                        {isDraft && editingLine !== line.id && (
                          <button onClick={() => handleDeleteLine(line.id)} className="p-1 rounded hover:bg-slate-200">
                            <TrashIcon className="w-3.5 h-3.5 text-slate-400" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              }

              if (line.line_type === 'note') {
                return (
                  <tr key={line.id} className="border-t border-slate-50">
                    <td
                      colSpan={isDraft ? 8 : 7}
                      className="px-4 py-2"
                    >
                      <div className="flex items-center justify-between">
                        {editingLine === line.id ? (
                          <textarea
                            value={editValues.description || editValues.name}
                            onChange={(e) => setEditValues({ ...editValues, name: e.target.value, description: e.target.value })}
                            onBlur={saveEditLine}
                            autoFocus
                            rows={2}
                            className="flex-1 px-2 py-1 text-sm rounded border border-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none"
                          />
                        ) : (
                          <span
                            className="text-xs text-slate-500 italic cursor-pointer"
                            onClick={() => isDraft && startEditLine(line)}
                          >
                            {line.description || line.name || 'Nota vacia'}
                          </span>
                        )}
                        {isDraft && editingLine !== line.id && (
                          <button onClick={() => handleDeleteLine(line.id)} className="p-1 rounded hover:bg-slate-100">
                            <TrashIcon className="w-3.5 h-3.5 text-slate-400" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              }

              // Product line
              const isEditing = editingLine === line.id;
              return (
                <tr
                  key={line.id}
                  className="border-t border-slate-50 hover:bg-slate-50/30 transition-colors"
                  onClick={() => isDraft && !isEditing && startEditLine(line)}
                >
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-slate-800 text-sm">{line.name}</div>
                    {line.description && (
                      <div className="text-xs text-slate-400 truncate">{line.description}</div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {isEditing ? (
                      <input
                        type="number"
                        value={editValues.quantity}
                        onChange={(e) => setEditValues({ ...editValues, quantity: parseFloat(e.target.value) || 0 })}
                        className="w-16 px-1 py-0.5 text-sm text-right rounded border border-blue-300 focus:outline-none"
                      />
                    ) : (
                      <span className="text-slate-700">{line.quantity}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-slate-500 hidden sm:table-cell">{line.unit_of_measure}</td>
                  <td className="px-3 py-2.5 text-right">
                    {isEditing ? (
                      <input
                        type="number"
                        step="0.01"
                        value={editValues.unit_price}
                        onChange={(e) => setEditValues({ ...editValues, unit_price: parseFloat(e.target.value) || 0 })}
                        className="w-20 px-1 py-0.5 text-sm text-right rounded border border-blue-300 focus:outline-none"
                      />
                    ) : (
                      <span className="text-slate-700">{formatPrice(line.unit_price)}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-500 hidden md:table-cell">
                    {isEditing ? (
                      <input
                        type="number"
                        value={editValues.tax_rate}
                        onChange={(e) => setEditValues({ ...editValues, tax_rate: parseFloat(e.target.value) || 0 })}
                        className="w-14 px-1 py-0.5 text-sm text-right rounded border border-blue-300 focus:outline-none"
                      />
                    ) : (
                      <span>{line.tax_rate}%</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-500 hidden md:table-cell">
                    {isEditing ? (
                      <input
                        type="number"
                        value={editValues.discount}
                        onChange={(e) => setEditValues({ ...editValues, discount: parseFloat(e.target.value) || 0 })}
                        className="w-14 px-1 py-0.5 text-sm text-right rounded border border-blue-300 focus:outline-none"
                      />
                    ) : (
                      <span>{line.discount > 0 ? `${line.discount}%` : '-'}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right font-medium text-slate-900">
                    {formatPrice(line.subtotal)}
                  </td>
                  {isDraft && (
                    <td className="px-2 py-2.5">
                      {isEditing ? (
                        <div className="flex gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); saveEditLine(); }}
                            className="p-1 rounded bg-blue-500 text-white hover:bg-blue-600"
                          >
                            <CheckCircleIcon className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); cancelEdit(); }}
                            className="p-1 rounded bg-slate-200 text-slate-600 hover:bg-slate-300"
                          >
                            <XCircleIcon className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteLine(line.id); }}
                          className="p-1 rounded hover:bg-slate-100"
                        >
                          <TrashIcon className="w-3.5 h-3.5 text-slate-400" />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}

            {lines.length === 0 && (
              <tr>
                <td colSpan={isDraft ? 8 : 7} className="px-4 py-8 text-center text-sm text-slate-400">
                  Sin lineas. Anade productos, secciones o notas.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Add line buttons */}
        {isDraft && (
          <div className="flex items-center gap-2 px-4 py-3 border-t border-slate-100">
            <button
              onClick={() => setShowProductPicker(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <PlusIcon className="w-3.5 h-3.5" />
              Anadir producto
            </button>
            <button
              onClick={handleAddSection}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <PlusIcon className="w-3.5 h-3.5" />
              Anadir seccion
            </button>
            <button
              onClick={handleAddNote}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <PlusIcon className="w-3.5 h-3.5" />
              Anadir nota
            </button>
          </div>
        )}

        {/* Totals */}
        <div className="border-t border-slate-200 bg-slate-50/50">
          <div className="flex flex-col items-end px-4 py-4 space-y-1">
            <div className="flex items-center gap-8 text-sm">
              <span className="text-slate-500">Subtotal</span>
              <span className="font-medium text-slate-700 w-28 text-right">{formatPrice(quotation.subtotal)}</span>
            </div>
            <div className="flex items-center gap-8 text-sm">
              <span className="text-slate-500">Impuestos</span>
              <span className="font-medium text-slate-700 w-28 text-right">{formatPrice(quotation.tax_total)}</span>
            </div>
            <div className="flex items-center gap-8 text-base pt-1 border-t border-slate-200">
              <span className="font-semibold text-slate-900">Total</span>
              <span className="font-bold text-slate-900 w-28 text-right">{formatPrice(quotation.total)}</span>
            </div>
          </div>
        </div>

        {/* Notes */}
        {quotation.notes && (
          <div className="px-4 py-3 border-t border-slate-100">
            <p className="text-xs text-slate-500 font-medium mb-1">Notas</p>
            <p className="text-sm text-slate-600">{quotation.notes}</p>
          </div>
        )}
      </div>

      {/* Product picker modal */}
      {showProductPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 max-h-[60vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-900">Seleccionar producto</h3>
              <button onClick={() => setShowProductPicker(false)} className="p-1 rounded-lg hover:bg-slate-100">
                <XCircleIcon className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <div className="flex-1 overflow-auto divide-y divide-slate-50">
              {products.length === 0 ? (
                <div className="p-6 text-center text-sm text-slate-400">
                  Sin productos. Crea productos en la pestana Productos.
                </div>
              ) : (
                products.map((product) => (
                  <button
                    key={product.id}
                    onClick={() => handleAddProduct(product)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors text-left"
                  >
                    <div>
                      <div className="text-sm font-medium text-slate-800">{product.name}</div>
                      {product.description && (
                        <div className="text-xs text-slate-400 truncate max-w-[200px]">{product.description}</div>
                      )}
                    </div>
                    <span className="text-sm font-medium text-slate-600">{formatPrice(product.unit_price)}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
