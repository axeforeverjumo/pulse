import type { ComponentDefinition, RendererProps } from '../../engine/types';

function ContainerRenderer({ node, resolvedProps, isEditing, children }: RendererProps) {
  const direction = (resolvedProps.direction as string) || 'column';
  const gap = (resolvedProps.gap as string) || '8px';
  const padding = (resolvedProps.padding as string) || '16px';
  const alignItems = (resolvedProps.alignItems as string) || 'stretch';
  const justifyContent = (resolvedProps.justifyContent as string) || 'start';
  const backgroundColor = resolvedProps.backgroundColor as string | undefined;
  const borderRadius = (resolvedProps.borderRadius as string) || '0px';
  const overflow = (resolvedProps.overflow as string) || 'visible';

  const hasChildren = Array.isArray(node._children) && node._children.length > 0;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: direction as 'column' | 'row',
        gap,
        padding,
        alignItems,
        justifyContent,
        backgroundColor,
        borderRadius,
        overflow,
        minHeight: '40px',
        ...(!hasChildren && isEditing
          ? { border: '2px dashed #D1D5DB', alignItems: 'center', justifyContent: 'center' }
          : {}),
        ...node._styles,
      }}
    >
      {hasChildren ? children : isEditing ? (
        <span style={{ color: '#9CA3AF', fontSize: '13px', userSelect: 'none' }}>
          Arrastra componentes aqui
        </span>
      ) : null}
    </div>
  );
}

const definition: ComponentDefinition = {
  type: 'Container',
  name: 'Contenedor',
  icon: 'Square',
  category: 'layout',
  hasChildren: true,
  properties: [
    {
      key: 'direction',
      label: 'Direccion',
      type: 'select',
      defaultValue: 'column',
      options: [
        { label: 'Columna', value: 'column' },
        { label: 'Fila', value: 'row' },
      ],
    },
    { key: 'gap', label: 'Gap', type: 'text', defaultValue: '8px' },
    { key: 'padding', label: 'Padding', type: 'text', defaultValue: '16px' },
    {
      key: 'alignItems',
      label: 'Alinear items',
      type: 'select',
      defaultValue: 'stretch',
      options: [
        { label: 'Inicio', value: 'start' },
        { label: 'Centro', value: 'center' },
        { label: 'Fin', value: 'end' },
        { label: 'Estirar', value: 'stretch' },
      ],
    },
    {
      key: 'justifyContent',
      label: 'Justificar contenido',
      type: 'select',
      defaultValue: 'start',
      options: [
        { label: 'Inicio', value: 'start' },
        { label: 'Centro', value: 'center' },
        { label: 'Fin', value: 'end' },
        { label: 'Espacio entre', value: 'space-between' },
      ],
    },
    { key: 'backgroundColor', label: 'Color de fondo', type: 'color' },
    { key: 'borderRadius', label: 'Border radius', type: 'text', defaultValue: '0px' },
    {
      key: 'overflow',
      label: 'Overflow',
      type: 'select',
      defaultValue: 'visible',
      options: [
        { label: 'Visible', value: 'visible' },
        { label: 'Oculto', value: 'hidden' },
        { label: 'Auto', value: 'auto' },
      ],
    },
  ],
  component: ContainerRenderer,
};

export default definition;
