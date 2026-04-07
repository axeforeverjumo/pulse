import { useDroppable } from '@dnd-kit/core';

interface DropZoneProps {
  parentId: string;
  index: number;
}

export default function DropZone({ parentId, index }: DropZoneProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: `drop-${parentId}-${index}`,
    data: { type: 'drop', parentId, index },
  });

  return (
    <div
      ref={setNodeRef}
      className={`transition-all ${
        isOver
          ? 'h-6 bg-indigo-100 border-2 border-dashed border-indigo-400 rounded-md my-1'
          : 'h-1 my-0'
      }`}
    />
  );
}
