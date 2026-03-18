import { useState, useEffect } from 'react';
import { getChatAttachmentUrl } from '../../api/client';

// Module-level URL cache to avoid refetching presigned URLs
const urlCache = new Map<string, { url: string; expiresAt: number }>();
const EXPIRY_BUFFER_MS = 60_000;

/** Returns a cached URL synchronously if still valid, or null. */
function getCachedUrl(attachmentId: string, thumbnail = false): string | null {
  const cached = urlCache.get(`${attachmentId}:${thumbnail}`);
  return cached && cached.expiresAt > Date.now() + EXPIRY_BUFFER_MS ? cached.url : null;
}

async function getImageUrl(attachmentId: string, thumbnail = false): Promise<string> {
  const hit = getCachedUrl(attachmentId, thumbnail);
  if (hit) return hit;

  const { url, expires_in } = await getChatAttachmentUrl(attachmentId, thumbnail);
  urlCache.set(`${attachmentId}:${thumbnail}`, { url, expiresAt: Date.now() + expires_in * 1000 });
  return url;
}

interface ChatAttachmentImageProps {
  attachmentId: string;
  width?: number;
  height?: number;
  className?: string;
}

export default function ChatAttachmentImage({ attachmentId, width, height, className }: ChatAttachmentImageProps) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getImageUrl(attachmentId, true)
      .then((url) => { if (!cancelled) setThumbUrl(url); })
      .catch(() => { if (!cancelled) setError(true); });
    // Pre-fetch full URL to warm the cache for click handler
    getImageUrl(attachmentId, false).catch(() => {});
    return () => { cancelled = true; };
  }, [attachmentId]);

  const handleClick = async () => {
    // Fast path: use cached URL if still valid (synchronous — won't be popup-blocked)
    const cached = getCachedUrl(attachmentId, false);
    if (cached) {
      window.open(cached, '_blank');
      return;
    }

    // Slow path: open blank window synchronously to preserve user gesture,
    // then navigate once the fresh URL resolves
    const win = window.open('', '_blank');
    try {
      const url = await getImageUrl(attachmentId, false);
      if (win) {
        win.location.href = url;
      }
    } catch {
      // Close the blank tab on failure, fall back to thumbnail
      win?.close();
      if (thumbUrl) window.open(thumbUrl, '_blank');
    }
  };

  // Compute aspect ratio for skeleton
  const aspectRatio = width && height ? width / height : 4 / 3;
  const displayWidth = Math.min(width || 300, 300);
  const displayHeight = Math.round(displayWidth / aspectRatio);

  if (error) {
    return (
      <div
        className={`rounded-xl bg-bg-gray flex items-center justify-center text-text-tertiary text-sm ${className || ''}`}
        style={{ width: displayWidth, height: displayHeight }}
      >
        Failed to load image
      </div>
    );
  }

  if (!thumbUrl) {
    return (
      <div
        className={`rounded-xl bg-bg-gray animate-pulse ${className || ''}`}
        style={{ width: displayWidth, height: displayHeight }}
      />
    );
  }

  return (
    <img
      src={thumbUrl}
      alt="Chat attachment"
      className={`rounded-xl cursor-pointer hover:opacity-90 transition-opacity ${className || ''}`}
      style={{ maxWidth: 300, maxHeight: 300 }}
      onClick={handleClick}
      loading="lazy"
    />
  );
}
