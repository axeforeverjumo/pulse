import type { ComponentDefinition, RendererProps } from '../../engine/types';

function SelectRenderer({ node, resolvedProps }: RendererProps) {
  const label = (resolvedProps.label as string) || '';
  const placeholder = (resolvedProps.placeholder as string) || 'Seleccionar...';
  const options = (resolvedProps.options as Array<{ label: string; value: string }>) || [];
  const multiple = (resolvedProps.multiple as boolean) || false;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', ...node._styles }}>
      {label && (
        <label style={{ fontSize: '14px', fontWeight: 500, color: '#374151' }}>
          {label}
        </label>
      )}
      <select
        multiple={multiple}
        style={{
          padding: '8px 12px',
          border: '1px solid #D1D5DB',
          borderRadius: '6px',
          fontSize: '14px',
          outline: 'none',
          width: '100%',
          boxSizing: 'border-box',
          backgroundColor: '#fff',
        }}
        defaultValue=""
      >
        {!multiple && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((opt, i) => (
          <option key={i} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

const definition: ComponentDefinition = {
  type: 'Select',
  name: 'Selector',
  icon: 'ChevronDown',
  category: 'form',
  hasChildren: false,
  properties: [
    { key: 'label', label: 'Etiqueta', type: 'text', defaultValue: '' },
    { key: 'placeholder', label: 'Placeholder', type: 'text', defaultValue: 'Seleccionar...' },
    { key: 'options', label: 'Opciones', type: 'json', defaultValue: [] },
    { key: 'multiple', label: 'Multiple', type: 'boolean', defaultValue: false },
  ],
  component: SelectRenderer,
};

export default definition;
