import { useState } from 'react';
import { useProjectsStore } from '../../../stores/projectsStore';
import {
  useProjectBoards,
  useUpdateBoard,
  useDeleteBoard,
  type ProjectBoard,
} from '../../../hooks/queries/useProjects';
import { EllipsisHorizontalIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline';
import { Plus, Columns3 } from 'lucide-react';
import { Icon } from '../../ui/Icon';
import ConfirmModal from './ConfirmModal';
import Dropdown from '../../Dropdown/Dropdown';

interface ProjectSidebarProps {
  onCreateClick: () => void;
  onSelectProject: (boardId: string) => void;
}

export default function ProjectSidebar({ onCreateClick, onSelectProject }: ProjectSidebarProps) {
  // UI state from store
  const activeProjectId = useProjectsStore((state) => state.activeProjectId);
  const workspaceAppId = useProjectsStore((state) => state.workspaceAppId);

  // React Query data
  const { data: boards = [] } = useProjectBoards(workspaceAppId);

  // React Query mutations
  const updateBoard = useUpdateBoard(workspaceAppId);
  const deleteBoard = useDeleteBoard(workspaceAppId);

  const [deleteTarget, setDeleteTarget] = useState<ProjectBoard | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [editingBoardId, setEditingBoardId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [menuButtons, setMenuButtons] = useState<Record<string, HTMLButtonElement | null>>({});

  const handleDeleteClick = (e: React.MouseEvent, board: ProjectBoard) => {
    e.stopPropagation();
    setOpenMenuId(null);
    setDeleteTarget(board);
  };

  const handleRenameClick = (e: React.MouseEvent, board: ProjectBoard) => {
    e.stopPropagation();
    setOpenMenuId(null);
    setEditingBoardId(board.id);
    setEditingName(board.name);
  };

  const handleRenameSubmit = (boardId: string) => {
    const trimmed = editingName.trim();
    if (trimmed && trimmed !== boards.find(b => b.id === boardId)?.name) {
      updateBoard.mutate({ boardId, updates: { name: trimmed } });
    }
    setEditingBoardId(null);
    setEditingName('');
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent, boardId: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleRenameSubmit(boardId);
    } else if (e.key === 'Escape') {
      setEditingBoardId(null);
      setEditingName('');
    }
  };

  const handleDeleteConfirm = () => {
    if (deleteTarget) {
      deleteBoard.mutate(deleteTarget.id);
      setDeleteTarget(null);
    }
  };

  return (
    <div className={`flex flex-col h-full bg-gradient-to-b from-[#f4faff] to-[#edf4fb] border-r border-[#d3e0ef]`}>
      {/* Header */}
      <div className="h-14 flex items-center justify-between pl-4 pr-3 shrink-0 border-b border-[#dce8f6]">
        <h2 className="text-[15px] font-semibold text-slate-800">Proyectos</h2>
        <button
          onClick={onCreateClick}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white border border-[#d0dded] text-slate-600 hover:text-slate-900 hover:border-[#bfd1e7] transition-colors focus-visible:ring-2 focus-visible:ring-brand-primary"
          title="Nuevo proyecto"
          aria-label="Nuevo proyecto"
        >
          <Icon icon={Plus} size={16} aria-hidden="true" />
        </button>
      </div>

      {/* Projects List */}
      <div className="flex-1 overflow-y-auto">
        {boards.length > 0 && (
          <div className="px-2">
            <div className="space-y-0.5">
              {boards.map((board: ProjectBoard) => (
                <div
                  key={board.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => editingBoardId !== board.id && onSelectProject(board.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      if (editingBoardId !== board.id) {
                        onSelectProject(board.id);
                      }
                    }
                  }}
                  className={`w-full flex items-center gap-2 px-2.5 h-[35px] rounded-lg text-sm transition-colors group cursor-pointer ${
                    activeProjectId === board.id
                      ? "bg-[#d9e8fb] text-slate-900 shadow-[inset_0_0_0_1px_rgba(144,175,210,0.45)]"
                      : "text-slate-700 hover:bg-white/70"
                  }`}
                >
                  <Icon icon={Columns3} size={16} className="flex-shrink-0" aria-hidden="true" />
                  {editingBoardId === board.id ? (
                    <input
                      type="text"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => handleRenameKeyDown(e, board.id)}
                      onBlur={() => handleRenameSubmit(board.id)}
                      onClick={(e) => e.stopPropagation()}
                      autoFocus
                      className="flex-1 text-sm bg-white border border-border-gray rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-brand-primary"
                    />
                  ) : (
                    <span className="flex-1 text-left truncate">
                      {board.name}
                    </span>
                  )}

                  {/* Hover Actions - three-dots menu */}
                  {editingBoardId !== board.id && (
                    <div className={`relative flex-shrink-0 ${
                      activeProjectId === board.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
                    }`}>
                      <button
                        ref={(el) => {
                          setMenuButtons((prev) => {
                            if (prev[board.id] === el) return prev;
                            return { ...prev, [board.id]: el };
                          });
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuId(openMenuId === board.id ? null : board.id);
                        }}
                        className="p-1 rounded text-slate-500 hover:text-slate-900 hover:bg-[#e8f0fa] transition-colors focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:opacity-100"
                        title="Más opciones"
                        aria-label={`Options for ${board.name}`}
                      >
                        <EllipsisHorizontalIcon className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                      <Dropdown
                        isOpen={openMenuId === board.id}
                        onClose={() => setOpenMenuId(null)}
                        trigger={{ current: menuButtons[board.id] || null }}
                      >
                        <button
                          onClick={(e) => handleRenameClick(e, board)}
                          className="w-full px-3 py-1.5 text-left text-sm text-text-body hover:bg-bg-gray flex items-center gap-2 focus-visible:bg-bg-gray focus-visible:outline-none"
                        >
                          <PencilIcon className="w-3.5 h-3.5" aria-hidden="true" />
                          Rename
                        </button>
                        <button
                          onClick={(e) => handleDeleteClick(e, board)}
                          className="w-full px-3 py-1.5 text-left text-sm text-red-500 hover:bg-bg-gray flex items-center gap-2 focus-visible:bg-bg-gray focus-visible:outline-none"
                        >
                          <TrashIcon className="w-3.5 h-3.5" aria-hidden="true" />
                          Delete
                        </button>
                      </Dropdown>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {boards.length === 0 && (
          <div className="px-4 py-8 text-center">
            <Icon icon={Columns3} size={32} className="mx-auto text-text-tertiary opacity-50 mb-2" aria-hidden="true" />
            <p className="text-sm text-text-tertiary">No projects yet</p>
            <button
              onClick={onCreateClick}
              className="mt-3 text-sm text-brand-primary hover:underline font-medium"
            >
              Create one
            </button>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Eliminar proyecto"
        message={`¿Estás seguro de que quieres eliminar "${deleteTarget?.name}"? Todas las columnas y tarjetas se eliminarán permanentemente.`}
        confirmLabel="Eliminar"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
