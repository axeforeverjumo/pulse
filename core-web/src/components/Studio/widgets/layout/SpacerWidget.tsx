import type { ComponentDefinition, RendererProps } from '../../engine/types';

function SpacerRenderer({ node, resolvedProps, isEditing }: RendererProps) {
  const size = (resolvedProps.size as string) || '24px';

  return (
    <div
      style={{
        height: size,
        width: '100%',
        ...(isEditing
          ? { borderTop: '1px dashed #D1D5DB', borderBottom: '1px dashed #D1D5DB', opacity: 0.6 }
          : {}),
        ...node._styles,
      }}
    />
  );
}

const definition: ComponentDefinition = {
  type: 'Spacer',
  name: 'Espaciador',
  icon: 'MoveVertical',
  category: 'layout',
  hasChildren: false,
  properties: [
    { key: 'size', label: 'Tamano', type: 'text', defaultValue: '24px' },
  ],
  component: SpacerRenderer,
};

export default definition;
