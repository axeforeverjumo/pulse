import type { ComponentDefinition, RendererProps } from '../../engine/types';

function FormRenderer({ node, resolvedProps, children, isEditing }: RendererProps) {
  const resetOnSubmit = resolvedProps.resetOnSubmit !== false;
  const submitLabel = (resolvedProps.submitLabel as string) || 'Enviar';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isEditing) return;
    if (resetOnSubmit) {
      const form = e.target as HTMLFormElement;
      form.reset();
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        ...node._styles,
      }}
    >
      {children}
      <button
        type="submit"
        disabled={isEditing}
        style={{
          padding: '8px 20px',
          background: '#3B82F6',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          fontSize: '14px',
          fontWeight: 500,
          cursor: isEditing ? 'default' : 'pointer',
          opacity: isEditing ? 0.7 : 1,
          alignSelf: 'flex-start',
        }}
      >
        {submitLabel}
      </button>
    </form>
  );
}

const definition: ComponentDefinition = {
  type: 'Form',
  name: 'Formulario',
  icon: 'FileInput',
  category: 'advanced',
  hasChildren: true,
  properties: [
    { key: 'resetOnSubmit', label: 'Resetear al enviar', type: 'boolean', defaultValue: true },
    { key: 'submitLabel', label: 'Texto del boton', type: 'text', defaultValue: 'Enviar' },
  ],
  component: FormRenderer,
};

export default definition;
