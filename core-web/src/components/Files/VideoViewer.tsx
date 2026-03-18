import { useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  XMarkIcon,
  ArrowDownTrayIcon,
} from '@heroicons/react/24/outline';

interface VideoViewerProps {
  url: string;
  title: string;
  onClose: () => void;
}

export default function VideoViewer({ url, title, onClose }: VideoViewerProps) {
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
              title="Download Video"
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
              title="Close (Esc)"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Video Content */}
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            flex: 1,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 24,
          }}
        >
          <video
            controls
            autoPlay
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              borderRadius: 8,
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
            }}
          >
            <source src={url} />
          </video>
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
