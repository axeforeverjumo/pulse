import { useMemo } from 'react';
import type { ComponentDefinition, RendererProps } from '../../engine/types';

function ChartRenderer({ node, resolvedProps }: RendererProps) {
  const rawData = resolvedProps.data;
  const chartType = (resolvedProps.chartType as string) || 'bar';
  const xAxis = (resolvedProps.xAxis as string) || '';
  const yAxis = (resolvedProps.yAxis as string) || '';
  const title = (resolvedProps.title as string) || '';
  const showLegend = resolvedProps.showLegend !== false;

  const data: Record<string, unknown>[] = useMemo(() => {
    if (Array.isArray(rawData)) return rawData;
    if (typeof rawData === 'string') {
      try { return JSON.parse(rawData); } catch { return []; }
    }
    return [];
  }, [rawData]);

  const maxVal = useMemo(() => {
    if (!yAxis || data.length === 0) return 1;
    return Math.max(1, ...data.map(d => Number(d[yAxis]) || 0));
  }, [data, yAxis]);

  const typeLabels: Record<string, string> = {
    bar: 'Barras',
    line: 'Linea',
    pie: 'Circular',
    area: 'Area',
  };

  return (
    <div style={{ width: '100%', minHeight: '200px', ...node._styles }}>
      {title && (
        <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px', color: '#1F2937' }}>
          {title}
        </div>
      )}
      {data.length > 0 && yAxis ? (
        <div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '160px', padding: '8px 0' }}>
            {data.map((d, i) => {
              const val = Number(d[yAxis]) || 0;
              const pct = (val / maxVal) * 100;
              return (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, height: '100%', justifyContent: 'flex-end' }}>
                  <span style={{ fontSize: '10px', color: '#6B7280', marginBottom: '2px' }}>{val}</span>
                  <div
                    style={{
                      width: '100%',
                      maxWidth: '40px',
                      height: `${pct}%`,
                      minHeight: '2px',
                      background: chartType === 'bar' ? '#3B82F6' : chartType === 'line' ? '#10B981' : chartType === 'pie' ? '#8B5CF6' : '#F59E0B',
                      borderRadius: '4px 4px 0 0',
                      transition: 'height 0.3s',
                    }}
                  />
                  {xAxis && (
                    <span style={{ fontSize: '10px', color: '#9CA3AF', marginTop: '4px', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60px' }}>
                      {String(d[xAxis] ?? '')}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          {showLegend && (
            <div style={{ fontSize: '10px', color: '#9CA3AF', textAlign: 'center', marginTop: '4px' }}>
              Tipo: {typeLabels[chartType] || chartType}
              {xAxis && <> &middot; X: {xAxis}</>}
              {yAxis && <> &middot; Y: {yAxis}</>}
            </div>
          )}
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '160px',
            border: '2px dashed #E5E7EB',
            borderRadius: '12px',
            color: '#9CA3AF',
          }}
        >
          <div style={{ fontSize: '28px', marginBottom: '8px' }}>
            {chartType === 'bar' ? '📊' : chartType === 'line' ? '📈' : chartType === 'pie' ? '🥧' : '📉'}
          </div>
          <div style={{ fontSize: '12px', fontWeight: 500 }}>Grafico de {typeLabels[chartType] || chartType}</div>
          <div style={{ fontSize: '11px', marginTop: '4px' }}>Instalar recharts para graficos interactivos</div>
        </div>
      )}
    </div>
  );
}

const definition: ComponentDefinition = {
  type: 'Chart',
  name: 'Grafico',
  icon: 'BarChart3',
  category: 'data',
  hasChildren: false,
  properties: [
    { key: 'data', label: 'Datos', type: 'expression', defaultValue: '[]' },
    {
      key: 'chartType',
      label: 'Tipo de grafico',
      type: 'select',
      defaultValue: 'bar',
      options: [
        { label: 'Barras', value: 'bar' },
        { label: 'Linea', value: 'line' },
        { label: 'Circular', value: 'pie' },
        { label: 'Area', value: 'area' },
      ],
    },
    { key: 'xAxis', label: 'Eje X (campo)', type: 'text', defaultValue: '' },
    { key: 'yAxis', label: 'Eje Y (campo)', type: 'text', defaultValue: '' },
    { key: 'title', label: 'Titulo', type: 'text', defaultValue: '' },
    { key: 'showLegend', label: 'Mostrar leyenda', type: 'boolean', defaultValue: true },
  ],
  component: ChartRenderer,
};

export default definition;
