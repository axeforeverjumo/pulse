import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { XMarkIcon, ChevronDownIcon } from "@heroicons/react/24/outline";

interface ProjectsSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  boardId: string | null;
  boardName: string;
  boardDescription?: string;
  initialTab?: "board" | "app";
  onSave: (name: string, description: string) => Promise<void>;
  onDelete?: () => void;
}

export default function ProjectsSettingsModal({
  isOpen,
  onClose,
  boardId: _boardId,
  boardName,
  boardDescription = "",
  initialTab = "board",
  onSave,
  onDelete,
}: ProjectsSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<"board" | "app">("board");
  const [editingName, setEditingName] = useState(boardName);
  const [editingDescription, setEditingDescription] = useState(boardDescription);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Reset form when modal opens or board changes
  useEffect(() => {
    if (isOpen) {
      setEditingName(boardName);
      setEditingDescription(boardDescription);
      setShowAdvancedOptions(false);
      setActiveTab(initialTab);
    }
  }, [isOpen, boardName, boardDescription]);

  const handleSave = async () => {
    if (!editingName.trim() || isSaving) return;
    setIsSaving(true);
    try {
      await onSave(editingName.trim(), editingDescription.trim());
      onClose();
    } catch (err) {
      console.error("Failed to save board settings:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    setShowAdvancedOptions(false);
    onClose();
  };

  if (!isOpen) return null;

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-[9999]"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
        className="bg-white rounded-lg shadow-xl w-[520px] max-w-[calc(100%-2rem)] max-h-[80vh] flex flex-col overflow-hidden"
        style={{ minHeight: 400 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-5">
          <h2 className="text-lg font-semibold text-gray-900">Projects</h2>
          <button
            onClick={handleClose}
            className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-4 px-6 mb-4">
          <button
            onClick={() => setActiveTab("board")}
            className={`pb-2 text-sm font-medium transition-colors relative ${
              activeTab === "board"
                ? "text-gray-900"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Board Settings
            {activeTab === "board" && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-900 rounded-full" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("app")}
            className={`pb-2 text-sm font-medium transition-colors relative ${
              activeTab === "app"
                ? "text-gray-900"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            App Settings
            {activeTab === "app" && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-900 rounded-full" />
            )}
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === "board" ? (
          <>
            <div className="overflow-y-auto flex-1 px-6 py-3 space-y-4">
              {/* Board Details Section */}
              <div>
                <h3 className="text-xs font-medium text-text-secondary mb-2">
                  Details
                </h3>
                {/* Board Name */}
                <div className="mb-3">
                  <label className="block text-xs text-text-secondary mb-2">
                    Name
                  </label>
                  <input
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    placeholder="e.g. Product Roadmap"
                    className="w-full px-3 py-2.5 bg-white border border-border-gray rounded-lg text-sm outline-none focus:border-text-tertiary"
                  />
                </div>

                {/* Board Description */}
                <div>
                  <label className="block text-xs text-text-secondary mb-2">
                    Description{" "}
                    <span className="text-text-tertiary">(optional)</span>
                  </label>
                  <textarea
                    value={editingDescription}
                    onChange={(e) => setEditingDescription(e.target.value)}
                    placeholder="What's this board about?"
                    rows={2}
                    className="w-full px-3 py-2.5 bg-white border border-border-gray rounded-lg text-sm outline-none focus:border-text-tertiary resize-none"
                  />
                </div>
              </div>

              {/* Collapsible Advanced Options */}
              {onDelete && (
                <div className="border-t border-border-light pt-4">
                  <button
                    onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                    className="flex items-center gap-2 text-xs text-text-tertiary hover:text-text-secondary transition-colors"
                  >
                    <ChevronDownIcon
                      className="w-3 h-3"
                      style={{
                        transform: showAdvancedOptions ? "rotate(0deg)" : "rotate(-90deg)",
                        transition: "transform 0.15s ease",
                      }}
                    />
                    Advanced options
                  </button>
                  {showAdvancedOptions && (
                    <div className="mt-3">
                      <p className="text-xs text-text-tertiary mb-3">
                        Deleting this board will permanently remove all cards and data. This action cannot be undone.
                      </p>
                      <button
                        onClick={() => {
                          handleClose();
                          onDelete();
                        }}
                        className="px-3 py-1.5 text-xs text-red-600 border border-red-200 rounded-md hover:bg-red-50 transition-colors"
                      >
                        Delete board
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Board Settings Footer */}
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-border-light">
              <button
                onClick={handleClose}
                className="px-4 py-2 text-sm text-text-secondary hover:bg-bg-gray rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!editingName.trim() || isSaving}
                className="px-4 py-2 text-sm bg-black text-white rounded-lg disabled:opacity-50"
              >
                {isSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </>
        ) : (
          <>
            {/* App Settings Tab Content */}
            <div className="overflow-y-auto flex-1 px-6 py-4">
              <h3 className="text-sm font-medium text-gray-900 mb-4">
                Permissions
              </h3>
              <div className="space-y-1">
                {/* Notifications Toggle */}
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      Notifications
                    </p>
                    <p className="text-[13px] text-gray-500">
                      Receive notifications from this app
                    </p>
                  </div>
                  <button
                    className="relative w-11 h-6 bg-gray-200 rounded-full transition-colors cursor-not-allowed"
                    disabled
                  >
                    <span className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full shadow transition-transform" />
                  </button>
                </div>
              </div>
            </div>

            {/* App Settings Footer */}
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-border-light">
              <button
                onClick={handleClose}
                className="px-4 py-2 text-sm text-text-secondary hover:bg-bg-gray rounded-lg"
              >
                Cancel
              </button>
              <button
                disabled
                className="px-4 py-2 text-sm bg-black text-white rounded-lg disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>,
    document.body
  );
}
