import { useState, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  XMarkIcon,
  TrashIcon,
  CalendarIcon,
  PlusIcon,
  EllipsisHorizontalIcon,
  PaperClipIcon,
  DocumentIcon,
} from '@heroicons/react/24/outline';
import { Flag } from '@phosphor-icons/react';
import { useProjectsStore } from '../../../stores/projectsStore';
import { useAuthStore } from '../../../stores/authStore';
import {
  useProjectBoard,
  useProjectMembers,
  useUpdateIssue,
  useDeleteIssue,
  useProjectAgentQueue,
  type ProjectIssue,
} from '../../../hooks/queries/useProjects';
import { getRelativeDate, formatDateFull } from '../../../utils/dateUtils';
import { getPresignedUploadUrl, confirmFileUpload, createRefinement, getIssueDependencies, addIssueDependency, removeIssueDependency, searchBoardIssues, type IssueDependency } from '../../../api/client';
import { resolveUploadMimeType } from '../../../utils/uploadMime';
import DatePicker from '../../ui/DatePicker';
import LabelPicker from './LabelPicker';
import AssigneePicker from './AssigneePicker';
import StackedAvatars from './StackedAvatars';
import IssueComments from './IssueComments';
import AgentLogPanel from './AgentLogPanel';
import { toast } from 'sonner';

interface CardDetailModalProps {
  card: ProjectIssue;
  onClose: () => void;
  initialEdit?: boolean;
  isDevelopmentBoard?: boolean;
}

// Priority: 4=highest, 3=high, 2=medium, 1=low,image.png 0=none
const PRIORITY_OPTIONS = [
  { value: 0, label: 'None', color: 'text-gray-300', bg: 'bg-gray-50' },
  { value: 1, label: '1', color: 'text-slate-500', bg: 'bg-slate-100' },
  { value: 2, label: '2', color: 'text-amber-500', bg: 'bg-amber-50' },
  { value: 3, label: '3', color: 'text-orange-500', bg: 'bg-orange-50' },
  { value: 4, label: '4', color: 'text-rose-500', bg: 'bg-rose-50' },
] as const;

