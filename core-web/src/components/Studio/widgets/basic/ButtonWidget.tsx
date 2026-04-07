import type { ComponentDefinition, RendererProps } from '../../engine/types';

const variantStyles: Record<string, React.CSSProperties> = {
  primary: { backgroundColor: '#4F46E5', color: '#fff', border: 'none' },
  secondary: { backgroundColor: '#E5E7EB', color: '#111827', border: 'none' },
  outline: { backgroundColor: 'transparent', color: '#4F46E5', border: '1px solid #4F46E5' },
  ghost: { backgroundColor: 'transparent', color: '#4F46E5', border: 'none' },
  destructive: { backgroundColor: '#DC2626', color: '#fff', border: 'none' },
};

const sizeStyles: Record<string, React.CSSProperties> = {
  sm: { padding: '4px 12px', fontSize: '13px' },
  md: { padding: '8px 16px', fontSize: '14px' },
  lg: { padding: '12px 24px', fontSize: '16px' },
};

function ButtonRenderer({ node, resolvedProps }: RendererProps) {
  const label = (resolvedProps.label as string) || 'Boton';
  const variant = (resolvedProps.variant as string) || 'primary';
  const size = (resolvedProps.size as string) || 'md';
  const disabled = (resolvedProps.disabled as boolean) || false;
  const fullWidth = (resolvedProps.fullWidth as boolean) || false;

  return (
    <button
      disabled={disabled}
      style={{
        borderRadius: '6px',
        fontWeight: 500,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        width: fullWidth ? '100%' : 'auto',
        ...variantStyles[variant],
        ...sizeStyles[size],
        ...node._styles,
      }}
    >
      {label}
    </button>
  );
}

const definition: ComponentDefinition = {
  type: 'Button',
  name: 'Boton',
  icon: 'RectangleHorizontal',
  category: 'basic',
  hasChildren: false,
  properties: [
    { key: 'label', label: 'Texto', type: 'expression', defaultValue: 'Boton' },
    {
      key: 'variant',
      label: 'Variante',
      type: 'select',
      defaultValue: 'primary',
      options: [
        { label: 'Primario', value: 'primary' },
        { label: 'Secundario', value: 'secondary' },
        { label: 'Outline', value: 'outline' },
        { label: 'Ghost', value: 'ghost' },
        { label: 'Destructivo', value: 'destructive' },
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
        { label: 'Grande', value: 'lg' },
      ],
    },
    { key: 'disabled', label: 'Deshabilitado', type: 'boolean', defaultValue: false },
    { key: 'fullWidth', label: 'Ancho completo', type: 'boolean', defaultValue: false },
  ],
  component: ButtonRenderer,
};

export default definition;
