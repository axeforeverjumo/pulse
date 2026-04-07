import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Undo2, Redo2, Eye, EyeOff, Save, Upload, Monitor, Tablet, Smartphone } from 'lucide-react';
import { useStudioStore } from '../../stores/studioStore';
import { useSaveStudioPageTree } from '../../hooks/queries/useStudio';

export default function StudioToolbar() {
  const navigate = useNavigate();
  const {
    activePageId,
    componentTree,
    undoStack,
    redoStack,
    isDirty,
    isPreviewMode,
    setPreviewMode,
    setDirty,
    undo,
    redo,
  } = useStudioStore();

  const saveTree = useSaveStudioPageTree();

  const handleSave = () => {
    if (!activePageId || !componentTree || !isDirty) return;
    saveTree.mutate(
      { pageId: activePageId, tree: componentTree as any },
      { onSuccess: () => setDirty(false) }
    );
  };

  return (
    <div className="flex items-center justify-between h-11 px-3 bg-white border-b border-gray-200 shrink-0">
      {/* Left */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => navigate(-1)}
          className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500"
          title="Volver"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="w-px h-5 bg-gray-200" />
        <button
          onClick={undo}
          disabled={undoStack.length === 0}
          className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 disabled:opacity-30 disabled:cursor-not-allowed"
          title="Deshacer (Ctrl+Z)"
        >
          <Undo2 size={15} />
        </button>
        <button
          onClick={redo}
          disabled={redoStack.length === 0}
          className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 disabled:opacity-30 disabled:cursor-not-allowed"
          title="Rehacer (Ctrl+Shift+Z)"
        >
          <Redo2 size={15} />
        </button>
      </div>

      {/* Center — viewport controls in preview mode */}
      {isPreviewMode && (
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          <button className="p-1.5 rounded-md bg-white shadow-sm text-gray-700" title="Desktop">
            <Monitor size={14} />
          </button>
          <button className="p-1.5 rounded-md text-gray-400 hover:text-gray-600" title="Tablet">
            <Tablet size={14} />
          </button>
          <button className="p-1.5 rounded-md text-gray-400 hover:text-gray-600" title="Mobile">
            <Smartphone size={14} />
          </button>
        </div>
      )}

      {/* Right */}
      <div className="flex items-center gap-2">
        {isDirty && (
          <span className="text-[10px] text-amber-600 font-medium mr-1">Sin guardar</span>
        )}
        <button
          onClick={handleSave}
          disabled={!isDirty || saveTree.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Save size={13} />
          {saveTree.isPending ? 'Guardando...' : 'Guardar'}
        </button>
        <button
          onClick={() => setPreviewMode(!isPreviewMode)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded-lg transition-colors ${
            isPreviewMode
              ? 'bg-indigo-600 text-white hover:bg-indigo-700'
              : 'text-gray-600 border border-gray-200 hover:bg-gray-50'
          }`}
        >
          {isPreviewMode ? <EyeOff size={13} /> : <Eye size={13} />}
          {isPreviewMode ? 'Editar' : 'Preview'}
        </button>
        <button
          className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
        >
          <Upload size={13} />
          Publicar
        </button>
      </div>
    </div>
  );
}
