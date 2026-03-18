import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning';
  hideCancelButton?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  variant = 'danger',
  hideCancelButton = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!isOpen) return null;

  const confirmButtonClasses = variant === 'danger'
    ? 'bg-red-500 hover:bg-red-600 text-white'
    : 'bg-amber-500 hover:bg-amber-600 text-white';

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 bg-black/40 flex items-center justify-center z-[10000]"
        onClick={onCancel}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
          className="bg-white rounded-lg shadow-xl overflow-hidden w-[360px] max-w-[calc(100%-2rem)]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-5">
            <div className="flex items-start gap-3">
              <div className={`p-2 rounded-full flex-shrink-0 ${
                variant === 'danger' ? 'bg-red-50' : 'bg-amber-50'
              }`}>
                <ExclamationTriangleIcon className={`w-5 h-5 ${
                  variant === 'danger' ? 'text-red-500' : 'text-amber-500'
                }`} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-[15px] font-semibold text-gray-900 mb-1">
                  {title}
                </h3>
                <p className="text-[13px] text-gray-500 leading-relaxed">
                  {message}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 px-5 pb-5">
            {!hideCancelButton && (
              <button
                onClick={onCancel}
                className="px-3 py-1.5 text-[13px] font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors"
              >
                {cancelLabel}
              </button>
            )}
            <button
              onClick={onConfirm}
              className={`px-3 py-1.5 text-[13px] font-medium rounded-md transition-colors ${confirmButtonClasses}`}
            >
              {confirmLabel}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
