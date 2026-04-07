import { useMemo } from 'react';
import type { ComponentDefinition, RendererProps } from '../../engine/types';

function RepeaterRenderer({ node, resolvedProps, children, isEditing }: RendererProps) {
  const rawData = resolvedProps.data;
  const direction = (resolvedProps.direction as string) || 'vertical';
  const gap = (resolvedProps.gap as string) || '8px';
  const gridColumns = Number(resolvedProps.gridColumns) || 3;
  const emptyMessage = (resolvedProps.emptyMessage as string) || 'Sin elementos';

  const data: unknown[] = useMemo(() => {
    if (Array.isArray(rawData)) return rawData;
    if (typeof rawData === 'string') {
      try { return JSON.parse(rawData); } catch { return []; }
    }
    return [];
  }, [rawData]);

  const containerStyle: React.CSSProperties = {
    ...node._styles,
    ...(direction === 'grid'
      ? { display: 'grid', gridTemplateColumns: `repeat(${gridColumns}, 1fr)`, gap }
      : direction === 'horizontal'
        ? { display: 'flex', flexDirection: 'row', gap, flexWrap: 'wrap' }
        : { display: 'flex', flexDirection: 'column', gap }),
  };

  if (isEditing) {
    return (
      <div style={containerStyle}>
        {children}
        <div
          style={{
            position: 'absolute',
            top: '4px',
            right: '4px',
            background: '#8B5CF6',
            color: 'white',
            fontSize: '10px',
            padding: '1px 6px',
            borderRadius: '4px',
            fontWeight: 500,
            pointerEvents: 'none',
          }}
        >
          [Repite x{data.length}]
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div style={{ padding: '16px', textAlign: 'center', color: '#9CA3AF', fontSize: '12px', ...node._styles }}>
        {emptyMessage}
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      {data.map((_, i) => (
        <div key={i}>{children}</div>
      ))}
    </div>
  );
}

const definition: ComponentDefinition = {
  type: 'Repeater',
  name: 'Repetidor',
  icon: 'List',
  category: 'data',
  hasChildren: true,
  properties: [
    { key: 'data', label: 'Datos', type: 'expression', defaultValue: '[]' },
    {
      key: 'direction',
      label: 'Direccion',
      type: 'select',
      defaultValue: 'vertical',
      options: [
        { label: 'Vertical', value: 'vertical' },
        { label: 'Horizontal', value: 'horizontal' },
        { label: 'Grid', value: 'grid' },
      ],
    },
    { key: 'gap', label: 'Espacio', type: 'text', defaultValue: '8px' },
    { key: 'gridColumns', label: 'Columnas grid', type: 'number', defaultValue: 3 },
    { key: 'emptyMessage', label: 'Mensaje vacio', type: 'text', defaultValue: 'Sin elementos' },
  ],
  component: RepeaterRenderer,
};

export default definition;
