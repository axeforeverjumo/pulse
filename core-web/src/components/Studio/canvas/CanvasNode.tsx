import { useDraggable } from '@dnd-kit/core';
import { useStudioStore } from '../../../stores/studioStore';
import { registry } from '../engine/registry';
import type { ComponentNode } from '../engine/types';

interface CanvasNodeProps {
  node: ComponentNode;
  isEditing: boolean;
}

export default function CanvasNode({ node, isEditing }: CanvasNodeProps) {
  const { selectedComponentId, hoveredComponentId, selectComponent, hoverComponent } = useStudioStore();

  const isSelected = selectedComponentId === node._id;
  const isHovered = hoveredComponentId === node._id;

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `canvas-${node._id}`,
    data: { type: 'move', nodeId: node._id },
    disabled: !isEditing,
  });

  const def = registry.get(node._component);
  const Component = def?.component;

  // Build resolvedProps (no expression evaluation yet — raw values)
  const resolvedProps: Record<string, unknown> = {};
  if (def) {
    for (const prop of def.properties) {
      resolvedProps[prop.key] = node[prop.key] ?? prop.defaultValue;
    }
  }

  // Render children if container
  let childNodes: React.ReactNode = null;
  if (def?.hasChildren && node._children) {
    childNodes = node._children.map((child) => (
      <CanvasNode key={child._id} node={child} isEditing={isEditing} />
    ));
  }

  return (
    <div
      ref={setNodeRef}
      onClick={(e) => {
        e.stopPropagation();
        if (isEditing) selectComponent(node._id);
      }}
      onMouseEnter={() => isEditing && hoverComponent(node._id)}
      onMouseLeave={() => isEditing && hoverComponent(null)}
      className={`relative group ${isDragging ? 'opacity-40' : ''}`}
      style={{ position: 'relative' }}
    >
      {/* Selection / Hover ring */}
      {isEditing && (isSelected || isHovered) && (
        <div
          className={`absolute inset-0 pointer-events-none z-10 rounded ${
            isSelected ? 'ring-2 ring-indigo-500' : 'ring-1 ring-indigo-300'
          }`}
        />
      )}

      {/* Component type badge */}
      {isEditing && (isSelected || isHovered) && (
        <span
          className={`absolute -top-5 left-0 text-[9px] px-1.5 py-0.5 rounded font-medium z-20 whitespace-nowrap ${
            isSelected ? 'bg-indigo-500 text-white' : 'bg-indigo-100 text-indigo-600'
          }`}
        >
          {def?.name || node._component}
        </span>
      )}

      {/* Drag handle */}
      {isEditing && isSelected && (
        <div
          {...listeners}
          {...attributes}
          className="absolute -top-5 right-0 z-20 cursor-grab active:cursor-grabbing p-0.5 rounded bg-indigo-500 text-white"
          title="Arrastrar"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
            <circle cx="3" cy="3" r="1" /><circle cx="7" cy="3" r="1" />
            <circle cx="3" cy="7" r="1" /><circle cx="7" cy="7" r="1" />
          </svg>
        </div>
      )}

      {/* Actual component */}
      {Component ? (
        <Component
          node={node}
          isEditing={isEditing}
          isSelected={isSelected}
          isHovered={isHovered}
          resolvedProps={resolvedProps}
        >
          {childNodes}
        </Component>
      ) : (
        <div className="bg-gray-50 border border-gray-200 rounded-md p-3 text-[11px] text-gray-500">
          [{node._component}] — widget no registrado
        </div>
      )}
    </div>
  );
}
