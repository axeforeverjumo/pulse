import type { ComponentDefinition, RendererProps } from '../../engine/types';

function CardRenderer({ node, resolvedProps, children }: RendererProps) {
  const title = (resolvedProps.title as string) || '';
  const subtitle = (resolvedProps.subtitle as string) || '';
  const padding = (resolvedProps.padding as string) || '16px';
  const shadow = (resolvedProps.shadow as string) || 'sm';
  const hoverable = resolvedProps.hoverable === true;

  const shadowMap: Record<string, string> = {
    none: 'none',
    sm: '0 1px 2px rgba(0,0,0,0.05)',
    md: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1)',
    lg: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)',
  };

  return (
    <div
      style={{
        background: 'white',
        borderRadius: '12px',
        border: '1px solid #F3F4F6',
        boxShadow: shadowMap[shadow] || shadowMap.sm,
        overflow: 'hidden',
        transition: hoverable ? 'box-shadow 0.2s, transform 0.2s' : undefined,
        ...node._styles,
      }}
    >
      {(title || subtitle) && (
        <div style={{ padding: `${padding} ${padding} 0 ${padding}` }}>
          {title && (
            <div style={{ fontSize: '15px', fontWeight: 600, color: '#111827', lineHeight: 1.3 }}>
              {title}
            </div>
          )}
          {subtitle && (
            <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '2px' }}>
              {subtitle}
            </div>
          )}
        </div>
      )}
      <div style={{ padding }}>
        {children}
      </div>
    </div>
  );
}

const definition: ComponentDefinition = {
  type: 'Card',
  name: 'Tarjeta',
  icon: 'CreditCard',
  category: 'advanced',
  hasChildren: true,
  properties: [
    { key: 'title', label: 'Titulo', type: 'expression', defaultValue: '' },
    { key: 'subtitle', label: 'Subtitulo', type: 'expression', defaultValue: '' },
    { key: 'padding', label: 'Padding', type: 'text', defaultValue: '16px' },
    {
      key: 'shadow',
      label: 'Sombra',
      type: 'select',
      defaultValue: 'sm',
      options: [
        { label: 'Ninguna', value: 'none' },
        { label: 'Pequena', value: 'sm' },
        { label: 'Media', value: 'md' },
        { label: 'Grande', value: 'lg' },
      ],
    },
    { key: 'hoverable', label: 'Hover efecto', type: 'boolean', defaultValue: false },
  ],
  component: CardRenderer,
};

export default definition;
