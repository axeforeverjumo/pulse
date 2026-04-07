import type { ComponentDefinition, RendererProps } from '../../engine/types';

const variantColors: Record<string, { bg: string; text: string }> = {
  default: { bg: '#F3F4F6', text: '#374151' },
  success: { bg: '#D1FAE5', text: '#065F46' },
  warning: { bg: '#FEF3C7', text: '#92400E' },
  error: { bg: '#FEE2E2', text: '#991B1B' },
  info: { bg: '#DBEAFE', text: '#1E40AF' },
};

function BadgeRenderer({ node, resolvedProps }: RendererProps) {
  const text = (resolvedProps.text as string) || 'Badge';
  const variant = (resolvedProps.variant as string) || 'default';
  const size = (resolvedProps.size as string) || 'md';

  const colors = variantColors[variant] || variantColors.default;

  return (
    <span
      style={{
        display: 'inline-block',
        backgroundColor: colors.bg,
        color: colors.text,
        borderRadius: '9999px',
        fontWeight: 500,
        lineHeight: 1,
        ...(size === 'sm'
          ? { padding: '2px 8px', fontSize: '11px' }
          : { padding: '4px 12px', fontSize: '13px' }),
        ...node._styles,
      }}
    >
      {text}
    </span>
  );
}

const definition: ComponentDefinition = {
  type: 'Badge',
  name: 'Etiqueta',
  icon: 'Tag',
  category: 'basic',
  hasChildren: false,
  properties: [
    { key: 'text', label: 'Texto', type: 'expression', defaultValue: 'Badge' },
    {
      key: 'variant',
      label: 'Variante',
      type: 'select',
      defaultValue: 'default',
      options: [
        { label: 'Default', value: 'default' },
        { label: 'Exito', value: 'success' },
        { label: 'Advertencia', value: 'warning' },
        { label: 'Error', value: 'error' },
        { label: 'Info', value: 'info' },
      ],
    },
    {
      key: 'size',
      label: 'Tamano',
      type: 'select',
      defaultValue: 'md',
      options: [
        { label: 'Pequeno', value: 'sm' },
        { label: 'Mediano', value: 'md' },
      ],
    },
  ],
  component: BadgeRenderer,
};

export default definition;