function DependenciesSection({ issueId, boardId }: { issueId: string; boardId: string }) {
  const [deps, setDeps] = useState<IssueDependency[]>([]);
  const [isBlocked, setIsBlocked] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ id: string; number: number; title: string; completed_at?: string }[]>([]);
  const [searching, setSearching] = useState(false);

  const fetchDeps = useCallback(async () => {
    try {
      const r = await getIssueDependencies(issueId);
      setDeps(r.dependencies);
      setIsBlocked(r.is_blocked);
    } catch { /* ignore */ }
  }, [issueId]);

  // Load deps on mount
  const mounted = useRef(false);
  if (!mounted.current) { mounted.current = true; fetchDeps(); }

  // Search with debounce
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const handleSearch = (q: string) => {
    setSearchQuery(q);
    clearTimeout(searchTimer.current);
    if (q.trim().length < 1) { setSearchResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await searchBoardIssues(boardId, q);
        // Filter out self and existing deps
        const depIds = new Set(deps.map(d => d.depends_on_issue_id));
        setSearchResults((r.issues || []).filter(i => i.id !== issueId && !depIds.has(i.id)));
      } catch { /* ignore */ }
      setSearching(false);
    }, 300);
  };

  const handleAdd = async (targetId: string) => {
    try {
      await addIssueDependency(issueId, targetId);
      toast.success('Dependencia añadida');
      setSearchQuery('');
      setSearchResults([]);
      setShowAdd(false);
      fetchDeps();
    } catch (e: any) {
      toast.error(e?.detail || e?.message || 'Error al añadir dependencia');
    }
  };

  const handleRemove = async (depId: string) => {
    try {
      await removeIssueDependency(issueId, depId);
      fetchDeps();
    } catch { toast.error('Error'); }
  };

  if (deps.length === 0 && !showAdd) {
    return (
      <div className="border-t border-gray-100 pt-4 pb-2">
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 text-[12px] font-medium text-gray-500 hover:text-gray-700 transition-colors"
        >
          <PlusIcon className="w-3.5 h-3.5" />
          Añadir dependencia
        </button>
      </div>
    );
  }

  return (
    <div className="border-t border-gray-100 pt-4 pb-2 space-y-2">
      {isBlocked && (
        <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-[12px] text-amber-700 font-medium flex items-center gap-2">
          <svg className="w-4 h-4 text-amber-500 shrink-0" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" /></svg>
          Bloqueada — dependencias pendientes
        </div>
      )}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Depende de</span>
        <button onClick={() => setShowAdd(!showAdd)} className="text-[11px] text-gray-400 hover:text-gray-600">
          {showAdd ? 'Cancelar' : '+ Añadir'}
        </button>
      </div>
      {deps.map((d) => (
        <div key={d.id} className="flex items-center justify-between px-3 py-1.5 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${d.resolved ? 'bg-green-400' : 'bg-amber-400'}`} />
            <span className="text-[12px] text-gray-700">#{d.number} {d.title}</span>
            {d.resolved && <span className="text-[10px] text-green-500 font-medium">Completada</span>}
          </div>
          <button onClick={() => handleRemove(d.id)} className="text-[11px] text-gray-400 hover:text-red-500">x</button>
        </div>
      ))}
      {showAdd && (
        <div className="space-y-1.5">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Buscar por numero o titulo..."
            className="w-full px-3 py-1.5 text-[12px] border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200"
            autoFocus
          />
          {searching && <p className="text-[11px] text-gray-400">Buscando...</p>}
          {searchResults.length > 0 && (
            <div className="max-h-32 overflow-y-auto space-y-1">
              {searchResults.map(r => (
                <button
                  key={r.id}
                  onClick={() => handleAdd(r.id)}
                  className="w-full text-left px-3 py-1.5 text-[12px] bg-gray-50 hover:bg-indigo-50 rounded-lg flex items-center gap-2 transition-colors"
                >
                  <span className="text-gray-400 font-mono">#{r.number}</span>
                  <span className="text-gray-700 truncate">{r.title}</span>
                  {r.completed_at && <span className="text-[10px] text-green-500 ml-auto shrink-0">Done</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RefinementSection({ issueId, parentIssueId, onCreated }: { issueId: string; parentIssueId?: string | null; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);

  if (parentIssueId) {
    return (
      <div className="border-t border-gray-100 pt-4 pb-2">
        <p className="text-[11px] text-gray-400">Esta es una tarea de refinamiento</p>
      </div>
    );
  }

  const handleCreate = async () => {
    if (!text.trim()) return;
    setLoading(true);
    try {
      const ref = await createRefinement(issueId, text);
      toast.success(`Refinamiento #${ref.number} creado`);
      setText('');
      setOpen(false);
      onCreated();
    } catch {
      toast.error('Error al crear refinamiento');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border-t border-gray-100 pt-4 pb-2">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 text-[12px] font-medium text-amber-600 hover:text-amber-800 transition-colors"
        >
          <PlusIcon className="w-3.5 h-3.5" />
          Añadir refinamiento
        </button>
      ) : (
        <div className="space-y-2">
          <label className="block text-[11px] font-medium text-gray-500">Que hay que corregir o completar?</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            autoFocus
            placeholder="Describe que falta, que fallo o que hay que ajustar..."
            className="w-full px-3 py-2 text-[13px] border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-400 resize-none"
          />
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={loading || !text.trim()}
              className="px-3 py-1.5 text-[12px] font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-40"
            >
              {loading ? 'Creando...' : 'Crear refinamiento'}
            </button>
            <button
              onClick={() => { setOpen(false); setText(''); }}
              className="px-3 py-1.5 text-[12px] font-medium text-gray-500 hover:text-gray-700"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CardDetailModal({ card, onClose, initialEdit = false, isDevelopmentBoard = false }: CardDetailModalProps) {
  const [isEditing, setIsEditing] = useState(initialEdit);
  const [isVisible, setIsVisible] = useState(true);
  const [showMenu, setShowMenu] = useState(false);

  // React Query mutations
  const updateIssue = useUpdateIssue(card.board_id);
  const deleteIssue = useDeleteIssue(card.board_id);

  // React Query data
  const workspaceId = useProjectsStore((state) => state.workspaceId);
  const { data: boardData } = useProjectBoard(card.board_id);
  const { data: members = [] } = useProjectMembers(workspaceId);
  const states = boardData?.states ?? [];
  const currentUserId = useAuthStore((s) => s.user?.id);

  // Helper to get member by user_id
  const getMemberByUserId = useCallback(
    (userId: string) => members.find((m) => m.user_id === userId),
    [members]
  );

  // Detect if this card has an agent assignee and a running job
  const hasAgentAssignee = card.assignees?.some((a) => a.assignee_type === 'agent');
  const workspaceAppId = card.workspace_app_id ?? null;
  const { data: queueJobs = [] } = useProjectAgentQueue(
    workspaceAppId,
    card.board_id,
    { enabled: !!hasAgentAssignee },
  );
  const runningJobId = useMemo(() => {
    const job = queueJobs.find(
      (j) => j.issue_id === card.id && (j.status === 'running' || j.status === 'queued'),
    );
    return job?.id ?? null;
  }, [queueJobs, card.id]);

  const creator = card.created_by ? getMemberByUserId(card.created_by) : null;
  const currentMember = currentUserId ? members.find((m) => m.user_id === currentUserId) : null;
  const canDelete = card.created_by === currentUserId || currentMember?.role === 'owner' || currentMember?.role === 'admin';
  const mouseDownTargetRef = useRef<EventTarget | null>(null);

  const closeModal = () => {
    setIsVisible(false);
  };

  const handleClose = () => {
    // If editing and has a title, save changes before closing
    if (isEditing && title.trim()) {
      handleSave();
    } else {
      closeModal();
    }
  };

  // Normalize ISO timestamp to YYYY-MM-DD for date input
  const toDateInputValue = (iso: string | undefined | null): string => {
    if (!iso) return '';
    return iso.slice(0, 10);
  };

  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description || '');
  const [priority, setPriority] = useState<number>(card.priority);
  const [showPriorityPicker, setShowPriorityPicker] = useState(false);
  const [dueDate, setDueDate] = useState(toDateInputValue(card.due_at));
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  // Attachment state - uses existing image_r2_keys column for generic files
  const [attachments, setAttachments] = useState(() => {
    if (card.attachments && card.attachments.length > 0) return card.attachments;
    const keys = card.image_r2_keys || [];
    const urls = card.image_urls || [];
    return keys.map((key, index) => {
      const url = urls[index] || '';
      const filename = key.split('/').pop() || 'archivo';
      return {
        r2_key: key,
        filename,
        mime_type: url ? 'image/*' : 'application/octet-stream',
        file_size: undefined,
        url,
        is_image: !!url,
      };
    });
  });
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const [checklistItems, setChecklistItems] = useState<
    Array<{ id: string; text: string; done: boolean; created_at?: string; completed_at?: string }>
  >(card.checklist_items || []);
  const [newChecklistItem, setNewChecklistItem] = useState('');

  const column = states.find((s) => s.id === card.state_id);
  const priorityConfig = PRIORITY_OPTIONS.find((p) => p.value === priority);

  // Track which attachments were added/removed for atomic operations
  const [addedAttachmentKeys, setAddedAttachmentKeys] = useState<string[]>([]);
  const [removedAttachmentKeys, setRemovedAttachmentKeys] = useState<string[]>([]);

  const handleAttachmentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const mimeType = resolveUploadMimeType(file);

    setIsUploadingAttachment(true);
    try {
      const uploadInfo = await getPresignedUploadUrl({
        workspaceId: card.workspace_id,
        filename: file.name,
        contentType: mimeType,
        fileSize: file.size,
        createDocument: false,
      });

      await fetch(uploadInfo.upload_url, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': mimeType },
      });

      const confirmResult = await confirmFileUpload(uploadInfo.file_id, {
        createDocument: false,
      });

      const newR2Key = confirmResult.file.r2_key || uploadInfo.r2_key;
      const contentType = confirmResult.file.content_type || mimeType;
      const filename = confirmResult.file.filename || file.name;
      const newUrl = confirmResult.file.public_url || uploadInfo.public_url || '';

      setAttachments((prev) => [
        ...prev,
        {
          r2_key: newR2Key,
          filename,
          mime_type: contentType,
          file_size: confirmResult.file.file_size || file.size,
          url: newUrl,
          is_image: contentType.startsWith('image/'),
        },
      ]);
      setAddedAttachmentKeys((prev) => [...prev, newR2Key]);
    } catch (error) {
      console.error('Failed to upload attachment:', error);
    } finally {
      setIsUploadingAttachment(false);
      if (attachmentInputRef.current) attachmentInputRef.current.value = '';
    }
  };

  const handleRemoveAttachment = (index: number) => {
    const keyToRemove = attachments[index]?.r2_key;
    if (!keyToRemove) return;
    setAttachments((prev) => prev.filter((_, i) => i !== index));
    if (!addedAttachmentKeys.includes(keyToRemove)) {
      setRemovedAttachmentKeys((prev) => [...prev, keyToRemove]);
    } else {
      setAddedAttachmentKeys((prev) => prev.filter((k) => k !== keyToRemove));
    }
  };

  const addChecklistItem = () => {
    const text = newChecklistItem.trim();
    if (!text) return;
    const id = (globalThis.crypto?.randomUUID?.() || `chk-${Date.now()}`).toString();
    setChecklistItems((prev) => [
      ...prev,
      { id, text, done: false, created_at: new Date().toISOString() },
    ]);
    setNewChecklistItem('');
  };

  const toggleChecklistItem = (id: string, done: boolean) => {
    setChecklistItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              done,
              completed_at: done ? (item.completed_at || new Date().toISOString()) : undefined,
            }
          : item
      )
    );
  };

  const removeChecklistItem = (id: string) => {
    setChecklistItems((prev) => prev.filter((item) => item.id !== id));
  };

  const applyDescriptionFormat = (kind: 'bold' | 'italic' | 'h1' | 'h2' | 'bullet') => {
    const el = descriptionRef.current;
    if (!el) return;

    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const selected = description.slice(start, end);

    let replacement = selected;
    if (kind === 'bold') replacement = `**${selected || 'texto'}**`;
    if (kind === 'italic') replacement = `*${selected || 'texto'}*`;
    if (kind === 'h1') replacement = `# ${selected || 'Título'}`;
    if (kind === 'h2') replacement = `## ${selected || 'Subtítulo'}`;
    if (kind === 'bullet') {
      const base = selected || 'Elemento';
      replacement = base
        .split('\n')
        .map((line) => `- ${line}`)
        .join('\n');
    }

    const next = description.slice(0, start) + replacement + description.slice(end);
    setDescription(next);

    requestAnimationFrame(() => {
      const caret = start + replacement.length;
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  };

  const handleSave = async () => {
    if (!title.trim()) return;

    // Optimistically close for faster perceived performance
    closeModal();

    // Build update object
    const updates: Parameters<typeof updateIssue.mutate>[0]['updates'] = {
      title: title.trim(),
      description: description.trim() || undefined,
      priority,
      due_at: dueDate || undefined,
      clear_due_at: !dueDate && !!card.due_at,
      checklist_items: checklistItems,
    };

    // Handle attachment changes - stored in image_r2_keys backend column
    if (addedAttachmentKeys.length > 0 && removedAttachmentKeys.length === 0) {
      updates.add_image_r2_keys = addedAttachmentKeys;
    } else if (removedAttachmentKeys.length > 0 && addedAttachmentKeys.length === 0) {
      updates.remove_image_r2_keys = removedAttachmentKeys;
    } else if (addedAttachmentKeys.length > 0 || removedAttachmentKeys.length > 0) {
      updates.image_r2_keys = attachments.map((attachment) => attachment.r2_key);
    }

    updateIssue.mutate({ issueId: card.id, updates });
  };

  const handleDelete = () => {
    deleteIssue.mutate(card.id);
    closeModal();
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes || Number.isNaN(bytes)) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return createPortal(
    <AnimatePresence onExitComplete={onClose}>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 bg-black/30 flex items-center justify-center z-9999"
          onMouseDown={(e) => { mouseDownTargetRef.current = e.target; }}
          onClick={(e) => e.target === e.currentTarget && mouseDownTargetRef.current === e.currentTarget && handleClose()}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
            className="bg-white rounded-lg shadow-[0_24px_48px_-12px_rgba(0,0,0,0.15)] overflow-hidden flex flex-col"
            style={{ height: '720px', maxHeight: '90vh', width: '720px', maxWidth: 'calc(100% - 2rem)' }}
            onClick={(e) => e.stopPropagation()}
          >
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-6 pb-0">
          <div className="flex-1 pr-4">
            {column && (
              <div className="flex items-center gap-2 mb-3">
                <div
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    backgroundColor:
                      column.name?.trim().toLowerCase() === 'to do' ||
                      column.name?.trim().toLowerCase() === 'todo' ||
                      column.name?.trim().toLowerCase() === 'to-do'
                        ? '#EF4444'
                        : (column.color || '#94a3b8'),
                  }}
                />
                <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">
                  {column.name}
                </span>
              </div>
            )}
            {isEditing ? (
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full text-lg font-medium text-gray-900 bg-transparent border-0 p-0 focus:outline-none focus:ring-0 placeholder:text-gray-300"
                placeholder="Título de tarjeta"
                autoFocus
              />
            ) : (
              <h2 className="text-lg font-medium text-gray-900 leading-snug">
                {card.title}
              </h2>
            )}
          </div>
          <div className="flex items-center gap-1">
            <div className="relative">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="p-1.5 text-gray-300 hover:text-gray-500 rounded-lg transition-colors"
              >
                <EllipsisHorizontalIcon className="w-4.5 h-4.5 stroke-2" />
              </button>
              {showMenu && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowMenu(false)}
                  />
                  <div className="absolute top-full right-0 z-20 mt-1 w-36 bg-white rounded-lg shadow-lg border border-gray-100 overflow-hidden py-1">
                    {canDelete ? (
                      <button
                        onClick={() => {
                          setShowMenu(false);
                          handleDelete();
                        }}
                        className="w-[calc(100%-8px)] mx-1 flex items-center gap-2 px-2 py-1.5 text-[12px] text-red-500 hover:bg-red-50 rounded-md transition-colors"
                      >
                        <TrashIcon className="w-4 h-4" />
                        Delete
                      </button>
                    ) : (
                      <button
                        disabled
                        title="Solo el creador de la tarjeta o los administradores pueden eliminar"
                        className="w-[calc(100%-8px)] mx-1 flex items-center gap-2 px-2 py-1.5 text-[12px] text-gray-300 cursor-not-allowed rounded-md"
                      >
                        <TrashIcon className="w-4 h-4" />
                        Delete
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
            <button
              onClick={handleClose}
              className="p-1.5 -mr-1 text-gray-300 hover:text-gray-500 rounded-lg transition-colors"
            >
              <XMarkIcon className="w-4.5 h-4.5 stroke-2" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 pb-6 pt-6 overflow-y-auto flex-1">
          {isEditing ? (
            <div className="space-y-5">
              {/* Row with Priority, Due Date, Labels, Assignees */}
              <div className="flex flex-wrap items-center gap-4">
                {/* Priority Picker */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowPriorityPicker(!showPriorityPicker)}
                    className="flex items-center gap-2 px-3 py-2 text-[13px] bg-white rounded-xl transition-all text-left hover:bg-gray-50/60"
                  >
                    {priority > 0 && priorityConfig ? (
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        <Flag size={14} weight="fill" className={priorityConfig.color} />
                        <span className="text-gray-700 font-medium">P{priority}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-gray-400 flex-1">
                        <Flag size={14} weight="fill" />
                        <span>Sin prioridad</span>
                      </div>
                    )}
                  </button>

                  {showPriorityPicker && (
                    <>
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setShowPriorityPicker(false)}
                      />
                      <div className="absolute top-full left-0 z-20 mt-1 w-40 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden py-1">
                        <button
                          onClick={() => {
                            setPriority(0);
                            setShowPriorityPicker(false);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-[12px] hover:bg-gray-50 transition-colors"
                        >
                          <span className="text-gray-400">Sin prioridad</span>
                          {priority === 0 && <span className="ml-auto text-blue-600">✓</span>}
                        </button>
                        {PRIORITY_OPTIONS.filter((o) => o.value > 0).map((option) => (
                          <button
                            key={option.value}
                            onClick={() => {
                              setPriority(option.value);
                              setShowPriorityPicker(false);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-[12px] hover:bg-gray-50 transition-colors"
                          >
                            <Flag size={14} weight="fill" className={option.color} />
                            <span className="text-gray-700">Priority {option.value}</span>
                            {priority === option.value && <span className="ml-auto text-blue-600">✓</span>}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* Due Date */}
                <div>
                  <DatePicker
                    value={dueDate}
                    onChange={setDueDate}
                    placeholder="Sin fecha límite"
                    buttonClassName="!px-3 hover:bg-gray-50/60"
                  />
                </div>

                {/* Labels */}
                <div>
                  <LabelPicker
                    issueId={card.id}
                    boardId={card.board_id}
                    currentLabels={card.label_objects || []}
                    buttonClassName="!px-3 !py-2 hover:bg-gray-50/60"
                  />
                </div>

                {/* Assignees */}
                <div>
                  <AssigneePicker
                    issueId={card.id}
                    boardId={card.board_id}
                    currentAssignees={card.assignees || []}
                    buttonClassName="!px-3 !py-2 hover:bg-gray-50/60"
                    isDevTask={card.is_dev_task}
                    isDevelopmentBoard={isDevelopmentBoard}
                  />
                </div>
              </div>

              {/* Description */}
              <div className="border-t border-gray-100 pt-5">
                <div className="flex flex-wrap items-center gap-1.5 mb-2">
                  <button
                    type="button"
                    onClick={() => applyDescriptionFormat('bold')}
                    className="px-2 py-1 text-[11px] border border-gray-200 rounded-md hover:bg-gray-50"
                  >
                    B
                  </button>
                  <button
                    type="button"
                    onClick={() => applyDescriptionFormat('italic')}
                    className="px-2 py-1 text-[11px] border border-gray-200 rounded-md italic hover:bg-gray-50"
                  >
                    I
                  </button>
                  <button
                    type="button"
                    onClick={() => applyDescriptionFormat('h1')}
                    className="px-2 py-1 text-[11px] border border-gray-200 rounded-md hover:bg-gray-50"
                  >
                    H1
                  </button>
                  <button
                    type="button"
                    onClick={() => applyDescriptionFormat('h2')}
                    className="px-2 py-1 text-[11px] border border-gray-200 rounded-md hover:bg-gray-50"
                  >
                    H2
                  </button>
                  <button
                    type="button"
                    onClick={() => applyDescriptionFormat('bullet')}
                    className="px-2 py-1 text-[11px] border border-gray-200 rounded-md hover:bg-gray-50"
                  >
                    • Lista
                  </button>
                </div>
                <textarea
                  ref={descriptionRef}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={6}
                  className="w-full py-1.5 text-[13px] text-gray-700 bg-transparent border-0 focus:outline-none placeholder:text-gray-400 resize-none transition-all"
                  placeholder="Añadir una descripción..."
                />
              </div>

              {/* Attachments */}
              <div className="border-t border-gray-100 pt-5">
                <div className="flex items-center gap-2 mb-4">
                  <PaperClipIcon className="w-4 h-4 text-gray-400" />
                  <span className="text-[12px] font-medium text-gray-500">Adjuntos</span>
                </div>
                <input
                  ref={attachmentInputRef}
                  type="file"
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.md,.html,.htm,.json,.xml"
                  onChange={handleAttachmentUpload}
                  className="hidden"
                />
                <div className="flex flex-wrap gap-3">
                  {attachments.map((attachment, index) => (
                    <div key={attachment.r2_key} className="relative group">
                      {attachment.is_image ? (
                        <div className="relative w-20 h-20">
                          <img
                            src={attachment.url}
                            alt={attachment.filename}
                            className="w-full h-full object-cover rounded-lg"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveAttachment(index)}
                            className="absolute top-1 right-1 p-1 bg-black/50 hover:bg-black/70 text-white rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <XMarkIcon className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="relative min-w-[170px] max-w-[220px] p-2 border border-gray-200 rounded-lg bg-white">
                          <div className="flex items-center gap-2">
                            <DocumentIcon className="w-4 h-4 text-gray-400 shrink-0" />
                            <div className="min-w-0">
                              <p className="text-[12px] text-gray-700 truncate">{attachment.filename}</p>
                              <p className="text-[11px] text-gray-400">{formatFileSize(attachment.file_size)}</p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveAttachment(index)}
                            className="absolute top-1 right-1 p-1 text-gray-400 hover:text-red-500"
                          >
                            <XMarkIcon className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => attachmentInputRef.current?.click()}
                    disabled={isUploadingAttachment}
                    className="w-16 h-16 flex items-center justify-center border border-border-gray hover:border-gray-300 rounded-lg text-gray-400 hover:text-gray-500 transition-colors disabled:opacity-50"
                  >
                    {isUploadingAttachment ? (
                      <span className="text-[10px]">...</span>
                    ) : (
                      <PlusIcon className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Checklist */}
              <div className="border-t border-gray-100 pt-5">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="text-[12px] font-medium text-gray-500">Checklist</span>
                  {checklistItems.length > 0 && (
                    <span className="text-[11px] text-gray-400">
                      {checklistItems.filter((item) => item.done).length}/{checklistItems.length}
                    </span>
                  )}
                </div>
                <div className="space-y-2">
                  {checklistItems.map((item) => (
                    <div key={item.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={item.done}
                        onChange={(e) => toggleChecklistItem(item.id, e.target.checked)}
                        className="rounded border-gray-300 text-gray-900 focus:ring-gray-300"
                      />
                      <span className={`text-[13px] flex-1 ${item.done ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
                        {item.text}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeChecklistItem(item.id)}
                        className="text-[12px] text-gray-400 hover:text-red-500"
                      >
                        Quitar
                      </button>
                    </div>
                  ))}
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newChecklistItem}
                      onChange={(e) => setNewChecklistItem(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addChecklistItem();
                        }
                      }}
                      placeholder="Añadir item..."
                      className="flex-1 px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-lg focus:outline-none focus:border-gray-300"
                    />
                    <button
                      type="button"
                      onClick={addChecklistItem}
                      className="px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-lg hover:bg-gray-50"
                    >
                      Añadir
                    </button>
                  </div>
                </div>
              </div>

              {/* Agent Log Panel */}
              {runningJobId && (
                <div className="border-t border-gray-100 pt-5">
                  <AgentLogPanel jobId={runningJobId} />
                </div>
              )}

              {/* Comments section */}
              <div className="border-t border-gray-100 pt-5">
                <IssueComments issueId={card.id} />
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Priority and Due Date row */}
              <div className="flex items-center gap-4">
                {card.priority > 0 && (
                  <div className="flex items-center gap-1.5">
                    <Flag size={14} weight="fill" className={priorityConfig?.color} />
                    <span className="text-[12px] text-gray-500">Priority {card.priority}</span>
                  </div>
                )}
                {card.due_at && (() => {
                  const dateInfo = getRelativeDate(card.due_at);
                  return (
                    <>
                      {card.priority > 0 && <div className="w-px h-3 bg-gray-200" />}
                      <div className={`flex items-center gap-1.5 text-[12px] ${
                        dateInfo.isOverdue ? 'text-red-500' : dateInfo.isSoon ? 'text-amber-600' : 'text-gray-500'
                      }`}>
                        <CalendarIcon className="w-3.5 h-3.5" />
                        {dateInfo.text}
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* Description */}
              {description ? (
                <p className="text-[13px] text-gray-600 leading-relaxed whitespace-pre-wrap">
                  {description}
                </p>
              ) : (
                <p className="text-[13px] text-gray-400 italic">Sin descripción</p>
              )}

              {/* Labels */}
              {card.label_objects && card.label_objects.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {card.label_objects.map((label) => (
                    <span
                      key={label.id}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium"
                      style={{
                        backgroundColor: label.color + '1F',
                        color: label.color,
                      }}
                    >
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: label.color }}
                      />
                      {label.name}
                    </span>
                  ))}
                </div>
              )}

              {/* Assignees */}
              {card.assignees && card.assignees.length > 0 && (
                <div className="flex items-center gap-2.5">
                  <StackedAvatars
                    userIds={card.assignees.filter((a) => a.assignee_type !== 'agent' && a.user_id).map((a) => a.user_id!)}
                    maxVisible={6}
                    size="md"
                  />
                </div>
              )}

              {/* Checklist */}
              {checklistItems.length > 0 && (
                <div className="border-t border-gray-100 pt-5">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-[12px] font-medium text-gray-500">Checklist</span>
                    <span className="text-[11px] text-gray-400">
                      {checklistItems.filter((item) => item.done).length}/{checklistItems.length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {checklistItems.map((item) => (
                      <div key={item.id} className="flex items-center gap-2 text-[13px]">
                        <input type="checkbox" checked={item.done} readOnly className="rounded border-gray-300 text-gray-900 focus:ring-0" />
                        <span className={item.done ? 'text-gray-400 line-through' : 'text-gray-700'}>{item.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Attachments */}
              {attachments.length > 0 && (
                <div className="border-t border-gray-100 pt-5">
                  <div className="flex items-center gap-2 mb-4">
                    <PaperClipIcon className="w-4 h-4 text-gray-400" />
                    <span className="text-[12px] font-medium text-gray-500">Adjuntos</span>
                  </div>
                  <div className="space-y-2">
                    {attachments.map((attachment) => (
                      <div key={attachment.r2_key} className="border border-gray-100 rounded-lg p-2.5 bg-gray-50/50">
                        {attachment.is_image ? (
                          <a href={attachment.url} target="_blank" rel="noopener noreferrer" className="block">
                            <img src={attachment.url} alt={attachment.filename} className="max-h-52 rounded-lg object-cover" />
                          </a>
                        ) : (
                          <a
                            href={attachment.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 hover:text-blue-600 transition-colors"
                          >
                            <DocumentIcon className="w-4 h-4 text-gray-400 shrink-0" />
                            <div className="min-w-0">
                              <p className="text-[13px] text-gray-700 truncate">{attachment.filename}</p>
                              <p className="text-[11px] text-gray-400">{formatFileSize(attachment.file_size)}</p>
                            </div>
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Agent Log Panel */}
              {runningJobId && (
                <div className="border-t border-gray-100 pt-5">
                  <AgentLogPanel jobId={runningJobId} />
                </div>
              )}

              {/* Dependencies section */}
              <DependenciesSection issueId={card.id} boardId={card.board_id} />

              {/* Refinement section */}
              <RefinementSection issueId={card.id} parentIssueId={card.parent_issue_id} onCreated={onClose} />

              {/* Comments section */}
              <div className="border-t border-gray-100 pt-5">
                <IssueComments issueId={card.id} />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 pb-6 pt-4 border-t border-gray-100">
          <div className="flex items-center gap-2 text-[11px] text-gray-400">
            {creator && (
              creator.avatar_url ? (
                <img
                  src={creator.avatar_url}
                  alt={creator.name || creator.email || 'Creator'}
                  className="w-5 h-5 rounded-full object-cover"
                  title={creator.name || creator.email}
                />
              ) : (
                <div
                  className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center text-[9px] font-medium text-gray-600"
                  title={creator.name || creator.email}
                >
                  {(creator.name || creator.email || '?').charAt(0).toUpperCase()}
                </div>
              )
            )}
            {card.created_at && `Created ${formatDateFull(card.created_at)}`}
          </div>
          <div className="flex items-center gap-2">
            {isEditing ? (
              <button
                onClick={handleSave}
                disabled={!title.trim()}
                className="px-3 py-2 text-[12px] font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-40 transition-all"
              >
                Save
              </button>
            ) : (
              <button
                onClick={() => setIsEditing(true)}
                className="px-3 py-1.5 text-[12px] font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
              >
                Edit
              </button>
            )}
          </div>
        </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
