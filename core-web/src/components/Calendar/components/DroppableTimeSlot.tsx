import { useDroppable } from '@dnd-kit/core';

interface DroppableTimeSlotProps {
  id: string;
  date: Date;
  hour: number;
  minute?: number;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onPointerDown?: (e: React.PointerEvent<HTMLButtonElement>) => void;
  className?: string;
  style?: React.CSSProperties;
}

export default function DroppableTimeSlot({
  id,
  date,
  hour,
  minute = 0,
  onClick,
  onPointerDown,
  className = '',
  style
}: DroppableTimeSlotProps) {
  const { setNodeRef } = useDroppable({
    id,
    data: { date, hour, minute, type: 'timeSlot' }
  });

  return (
    <button
      ref={setNodeRef}
      onClick={onClick}
      onPointerDown={onPointerDown}
      className={className}
      style={{
        background: 'transparent',
        padding: 0,
        cursor: 'default',
        position: 'relative',
        ...style
      }}
    />
  );
}
