import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { pptxToHtml } from '@jvmr/pptx-to-html';
import {
  XMarkIcon,
  ArrowDownTrayIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import { sanitizeRichDocumentHtml } from '../../utils/sanitizeHtml';

interface PptxViewerProps {
  url: string;
  title: string;
  onClose: () => void;
}

export default function PptxViewer({ url, title, onClose }: PptxViewerProps) {
  const [slides, setSlides] = useState<string[]>([]);
  const [currentSlide, setCurrentSlide] = useState<number>(0);
  const [scale, setScale] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const goToPrevSlide = () => setCurrentSlide((prev) => Math.max(prev - 1, 0));
  const goToNextSlide = () => setCurrentSlide((prev) => Math.min(prev + 1, slides.length - 1));

  const zoomIn = () => setScale((prev) => Math.min(prev + 0.25, 2));
  const zoomOut = () => setScale((prev) => Math.max(prev - 0.25, 0.5));
  const resetZoom = () => setScale(1);
  const sanitizedSlideHtml = useMemo(
    () => sanitizeRichDocumentHtml(slides[currentSlide] || ''),
    [slides, currentSlide]
  );

  // Load and render the PPTX
  useEffect(() => {
    let cancelled = false;

    async function loadPresentation() {
      setIsLoading(true);
      setError(null);

      try {
        // Fetch the document from presigned URL
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to fetch presentation: ${response.status}`);
        }

        const arrayBuffer = await response.arrayBuffer();

        if (cancelled) return;

        // Convert PPTX to HTML - returns array de slide HTML strings
        const slideHtmlArray = await pptxToHtml(arrayBuffer, {
          width: 960,
          height: 540,
          scaleToFit: true,
          letterbox: true,
        });

        if (cancelled) return;

        // The library returns an array de HTML strings, one per slide
        if (Array.isArray(slideHtmlArray) && slideHtmlArray.length > 0) {
          setSlides(slideHtmlArray);
        } else if (typeof slideHtmlArray === 'string') {
          // Fallback if it returns a single string
          setSlides([slideHtmlArray]);
        } else {
          setSlides([]);
        }

        setCurrentSlide(0);
        setIsLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load presentation');
          setIsLoading(false);
          console.error('PPTX load error:', err);
        }
      }
    }

    loadPresentation();

    return () => {
      cancelled = true;
    };
  }, [url]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goToPrevSlide();
      else if (e.key === 'ArrowRight') goToNextSlide();
      else if (e.key === 'Escape') onClose();
      else if (e.key === '+' || e.key === '=') zoomIn();
      else if (e.key === '-') zoomOut();
    },
    [slides.length, onClose]
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
                title="Restablecer zoom"
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

            {/* Slide navigation */}
            {slides.length > 1 && (
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
                  onClick={goToPrevSlide}
                  disabled={currentSlide <= 0}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 28,
                    height: 28,
                    color: currentSlide <= 0 ? 'rgba(255,255,255,0.3)' : 'white',
                    background: 'none',
                    border: 'none',
                    borderRadius: 4,
                    cursor: currentSlide <= 0 ? 'not-allowed' : 'pointer',
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
                  {currentSlide + 1} / {slides.length}
                </span>
                <button
                  onClick={goToNextSlide}
                  disabled={currentSlide >= slides.length - 1}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 28,
                    height: 28,
                    color: currentSlide >= slides.length - 1 ? 'rgba(255,255,255,0.3)' : 'white',
                    background: 'none',
                    border: 'none',
                    borderRadius: 4,
                    cursor: currentSlide >= slides.length - 1 ? 'not-allowed' : 'pointer',
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
              title="Descargar presentaciÛn"
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
              title="Cerrar (Esc)"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Presentation Content */}
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            flex: 1,
            overflow: 'auto',
            display: 'flex',
            justifyContent: 'center',
            alignItems: isLoading || error ? 'center' : 'center',
            padding: 24,
            backgroundColor: '#2d2d2d',
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
              <p style={{ fontSize: 16, marginBottom: 8 }}>Error al cargar presentaciÛn</p>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>{error}</p>
            </div>
          ) : isLoading ? (
            <div style={{ color: 'white', display: 'flex', alignItems: 'center', gap: 8 }}>
              <ArrowPathIcon className="w-5 h-5 animate-spin" />
              <span>Loading presentation...</span>
            </div>
          ) : slides.length > 0 ? (
            <div
              ref={containerRef}
              style={{
                transform: `scale(${scale})`,
                transformOrigin: 'center center',
                transition: 'transform 0.2s ease',
                backgroundColor: 'white',
                borderRadius: 8,
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                overflow: 'hidden',
                width: 960,
                minHeight: 540,
              }}
              dangerouslySetInnerHTML={{ __html: sanitizedSlideHtml }}
            />
          ) : (
            <div style={{ color: 'white', textAlign: 'center' }}>
              <p>No se encontraron diapositivas en la presentaciÛn</p>
            </div>
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
            ‚Üê ‚Üí Navigate slides
          </span>
          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>
            + ‚àí Zoom
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
