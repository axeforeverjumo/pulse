import type { ComponentDefinition, RendererProps } from '../../engine/types';

function StatRenderer({ node, resolvedProps }: RendererProps) {
  const value = resolvedProps.value ?? '0';
  const label = (resolvedProps.label as string) || 'Total';
  const prefix = (resolvedProps.prefix as string) || '';
  const suffix = (resolvedProps.suffix as string) || '';
  const trend = (resolvedProps.trend as string) || '';
  const trendDirection = (resolvedProps.trendDirection as string) || 'neutral';

  const trendColor = trendDirection === 'up' ? '#059669' : trendDirection === 'down' ? '#DC2626' : '#9CA3AF';
  const trendIcon = trendDirection === 'up' ? '↑' : trendDirection === 'down' ? '↓' : '—';

  return (
    <div
      style={{
        background: 'white',
        borderRadius: '12px',
        padding: '16px 20px',
        border: '1px solid #F3F4F6',
        ...node._styles,
      }}
    >
      <div style={{ fontSize: '28px', fontWeight: 700, color: '#111827', lineHeight: 1.2 }}>
        {prefix && <span style={{ fontSize: '18px', fontWeight: 500, color: '#6B7280' }}>{prefix}</span>}
        {String(value)}
        {suffix && <span style={{ fontSize: '18px', fontWeight: 500, color: '#6B7280' }}>{suffix}</span>}
      </div>
      <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '4px' }}>{label}</div>
      {trend && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '8px', fontSize: '12px', color: trendColor, fontWeight: 500 }}>
          <span>{trendIcon}</span>
          <span>{trend}</span>
        </div>
      )}
    </div>
  );
}

const definition: ComponentDefinition = {
  type: 'Stat',
  name: 'Estadistica',
  icon: 'TrendingUp',
  category: 'data',
  hasChildren: false,
  properties: [
    { key: 'value', label: 'Valor', type: 'expression', defaultValue: '0' },
    { key: 'label', label: 'Etiqueta', type: 'text', defaultValue: 'Total' },
    { key: 'prefix', label: 'Prefijo', type: 'text', defaultValue: '' },
    { key: 'suffix', label: 'Sufijo', type: 'text', defaultValue: '' },
    { key: 'trend', label: 'Tendencia', type: 'text', defaultValue: '' },
    {
      key: 'trendDirection',
      label: 'Direccion tendencia',
      type: 'select',
      defaultValue: 'neutral',
      options: [
        { label: 'Sube', value: 'up' },
        { label: 'Baja', value: 'down' },
        { label: 'Neutral', value: 'neutral' },
      ],
    },
  ],
  component: StatRenderer,
};

export default definition;
