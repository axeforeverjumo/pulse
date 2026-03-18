import NoteEditor from './Files/NoteEditor';
import type { PublicSharedDocument } from '../api/client';

interface PublicDocumentViewerProps {
  document: PublicSharedDocument;
  sharedBy?: {
    name?: string;
    avatar_url?: string;
  };
  isAuthenticated: boolean;
  isOpening?: boolean;
  onOpenInWorkspace?: () => void;
  onSignInGoogle?: () => void;
  onSignInMicrosoft?: () => void;
}

export default function PublicDocumentViewer({
  document,
  sharedBy,
  isAuthenticated,
  isOpening,
  onOpenInWorkspace,
  onSignInGoogle,
  onSignInMicrosoft,
}: PublicDocumentViewerProps) {
  const sharerName = sharedBy?.name || 'Someone';

  return (
    <div className="h-screen w-screen bg-white flex flex-col">
      {/* Minimal top bar — shared by info + open in workspace */}
      <div className="border-b border-border-gray px-6 py-2.5 flex items-center justify-between">
        <p className="text-xs text-text-tertiary">
          Shared by {sharerName}
        </p>
        {isAuthenticated ? (
          <button
            onClick={onOpenInWorkspace}
            disabled={isOpening}
            className="px-3 py-1.5 text-xs rounded bg-black text-white disabled:opacity-60"
          >
            {isOpening ? 'Opening...' : 'Open in workspace'}
          </button>
        ) : null}
      </div>

      {/* Document content — title inline like the notes editor */}
      <div className="flex-1 overflow-y-auto">
        <div className="w-[min(800px,90%)] mx-auto">
          <div className="px-6 pt-4 pb-2">
            <h1 className="w-full text-[28px] font-semibold text-text-body">
              {document.title || 'Untitled'}
            </h1>
          </div>
          <div className="px-6 pb-6">
            <NoteEditor
              content={document.content || ''}
              onChange={() => undefined}
              editable={false}
            />
          </div>
        </div>
      </div>

      {/* Sign in banner — fixed to bottom of screen */}
      {!isAuthenticated && (onSignInGoogle || onSignInMicrosoft) && (
        <div className="fixed bottom-0 left-0 right-0 border-t border-border-gray px-6 py-3 bg-bg-gray flex items-center justify-center gap-3 z-10">
          <span className="text-xs text-text-secondary">Sign in for full access</span>
          {onSignInGoogle && (
            <button
              onClick={onSignInGoogle}
              className="px-2.5 py-1 text-xs rounded bg-black text-white"
            >
              Google
            </button>
          )}
          {onSignInMicrosoft && (
            <button
              onClick={onSignInMicrosoft}
              className="px-2.5 py-1 text-xs rounded border border-border-gray hover:bg-white"
            >
              Microsoft
            </button>
          )}
        </div>
      )}
    </div>
  );
}
