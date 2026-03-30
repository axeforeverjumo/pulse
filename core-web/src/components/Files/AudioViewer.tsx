import { useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  XMarkIcon,
  ArrowDownTrayIcon,
} from '@heroicons/react/24/outline';

interface AudioViewerProps {
  url: string;
  title: string;
  onClose: () => void;
}

export default function AudioViewer({ url, title, onClose }: AudioViewerProps) {
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
              maxWidth: '60%',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {title}
          </h2>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
              title="Descargar audio"
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

        {/* Audio Content */}
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 24,
            gap: 24,
          }}
        >
          {/* File name display */}
          <div
            style={{
              width: 120,
              height: 120,
              borderRadius: 24,
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
          </div>

          <audio
            controls
            autoPlay
            style={{
              width: '100%',
              maxWidth: 500,
            }}
          >
            <source src={url} />
          </audio>
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
