import type { ComponentDefinition, RendererProps } from '../../engine/types';

function TextRenderer({ node, resolvedProps }: RendererProps) {
  const content = (resolvedProps.content as string) || 'Texto de ejemplo';
  const variant = (resolvedProps.variant as string) || 'body';
  const color = resolvedProps.color as string | undefined;
  const fontWeight = (resolvedProps.fontWeight as string) || 'normal';
  const textAlign = (resolvedProps.textAlign as string) || 'left';

  const baseStyle = { color, fontWeight, textAlign: textAlign as 'left' | 'center' | 'right' | 'justify', ...node._styles };

  switch (variant) {
    case 'h1':
      return <h1 style={{ fontSize: '2rem', lineHeight: 1.2, margin: 0, ...baseStyle }}>{content}</h1>;
    case 'h2':
      return <h2 style={{ fontSize: '1.5rem', lineHeight: 1.3, margin: 0, ...baseStyle }}>{content}</h2>;
    case 'h3':
      return <h3 style={{ fontSize: '1.25rem', lineHeight: 1.4, margin: 0, ...baseStyle }}>{content}</h3>;
    case 'h4':
      return <h4 style={{ fontSize: '1.1rem', lineHeight: 1.4, margin: 0, ...baseStyle }}>{content}</h4>;
    case 'caption':
      return <span style={{ fontSize: '11px', margin: 0, ...baseStyle, color: color || '#6B7280' }}>{content}</span>;
    default:
      return <p style={{ fontSize: '1rem', lineHeight: 1.6, margin: 0, ...baseStyle }}>{content}</p>;
  }
}

const definition: ComponentDefinition = {
  type: 'Text',
  name: 'Texto',
  icon: 'Type',
  category: 'basic',
  hasChildren: false,
  properties: [
    { key: 'content', label: 'Contenido', type: 'expression', defaultValue: 'Texto de ejemplo' },
    {
      key: 'variant',
      label: 'Variante',
      type: 'select',
      defaultValue: 'body',
      options: [
        { label: 'H1', value: 'h1' },
        { label: 'H2', value: 'h2' },
        { label: 'H3', value: 'h3' },
        { label: 'H4', value: 'h4' },
        { label: 'Body', value: 'body' },
        { label: 'Caption', value: 'caption' },
      ],
    },
    { key: 'color', label: 'Color', type: 'color' },
    {
      key: 'fontWeight',
      label: 'Peso de fuente',
      type: 'select',
      defaultValue: 'normal',
      options: [
        { label: 'Normal', value: 'normal' },
        { label: 'Medium', value: '500' },
        { label: 'Semibold', value: '600' },
        { label: 'Bold', value: 'bold' },
      ],
    },
    {
      key: 'textAlign',
      label: 'Alineacion',
      type: 'select',
      defaultValue: 'left',
      options: [
        { label: 'Izquierda', value: 'left' },
        { label: 'Centro', value: 'center' },
        { label: 'Derecha', value: 'right' },
        { label: 'Justificado', value: 'justify' },
      ],
    },
  ],
  component: TextRenderer,
};

export default definition;
