import { useState, useEffect, useRef } from 'react';
import { PlusIcon, XMarkIcon, TagIcon } from '@heroicons/react/24/outline';
import { getCrmTags, createCrmTag } from '../../api/client';
import { toast } from 'sonner';

interface Tag {
  id: string;
  name: string;
  color: string;
  entity_type: string;
}

interface TagManagerProps {
  workspaceId: string;
  selectedTags: string[];
  onChange: (tags: string[]) => void;
  entityType?: 'contact' | 'company' | 'opportunity';
  compact?: boolean;
}

const TAG_COLORS = [
  '#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1',
];

export default function TagManager({ workspaceId, selectedTags, onChange, entityType, compact }: TagManagerProps) {
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [creating, setCreating] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (workspaceId) {
      getCrmTags(workspaceId).then((res) => setAllTags(res.tags || [])).catch(() => {});
    }
  }, [workspaceId]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleTag = (tagName: string) => {
    if (selectedTags.includes(tagName)) {
      onChange(selectedTags.filter((t) => t !== tagName));
    } else {
      onChange([...selectedTags, tagName]);
    }
  };

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;
    setCreating(true);
    try {
      const color = TAG_COLORS[allTags.length % TAG_COLORS.length];
      const res = await createCrmTag({
        workspace_id: workspaceId,
        name: newTagName.trim(),
        color,
        entity_type: entityType || 'all',
      });
      setAllTags([...allTags, res.tag]);
      onChange([...selectedTags, res.tag.name]);
      setNewTagName('');
    } catch (err: any) {
      toast.error(err.message || 'Error al crear tag');
    } finally {
      setCreating(false);
    }
  };

  const filteredTags = allTags.filter((t) =>
    t.entity_type === 'all' || t.entity_type === entityType
  );

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Selected tags pills */}
      <div className="flex flex-wrap gap-1.5 items-center">
        {selectedTags.map((tagName) => {
          const tag = allTags.find((t) => t.name === tagName);
          return (
            <span
              key={tagName}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium text-white"
              style={{ backgroundColor: tag?.color || '#6B7280' }}
            >
              {tagName}
              <button
                onClick={() => toggleTag(tagName)}
                className="hover:bg-white/20 rounded-full p-0.5"
              >
                <XMarkIcon className="w-3 h-3" />
              </button>
            </span>
          );
        })}
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border border-dashed border-slate-300 text-slate-500 hover:border-blue-400 hover:text-blue-500 transition-colors ${compact ? 'py-0.5' : ''}`}
        >
          <TagIcon className="w-3 h-3" />
          {!compact && 'Tag'}
        </button>
      </div>

      {/* Dropdown */}
      {showDropdown && (
        <div className="absolute z-50 mt-1 w-56 bg-white rounded-xl border border-slate-200 shadow-lg p-2 space-y-1">
          {filteredTags.map((tag) => {
            const isSelected = selectedTags.includes(tag.name);
            return (
              <button
                key={tag.id}
                onClick={() => toggleTag(tag.name)}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  isSelected ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
                {tag.name}
                {isSelected && <span className="ml-auto text-blue-400 text-[10px]">activo</span>}
              </button>
            );
          })}

          {/* Create new tag */}
          <div className="flex items-center gap-1 pt-1 border-t border-slate-100">
            <input
              type="text"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateTag()}
              placeholder="Nuevo tag..."
              className="flex-1 text-xs px-2 py-1.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-300"
            />
            <button
              onClick={handleCreateTag}
              disabled={creating || !newTagName.trim()}
              className="p-1.5 rounded-lg bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 transition-colors"
            >
              <PlusIcon className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
