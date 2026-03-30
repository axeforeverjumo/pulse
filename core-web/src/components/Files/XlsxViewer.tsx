import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { read, utils, type WorkBook } from 'xlsx';
import {
  XMarkIcon,
  ArrowDownTrayIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';

interface XlsxViewerProps {
  url: string;
  title: string;
  onClose: () => void;
}

export default function XlsxViewer({ url, title, onClose }: XlsxViewerProps) {
  const [workbook, setWorkbook] = useState<WorkBook | null>(null);
  const [activeSheet, setActiveSheet] = useState<string>('');
  const [rows, setRows] = useState<string[][]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSpreadsheet() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to fetch spreadsheet: ${response.status}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        if (cancelled) return;

        const wb = read(arrayBuffer, { type: 'array' });
        if (cancelled) return;

        setWorkbook(wb);
        const firstSheet = wb.SheetNames[0];
        setActiveSheet(firstSheet);
        setRows(utils.sheet_to_json<string[]>(wb.Sheets[firstSheet], { header: 1 }));
        setIsLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load spreadsheet');
          setIsLoading(false);
          console.error('XLSX load error:', err);
        }
      }
    }

    loadSpreadsheet();
    return () => { cancelled = true; };
  }, [url]);

  const switchSheet = (name: string) => {
    if (!workbook) return;
    setActiveSheet(name);
    setRows(utils.sheet_to_json<string[]>(workbook.Sheets[name], { header: 1 }));
  };

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={onClose}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 50,
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'rgba(0, 0, 0, 0.9)',
          outline: 'none',
        }}
      >
        {/* Header */}
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          }}
        >
          <h2
            style={{
              color: 'white',
              fontSize: 14,
              fontWeight: 500,
              margin: 0,
              maxWidth: '40%',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {title}
          </h2>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Sheet tabs */}
            {workbook && workbook.SheetNames.length > 1 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                  borderRadius: 8,
                  padding: '4px 6px',
                }}
              >
                {workbook.SheetNames.map((name: string) => (
                  <button
                    key={name}
                    onClick={() => switchSheet(name)}
                    style={{
                      padding: '4px 10px',
                      fontSize: 12,
                      color: name === activeSheet ? 'white' : 'rgba(255,255,255,0.5)',
                      backgroundColor: name === activeSheet ? 'rgba(255, 255, 255, 0.15)' : 'transparent',
                      border: 'none',
                      borderRadius: 6,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}

            <a
              href={url}
              download={title}
              onClick={(e) => e.stopPropagation()}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 36,
                height: 36,
                color: 'white',
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                textDecoration: 'none',
              }}
              title="Descargar hoja de cálculo"
            >
              <ArrowDownTrayIcon className="w-5 h-5" />
            </a>

            <button
              onClick={onClose}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 36,
                height: 36,
                color: 'white',
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
              }}
              title="Cerrar (Esc)"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Spreadsheet Content */}
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            flex: 1,
            overflow: 'auto',
            display: 'flex',
            justifyContent: isLoading || error ? 'center' : 'flex-start',
            alignItems: isLoading || error ? 'center' : 'flex-start',
            padding: isLoading || error ? 24 : 0,
          }}
        >
          {error ? (
            <div style={{ color: 'white', textAlign: 'center', padding: 24 }}>
              <p style={{ fontSize: 16, marginBottom: 8 }}>Error al cargar hoja de cálculo</p>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>{error}</p>
            </div>
          ) : isLoading ? (
            <div style={{ color: 'white', display: 'flex', alignItems: 'center', gap: 8 }}>
              <ArrowPathIcon className="w-5 h-5 animate-spin" />
              <span>Loading spreadsheet...</span>
            </div>
          ) : rows.length === 0 ? (
            <div style={{ color: 'white', textAlign: 'center', padding: 24 }}>
              <p>Esta hoja está vacía</p>
            </div>
          ) : (
            <table
              style={{
                borderCollapse: 'collapse',
                fontSize: 13,
                fontFamily: 'var(--font-mono, monospace)',
                width: '100%',
              }}
            >
              <thead>
                {rows.length > 0 && (
                  <tr>
                    <th
                      style={{
                        position: 'sticky',
                        top: 0,
                        padding: '8px 12px',
                        backgroundColor: 'rgba(255, 255, 255, 0.08)',
                        color: 'rgba(255, 255, 255, 0.4)',
                        fontWeight: 500,
                        textAlign: 'center',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRight: '1px solid rgba(255, 255, 255, 0.06)',
                        fontSize: 11,
                        minWidth: 40,
                        zIndex: 1,
                      }}
                    >
                      #
                    </th>
                    {rows[0].map((_cell, colIdx) => (
                      <th
                        key={colIdx}
                        style={{
                          position: 'sticky',
                          top: 0,
                          padding: '8px 12px',
                          backgroundColor: 'rgba(255, 255, 255, 0.08)',
                          color: 'rgba(255, 255, 255, 0.7)',
                          fontWeight: 600,
                          textAlign: 'left',
                          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                          borderRight: '1px solid rgba(255, 255, 255, 0.06)',
                          whiteSpace: 'nowrap',
                          zIndex: 1,
                        }}
                      >
                        {String(rows[0][colIdx] ?? '')}
                      </th>
                    ))}
                  </tr>
                )}
              </thead>
              <tbody>
                {rows.slice(1).map((row, rowIdx) => (
                  <tr
                    key={rowIdx}
                    style={{
                      backgroundColor: rowIdx % 2 === 0 ? 'transparent' : 'rgba(255, 255, 255, 0.02)',
                    }}
                  >
                    <td
                      style={{
                        padding: '6px 12px',
                        color: 'rgba(255, 255, 255, 0.3)',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                        borderRight: '1px solid rgba(255, 255, 255, 0.06)',
                        textAlign: 'center',
                        fontSize: 11,
                      }}
                    >
                      {rowIdx + 2}
                    </td>
                    {rows[0].map((_header, colIdx) => (
                      <td
                        key={colIdx}
                        style={{
                          padding: '6px 12px',
                          color: 'rgba(255, 255, 255, 0.85)',
                          borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                          borderRight: '1px solid rgba(255, 255, 255, 0.06)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {String(row[colIdx] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Keyboard hint */}
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            padding: '8px 16px',
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            justifyContent: 'center',
            gap: 24,
          }}
        >
          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>
            Esc Close
          </span>
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
