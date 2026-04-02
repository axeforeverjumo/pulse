import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useState, useRef, useEffect, useMemo, memo } from "react";
import {
  PlusIcon,
  TrashIcon,
  EllipsisHorizontalIcon,
  PencilIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  UserPlusIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { SwatchIcon } from "@heroicons/react/24/solid";
import ConfirmModal from "./ConfirmModal";
import Dropdown from "../../Dropdown/Dropdown";
import { useProjectsStore } from "../../../stores/projectsStore";
import { api } from "../../../api/client";
import { useQuery } from "@tanstack/react-query";

const COLUMN_COLORS = [
  { value: "#94A3B8", name: "Slate" },
  { value: "#64748B", name: "Gray" },
  { value: "#3B82F6", name: "Blue" },
  { value: "#06B6D4", name: "Cyan" },
  { value: "#10B981", name: "Green" },
  { value: "#FBBF24", name: "Yellow" },
  { value: "#F59E0B", name: "Amber" },
  { value: "#F97316", name: "Orange" },
  { value: "#EF4444", name: "Red" },
];
import KanbanCard from "./KanbanCard";
import {
  useCreateIssue,
  useDeleteState,
  useUpdateState,
  useProjectMembers,
  useAddAgentAssignee,
  type ProjectIssue,
  type ProjectState,
  type WorkspaceMember,
} from "../../../hooks/queries/useProjects";

interface OpenClawAgent {
  id: string;
  name: string;
  tier: string;
  avatar_url?: string;
}

interface KanbanColumnProps {
  column: ProjectState;
  boardId: string;
  cardsOverride: ProjectIssue[];
  onCardClick?: (cardId: string) => void;
  previewIndex?: number | null;
  activeCardId?: string | null;
  isDragActive?: boolean;
  isCollapsed?: boolean;
}

const KanbanColumn = memo(function KanbanColumn({
  column,
  boardId,
  cardsOverride,
  onCardClick,
  previewIndex,
  activeCardId,
  isDragActive = false,
  isCollapsed = false,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
    data: {
      type: "column",
      columnId: column.id,
    },
  });

  // React Query mutations
  const createIssue = useCreateIssue(boardId);
  const deleteState = useDeleteState(boardId);
  const updateState = useUpdateState(boardId);
  const addAgentAssignee = useAddAgentAssignee(boardId);

  // Workspace data for assignee picker
  const workspaceId = useProjectsStore((state) => state.workspaceId);
  const { data: wsMembers = [] } = useProjectMembers(workspaceId);
  // Fetch OpenClaw agents (the real agents: Jarvis, Donna, Claudia, etc.)
  const { data: wsAgents = [] } = useQuery<OpenClawAgent[]>({
    queryKey: ["openclaw-agents", workspaceId],
    queryFn: async () => {
      if (!workspaceId) return [];
      const data = await api<{ agents: OpenClawAgent[] }>(`/openclaw-agents/?workspace_id=${workspaceId}`);
      return data.agents || [];
    },
    enabled: !!workspaceId,
    staleTime: 5 * 60 * 1000,
  });

  const cards = cardsOverride;
  const [isExpanded, setIsExpanded] = useState(false);
  const [isAddingCard, setIsAddingCard] = useState(false);

  const VISIBLE_CARD_LIMIT = 10;
  const hasMoreCards = cards.length > VISIBLE_CARD_LIMIT;
  const visibleCards = isExpanded ? cards : cards.slice(0, VISIBLE_CARD_LIMIT);
  const hiddenCount = cards.length - VISIBLE_CARD_LIMIT;
  const [newCardTitle, setNewCardTitle] = useState("");
  const [newCardDescription, setNewCardDescription] = useState("");
  const [newCardPriority, setNewCardPriority] = useState(0);
  const [newCardAssignees, setNewCardAssignees] = useState<Array<{ type: 'user' | 'agent'; id: string; name: string; avatarUrl?: string }>>([]);
  const [showAssigneePicker, setShowAssigneePicker] = useState(false);
  const [assigneeSearch, setAssigneeSearch] = useState("");
  const assigneePickerRef = useRef<HTMLDivElement>(null);

  // Combined list of members + agents for picker
  const assigneeOptions = useMemo(() => {
    const search = assigneeSearch.toLowerCase();
    const selectedIds = new Set(newCardAssignees.map(a => a.id));

    const members: Array<{ type: 'user' | 'agent'; id: string; name: string; avatarUrl?: string }> =
      wsMembers
        .filter((m: WorkspaceMember) => !selectedIds.has(m.user_id) && (m.name || m.email || '').toLowerCase().includes(search))
        .map((m: WorkspaceMember) => ({ type: 'user' as const, id: m.user_id, name: m.name || m.email || 'Usuario', avatarUrl: m.avatar_url }));

    const agents: Array<{ type: 'user' | 'agent'; id: string; name: string; avatarUrl?: string; tier?: string }> =
      wsAgents
        .filter((a) => !selectedIds.has(a.id) && (a.name || '').toLowerCase().includes(search))
        .map((a) => ({ type: 'agent' as const, id: a.id, name: a.name, avatarUrl: a.avatar_url, tier: a.tier }));

    return [...members, ...agents];
  }, [wsMembers, wsAgents, newCardAssignees, assigneeSearch]);

  // Close assignee picker on outside click
  useEffect(() => {
    if (!showAssigneePicker) return;
    const handleClick = (e: MouseEvent) => {
      if (assigneePickerRef.current && !assigneePickerRef.current.contains(e.target as Node)) {
        setShowAssigneePicker(false);
        setAssigneeSearch("");
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showAssigneePicker]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingName, setEditingName] = useState(column.name);
  const colorPickerRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  // Close color picker on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        colorPickerRef.current &&
        !colorPickerRef.current.contains(e.target as Node)
      ) {
        setShowColorPicker(false);
      }
    };
    if (showColorPicker) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showColorPicker]);

  const normalizeTodoColor = (color?: string) => {
    const name = column.name?.trim().toLowerCase();
    if (name === "to do" || name === "todo" || name === "to-do") {
      if (!color || color === "#94A3B8" || color === "#3B82F6") {
        return "#EF4444";
      }
    }
    return color || "#94A3B8";
  };

  const displayColor = normalizeTodoColor(column.color);

  const handleColorChange = (color: string) => {
    updateState.mutate({ stateId: column.id, updates: { color } });
    setShowColorPicker(false);
  };

  const handleAddCard = () => {
    const title = newCardTitle.trim();
    if (!title) {
      setIsAddingCard(false);
      return;
    }

    const description = newCardDescription.trim();
    const priority = newCardPriority;
    const assignees = [...newCardAssignees];

    // Close form and clear input immediately
    setNewCardTitle("");
    setNewCardDescription("");
    setNewCardPriority(0);
    setNewCardAssignees([]);
    setShowAssigneePicker(false);
    setAssigneeSearch("");
    setIsAddingCard(false);

    // Get user assignee IDs for the create call
    const userAssigneeIds = assignees.filter(a => a.type === 'user').map(a => a.id);
    const agentAssignees = assignees.filter(a => a.type === 'agent');

    // React Query handles optimistic update
    createIssue.mutate(
      {
        state_id: column.id,
        title,
        ...(description && { description }),
        ...(priority > 0 && { priority }),
        ...(userAssigneeIds.length > 0 && { assignee_ids: userAssigneeIds }),
      },
      {
        onSuccess: (newIssue) => {
          // Assign agents after creation (API doesn't support agent_ids in create)
          for (const agent of agentAssignees) {
            addAgentAssignee.mutate({ issueId: newIssue.id, agentId: agent.id });
          }
        },
      }
    );
  };

  const handleDeleteColumn = () => {
    setShowColumnMenu(false);
    setShowDeleteConfirm(true);
  };

  const handleRenameClick = () => {
    setShowColumnMenu(false);
    setEditingName(column.name);
    setIsEditingName(true);
  };

  const handleRenameSubmit = () => {
    const trimmed = editingName.trim();
    if (trimmed && trimmed !== column.name) {
      updateState.mutate({ stateId: column.id, updates: { name: trimmed } });
    }
    setIsEditingName(false);
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleRenameSubmit();
    } else if (e.key === "Escape") {
      setIsEditingName(false);
      setEditingName(column.name);
    }
  };

  const handleColorPickerFromMenu = () => {
    setShowColumnMenu(false);
    setShowColorPicker(true);
  };

  const handleDeleteConfirm = () => {
    deleteState.mutate(column.id);
    setShowDeleteConfirm(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddCard();
    } else if (e.key === "Escape") {
      setIsAddingCard(false);
      setNewCardTitle("");
      setNewCardDescription("");
      setNewCardPriority(0);
      setNewCardAssignees([]);
      setShowAssigneePicker(false);
      setAssigneeSearch("");
    }
  };

  const columnClasses = [
    "w-80 h-full flex-shrink-0 flex flex-col transition-all duration-300",
    isOver && "scale-[1.01]",
  ]
    .filter(Boolean)
    .join(" ");

  // Collapsed view for Done column in Active mode
  if (isCollapsed) {
    return (
      <div
        ref={setNodeRef}
        className={`w-80 flex-shrink-0 rounded-md transition-colors duration-200 ${
          isOver ? "bg-[#F0F1F3] ring-2 ring-green-300" : "bg-[#F9F9F9]"
        }`}
      >
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: displayColor }}
            />
            <span className="font-medium text-[13px] text-gray-900">{column.name}</span>
          </div>
          <span className="text-[12px] text-gray-400">{cards.length}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={columnClasses}>
      {/* Column wrapper with background */}
      <div
        className={`flex-1 flex flex-col rounded-md px-2 pt-2 pb-2 transition-colors duration-200 ${
          isOver ? "bg-[#F0F1F3]" : "bg-[#F9F9F9]"
        }`}
      >
        {/* Column Header */}
        <div
          className="shrink-0 pb-4 flex items-center justify-between group"
          onMouseEnter={() => setHoveredId(column.id)}
          onMouseLeave={() => setHoveredId(null)}
        >
          <div className="flex items-center gap-2 flex-1 min-w-0 px-2">
            <div className="relative" ref={colorPickerRef}>
              <button
                onClick={() => setShowColorPicker(!showColorPicker)}
                className="w-2 h-2 rounded-full shrink-0 hover:scale-125 transition-transform"
                style={{ backgroundColor: displayColor }}
                title="Cambiar color"
              />
              {showColorPicker && (
                <div className="absolute top-full left-0 mt-2 p-2.5 bg-white rounded-lg shadow-lg border border-gray-100 z-10">
                  <div className="flex gap-2">
                    {COLUMN_COLORS.map((color) => (
                      <button
                        key={color.value}
                        onClick={() => handleColorChange(color.value)}
                        className={`w-5 h-5 rounded-full transition-all ${
                          column.color === color.value
                            ? "ring-2 ring-offset-1 ring-gray-400 scale-110"
                            : "hover:scale-110"
                        }`}
                        style={{ backgroundColor: color.value }}
                        title={color.name}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
            {isEditingName ? (
              <input
                type="text"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onKeyDown={handleRenameKeyDown}
                onBlur={handleRenameSubmit}
                autoFocus
                className="font-medium text-[13px] text-gray-900 bg-white border border-gray-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-gray-400 min-w-0 flex-1"
              />
            ) : (
              <h3 className="font-medium text-[13px] text-gray-900 truncate">
                {column.name}
              </h3>
            )}
            <span className="text-[12px] text-gray-400 font-normal shrink-0">
              {cards.length}
            </span>
          </div>

          {/* Column Actions (Hover) - Three-dots menu */}
          <div className="relative shrink-0">
            <button
              ref={menuButtonRef}
              onClick={() => setShowColumnMenu(!showColumnMenu)}
              className={`p-1.5 rounded-lg text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors duration-200 ${
                hoveredId === column.id || showColumnMenu
                  ? "opacity-100"
                  : "opacity-0"
              }`}
              title="Opciones de columna"
            >
              <EllipsisHorizontalIcon className="w-3.5 h-3.5" />
            </button>
            <Dropdown
              isOpen={showColumnMenu}
              onClose={() => setShowColumnMenu(false)}
              trigger={menuButtonRef}
            >
              <button
                onClick={handleRenameClick}
                className="w-full px-3 py-1.5 text-left text-sm text-text-body hover:bg-bg-gray flex items-center gap-2"
              >
                <PencilIcon className="w-3.5 h-3.5" />
                Renombrar
              </button>
              <button
                onClick={handleColorPickerFromMenu}
                className="w-full px-3 py-1.5 text-left text-sm text-text-body hover:bg-bg-gray flex items-center gap-2"
              >
                <SwatchIcon className="w-3.5 h-3.5" />
                Cambiar color
              </button>
              <button
                onClick={handleDeleteColumn}
                className="w-full px-3 py-1.5 text-left text-sm text-red-500 hover:bg-bg-gray flex items-center gap-2"
              >
                <TrashIcon className="w-3.5 h-3.5" />
                Eliminar
              </button>
            </Dropdown>
          </div>
        </div>

        {/* Column Content */}
        <div ref={setNodeRef}>
          <SortableContext
            items={cards.map((c) => c.id)}
            strategy={verticalListSortingStrategy}
          >
            {visibleCards.map((card, index) => (
              <div key={card.id}>
                {/* Drop indicator before this card */}
                {previewIndex === index && activeCardId !== card.id && (
                  <div className="h-0.5 bg-gray-300 rounded-full my-2 transition-colors duration-200" />
                )}
                <KanbanCard
                  card={card}
                  onCardClick={onCardClick}
                  isDragging={activeCardId === card.id}
                  isDragActive={isDragActive}
                />
              </div>
            ))}
            {/* Drop indicator at end de column */}
            {previewIndex === cards.length && cards.length > 0 && (
              <div className="h-0.5 bg-gray-300 rounded-full my-2 transition-colors duration-200" />
            )}
            {/* Indicator for empty column */}
            {cards.length === 0 && isOver && (
              <div className="h-0.5 bg-gray-300 rounded-full my-2 transition-colors duration-200" />
            )}
          </SortableContext>

          {/* Add Card Input - appears directly below cards when adding */}
          {isAddingCard && (
            <div className="mt-2 p-4 bg-white rounded-lg border border-gray-100 shadow-sm">
              <input
                type="text"
                autoFocus
                value={newCardTitle}
                onChange={(e) => setNewCardTitle(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Título de la tarea..."
                className="w-full px-0 py-1 font-medium text-[13px] text-gray-900 placeholder:text-gray-400 placeholder:font-normal bg-transparent border-0 focus:outline-none focus:ring-0"
              />
              <textarea
                value={newCardDescription}
                onChange={(e) => setNewCardDescription(e.target.value)}
                placeholder="Descripción (opcional)..."
                rows={2}
                className="w-full mt-2 px-0 py-1 text-[12px] text-gray-700 placeholder:text-gray-400 bg-transparent border-0 focus:outline-none focus:ring-0 resize-none"
              />

              {/* Assigned people/agents chips */}
              {newCardAssignees.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  {newCardAssignees.map((a) => (
                    <span
                      key={a.id}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                        a.type === 'agent'
                          ? 'bg-purple-50 text-purple-700'
                          : 'bg-blue-50 text-blue-700'
                      }`}
                    >
                      {a.avatarUrl ? (
                        <img src={a.avatarUrl} className="w-3.5 h-3.5 rounded-full" alt="" />
                      ) : (
                        <span className="w-3.5 h-3.5 rounded-full bg-gray-300 flex items-center justify-center text-[8px] text-white font-bold">
                          {a.name[0]?.toUpperCase()}
                        </span>
                      )}
                      {a.name}
                      {a.type === 'agent' && <span className="text-[9px] opacity-60">🤖</span>}
                      <button
                        onClick={() => setNewCardAssignees(prev => prev.filter(x => x.id !== a.id))}
                        className="ml-0.5 hover:text-red-500"
                      >
                        <XMarkIcon className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <div className="flex flex-col gap-2 mt-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={newCardPriority}
                    onChange={(e) => setNewCardPriority(Number(e.target.value))}
                    className="text-[11px] text-gray-500 bg-gray-50 border border-gray-200 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-gray-300"
                  >
                    <option value={0}>Sin prioridad</option>
                    <option value={1}>🔴 Urgente</option>
                    <option value={2}>🟠 Alta</option>
                    <option value={3}>🟡 Media</option>
                    <option value={4}>🔵 Baja</option>
                  </select>

                  {/* Assignee picker toggle */}
                  <div className="relative" ref={assigneePickerRef}>
                    <button
                      onClick={() => setShowAssigneePicker(!showAssigneePicker)}
                      className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border transition-colors ${
                        showAssigneePicker
                          ? 'bg-violet-50 border-violet-200 text-violet-600'
                          : 'bg-gray-50 border-gray-200 text-gray-500 hover:text-gray-700'
                      }`}
                      title="Asignar persona o agente"
                    >
                      <UserPlusIcon className="w-3.5 h-3.5" />
                      Asignar
                    </button>

                    {showAssigneePicker && (
                      <div className="absolute bottom-full left-0 mb-1 w-56 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden z-50">
                        <div className="p-2 border-b border-gray-100">
                          <input
                            type="text"
                            value={assigneeSearch}
                            onChange={(e) => setAssigneeSearch(e.target.value)}
                            placeholder="Buscar persona o agente..."
                            autoFocus
                            className="w-full px-2 py-1.5 text-[12px] bg-gray-50 rounded-lg border-0 focus:outline-none focus:ring-1 focus:ring-violet-200"
                          />
                        </div>
                        <div className="max-h-56 overflow-y-auto p-1">
                          {assigneeOptions.length === 0 ? (
                            <div className="px-3 py-4 text-center text-[11px] text-gray-400">
                              No hay más personas disponibles
                            </div>
                          ) : (
                            <>
                              {/* Members section */}
                              {assigneeOptions.some(o => o.type === 'user') && (
                                <div className="px-2 pt-1 pb-0.5 text-[10px] font-medium text-gray-400 uppercase tracking-wide">Miembros</div>
                              )}
                              {assigneeOptions.filter(o => o.type === 'user').map((opt) => (
                                <button
                                  key={opt.id}
                                  onClick={() => {
                                    setNewCardAssignees(prev => [...prev, opt]);
                                    setAssigneeSearch("");
                                  }}
                                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
                                >
                                  {opt.avatarUrl ? (
                                    <img src={opt.avatarUrl} className="w-6 h-6 rounded-full object-cover" alt="" />
                                  ) : (
                                    <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white bg-gradient-to-br from-blue-400 to-blue-600">
                                      {opt.name[0]?.toUpperCase()}
                                    </span>
                                  )}
                                  <div className="text-[12px] text-gray-900 truncate">{opt.name}</div>
                                </button>
                              ))}
                              {/* Agents section */}
                              {assigneeOptions.some(o => o.type === 'agent') && (
                                <div className="px-2 pt-2 pb-0.5 text-[10px] font-medium text-gray-400 uppercase tracking-wide">Agentes</div>
                              )}
                              {assigneeOptions.filter(o => o.type === 'agent').map((opt) => (
                                <button
                                  key={opt.id}
                                  onClick={() => {
                                    setNewCardAssignees(prev => [...prev, opt]);
                                    setAssigneeSearch("");
                                  }}
                                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
                                >
                                  {opt.avatarUrl ? (
                                    <img src={opt.avatarUrl} className="w-6 h-6 rounded-full object-cover" alt="" />
                                  ) : (
                                    <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white bg-gradient-to-br from-purple-400 to-violet-600">
                                      {opt.name[0]?.toUpperCase()}
                                    </span>
                                  )}
                                  <div className="flex-1 min-w-0 text-left">
                                    <div className="text-[12px] text-gray-900 truncate">{opt.name}</div>
                                  </div>
                                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${
                                    ('tier' in opt && opt.tier === 'core')
                                      ? 'bg-blue-100 text-blue-600'
                                      : 'bg-purple-100 text-purple-600'
                                  }`}>
                                    {('tier' in opt && opt.tier === 'core') ? 'CORE' : 'ADVANCE'}
                                  </span>
                                </button>
                              ))}
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={() => {
                      setIsAddingCard(false);
                      setNewCardTitle("");
                      setNewCardDescription("");
                      setNewCardPriority(0);
                      setNewCardAssignees([]);
                      setShowAssigneePicker(false);
                      setAssigneeSearch("");
                    }}
                    className="px-3 py-1.5 text-[12px] text-gray-500 hover:text-gray-700 font-medium transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleAddCard}
                    disabled={!newCardTitle.trim()}
                    className="px-3 py-1.5 text-[12px] bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    Crear tarea
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* See all / Show less toggle */}
          {hasMoreCards && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="w-full mt-2 py-2 text-[12px] text-gray-500 hover:text-gray-700 rounded-lg flex items-center justify-center gap-1 transition-colors duration-200 hover:bg-white/60"
            >
              {isExpanded ? (
                <>
                  <ChevronUpIcon className="w-3.5 h-3.5" />
                  <span>Ver menos</span>
                </>
              ) : (
                <>
                  <ChevronDownIcon className="w-3.5 h-3.5" />
                  <span>Ver todo ({hiddenCount} más)</span>
                </>
              )}
            </button>
          )}

          {/* Add Card Button - stays at bottom */}
          {!isAddingCard && (
            <button
              onClick={() => setIsAddingCard(true)}
              className="w-full mt-2 py-3 text-[13px] text-gray-400 hover:text-gray-600 rounded-lg flex items-center justify-center gap-1.5 transition-colors duration-200 hover:bg-white/60"
            >
              <PlusIcon className="w-4 h-4 stroke-2" />
              <span>Añadir tarjeta</span>
            </button>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={showDeleteConfirm}
        title="Eliminar columna"
        message={`¿Estás seguro de que quieres eliminar "${column.name}"? Todas las tarjetas de esta columna también se eliminarán.`}
        confirmLabel="Eliminar"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
});

export default KanbanColumn;
