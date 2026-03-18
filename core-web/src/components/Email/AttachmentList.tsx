import { useState } from 'react';
import { ArrowDownTrayIcon, DocumentTextIcon, PhotoIcon, DocumentIcon } from '@heroicons/react/24/outline';
import { downloadEmailAttachment } from '../../api/client';
import type { EmailAttachment } from '../../api/client';

interface AttachmentListProps {
  emailId: string;
  attachments: EmailAttachment[];
  compact?: boolean;
  onImageClick?: (url: string) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageFile(attachment: EmailAttachment): boolean {
  // Check mimeType first
  if (attachment.mimeType?.startsWith('image/')) return true;
  // Fallback to filename extension
  const ext = attachment.filename?.toLowerCase().split('.').pop();
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext || '');
}

function getFileIcon(attachment: EmailAttachment) {
  if (isImageFile(attachment)) return PhotoIcon;
  const mimeType = attachment.mimeType || '';
  if (mimeType.includes('pdf')) return DocumentTextIcon;
  if (mimeType.includes('word') || mimeType.includes('document')) return DocumentTextIcon;
  return DocumentIcon;
}

export function AttachmentList({ emailId, attachments, compact = false, onImageClick }: AttachmentListProps) {
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [loadingImages, setLoadingImages] = useState<Set<string>>(new Set());

  const handleDownload = async (attachment: EmailAttachment) => {
    try {
      const { blob } = await downloadEmailAttachment(emailId, attachment.attachmentId);

      // Create download link
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = attachment.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download attachment:', err);
    }
  };

  const handleImageClick = async (attachment: EmailAttachment) => {
    if (!onImageClick) {
      handleDownload(attachment);
      return;
    }

    // If we already have the URL cached, use it
    if (imageUrls[attachment.attachmentId]) {
      onImageClick(imageUrls[attachment.attachmentId]);
      return;
    }

    // Load the image
    setLoadingImages(prev => new Set(prev).add(attachment.attachmentId));
    try {
      const { blob } = await downloadEmailAttachment(emailId, attachment.attachmentId);
      const url = URL.createObjectURL(blob);
      setImageUrls(prev => ({ ...prev, [attachment.attachmentId]: url }));
      onImageClick(url);
    } catch (err) {
      console.error('Failed to load image:', err);
    } finally {
      setLoadingImages(prev => {
        const next = new Set(prev);
        next.delete(attachment.attachmentId);
        return next;
      });
    }
  };

  if (attachments.length === 0) return null;

  return (
    <div className={`flex flex-wrap gap-2 ${compact ? 'mt-2' : 'mt-3'}`}>
      {attachments.map((attachment) => {
        const Icon = getFileIcon(attachment);
        const isImage = isImageFile(attachment);
        const isLoading = loadingImages.has(attachment.attachmentId);

        return (
          <button
            key={attachment.attachmentId}
            onClick={(e) => {
              e.stopPropagation();
              if (isImage) {
                handleImageClick(attachment);
              } else {
                handleDownload(attachment);
              }
            }}
            disabled={isLoading}
            className={`flex items-center gap-2 px-3 py-2 bg-black/[0.03] hover:bg-black/[0.06] rounded-lg transition-colors group ${
              compact ? 'text-xs' : 'text-sm'
            } ${isLoading ? 'opacity-50' : ''}`}
          >
            <Icon className={`${compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} text-text-tertiary flex-shrink-0`} />
            <div className="flex flex-col items-start min-w-0">
              <span className="text-text-body truncate max-w-[200px]">
                {attachment.filename}
              </span>
              <span className="text-text-tertiary text-xs">
                {formatFileSize(attachment.size)}
              </span>
            </div>
            <ArrowDownTrayIcon
              className={`${compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0`}
            />
          </button>
        );
      })}
    </div>
  );
}
