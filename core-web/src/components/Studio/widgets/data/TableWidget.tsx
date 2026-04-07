import { useState, useMemo } from 'react';
import type { ComponentDefinition, RendererProps } from '../../engine/types';

function TableRenderer({ node, resolvedProps }: RendererProps) {
  const rawData = resolvedProps.data;
  const columnsRaw = resolvedProps.columns as { key: string; label?: string }[] | undefined;
  const pageSize = Number(resolvedProps.pageSize) || 10;
  const searchable = resolvedProps.searchable !== false;
  const striped = resolvedProps.striped !== false;
  const compact = resolvedProps.compact === true;
  const emptyMessage = (resolvedProps.emptyMessage as string) || 'Sin datos';

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  const data: Record<string, unknown>[] = useMemo(() => {
    if (Array.isArray(rawData)) return rawData;
    if (typeof rawData === 'string') {
      try { return JSON.parse(rawData); } catch { return []; }
    }
    return [];
  }, [rawData]);

  const columns = useMemo(() => {
    if (Array.isArray(columnsRaw) && columnsRaw.length > 0) return columnsRaw;
    if (data.length > 0) return Object.keys(data[0]).map(k => ({ key: k, label: k }));
    return [];
  }, [columnsRaw, data]);

  const filtered = useMemo(() => {
    if (!search) return data;
    const q = search.toLowerCase();
    return data.filter(row =>
      columns.some(col => String(row[col.key] ?? '').toLowerCase().includes(q))
    );
  }, [data, search, columns]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice(page * pageSize, (page + 1) * pageSize);

  const py = compact ? '4px' : '8px';

  return (
    <div style={{ width: '100%', fontSize: '12px', ...node._styles }}>
      {searchable && (
        <input
          type="text"
          placeholder="Buscar..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0); }}
          style={{
            width: '100%',
            padding: '6px 10px',
            marginBottom: '8px',
            border: '1px solid #E5E7EB',
            borderRadius: '6px',
            fontSize: '12px',
            outline: 'none',
          }}
        />
      )}
      {paged.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center', color: '#9CA3AF' }}>{emptyMessage}</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {columns.map(col => (
                <th
                  key={col.key}
                  style={{
                    textAlign: 'left',
                    padding: `${py} 8px`,
                    borderBottom: '2px solid #E5E7EB',
                    fontWeight: 600,
                    color: '#374151',
                    fontSize: '11px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  {col.label || col.key}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.map((row, i) => (
              <tr
                key={i}
                style={{
                  backgroundColor: striped && i % 2 === 1 ? '#F9FAFB' : 'transparent',
                }}
              >
                {columns.map(col => (
                  <td
                    key={col.key}
                    style={{
                      padding: `${py} 8px`,
                      borderBottom: '1px solid #F3F4F6',
                      color: '#4B5563',
                    }}
                  >
                    {String(row[col.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', fontSize: '11px', color: '#6B7280' }}>
          <span>{filtered.length} resultados</span>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              style={{ padding: '2px 8px', border: '1px solid #E5E7EB', borderRadius: '4px', background: 'white', cursor: page === 0 ? 'default' : 'pointer', opacity: page === 0 ? 0.4 : 1 }}
            >
              ‹
            </button>
            <span style={{ padding: '2px 8px' }}>{page + 1} / {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              style={{ padding: '2px 8px', border: '1px solid #E5E7EB', borderRadius: '4px', background: 'white', cursor: page >= totalPages - 1 ? 'default' : 'pointer', opacity: page >= totalPages - 1 ? 0.4 : 1 }}
            >
              ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const definition: ComponentDefinition = {
  type: 'Table',
  name: 'Tabla',
  icon: 'Table',
  category: 'data',
  hasChildren: false,
  properties: [
    { key: 'data', label: 'Datos', type: 'expression', defaultValue: '[]' },
    { key: 'columns', label: 'Columnas', type: 'json', defaultValue: [] },
    { key: 'pageSize', label: 'Filas por pagina', type: 'number', defaultValue: 10 },
    { key: 'searchable', label: 'Buscable', type: 'boolean', defaultValue: true },
    { key: 'striped', label: 'Rayas alternas', type: 'boolean', defaultValue: true },
    { key: 'compact', label: 'Compacto', type: 'boolean', defaultValue: false },
    { key: 'emptyMessage', label: 'Mensaje vacio', type: 'text', defaultValue: 'Sin datos' },
  ],
  component: TableRenderer,
};

export default definition;
