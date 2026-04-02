import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { avatarGradient } from '../../../utils/avatarGradient';
import { motion, AnimatePresence } from 'motion/react';
import { CheckIcon } from '@heroicons/react/24/outline';
import { User } from 'lucide-react';
import { Icon } from '../../ui/Icon';
import { useProjectsStore } from '../../../stores/projectsStore';
import {
  useProjectMembers,
  useWorkspaceAgents,
  useAddAssignee,
  useRemoveAssignee,
  useAddAgentAssignee,
  useRemoveAgentAssignee,
  type ProjectIssueAssignee,
  type WorkspaceMember,
  type OpenClawAgent,
} from '../../../hooks/queries/useProjects';

interface AssigneePickerProps {
  issueId: string;
  boardId?: string;
  currentAssignees: ProjectIssueAssignee[];
  buttonClassName?: string;
  emptyState?: 'default' | 'icon-dash' | 'icon-only';
  compact?: boolean;
}

const MAX_ASSIGNEES = 10;

type AssigneeEntry =
  | { type: 'user'; id: string; userId: string; name?: string; email?: string; avatarUrl?: string }
  | { type: 'agent'; id: string; agentId: string; name: string; avatarUrl?: string };

export default function AssigneePicker({ issueId, boardId, currentAssignees, buttonClassName = '', emptyState = 'default', compact = false }: AssigneePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'members' | 'agents'>('members');
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, openAbove: false });
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const workspaceId = useProjectsStore((state) => state.workspaceId);

  const { data: members = [] } = useProjectMembers(workspaceId);
  const { data: agents = [] } = useWorkspaceAgents(workspaceId);

  const membersByUserId = useMemo(() => {
    const map = new Map<string, WorkspaceMember>();
    members.forEach((m) => map.set(m.user_id, m));
    return map;
  }, [members]);

  const agentsById = useMemo(() => {
    const map = new Map<string, OpenClawAgent>();
    agents.forEach((a) => map.set(a.id, a));
    return map;
  }, [agents]);

  const getMemberByUserId = useCallback(
    (userId: string) => membersByUserId.get(userId),
    [membersByUserId]
  );

  const getAgentById = useCallback(
    (agentId: string) => agentsById.get(agentId),
    [agentsById]
  );

  const addAssigneeMutation = useAddAssignee(boardId ?? null);
  const removeAssigneeMutation = useRemoveAssignee(boardId ?? null);
  const addAgentAssigneeMutation = useAddAgentAssignee(boardId ?? null);
  const removeAgentAssigneeMutation = useRemoveAgentAssignee(boardId ?? null);

  const calculateDropdownPosition = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const dropdownWidth = 280;
      const dropdownHeight = 340;

      let left = rect.left;
      if (left + dropdownWidth > window.innerWidth - 8) {
        left = window.innerWidth - dropdownWidth - 8;
      }
      if (left < 8) left = 8;

      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const openAbove = spaceBelow < dropdownHeight && spaceAbove > spaceBelow;

      setDropdownPosition({
        top: openAbove ? rect.top - 4 : rect.bottom + 4,
        left,
        openAbove,
      });
    }
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const clickedInContainer = containerRef.current?.contains(target);
      const clickedInDropdown = dropdownRef.current?.contains(target);

      if (!clickedInContainer && !clickedInDropdown) {
        setIsOpen(false);
        setSearch('');
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const preventScroll = (e: Event) => {
      if (dropdownRef.current?.contains(e.target as Node)) return;
      e.preventDefault();
    };

    document.addEventListener('wheel', preventScroll, { passive: false });
    document.addEventListener('touchmove', preventScroll, { passive: false });

    return () => {
      document.removeEventListener('wheel', preventScroll);
      document.removeEventListener('touchmove', preventScroll);
    };
  }, [isOpen]);

  const assignedUserIds = new Set(
    currentAssignees.filter((a) => a.assignee_type !== 'agent' && a.user_id).map((a) => a.user_id!)
  );
  const assignedAgentIds = new Set(
    currentAssignees.filter((a) => a.assignee_type === 'agent' && a.agent_id).map((a) => a.agent_id!)
  );
  const atMax = currentAssignees.length >= MAX_ASSIGNEES;

  const filteredMembers = members.filter((m) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (m.name?.toLowerCase().includes(s) || m.email?.toLowerCase().includes(s));
  });

  const filteredAgents = agents.filter((a) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return a.name?.toLowerCase().includes(s);
  });

  const getInitials = (member: { name?: string; email?: string }) => {
    if (member.name) {
      return member.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return (member.email?.[0] || '?').toUpperCase();
  };

  const getDisplayName = (member: { name?: string; email?: string }) => {
    return member.name || member.email || 'Desconocido';
  };

  const handleToggleUser = (userId: string) => {
    if (assignedUserIds.has(userId)) {
      removeAssigneeMutation.mutate({ issueId, userId });
    } else if (!atMax) {
      addAssigneeMutation.mutate({ issueId, userId });
    }
  };

  const handleToggleAgent = (agentId: string) => {
    if (assignedAgentIds.has(agentId)) {
      removeAgentAssigneeMutation.mutate({ issueId, agentId });
    } else if (!atMax) {
      addAgentAssigneeMutation.mutate({ issueId, agentId });
    }
  };

  // Build combined assignee display list
  const assigneeEntries: AssigneeEntry[] = useMemo(() => {
    return currentAssignees.map((a) => {
      if (a.assignee_type === 'agent' && a.agent_id) {
        const agentData = getAgentById(a.agent_id);
        return {
          type: 'agent' as const,
          id: a.agent_id,
          agentId: a.agent_id,
          name: agentData?.name || 'Agente',
          avatarUrl: agentData?.avatar_url,
        };
      }
      const member = a.user_id ? getMemberByUserId(a.user_id) : undefined;
      return {
        type: 'user' as const,
        id: a.user_id || a.id,
        userId: a.user_id || '',
        name: member?.name,
        email: member?.email,
        avatarUrl: member?.avatar_url,
      };
    });
  }, [currentAssignees, getMemberByUserId, getAgentById]);

  const renderAvatar = (entry: AssigneeEntry, size: number = 20, className: string = '') => {
    if (entry.type === 'agent') {
      return (
        <div className={`relative shrink-0 ${className}`} style={{ width: size, height: size }}>
          {entry.avatarUrl ? (
            <img
              src={entry.avatarUrl}
              alt={entry.name}
              className="w-full h-full rounded-full object-cover"
            />
          ) : (
            <div className="w-full h-full rounded-full flex items-center justify-center bg-gradient-to-br from-violet-500 to-indigo-600">
              <span className="text-white font-medium" style={{ fontSize: size * 0.4 }}>
                {entry.name.slice(0, 2).toUpperCase()}
              </span>
            </div>
          )}
          <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-violet-600 flex items-center justify-center border border-white">
            <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="10" rx="2" />
              <circle cx="12" cy="5" r="4" />
            </svg>
          </div>
        </div>
      );
    }

    if (entry.avatarUrl) {
      return (
        <img
          src={entry.avatarUrl}
          alt={entry.name || entry.email || ''}
          className={`rounded-full object-cover shrink-0 ${className}`}
          style={{ width: size, height: size }}
        />
      );
    }

    return (
      <div
        className={`rounded-full flex items-center justify-center shrink-0 ${className}`}
        style={{ width: size, height: size, background: avatarGradient(entry.name || entry.email || '?') }}
      >
        <span className="font-medium text-white" style={{ fontSize: size * 0.4 }}>
          {getInitials(entry)}
        </span>
      </div>
    );
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (!isOpen) {
            calculateDropdownPosition();
          }
          setIsOpen(!isOpen);
        }}
        className={`flex items-center gap-2.5 px-3 py-2.5 text-[13px] rounded-xl transition-all text-left ${buttonClassName}`}
      >
        <div className={`flex items-center gap-1 min-w-0 overflow-hidden ${!(compact && emptyState === 'icon-only' && currentAssignees.length === 0) ? 'flex-1' : ''}`}>
          <div className="flex items-center min-h-5">
            <AnimatePresence mode="popLayout">
              {assigneeEntries.length === 0 ? (
                <motion.div
                  key="empty-state"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className={`flex items-center gap-1 text-gray-400 ${emptyState === 'icon-dash' || emptyState === 'icon-only' ? '' : 'gap-1.5'}`}
                >
                  <Icon icon={User} size={compact ? 12 : 14} />
                  {emptyState !== 'icon-only' && (
                    <span className={compact ? 'text-[11px]' : ''}>{emptyState === 'icon-dash' ? '\u2013' : 'Sin asignados'}</span>
                  )}
                </motion.div>
              ) : (
                assigneeEntries.slice(0, 3).map((entry, index) => (
                  <motion.div
                    key={entry.id}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                    className={`w-5 h-5 rounded-full bg-white flex items-center justify-center shrink-0 border border-gray-100/60 ${index > 0 ? '-ml-1.5' : ''}`}
                    title={entry.type === 'agent' ? `${entry.name} (Agente)` : getDisplayName(entry)}
                  >
                    {renderAvatar(entry, 20)}
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>
          {assigneeEntries.length > 0 && !compact && (
            <span className="text-gray-700 truncate ml-1">
              {assigneeEntries.length === 1
                ? assigneeEntries[0].type === 'agent'
                  ? assigneeEntries[0].name
                  : getDisplayName(assigneeEntries[0])
                : `${assigneeEntries.length} asignados`}
            </span>
          )}
          {assigneeEntries.length > 3 && compact && (
            <span className="text-[11px] text-gray-400 ml-0.5">+{assigneeEntries.length - 3}</span>
          )}
        </div>
      </button>

      {isOpen && createPortal(
        <div
          ref={dropdownRef}
          onClick={(e) => e.stopPropagation()}
          className="fixed z-10000 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden"
          style={{
            top: dropdownPosition.top,
            left: dropdownPosition.left,
            width: 280,
            transform: dropdownPosition.openAbove ? 'translateY(-100%)' : undefined,
          }}
        >
          {/* Tabs: Members / Agents */}
          <div className="flex border-b border-gray-100">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setActiveTab('members'); setSearch(''); }}
              className={`flex-1 px-3 py-2 text-[12px] font-medium transition-colors ${
                activeTab === 'members'
                  ? 'text-gray-900 border-b-2 border-gray-900'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              Miembros
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setActiveTab('agents'); setSearch(''); }}
              className={`flex-1 px-3 py-2 text-[12px] font-medium transition-colors ${
                activeTab === 'agents'
                  ? 'text-violet-600 border-b-2 border-violet-600'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <span className="flex items-center justify-center gap-1">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="10" rx="2" />
                  <circle cx="12" cy="5" r="4" />
                </svg>
                Agents
              </span>
            </button>
          </div>

          {/* Search */}
          <div className="p-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={activeTab === 'members' ? 'Buscar miembros...' : 'Buscar agentes...'}
              className="w-full px-2.5 py-1.5 text-[12px] text-gray-700 bg-transparent border-0 rounded-lg focus:outline-none placeholder:text-gray-400"
              autoFocus
            />
          </div>
          {atMax && (
            <div className="px-3 py-1.5 text-[11px] text-amber-600 bg-amber-50">
              Máximo de {MAX_ASSIGNEES} asignados alcanzado
            </div>
          )}

          {/* Members tab */}
          {activeTab === 'members' && (
            <div className="max-h-48 overflow-y-auto p-1.5 flex flex-col gap-0.5 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' as any }}>
              {filteredMembers.map((member) => {
                const isAssigned = assignedUserIds.has(member.user_id);
                const isDisabled = !isAssigned && atMax;
                return (
                  <button
                    key={member.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleUser(member.user_id);
                    }}
                    disabled={isDisabled}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 text-[12px] transition-colors rounded-lg ${
                      isDisabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-50'
                    } ${isAssigned ? 'bg-gray-50' : ''}`}
                  >
                    {member.avatar_url ? (
                      <img
                        src={member.avatar_url}
                        alt={getDisplayName(member)}
                        className="w-5 h-5 rounded-full object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{ background: avatarGradient(member.name || member.email || '?') }}>
                        <span className="text-[10px] font-medium text-white">
                          {getInitials(member)}
                        </span>
                      </div>
                    )}
                    <div className="flex-1 text-left min-w-0">
                      <div className="text-gray-700 font-medium truncate">
                        {getDisplayName(member)}
                      </div>
                      {member.name && member.email && (
                        <div className="text-[11px] text-gray-400 truncate">
                          {member.email}
                        </div>
                      )}
                    </div>
                    {isAssigned && (
                      <CheckIcon className="w-4 h-4 text-gray-900 shrink-0" />
                    )}
                  </button>
                );
              })}
              {filteredMembers.length === 0 && (
                <div className="px-3 py-3 text-[12px] text-gray-400 text-center">
                  No se encontraron miembros
                </div>
              )}
            </div>
          )}

          {/* Agents tab */}
          {activeTab === 'agents' && (
            <div className="max-h-48 overflow-y-auto flex flex-col gap-0.5 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' as any }}>
              {/* Info banner */}
              <div className="px-3 py-2 bg-gray-50 text-[11px] text-gray-500 border-b border-gray-100 shrink-0">
                <span className="font-medium text-blue-600">Core</span>: analizan y responden · <span className="font-medium text-purple-600">Advance</span>: ejecutan trabajo real
              </div>
              <div className="p-1.5 flex flex-col gap-0.5">
              {filteredAgents.map((agent) => {
                const isAssigned = assignedAgentIds.has(agent.id);
                const isDisabled = !isAssigned && atMax;
                return (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleAgent(agent.id);
                    }}
                    disabled={isDisabled}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 text-[12px] transition-colors rounded-lg ${
                      isDisabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-50'
                    } ${isAssigned ? 'bg-violet-50' : ''}`}
                  >
                    <div className="relative shrink-0">
                      {agent.avatar_url ? (
                        <img
                          src={agent.avatar_url}
                          alt={agent.name}
                          className="w-5 h-5 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-5 h-5 rounded-full flex items-center justify-center bg-gradient-to-br from-violet-500 to-indigo-600">
                          <span className="text-[10px] font-medium text-white">
                            {agent.name.slice(0, 2).toUpperCase()}
                          </span>
                        </div>
                      )}
                      <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-violet-600 flex items-center justify-center border border-white">
                        <svg width="6" height="6" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="11" width="18" height="10" rx="2" />
                          <circle cx="12" cy="5" r="4" />
                        </svg>
                      </div>
                    </div>
                    <div className="flex-1 text-left min-w-0">
                      <div className="text-gray-700 font-medium truncate">
                        {agent.name}
                      </div>
                      <div className="text-[11px] text-gray-400 truncate">
                        Agente
                      </div>
                    </div>
                    {isAssigned && (
                      <CheckIcon className="w-4 h-4 text-violet-600 shrink-0" />
                    )}
                  </button>
                );
              })}
              {filteredAgents.length === 0 && (
                <div className="px-3 py-3 text-[12px] text-gray-400 text-center">
                  No hay agentes disponibles
                </div>
              )}
              </div>
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
