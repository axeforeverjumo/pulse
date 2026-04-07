import type { ComponentDefinition, RendererProps } from '../../engine/types';

function InputRenderer({ node, resolvedProps }: RendererProps) {
  const label = (resolvedProps.label as string) || '';
  const placeholder = (resolvedProps.placeholder as string) || 'Escribe aqui...';
  const inputType = (resolvedProps.inputType as string) || 'text';
  const required = (resolvedProps.required as boolean) || false;
  const helperText = (resolvedProps.helperText as string) || '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', ...node._styles }}>
      {label && (
        <label style={{ fontSize: '14px', fontWeight: 500, color: '#374151' }}>
          {label}
          {required && <span style={{ color: '#DC2626', marginLeft: '2px' }}>*</span>}
        </label>
      )}
      <input
        type={inputType}
        placeholder={placeholder}
        required={required}
        style={{
          padding: '8px 12px',
          border: '1px solid #D1D5DB',
          borderRadius: '6px',
          fontSize: '14px',
          outline: 'none',
          width: '100%',
          boxSizing: 'border-box',
        }}
      />
      {helperText && (
        <span style={{ fontSize: '12px', color: '#6B7280' }}>{helperText}</span>
      )}
    </div>
  );
}

const definition: ComponentDefinition = {
  type: 'Input',
  name: 'Campo de texto',
  icon: 'TextCursorInput',
  category: 'form',
  hasChildren: false,
  properties: [
    { key: 'label', label: 'Etiqueta', type: 'text', defaultValue: '' },
    { key: 'placeholder', label: 'Placeholder', type: 'text', defaultValue: 'Escribe aqui...' },
    {
      key: 'inputType',
      label: 'Tipo',
      type: 'select',
      defaultValue: 'text',
      options: [
        { label: 'Texto', value: 'text' },
        { label: 'Email', value: 'email' },
        { label: 'Contrasena', value: 'password' },
        { label: 'Numero', value: 'number' },
        { label: 'Telefono', value: 'tel' },
        { label: 'URL', value: 'url' },
      ],
    },
    { key: 'required', label: 'Requerido', type: 'boolean', defaultValue: false },
    { key: 'helperText', label: 'Texto de ayuda', type: 'text' },
  ],
  component: InputRenderer,
};

export default definition;
