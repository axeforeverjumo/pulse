import type { ComponentDefinition, RendererProps } from '../../engine/types';

function ModalRenderer({ node, resolvedProps, children, isEditing }: RendererProps) {
  const title = (resolvedProps.title as string) || 'Modal';
  const size = (resolvedProps.size as string) || 'md';
  const showClose = resolvedProps.showClose !== false;

  const sizeWidths: Record<string, string> = {
    sm: '360px',
    md: '480px',
    lg: '640px',
    xl: '800px',
  };

  const maxW = sizeWidths[size] || sizeWidths.md;

  return (
    <div
      style={{
        width: '100%',
        maxWidth: maxW,
        border: '1px solid #E5E7EB',
        borderRadius: '12px',
        background: 'white',
        overflow: 'hidden',
        position: 'relative',
        ...node._styles,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid #F3F4F6',
          background: '#FAFAFA',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isEditing && (
            <span
              style={{
                fontSize: '10px',
                background: '#8B5CF6',
                color: 'white',
                padding: '1px 6px',
                borderRadius: '4px',
                fontWeight: 500,
              }}
            >
              Modal
            </span>
          )}
          <span style={{ fontSize: '14px', fontWeight: 600, color: '#111827' }}>{title}</span>
        </div>
        {showClose && (
          <span style={{ fontSize: '18px', color: '#9CA3AF', cursor: 'pointer', lineHeight: 1 }}>
            &times;
          </span>
        )}
      </div>
      {/* Body */}
      <div style={{ padding: '16px', minHeight: '60px' }}>
        {children}
      </div>
    </div>
  );
}

const definition: ComponentDefinition = {
  type: 'Modal',
  name: 'Modal',
  icon: 'Maximize2',
  category: 'advanced',
  hasChildren: true,
  properties: [
    { key: 'title', label: 'Titulo', type: 'text', defaultValue: 'Modal' },
    {
      key: 'size',
      label: 'Tamano',
      type: 'select',
      defaultValue: 'md',
      options: [
        { label: 'Pequeno', value: 'sm' },
        { label: 'Mediano', value: 'md' },
        { label: 'Grande', value: 'lg' },
        { label: 'Extra grande', value: 'xl' },
      ],
    },
    { key: 'showClose', label: 'Boton cerrar', type: 'boolean', defaultValue: true },
  ],
  component: ModalRenderer,
};

export default definition;
