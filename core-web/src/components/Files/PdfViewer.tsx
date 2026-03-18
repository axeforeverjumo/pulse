import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import {
  XMarkIcon,
  ArrowDownTrayIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

interface PdfViewerProps {
  url: string;
  title: string;
  onClose: () => void;
}

export default function PdfViewer({ url, title, onClose }: PdfViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [scale, setScale] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setPageNumber(1);
    setIsLoading(false);
    setError(null);
  }, []);

  const onDocumentLoadError = useCallback((err: Error) => {
    setError(err.message || 'Failed to load PDF');
    setIsLoading(false);
    console.error('PDF load error:', err);
  }, []);

  const goToPrevPage = () => setPageNumber((prev) => Math.max(prev - 1, 1));
  const goToNextPage = () => setPageNumber((prev) => Math.min(prev + 1, numPages));

  const zoomIn = () => setScale((prev) => Math.min(prev + 0.25, 3));
  const zoomOut = () => setScale((prev) => Math.max(prev - 0.25, 0.5));
  const resetZoom = () => setScale(1);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goToPrevPage();
      else if (e.key === 'ArrowRight') goToNextPage();
      else if (e.key === 'Escape') onClose();
      else if (e.key === '+' || e.key === '=') zoomIn();
      else if (e.key === '-') zoomOut();
    },
    [numPages, onClose]
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
                disabled={scale >= 3}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 28,
                  height: 28,
                  color: scale >= 3 ? 'rgba(255,255,255,0.3)' : 'white',
                  background: 'none',
                  border: 'none',
                  borderRadius: 4,
                  cursor: scale >= 3 ? 'not-allowed' : 'pointer',
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

            {/* Page navigation */}
            {numPages > 1 && (
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
                  onClick={goToPrevPage}
                  disabled={pageNumber <= 1}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 28,
                    height: 28,
                    color: pageNumber <= 1 ? 'rgba(255,255,255,0.3)' : 'white',
                    background: 'none',
                    border: 'none',
                    borderRadius: 4,
                    cursor: pageNumber <= 1 ? 'not-allowed' : 'pointer',
                  }}
                >
                  <ChevronLeftIcon className="w-4.5 h-4.5" />
                </button>
                <span
                  style={{
                    color: 'white',
                    fontSize: 12,
                    minWidth: 60,
                    textAlign: 'center',
                  }}
                >
                  {pageNumber} / {numPages}
                </span>
                <button
                  onClick={goToNextPage}
                  disabled={pageNumber >= numPages}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 28,
                    height: 28,
                    color: pageNumber >= numPages ? 'rgba(255,255,255,0.3)' : 'white',
                    background: 'none',
                    border: 'none',
                    borderRadius: 4,
                    cursor: pageNumber >= numPages ? 'not-allowed' : 'pointer',
                  }}
                >
                  <ChevronRightIcon className="w-4.5 h-4.5" />
                </button>
              </div>
            )}

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
              title="Download PDF"
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

        {/* PDF Content */}
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            flex: 1,
            overflow: 'auto',
            display: 'flex',
            justifyContent: 'center',
            alignItems: isLoading || error ? 'center' : 'flex-start',
            padding: 24,
          }}
        >
          {error ? (
            <div
              style={{
                color: 'white',
                textAlign: 'center',
                padding: 24,
              }}
            >
              <p style={{ fontSize: 16, marginBottom: 8 }}>Failed to load PDF</p>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>{error}</p>
            </div>
          ) : (
            <Document
              file={url}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={onDocumentLoadError}
              loading={
                <div style={{ color: 'white', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ArrowPathIcon className="w-5 h-5 animate-spin" />
                  <span>Loading PDF...</span>
                </div>
              }
            >
              <Page
                pageNumber={pageNumber}
                scale={scale}
                renderTextLayer={true}
                renderAnnotationLayer={true}
                loading={
                  <div
                    style={{
                      width: 600 * scale,
                      height: 800 * scale,
                      backgroundColor: 'rgba(255,255,255,0.05)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'rgba(255,255,255,0.5)',
                    }}
                  >
                    Loading page...
                  </div>
                }
              />
            </Document>
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
            ← → Navigate pages
          </span>
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
