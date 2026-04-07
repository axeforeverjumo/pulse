import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, LayoutDashboard, MoreVertical, Trash2, Pencil } from 'lucide-react';
import { useStudioApps, useCreateStudioApp, useDeleteStudioApp } from '../../hooks/queries/useStudio';
import type { StudioApp } from '../../api/client';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60) || 'app';
}

const COLORS = ['#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#EF4444', '#06B6D4', '#84CC16'];

export default function StudioAppList({ workspaceId }: { workspaceId: string | null | undefined }) {
  const navigate = useNavigate();
  const { data: apps, isLoading } = useStudioApps(workspaceId ?? null);
  const createApp = useCreateStudioApp();
  const deleteApp = useDeleteStudioApp();

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!newName.trim() || !workspaceId) return;
    const slug = slugify(newName);
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    try {
      const app = await createApp.mutateAsync({
        workspace_id: workspaceId,
        name: newName.trim(),
        slug,
        description: newDesc.trim(),
        color,
      });
      setShowCreate(false);
      setNewName('');
      setNewDesc('');
      navigate(`studio/${app.id}`);
    } catch { /* handled by RQ */ }
  };

  const handleDelete = async (appId: string) => {
    if (!confirm('Eliminar esta app?')) return;
    await deleteApp.mutateAsync(appId);
    setMenuOpen(null);
  };

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[20px] font-bold text-gray-900">Pulse Studio</h1>
          <p className="text-[13px] text-gray-500 mt-1">Construye aplicaciones e interfaces visuales</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 text-[13px] font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Plus size={16} />
          Nueva App
        </button>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-[16px] font-semibold text-gray-900 mb-4">Nueva App</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-[12px] font-medium text-gray-600 mb-1">Nombre</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Mi dashboard..."
                  className="w-full px-3 py-2 text-[13px] border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-gray-600 mb-1">Descripcion</label>
                <textarea
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Descripcion opcional..."
                  rows={2}
                  className="w-full px-3 py-2 text-[13px] border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 text-[13px] text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreate}
                disabled={!newName.trim() || createApp.isPending}
                className="px-4 py-2 text-[13px] font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {createApp.isPending ? 'Creando...' : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center h-48 text-[13px] text-gray-400">
          Cargando apps...
        </div>
      )}

      {/* Empty */}
      {!isLoading && (!apps || apps.length === 0) && (
        <div className="flex flex-col items-center justify-center h-48 text-center">
          <LayoutDashboard size={40} className="text-gray-300 mb-3" />
          <p className="text-[14px] font-medium text-gray-500">Sin apps todavia</p>
          <p className="text-[12px] text-gray-400 mt-1">Crea tu primera app visual con el boton de arriba</p>
        </div>
      )}

      {/* Grid */}
      {apps && apps.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {apps.map((app: StudioApp) => (
            <div
              key={app.id}
              onClick={() => navigate(`studio/${app.id}`)}
              className="relative group bg-white border border-gray-100 rounded-xl p-5 cursor-pointer hover:shadow-md hover:border-gray-200 transition-all"
            >
              {/* Color bar */}
              <div
                className="absolute top-0 left-0 right-0 h-1 rounded-t-xl"
                style={{ backgroundColor: app.color }}
              />

              {/* Menu */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(menuOpen === app.id ? null : app.id);
                }}
                className="absolute top-3 right-3 p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-gray-100 transition-opacity"
              >
                <MoreVertical size={14} className="text-gray-400" />
              </button>

              {menuOpen === app.id && (
                <div className="absolute top-8 right-3 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-10 min-w-[120px]">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(null);
                    }}
                    className="flex items-center gap-2 w-full px-3 py-1.5 text-[12px] text-gray-600 hover:bg-gray-50"
                  >
                    <Pencil size={12} /> Editar
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(app.id);
                    }}
                    className="flex items-center gap-2 w-full px-3 py-1.5 text-[12px] text-red-600 hover:bg-red-50"
                  >
                    <Trash2 size={12} /> Eliminar
                  </button>
                </div>
              )}

              <div className="mt-2">
                <h3 className="text-[14px] font-semibold text-gray-900 truncate">{app.name}</h3>
                {app.description && (
                  <p className="text-[12px] text-gray-500 mt-1 line-clamp-2">{app.description}</p>
                )}
                <div className="flex items-center gap-2 mt-3">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                    app.status === 'published'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-500'
                  }`}>
                    {app.status === 'published' ? 'Publicada' : 'Borrador'}
                  </span>
                  <span className="text-[10px] text-gray-400">
                    {new Date(app.updated_at).toLocaleDateString('es')}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
