import { useState } from 'react';
import { Upload, Globe, Link2, Check } from 'lucide-react';
import { api } from '../../../api/client';
import { useStudioStore } from '../../../stores/studioStore';

interface Props {
  appId: string;
  appSlug: string;
  onClose: () => void;
  onPublished: () => void;
}

export default function PublishDialog({ appId, appSlug, onClose, onPublished }: Props) {
  const [label, setLabel] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);

  const handlePublish = async () => {
    setPublishing(true);
    try {
      await api(`/studio/apps/${appId}/publish`, {
        method: 'POST',
        body: JSON.stringify({ version_label: label }),
      });
      setPublished(true);
      onPublished();
    } catch {
      // error handled
    } finally {
      setPublishing(false);
    }
  };

  const publicUrl = `${window.location.origin}/app/${appSlug}`;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
        {!published ? (
          <>
            <div className="flex items-center gap-2 mb-4">
              <Upload size={18} className="text-indigo-600" />
              <h2 className="text-[16px] font-semibold text-gray-900">Publicar App</h2>
            </div>
            <p className="text-[13px] text-gray-500 mb-4">
              Se creara un snapshot de todas las paginas y se publicara en:
            </p>
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg mb-4">
              <Globe size={14} className="text-gray-400" />
              <code className="text-[12px] text-indigo-600">{publicUrl}</code>
            </div>
            <div className="mb-4">
              <label className="block text-[12px] font-medium text-gray-600 mb-1">
                Etiqueta de version (opcional)
              </label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="v1.0, beta, etc."
                className="w-full px-3 py-2 text-[13px] border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="px-4 py-2 text-[13px] text-gray-600 hover:bg-gray-100 rounded-lg">
                Cancelar
              </button>
              <button
                onClick={handlePublish}
                disabled={publishing}
                className="flex items-center gap-2 px-4 py-2 text-[13px] font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                <Upload size={14} />
                {publishing ? 'Publicando...' : 'Publicar'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="text-center py-4">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <Check size={24} className="text-green-600" />
              </div>
              <h2 className="text-[16px] font-semibold text-gray-900 mb-1">Publicada!</h2>
              <p className="text-[13px] text-gray-500 mb-4">Tu app esta disponible en:</p>
              <a
                href={publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-lg text-[13px] font-medium hover:bg-indigo-100"
              >
                <Link2 size={14} />
                {publicUrl}
              </a>
            </div>
            <div className="flex justify-center mt-4">
              <button onClick={onClose} className="px-4 py-2 text-[13px] text-gray-600 hover:bg-gray-100 rounded-lg">
                Cerrar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
