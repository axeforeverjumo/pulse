import Modal from '../Modal/Modal';

interface MiniAppSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  appName: string;
}

export default function MiniAppSettingsModal({
  isOpen,
  onClose,
  appName,
}: MiniAppSettingsModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`${appName} Settings`} size="md">
      <div className="flex flex-col gap-6">
        {/* Permissions Section */}
        <div>
          <h3 className="text-sm font-medium text-text-body mb-3">Permissions</h3>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between p-3 rounded-lg border border-border-gray">
              <div>
                <p className="text-sm text-text-body">Read access</p>
                <p className="text-xs text-text-secondary">Allow reading data from this app</p>
              </div>
              <div className="w-10 h-6 bg-bg-gray rounded-full" />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg border border-border-gray">
              <div>
                <p className="text-sm text-text-body">Write access</p>
                <p className="text-xs text-text-secondary">Allow modifying data in this app</p>
              </div>
              <div className="w-10 h-6 bg-bg-gray rounded-full" />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg border border-border-gray">
              <div>
                <p className="text-sm text-text-body">Notifications</p>
                <p className="text-xs text-text-secondary">Receive notifications from this app</p>
              </div>
              <div className="w-10 h-6 bg-bg-gray rounded-full" />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2 border-t border-border-light">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-text-secondary hover:bg-bg-gray rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm bg-black text-white rounded-lg"
          >
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
}
