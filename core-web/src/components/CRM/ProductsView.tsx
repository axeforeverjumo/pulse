import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  PlusIcon,
  MagnifyingGlassIcon,
  ArrowLeftIcon,
  StarIcon as StarOutline,
  Squares2X2Icon,
  ListBulletIcon,
  CubeIcon,
  PhotoIcon,
} from '@heroicons/react/24/outline';
import { StarIcon as StarSolid } from '@heroicons/react/24/solid';
import { getCrmProducts, createCrmProduct, updateCrmProduct } from '../../api/client';
import { toast } from 'sonner';

interface ProductsViewProps {
  workspaceId: string;
}

interface ProductForm {
  name: string;
  description: string;
  unit_price: number;
  currency_code: string;
  unit_of_measure: string;
  tax_rate: number;
  category: string;
  product_type: string;
  cost: number;
  sales_description: string;
  internal_notes: string;
}

const emptyForm: ProductForm = {
  name: '',
  description: '',
  unit_price: 0,
  currency_code: 'EUR',
  unit_of_measure: 'Unidad',
  tax_rate: 21,
  category: '',
  product_type: 'bienes',
  cost: 0,
  sales_description: '',
  internal_notes: '',
};

type ViewMode = 'list' | 'detail' | 'create';
type ListStyle = 'grid' | 'table';
type DetailTab = 'general' | 'ventas';

const formatPrice = (price: number, currency: string = 'EUR') =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(price);

