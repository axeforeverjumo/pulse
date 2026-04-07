import type { ComponentDefinition, RendererProps } from '../../engine/types';

function CheckboxRenderer({ node, resolvedProps }: RendererProps) {
  const label = (resolvedProps.label as string) || 'Opcion';
  const checked = (resolvedProps.checked as boolean) || false;
  const disabled = (resolvedProps.disabled as boolean) || false;

  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        ...node._styles,
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        readOnly
        style={{ width: '16px', height: '16px', accentColor: '#4F46E5' }}
      />
      <span style={{ fontSize: '14px', color: '#374151' }}>{label}</span>
    </label>
  );
}

const definition: ComponentDefinition = {
  type: 'Checkbox',
  name: 'Casilla',
  icon: 'CheckSquare',
  category: 'form',
  hasChildren: false,
  properties: [
    { key: 'label', label: 'Etiqueta', type: 'text', defaultValue: 'Opcion' },
    { key: 'checked', label: 'Marcado', type: 'boolean', defaultValue: false },
    { key: 'disabled', label: 'Deshabilitado', type: 'boolean', defaultValue: false },
  ],
  component: CheckboxRenderer,
};

export default definition;
