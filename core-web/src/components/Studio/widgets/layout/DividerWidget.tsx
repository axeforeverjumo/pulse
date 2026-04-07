import type { ComponentDefinition, RendererProps } from '../../engine/types';

function DividerRenderer({ node, resolvedProps }: RendererProps) {
  const color = (resolvedProps.color as string) || '#E5E7EB';
  const thickness = (resolvedProps.thickness as string) || '1px';
  const margin = (resolvedProps.margin as string) || '8px';

  return (
    <hr
      style={{
        border: 'none',
        borderTop: `${thickness} solid ${color}`,
        margin: `${margin} 0`,
        ...node._styles,
      }}
    />
  );
}

const definition: ComponentDefinition = {
  type: 'Divider',
  name: 'Divisor',
  icon: 'Minus',
  category: 'layout',
  hasChildren: false,
  properties: [
    { key: 'color', label: 'Color', type: 'color', defaultValue: '#E5E7EB' },
    { key: 'thickness', label: 'Grosor', type: 'text', defaultValue: '1px' },
    { key: 'margin', label: 'Margen', type: 'text', defaultValue: '8px' },
  ],
  component: DividerRenderer,
};

export default definition;
