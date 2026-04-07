import type { ComponentDefinition, RendererProps } from '../../engine/types';

function IconRenderer({ node, resolvedProps }: RendererProps) {
  const name = (resolvedProps.name as string) || 'Star';
  const size = (resolvedProps.size as number) || 24;
  const color = (resolvedProps.color as string) || 'currentColor';
  const strokeWidth = (resolvedProps.strokeWidth as number) || 2;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: 'inline-block', ...node._styles }}
    >
      <rect x={1} y={1} width={size - 2} height={size - 2} rx={3} />
      <text
        x={size / 2}
        y={size / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fill={color}
        stroke="none"
        fontSize={Math.max(7, size * 0.25)}
        fontFamily="sans-serif"
      >
        {name}
      </text>
    </svg>
  );
}

const definition: ComponentDefinition = {
  type: 'Icon',
  name: 'Icono',
  icon: 'Star',
  category: 'basic',
  hasChildren: false,
  properties: [
    { key: 'name', label: 'Nombre del icono', type: 'text', defaultValue: 'Star' },
    { key: 'size', label: 'Tamano', type: 'number', defaultValue: 24 },
    { key: 'color', label: 'Color', type: 'color' },
    { key: 'strokeWidth', label: 'Grosor de trazo', type: 'number', defaultValue: 2 },
  ],
  component: IconRenderer,
};

export default definition;
