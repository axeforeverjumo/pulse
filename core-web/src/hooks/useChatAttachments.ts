import { useState, useCallback, useRef } from 'react';
import { getChatAttachmentUploadUrl, confirmChatAttachment, deleteChatAttachment } from '../api/client';
import { isHeicFile, convertHeicToJpeg } from '../lib/heicConverter';

const MAX_ATTACHMENTS = 3;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/heic', 'image/heif'];
const THUMBNAIL_MAX_PX = 300;

export interface PendingAttachment {
  id: string;
  file: File;
  preview: string; // object URL
  status: 'pending' | 'uploading' | 'uploaded' | 'error';
  attachmentId?: string; // server-assigned
  width?: number;
  height?: number;
  error?: string;
}

export interface UploadedAttachmentInfo {
  attachmentId: string;
  width?: number;
  height?: number;
}

function generateLocalId(): string {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Create a thumbnail canvas from an image file. */
async function createThumbnail(file: File, maxPx: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Thumbnail creation failed'))),
        'image/jpeg',
        0.8
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    img.src = url;
  });
}

/** Get image dimensions from a File. */
async function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    img.src = url;
  });
}

export function useChatAttachments() {
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const attachmentsRef = useRef<PendingAttachment[]>([]);

  // Keep ref in sync for async operations
  const updateAttachments = useCallback((updater: (prev: PendingAttachment[]) => PendingAttachment[]) => {
    setAttachments((prev) => {
      const next = updater(prev);
      attachmentsRef.current = next;
      return next;
    });
  }, []);

  const addFiles = useCallback(async (files: File[]) => {
    const currentCount = attachmentsRef.current.length;
    const available = MAX_ATTACHMENTS - currentCount;
    if (available <= 0) return;

    const toProcess = files.slice(0, available);
    const newAttachments: PendingAttachment[] = [];

    for (const rawFile of toProcess) {
      // Validate type
      if (!ALLOWED_TYPES.includes(rawFile.type.toLowerCase()) && !isHeicFile(rawFile)) {
        continue; // skip non-image files
      }

      // Convert HEIC if needed
      let file = rawFile;
      if (isHeicFile(rawFile)) {
        try {
          file = await convertHeicToJpeg(rawFile);
        } catch {
          continue; // skip if conversion fails
        }
      }

      // Get dimensions
      let width: number | undefined;
      let height: number | undefined;
      try {
        const dims = await getImageDimensions(file);
        width = dims.width;
        height = dims.height;
      } catch {
        // non-critical
      }

      const preview = URL.createObjectURL(file);
      newAttachments.push({
        id: generateLocalId(),
        file,
        preview,
        status: 'pending',
        width,
        height,
      });
    }

    if (newAttachments.length > 0) {
      updateAttachments((prev) => [...prev, ...newAttachments]);
    }
  }, [updateAttachments]);

  const removeAttachment = useCallback(async (localId: string) => {
    const attachment = attachmentsRef.current.find((a) => a.id === localId);
    if (!attachment) return;

    // Revoke object URL
    URL.revokeObjectURL(attachment.preview);

    // Delete from server if uploaded
    if (attachment.attachmentId && attachment.status === 'uploaded') {
      try {
        await deleteChatAttachment(attachment.attachmentId);
      } catch {
        // non-critical
      }
    }

    updateAttachments((prev) => prev.filter((a) => a.id !== localId));
  }, [updateAttachments]);

  const uploadAll = useCallback(async (conversationId: string): Promise<{
    attachmentIds: string[];
    uploadedAttachments: UploadedAttachmentInfo[];
    hadErrors: boolean;
  }> => {
    const existingUploaded = attachmentsRef.current.filter(
      (a) => a.status === 'uploaded' && a.attachmentId
    );
    const uploadedAttachments: UploadedAttachmentInfo[] = existingUploaded.map((a) => ({
      attachmentId: a.attachmentId!,
      width: a.width,
      height: a.height,
    }));
    const attachmentIds: string[] = uploadedAttachments.map((a) => a.attachmentId);

    const pending = attachmentsRef.current.filter(
      (a) => a.status === 'pending' || a.status === 'error'
    );
    if (pending.length === 0) {
      return { attachmentIds, uploadedAttachments, hadErrors: false };
    }

    setIsUploading(true);
    let hadErrors = false;

    try {
      for (const attachment of pending) {
        // Mark as uploading
        updateAttachments((prev) =>
          prev.map((a) =>
            a.id === attachment.id
              ? { ...a, status: 'uploading' as const, error: undefined }
              : a
          )
        );

        try {
          // Generate thumbnail
          const thumbBlob = await createThumbnail(attachment.file, THUMBNAIL_MAX_PX);

          // Get presigned URLs
          const { attachment_id, original, thumbnail } = await getChatAttachmentUploadUrl({
            conversationId,
            filename: attachment.file.name,
            contentType: attachment.file.type === 'image/heic' ? 'image/jpeg' : attachment.file.type,
            fileSize: attachment.file.size,
            thumbnailSize: thumbBlob.size,
            width: attachment.width,
            height: attachment.height,
          });

          // Upload original + thumbnail to R2 in parallel
          const contentType = attachment.file.type === 'image/heic' ? 'image/jpeg' : attachment.file.type;
          const [originalResult, thumbnailResult] = await Promise.all([
            fetch(original.upload_url, {
              method: 'PUT',
              body: attachment.file,
              headers: { 'Content-Type': contentType },
            }),
            fetch(thumbnail.upload_url, {
              method: 'PUT',
              body: thumbBlob,
              headers: { 'Content-Type': 'image/jpeg' },
            }),
          ]);
          if (!originalResult.ok || !thumbnailResult.ok) {
            throw new Error('Upload failed');
          }

          // Confirm upload
          await confirmChatAttachment(attachment_id);

          // Mark as uploaded
          updateAttachments((prev) =>
            prev.map((a) =>
              a.id === attachment.id
                ? { ...a, status: 'uploaded' as const, attachmentId: attachment_id }
                : a
            )
          );

          attachmentIds.push(attachment_id);
          uploadedAttachments.push({
            attachmentId: attachment_id,
            width: attachment.width,
            height: attachment.height,
          });
        } catch (err) {
          console.error('Failed to upload attachment:', err);
          hadErrors = true;
          updateAttachments((prev) =>
            prev.map((a) =>
              a.id === attachment.id
                ? { ...a, status: 'error' as const, error: 'Upload failed' }
                : a
            )
          );
        }
      }

      return { attachmentIds, uploadedAttachments, hadErrors };
    } finally {
      setIsUploading(false);
    }
  }, [updateAttachments]);

  const clearAll = useCallback(() => {
    for (const a of attachmentsRef.current) {
      URL.revokeObjectURL(a.preview);
    }
    updateAttachments(() => []);
  }, [updateAttachments]);

  return {
    attachments,
    isUploading,
    addFiles,
    removeAttachment,
    uploadAll,
    clearAll,
  };
}