export default function ProductsView({ workspaceId }: ProductsViewProps) {
  const [products, setProducts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [listStyle, setListStyle] = useState<ListStyle>('grid');
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<DetailTab>('general');
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

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

  const filteredProducts = useMemo(() => {
    if (!search) return products;
    const q = search.toLowerCase();
    return products.filter(
      (p) =>
        p.name?.toLowerCase().includes(q) ||
        p.category?.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q)
    );
  }, [products, search]);

  const openCreate = () => {
    setSelectedProduct(null);
    setForm(emptyForm);
    setActiveTab('general');
    setViewMode('create');
  };

  const openDetail = (product: any) => {
    setSelectedProduct(product);
    setForm({
      name: product.name || '',
      description: product.description || '',
      unit_price: product.unit_price || 0,
      currency_code: product.currency_code || 'EUR',
      unit_of_measure: product.unit_of_measure || 'Unidad',
      tax_rate: product.tax_rate ?? 21,
      category: product.category || '',
      product_type: product.product_type || 'bienes',
      cost: product.cost || 0,
      sales_description: product.sales_description || '',
      internal_notes: product.internal_notes || '',
    });
    setActiveTab('general');
    setViewMode('detail');
  };

  const goBack = () => {
    setViewMode('list');
    setSelectedProduct(null);
  };

  const toggleFavorite = (e: React.MouseEvent, productId: string) => {
    e.stopPropagation();
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }
    setSaving(true);
    try {
      if (selectedProduct) {
        await updateCrmProduct(selectedProduct.id, form);
        toast.success('Producto actualizado');
      } else {
        await createCrmProduct({ ...form, workspace_id: workspaceId });
        toast.success('Producto creado');
      }
      await loadProducts();
      goBack();
    } catch (err: any) {
      toast.error(err.message || 'Error al guardar producto');
    } finally {
      setSaving(false);
    }
  };

  const updateField = <K extends keyof ProductForm>(key: K, value: ProductForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  // ─── LIST VIEW ────────────────────────────────────────────────────────
  if (viewMode === 'list') {
    return (
      <div className="flex flex-col h-full">
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
          <div className="relative flex-1 max-w-sm">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar productos..."
              className="w-full pl-9 pr-3 py-1.5 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 placeholder:text-slate-400"
            />
          </div>

          {/* View toggle */}
          <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
            <button
              onClick={() => setListStyle('grid')}
              className={`p-1.5 rounded-md transition-colors ${
                listStyle === 'grid' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400 hover:text-slate-600'
              }`}
              title="Vista en cuadricula"
            >
              <Squares2X2Icon className="w-4 h-4" />
            </button>
            <button
              onClick={() => setListStyle('table')}
              className={`p-1.5 rounded-md transition-colors ${
                listStyle === 'table' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400 hover:text-slate-600'
              }`}
              title="Vista en lista"
            >
              <ListBulletIcon className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            Nuevo
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {isLoading && products.length === 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="h-40 bg-slate-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <CubeIcon className="w-14 h-14 text-slate-300 mb-3" />
              <p className="text-sm text-slate-500 mb-1">Sin productos</p>
              <p className="text-xs text-slate-400 mb-4">
                Crea tu primer producto para usarlo en presupuestos
              </p>
              <button
                onClick={openCreate}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800"
              >
                <PlusIcon className="w-4 h-4" />
                Nuevo producto
              </button>
            </div>
          ) : listStyle === 'grid' ? (
            /* ── Grid View ─────────────────────────────────────────── */
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredProducts.map((product) => (
                <div
                  key={product.id}
                  onClick={() => openDetail(product)}
                  className="group relative bg-white border border-slate-200 rounded-xl hover:shadow-md hover:border-slate-300 transition-all cursor-pointer overflow-hidden"
                >
                  {/* Image placeholder */}
                  <div className="aspect-square bg-slate-50 flex items-center justify-center border-b border-slate-100">
                    <CubeIcon className="w-12 h-12 text-slate-200 group-hover:text-slate-300 transition-colors" />
                  </div>

                  {/* Favorite star */}
                  <button
                    onClick={(e) => toggleFavorite(e, product.id)}
                    className="absolute top-2 right-2 p-1 rounded-full hover:bg-white/80 transition-colors"
                  >
                    {favorites.has(product.id) ? (
                      <StarSolid className="w-5 h-5 text-amber-400" />
                    ) : (
                      <StarOutline className="w-5 h-5 text-slate-300 group-hover:text-slate-400" />
                    )}
                  </button>

                  {/* Info */}
                  <div className="p-3">
                    <p className="text-sm font-medium text-slate-900 truncate">{product.name}</p>
                    <p className="text-sm font-semibold text-slate-700 mt-1">
                      {formatPrice(product.unit_price, product.currency_code || 'EUR')}
                    </p>
                    {product.category && (
                      <span className="inline-block mt-1.5 px-2 py-0.5 text-[11px] font-medium rounded-full bg-blue-50 text-blue-600">
                        {product.category}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* ── Table View ────────────────────────────────────────── */
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left">
                  <th className="px-4 py-2.5 w-8" />
                  <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wider">
                    Producto
                  </th>
                  <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wider">
                    Precio
                  </th>
                  <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wider hidden sm:table-cell">
                    UdM
                  </th>
                  <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wider hidden md:table-cell">
                    IVA
                  </th>
                  <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wider hidden lg:table-cell">
                    Categoria
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product) => (
                  <tr
                    key={product.id}
                    className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors cursor-pointer"
                    onClick={() => openDetail(product)}
                  >
                    <td className="px-4 py-3">
                      <button
                        onClick={(e) => toggleFavorite(e, product.id)}
                        className="p-0.5"
                      >
                        {favorites.has(product.id) ? (
                          <StarSolid className="w-4 h-4 text-amber-400" />
                        ) : (
                          <StarOutline className="w-4 h-4 text-slate-300 hover:text-slate-400" />
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{product.name}</div>
                      {product.description && (
                        <div className="text-xs text-slate-400 truncate max-w-xs">
                          {product.description}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-700 font-medium">
                      {formatPrice(product.unit_price, product.currency_code || 'EUR')}
                    </td>
                    <td className="px-4 py-3 text-slate-500 hidden sm:table-cell">
                      {product.unit_of_measure}
                    </td>
                    <td className="px-4 py-3 text-slate-500 hidden md:table-cell">
                      {product.tax_rate}%
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {product.category && (
                        <span className="inline-flex px-2 py-0.5 text-xs rounded-full bg-slate-100 text-slate-600">
                          {product.category}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  }

  // ─── DETAIL / CREATE VIEW ─────────────────────────────────────────────
  const isCreating = viewMode === 'create';
  const pageTitle = isCreating ? 'Nuevo producto' : 'Producto';

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
        <button
          onClick={goBack}
          className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 transition-colors"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          Productos
        </button>
        <div className="flex-1" />
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Guardando...' : isCreating ? 'Crear' : 'Guardar'}
        </button>
      </div>

      {/* Product title section */}
      <div className="px-6 pt-5 pb-3">
        <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">{pageTitle}</p>
        <input
          value={form.name}
          onChange={(e) => updateField('name', e.target.value)}
          placeholder="Nombre del producto"
          className="text-2xl font-semibold text-slate-900 bg-transparent border-none outline-none w-full placeholder:text-slate-300 focus:ring-0"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-0 px-6 border-b border-slate-200">
        {(
          [
            { key: 'general' as DetailTab, label: 'Informacion general' },
            { key: 'ventas' as DetailTab, label: 'Ventas' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'general' ? (
          <div className="p-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Left column - Form fields */}
              <div className="lg:col-span-2 space-y-5">
                {/* Tipo de producto */}
                <div className="flex items-start gap-3">
                  <label className="text-sm text-slate-500 w-44 pt-2 shrink-0 text-right">
                    Tipo de producto
                  </label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="product_type"
                        value="bienes"
                        checked={form.product_type === 'bienes'}
                        onChange={() => updateField('product_type', 'bienes')}
                        className="w-4 h-4 text-slate-900 border-slate-300 focus:ring-slate-500"
                      />
                      <span className="text-sm text-slate-700">Bienes</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="product_type"
                        value="servicio"
                        checked={form.product_type === 'servicio'}
                        onChange={() => updateField('product_type', 'servicio')}
                        className="w-4 h-4 text-slate-900 border-slate-300 focus:ring-slate-500"
                      />
                      <span className="text-sm text-slate-700">Servicio</span>
                    </label>
                  </div>
                </div>

                {/* Precio de venta */}
                <div className="flex items-start gap-3">
                  <label className="text-sm text-slate-500 w-44 pt-2 shrink-0 text-right">
                    Precio de venta
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.01"
                      value={form.unit_price}
                      onChange={(e) => updateField('unit_price', parseFloat(e.target.value) || 0)}
                      className="w-28 px-3 py-1.5 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                    />
                    <span className="text-sm text-slate-400">por</span>
                    <input
                      value={form.unit_of_measure}
                      onChange={(e) => updateField('unit_of_measure', e.target.value)}
                      className="w-28 px-3 py-1.5 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                      placeholder="Unidad"
                    />
                  </div>
                </div>

                {/* Moneda */}
                <div className="flex items-start gap-3">
                  <label className="text-sm text-slate-500 w-44 pt-2 shrink-0 text-right">
                    Moneda
                  </label>
                  <select
                    value={form.currency_code}
                    onChange={(e) => updateField('currency_code', e.target.value)}
                    className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                  >
                    <option value="EUR">EUR</option>
                    <option value="USD">USD</option>
                    <option value="GBP">GBP</option>
                  </select>
                </div>

                {/* Impuesto de ventas */}
                <div className="flex items-start gap-3">
                  <label className="text-sm text-slate-500 w-44 pt-2 shrink-0 text-right">
                    Impuesto de ventas
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={form.tax_rate}
                      onChange={(e) => updateField('tax_rate', parseFloat(e.target.value) || 0)}
                      className="w-20 px-3 py-1.5 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                    />
                    <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                      {form.tax_rate}% S
                    </span>
                  </div>
                </div>

                {/* Coste */}
                <div className="flex items-start gap-3">
                  <label className="text-sm text-slate-500 w-44 pt-2 shrink-0 text-right">
                    Coste
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.cost}
                    onChange={(e) => updateField('cost', parseFloat(e.target.value) || 0)}
                    className="w-28 px-3 py-1.5 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                  />
                </div>

                {/* Categoria */}
                <div className="flex items-start gap-3">
                  <label className="text-sm text-slate-500 w-44 pt-2 shrink-0 text-right">
                    Categoria
                  </label>
                  <input
                    value={form.category}
                    onChange={(e) => updateField('category', e.target.value)}
                    placeholder="Ej: Servicio, Hardware..."
                    className="w-56 px-3 py-1.5 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 placeholder:text-slate-300"
                  />
                </div>

                {/* Descripcion */}
                <div className="flex items-start gap-3">
                  <label className="text-sm text-slate-500 w-44 pt-2 shrink-0 text-right">
                    Descripcion
                  </label>
                  <textarea
                    value={form.description}
                    onChange={(e) => updateField('description', e.target.value)}
                    placeholder="Descripcion del producto..."
                    rows={2}
                    className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 resize-none placeholder:text-slate-300"
                  />
                </div>
              </div>

              {/* Right column - Image */}
              <div className="flex flex-col items-center">
                <div className="w-40 h-40 rounded-xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-300 hover:border-slate-300 hover:text-slate-400 transition-colors cursor-pointer">
                  <PhotoIcon className="w-10 h-10 mb-1" />
                  <span className="text-xs">Imagen</span>
                </div>
              </div>
            </div>

            {/* Internal notes section */}
            <div className="mt-8 pt-6 border-t border-slate-100">
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                Notas internas
              </h4>
              <textarea
                value={form.internal_notes}
                onChange={(e) => updateField('internal_notes', e.target.value)}
                placeholder="Notas internas sobre este producto..."
                rows={3}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 resize-none placeholder:text-slate-300"
              />
            </div>
          </div>
        ) : (
          /* ── Tab: Ventas ──────────────────────────────────────── */
          <div className="p-6">
            <div className="max-w-2xl">
              <div className="flex items-start gap-3">
                <label className="text-sm text-slate-500 w-56 pt-2 shrink-0 text-right">
                  Descripcion del presupuesto
                </label>
                <div className="flex-1">
                  <textarea
                    value={form.sales_description}
                    onChange={(e) => updateField('sales_description', e.target.value)}
                    placeholder="Esta descripcion se agregara automaticamente a las lineas de presupuesto cuando se use este producto."
                    rows={4}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 resize-none placeholder:text-slate-300"
                  />
                  <p className="text-xs text-slate-400 mt-1.5">
                    Se anade automaticamente a las lineas del presupuesto al seleccionar este producto.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
