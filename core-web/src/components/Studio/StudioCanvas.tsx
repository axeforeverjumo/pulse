import { useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useState } from 'react';
import { MousePointer2 } from 'lucide-react';
import { useStudioStore } from '../../stores/studioStore';
import { registry } from './engine/registry';
import { createNode, insertNode, moveNode, findNode } from './engine/nodeFactory';
import type { ComponentNode } from './engine/types';
import CanvasNode from './canvas/CanvasNode';
import DropZone from './canvas/DropZone';

export default function StudioCanvas() {
  const { componentTree, isPreviewMode, selectComponent, updateTree } = useStudioStore();
  const [activeDrag, setActiveDrag] = useState<{ type: 'new' | 'move'; label: string } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as any;
    if (data?.type === 'new') {
      const def = registry.get(data.componentType);
      setActiveDrag({ type: 'new', label: def?.name || data.componentType });
    } else if (data?.type === 'move') {
      const node = componentTree ? findNode(componentTree, data.nodeId) : null;
      const def = node ? registry.get(node._component) : null;
      setActiveDrag({ type: 'move', label: def?.name || '?' });
    }
  }, [componentTree]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveDrag(null);
    const { active, over } = event;
    if (!over || !componentTree) return;

    const dragData = active.data.current as any;
    const dropData = over.data.current as any;

    if (!dropData || dropData.type !== 'drop') return;
    const { parentId, index } = dropData;

    if (dragData.type === 'new') {
      const newNode = createNode(dragData.componentType);
      const newTree = insertNode(componentTree, newNode, parentId, index);
      updateTree(newTree);
      selectComponent(newNode._id);
    } else if (dragData.type === 'move') {
      const newTree = moveNode(componentTree, dragData.nodeId, parentId, index);
      updateTree(newTree);
    }
  }, [componentTree, updateTree, selectComponent]);

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div
        className="flex-1 overflow-auto bg-[#f0f2f5]"
        onClick={() => selectComponent(null)}
      >
        <div className="min-h-full p-8 flex justify-center">
          <div
            className={`bg-white shadow-sm rounded-lg w-full max-w-[1200px] min-h-[600px] ${
              isPreviewMode ? '' : 'border-2 border-dashed border-gray-200'
            }`}
          >
            {componentTree ? (
              <CanvasContent node={componentTree} isEditing={!isPreviewMode} />
            ) : (
              <div className="flex flex-col items-center justify-center h-full min-h-[600px] text-center">
                <MousePointer2 size={32} className="text-gray-300 mb-3" />
                <p className="text-[14px] font-medium text-gray-400">Canvas vacio</p>
                <p className="text-[12px] text-gray-300 mt-1">
                  Arrastra componentes desde el panel izquierdo
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <DragOverlay>
        {activeDrag && (
          <div className="bg-white border-2 border-indigo-400 rounded-lg px-4 py-2 shadow-lg text-[12px] font-medium text-indigo-700">
            {activeDrag.label}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

function CanvasContent({ node, isEditing }: { node: ComponentNode; isEditing: boolean }) {
  const def = registry.get(node._component);
  const hasChildren = def?.hasChildren ?? (node._children !== undefined);

  if (!hasChildren) {
    return <CanvasNode node={node} isEditing={isEditing} />;
  }

  const children = node._children || [];

  return (
    <CanvasNode node={node} isEditing={isEditing}>
      {isEditing && <DropZone parentId={node._id} index={0} />}
      {children.map((child, i) => (
        <div key={child._id}>
          <CanvasContent node={child} isEditing={isEditing} />
          {isEditing && <DropZone parentId={node._id} index={i + 1} />}
        </div>
      ))}
      {children.length === 0 && isEditing && (
        <div className="border border-dashed border-gray-200 rounded-md p-4 text-[11px] text-gray-300 text-center">
          Arrastra componentes aqui
        </div>
      )}
    </CanvasNode>
  );
}
