import { useDraggable } from '@dnd-kit/core';
import { registry } from '../engine/registry';
import type { ComponentDefinition, WidgetCategory } from '../engine/types';
import {
  Square, Type, RectangleHorizontal, Minus, MoveVertical, Star,
  ExternalLink, Tag, TextCursorInput, ChevronDown, CheckSquare,
  ImageIcon,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const ICON_MAP: Record<string, LucideIcon> = {
  Square, Type, RectangleHorizontal, Minus, MoveVertical, Star,
  ExternalLink, Tag, TextCursorInput, ChevronDown, CheckSquare,
  ImageIcon, Image: ImageIcon,
};

const CATEGORY_LABELS: Record<WidgetCategory, string> = {
  layout: 'Layout',
  basic: 'Basico',
  form: 'Formulario',
  data: 'Datos',
  media: 'Media',
  navigation: 'Navegacion',
  advanced: 'Avanzado',
};

const CATEGORY_ORDER: WidgetCategory[] = ['layout', 'basic', 'form', 'media', 'data', 'advanced', 'navigation'];

export default function ComponentPalette() {
  const categories = CATEGORY_ORDER.filter((cat) => registry.getByCategory(cat).length > 0);

  return (
    <div className="space-y-3">
      {categories.map((cat) => (
        <div key={cat}>
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            {CATEGORY_LABELS[cat]}
          </span>
          <div className="grid grid-cols-2 gap-1 mt-1.5">
            {registry.getByCategory(cat).map((def) => (
              <PaletteItem key={def.type} definition={def} />
            ))}
          </div>
        </div>
      ))}

      {categories.length === 0 && (
        <p className="text-[11px] text-gray-400 text-center py-4">
          No hay widgets registrados
        </p>
      )}
    </div>
  );
}

function PaletteItem({ definition }: { definition: ComponentDefinition }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${definition.type}`,
    data: { type: 'new', componentType: definition.type },
  });

  const IconComp = ICON_MAP[definition.icon];

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`flex flex-col items-center gap-1 px-2 py-2.5 rounded-lg border border-transparent cursor-grab active:cursor-grabbing transition-all text-center ${
        isDragging
          ? 'opacity-40 bg-indigo-50 border-indigo-200'
          : 'hover:bg-white hover:border-gray-200 hover:shadow-sm'
      }`}
    >
      {IconComp ? (
        <IconComp size={16} className="text-gray-500" />
      ) : (
        <div className="w-4 h-4 bg-gray-200 rounded" />
      )}
      <span className="text-[10px] text-gray-600 leading-tight">{definition.name}</span>
    </div>
  );
}
