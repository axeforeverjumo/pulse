import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { renderAsync } from 'docx-preview';
import {
  XMarkIcon,
  ArrowDownTrayIcon,
  ArrowPathIcon,
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
} from '@heroicons/react/24/outline';
import { sanitizeRichDocumentElementInPlace } from '../../utils/sanitizeHtml';

interface DocxViewerProps {
  url: string;
  title: string;
  onClose: () => void;
}

export default function DocxViewer({ url, title, onClose }: DocxViewerProps) {
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState<number>(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const styleContainerRef = useRef<HTMLDivElement>(null);

  const zoomIn = () => setScale((prev) => Math.min(prev + 0.25, 2));
  const zoomOut = () => setScale((prev) => Math.max(prev - 0.25, 0.5));
  const resetZoom = () => setScale(1);

  // Load and render the DOCX
  useEffect(() => {
    let cancelled = false;

    async function loadDocument() {
      if (!containerRef.current) return;

      setIsLoading(true);
      setError(null);

      try {
        // Fetch the document from presigned URL
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to fetch document: ${response.status}`);
        }

        const blob = await response.blob();

        if (cancelled) return;

        // Clear previous content
        containerRef.current.innerHTML = '';
        if (styleContainerRef.current) {
          styleContainerRef.current.innerHTML = '';
        }

        // Render the document
        await renderAsync(blob, containerRef.current, styleContainerRef.current!, {
          className: 'docx',
          inWrapper: true,
          breakPages: true,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          renderEndnotes: true,
          ignoreWidth: false,
          ignoreHeight: false,
        });

        if (cancelled) return;
        sanitizeRichDocumentElementInPlace(containerRef.current);
        if (styleContainerRef.current) {
          sanitizeRichDocumentElementInPlace(styleContainerRef.current);
        }
        setIsLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load document');
          setIsLoading(false);
          console.error('DOCX load error:', err);
        }
      }
    }

    loadDocument();

    return () => {
      cancelled = true;
    };
  }, [url]);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === '+' || e.key === '=') zoomIn();
      else if (e.key === '-') zoomOut();
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
          {/* Title */}
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

          {/* Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Zoom controls */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                borderRadius: 8,
                padding: '4px 8px',
              }}
            >
              <button
                onClick={zoomOut}
                disabled={scale <= 0.5}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 28,
                  height: 28,
                  color: scale <= 0.5 ? 'rgba(255,255,255,0.3)' : 'white',
                  background: 'none',
                  border: 'none',
                  borderRadius: 4,
                  cursor: scale <= 0.5 ? 'not-allowed' : 'pointer',
                }}
              >
                <MagnifyingGlassMinusIcon className="w-4.5 h-4.5" />
              </button>
              <span
                style={{
                  color: 'white',
                  fontSize: 12,
                  minWidth: 50,
                  textAlign: 'center',
                }}
              >
                {Math.round(scale * 100)}%
              </span>
              <button
                onClick={zoomIn}
                disabled={scale >= 2}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 28,
                  height: 28,
                  color: scale >= 2 ? 'rgba(255,255,255,0.3)' : 'white',
                  background: 'none',
                  border: 'none',
                  borderRadius: 4,
                  cursor: scale >= 2 ? 'not-allowed' : 'pointer',
                }}
              >
                <MagnifyingGlassPlusIcon className="w-4.5 h-4.5" />
              </button>
              <button
                onClick={resetZoom}
                title="Reset zoom"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 28,
                  height: 28,
                  color: 'white',
                  background: 'none',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                }}
              >
                <ArrowPathIcon className="w-4 h-4" />
              </button>
            </div>

            {/* Download */}
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
              title="Download Document"
            >
              <ArrowDownTrayIcon className="w-5 h-5" />
            </a>

            {/* Close */}
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
              title="Close (Esc)"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Document Content */}
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            flex: 1,
            overflow: 'auto',
            display: 'flex',
            justifyContent: 'center',
            alignItems: isLoading || error ? 'center' : 'flex-start',
            padding: 24,
            backgroundColor: '#525659',
          }}
        >
          {/* Hidden style container for docx-preview */}
          <div ref={styleContainerRef} style={{ display: 'none' }} />

          {error ? (
            <div
              style={{
                color: 'white',
                textAlign: 'center',
                padding: 24,
              }}
            >
              <p style={{ fontSize: 16, marginBottom: 8 }}>Failed to load document</p>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>{error}</p>
            </div>
          ) : isLoading ? (
            <div style={{ color: 'white', display: 'flex', alignItems: 'center', gap: 8 }}>
              <ArrowPathIcon className="w-5 h-5 animate-spin" />
              <span>Loading document...</span>
            </div>
          ) : null}

          {/* Document render container */}
          <div
            ref={containerRef}
            style={{
              transform: `scale(${scale})`,
              transformOrigin: 'top center',
              transition: 'transform 0.2s ease',
              display: isLoading || error ? 'none' : 'block',
            }}
          />
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
            + − Zoom
          </span>
          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>
            Esc Close
          </span>
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
