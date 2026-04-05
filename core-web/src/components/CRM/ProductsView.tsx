import { useState, useEffect, useCallback } from 'react';
import {
  PlusIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  XMarkIcon,
  CubeIcon,
} from '@heroicons/react/24/outline';
import { getCrmProducts, createCrmProduct, updateCrmProduct } from '../../api/client';
import { toast } from 'sonner';

interface ProductsViewProps {
  workspaceId: string;
}

const emptyProduct = {
  name: '',
  description: '',
  unit_price: 0,
  currency_code: 'EUR',
  unit_of_measure: 'Unidad',
  tax_rate: 21,
  category: '',
};

export default function ProductsView({ workspaceId }: ProductsViewProps) {
  const [products, setProducts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any | null>(null);
  const [form, setForm] = useState(emptyProduct);
  const [saving, setSaving] = useState(false);

  const loadProducts = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getCrmProducts(workspaceId, search || undefined);
      setProducts(data.products || []);
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId, search]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const openCreate = () => {
    setEditingProduct(null);
    setForm(emptyProduct);
    setShowModal(true);
  };

  const openEdit = (product: any) => {
    setEditingProduct(product);
    setForm({
      name: product.name || '',
      description: product.description || '',
      unit_price: product.unit_price || 0,
      currency_code: product.currency_code || 'EUR',
      unit_of_measure: product.unit_of_measure || 'Unidad',
      tax_rate: product.tax_rate ?? 21,
      category: product.category || '',
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }
    setSaving(true);
    try {
      if (editingProduct) {
        await updateCrmProduct(editingProduct.id, form);
        toast.success('Producto actualizado');
      } else {
        await createCrmProduct({ ...form, workspace_id: workspaceId });
        toast.success('Producto creado');
      }
      setShowModal(false);
      loadProducts();
    } catch (err: any) {
      toast.error(err.message || 'Error al guardar producto');
    } finally {
      setSaving(false);
    }
  };

  const formatPrice = (price: number, currency: string) => {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(price);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
        <div className="relative flex-1 max-w-xs">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar productos..."
            className="w-full pl-9 pr-3 py-1.5 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 placeholder:text-slate-400"
          />
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-colors"
        >
          <PlusIcon className="w-4 h-4" />
          <span className="hidden sm:inline">Nuevo producto</span>
        </button>
      </div>

      {/* Product table */}
      <div className="flex-1 overflow-auto">
        {isLoading && products.length === 0 ? (
          <div className="space-y-2 p-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-slate-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <CubeIcon className="w-12 h-12 text-slate-300 mb-3" />
            <p className="text-sm text-slate-500 mb-1">Sin productos</p>
            <p className="text-xs text-slate-400 mb-4">Crea tu primer producto para usarlo en presupuestos</p>
            <button
              onClick={openCreate}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800"
            >
              <PlusIcon className="w-4 h-4" />
              Nuevo producto
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left">
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wider">Producto</th>
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wider">Precio</th>
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wider hidden sm:table-cell">UdM</th>
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wider hidden md:table-cell">IVA</th>
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wider hidden lg:table-cell">Categoria</th>
                <th className="px-4 py-2.5 w-10" />
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr
                  key={product.id}
                  className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors cursor-pointer"
                  onClick={() => openEdit(product)}
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{product.name}</div>
                    {product.description && (
                      <div className="text-xs text-slate-400 truncate max-w-xs">{product.description}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-700 font-medium">
                    {formatPrice(product.unit_price, product.currency_code || 'EUR')}
                  </td>
                  <td className="px-4 py-3 text-slate-500 hidden sm:table-cell">{product.unit_of_measure}</td>
                  <td className="px-4 py-3 text-slate-500 hidden md:table-cell">{product.tax_rate}%</td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    {product.category && (
                      <span className="inline-flex px-2 py-0.5 text-xs rounded-full bg-slate-100 text-slate-600">
                        {product.category}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={(e) => { e.stopPropagation(); openEdit(product); }}
                      className="p-1 rounded hover:bg-slate-100"
                    >
                      <PencilSquareIcon className="w-4 h-4 text-slate-400" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-slate-900">
                {editingProduct ? 'Editar producto' : 'Nuevo producto'}
              </h3>
              <button onClick={() => setShowModal(false)} className="p-1 rounded-lg hover:bg-slate-100">
                <XMarkIcon className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <div className="space-y-3">
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Nombre del producto"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Descripcion (opcional)"
                rows={2}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none"
              />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Precio unitario</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.unit_price}
                    onChange={(e) => setForm({ ...form, unit_price: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Moneda</label>
                  <select
                    value={form.currency_code}
                    onChange={(e) => setForm({ ...form, currency_code: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  >
                    <option value="EUR">EUR</option>
                    <option value="USD">USD</option>
                    <option value="GBP">GBP</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Unidad de medida</label>
                  <input
                    value={form.unit_of_measure}
                    onChange={(e) => setForm({ ...form, unit_of_measure: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">IVA (%)</label>
                  <input
                    type="number"
                    value={form.tax_rate}
                    onChange={(e) => setForm({ ...form, tax_rate: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Categoria</label>
                  <input
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    placeholder="Ej: Servicio"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Guardando...' : editingProduct ? 'Guardar cambios' : 'Crear producto'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
