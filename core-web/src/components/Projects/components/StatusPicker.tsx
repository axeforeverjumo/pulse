import { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { CheckIcon } from '@heroicons/react/24/outline';
import { useProjectsStore } from '../../../stores/projectsStore';
import { useProjectBoard, useUpdateIssue, type ProjectState } from '../../../hooks/queries/useProjects';

interface StatusPickerProps {
  issueId: string;
  boardId?: string;
  currentStatusId: string;
  buttonClassName?: string;
}

export default function StatusPicker({ issueId, boardId, currentStatusId, buttonClassName = '' }: StatusPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // UI state from store
  const activeProjectId = useProjectsStore((state) => state.activeProjectId);
  const resolvedBoardId = boardId ?? activeProjectId;

  // React Query data
  const { data: boardData } = useProjectBoard(resolvedBoardId);
  const columns = useMemo(() => {
    if (!boardData?.states) return [];
    return [...boardData.states].sort((a, b) => a.position - b.position);
  }, [boardData?.states]);

  // React Query mutations
  const updateIssue = useUpdateIssue(resolvedBoardId);

  const currentStatus = columns.find((c) => c.id === currentStatusId);

  const getStatusDotColor = (status: { name?: string; color?: string } | undefined) => {
    const name = status?.name?.trim().toLowerCase();
    if (name === 'to do' || name === 'todo' || name === 'to-do') {
      if (!status?.color || status.color === '#94A3B8' || status.color === '#3B82F6') {
        return '#EF4444';
      }
    }
    return status?.color || '#94A3B8';
  };

  const handleStatusChange = (status: ProjectState) => {
    setIsOpen(false);
    if (status.id === currentStatusId) return;
    updateIssue.mutate({ issueId, updates: { state_id: status.id } });
  };

  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const dropdownWidth = 200;
      
      let left = rect.left;
      if (left + dropdownWidth > window.innerWidth - 8) {
        left = window.innerWidth - dropdownWidth - 8;
      }
      if (left < 8) left = 8;

      setDropdownPosition({
        top: rect.bottom + 4,
        left,
      });
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current && 
        !dropdownRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation(); // Prevent row click
          setIsOpen(!isOpen);
        }}
        className={`flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors ${buttonClassName}`}
      >
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: getStatusDotColor(currentStatus) }}
        />
        <span className="truncate text-sm text-gray-700">
          {currentStatus?.name || 'Unknown'}
        </span>
      </button>

      {isOpen && createPortal(
        <div
          ref={dropdownRef}
          className="fixed z-[100] bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden py-1 w-48"
          style={{ top: dropdownPosition.top, left: dropdownPosition.left }}
        >
          {columns.map((status) => (
            <button
              key={status.id}
              onClick={(e) => {
                e.stopPropagation();
                handleStatusChange(status);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 transition-colors text-left"
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: getStatusDotColor(status) }}
              />
              <span className="flex-1 truncate text-gray-700">{status.name}</span>
              {status.id === currentStatusId && (
                <CheckIcon className="w-4 h-4 text-gray-900 shrink-0" />
              )}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}
