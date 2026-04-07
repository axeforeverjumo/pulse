import { useState } from 'react';
import { ChevronRight, ChevronDown, Trash2 } from 'lucide-react';
import { useStudioStore } from '../../../stores/studioStore';
import { registry } from '../engine/registry';
import { removeNode } from '../engine/nodeFactory';
import type { ComponentNode } from '../engine/types';

export default function ComponentTree() {
  const { componentTree, selectedComponentId, selectComponent, updateTree } = useStudioStore();

  if (!componentTree) {
    return <p className="text-[11px] text-gray-400 text-center py-4">Sin componentes</p>;
  }

  const handleDelete = (nodeId: string) => {
    if (nodeId === componentTree._id) return; // can't delete root
    const newTree = removeNode(componentTree, nodeId);
    updateTree(newTree);
    if (selectedComponentId === nodeId) selectComponent(null);
  };

  return (
    <div className="space-y-0.5">
      <TreeNode
        node={componentTree}
        depth={0}
        selectedId={selectedComponentId}
        onSelect={selectComponent}
        onDelete={handleDelete}
      />
    </div>
  );
}

function TreeNode({
  node,
  depth,
  selectedId,
  onSelect,
  onDelete,
}: {
  node: ComponentNode;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const def = registry.get(node._component);
  const hasChildren = (node._children?.length ?? 0) > 0;
  const isSelected = selectedId === node._id;

  return (
    <div>
      <div
        className={`flex items-center gap-1 px-1 py-1 rounded-md cursor-pointer group transition-colors ${
          isSelected
            ? 'bg-indigo-50 text-indigo-700'
            : 'text-gray-600 hover:bg-gray-100'
        }`}
        style={{ paddingLeft: depth * 16 + 4 }}
        onClick={() => onSelect(node._id)}
      >
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="p-0.5 shrink-0"
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}
        <span className="text-[11px] font-medium truncate flex-1">
          {def?.name || node._component}
        </span>
        {depth > 0 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(node._id);
            }}
            className="p-0.5 opacity-0 group-hover:opacity-100 hover:text-red-500 shrink-0"
          >
            <Trash2 size={11} />
          </button>
        )}
      </div>
      {expanded && hasChildren && node._children?.map((child) => (
        <TreeNode
          key={child._id}
          node={child}
          depth={depth + 1}
          selectedId={selectedId}
          onSelect={onSelect}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
