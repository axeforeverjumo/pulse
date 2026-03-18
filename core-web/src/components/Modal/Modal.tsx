import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { XMarkIcon } from '@heroicons/react/24/outline';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

const sizeWidths = {
  sm: 420,
  md: 520,
  lg: 600,
};

export default function Modal({ isOpen, onClose, title, children, size = 'sm' }: ModalProps) {
  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, onClose]);

  // Close on click outside
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  // Use portal to render at document body level (outside sidebar)
  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={handleBackdropClick}
          className="fixed inset-0 z-9999 flex items-center justify-center bg-black/30"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
            className="bg-white rounded-lg overflow-hidden"
            style={{
              width: '100%',
              maxWidth: sizeWidths[size],
              margin: '0 16px',
              boxShadow: '0 24px 48px -12px rgba(0, 0, 0, 0.15)',
            }}
          >
            {title && (
              <div className="flex items-start justify-between px-6 pt-6 pb-0">
                <h2 className="text-lg font-medium text-gray-900">{title}</h2>
                <button
                  onClick={onClose}
                  className="p-1.5 -mr-1 text-gray-300 hover:text-gray-500 rounded-lg transition-colors"
                >
                  <XMarkIcon className="w-4.5 h-4.5 stroke-2" />
                </button>
              </div>
            )}
            <div className="px-6 pb-6 pt-5">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
