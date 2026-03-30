import { useEffect, useMemo, useState } from 'react';
import { checkShareLinkSlugAvailability, type ShareLink } from '../../api/client';

type AvailabilityState = 'idle' | 'checking' | 'available' | 'unavailable';

const LINK_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;
const HEX_TOKEN_PATTERN = /^[0-9a-f]{32}$/;

const normalizeSlug = (value: string): string => value.trim().toLowerCase();

const getLinkPrefix = (url: string): string => {
  const marker = '/s/';
  const index = url.indexOf(marker);
  if (index >= 0) {
    return url.slice(0, index + marker.length);
  }
  return `${window.location.origin}/s/`;
};

const validateSlug = (slug: string): string | null => {
  if (!slug) {
    return 'Slug is required';
  }
  if (!LINK_SLUG_PATTERN.test(slug)) {
    return 'Use 3-64 chars: lowercase letters, numbers, and hyphens';
  }
  if (HEX_TOKEN_PATTERN.test(slug)) {
    return 'Slug cannot be a 32-character hex token';
  }
  return null;
};

interface LinkSlugEditorProps {
  link: ShareLink;
  onUpdateSlug: (slug: string | null) => Promise<void>;
}

export default function LinkSlugEditor({ link, onUpdateSlug }: LinkSlugEditorProps) {
  const currentSlug = link.link_slug || '';
  const [isEditing, setIsEditing] = useState(false);
  const [draftSlug, setDraftSlug] = useState(currentSlug);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availability, setAvailability] = useState<AvailabilityState>('idle');
  const [availabilityReason, setAvailabilityReason] = useState<string | null>(null);

  const normalizedDraft = useMemo(() => normalizeSlug(draftSlug), [draftSlug]);
  const hasChanges = normalizedDraft !== currentSlug;
  const formatError = normalizedDraft ? validateSlug(normalizedDraft) : null;

  useEffect(() => {
    if (!isEditing) {
      setDraftSlug(currentSlug);
    }
  }, [currentSlug, isEditing]);

  useEffect(() => {
    if (!isEditing) return;

    if (!normalizedDraft) {
      setAvailability('idle');
      setAvailabilityReason(null);
      return;
    }

    if (formatError) {
      setAvailability('unavailable');
      setAvailabilityReason(formatError);
      return;
    }

    if (!hasChanges) {
      setAvailability('available');
      setAvailabilityReason(null);
      return;
    }

    let cancelled = false;
    setAvailability('checking');
    setAvailabilityReason(null);

    const timer = window.setTimeout(async () => {
      try {
        const result = await checkShareLinkSlugAvailability(normalizedDraft);
        if (cancelled) return;
        setAvailability(result.available ? 'available' : 'unavailable');
        setAvailabilityReason(result.available ? null : (result.reason || 'Slug is already in use'));
      } catch {
        if (cancelled) return;
        setAvailability('unavailable');
        setAvailabilityReason('Failed to check slug availability');
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isEditing, normalizedDraft, formatError, hasChanges]);

  const handleStartEditing = () => {
    setDraftSlug(currentSlug);
    setError(null);
    setAvailability('idle');
    setAvailabilityReason(null);
    setIsEditing(true);
  };

  const handleCancel = () => {
    setDraftSlug(currentSlug);
    setError(null);
    setAvailability('idle');
    setAvailabilityReason(null);
    setIsEditing(false);
  };

  const handleSave = async () => {
    const validationError = validateSlug(normalizedDraft);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (!hasChanges) {
      setIsEditing(false);
      return;
    }
    if (availability !== 'available') {
      setError('Choose an available slug before saving');
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      await onUpdateSlug(normalizedDraft);
      setIsEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update slug');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUseRandomLink = async () => {
    if (!currentSlug) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      await onUpdateSlug(null);
      setDraftSlug('');
      setIsEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset slug');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isEditing) {
    return (
      <div className="space-y-1">
        <p className="text-xs text-text-body truncate">{link.url}</p>
        <button
          type="button"
          onClick={handleStartEditing}
          className="text-[11px] text-text-secondary hover:text-text-body"
        >
          {link.link_slug ? 'Edit slug' : 'Customize link'}
        </button>
      </div>
    );
  }

  const canSave = Boolean(
    hasChanges
    && normalizedDraft
    && !formatError
    && availability === 'available'
    && !isSaving
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-text-secondary whitespace-nowrap">{getLinkPrefix(link.url)}</span>
        <input
          value={draftSlug}
          onChange={(event) => {
            setDraftSlug(event.target.value);
            if (error) setError(null);
          }}
          placeholder="my-share-link"
          className="min-w-0 w-full px-2 py-1 text-xs border border-border-gray rounded"
          autoFocus
        />
      </div>

      {error && <p className="text-[11px] text-red-500">{error}</p>}
      {!error && availability === 'checking' && (
        <p className="text-[11px] text-text-secondary">Checking availability...</p>
      )}
      {!error && availability === 'unavailable' && availabilityReason && (
        <p className="text-[11px] text-red-500">{availabilityReason}</p>
      )}
      {!error && availability === 'available' && hasChanges && (
        <p className="text-[11px] text-green-600">El slug está disponible</p>
      )}

      <p className="text-[11px] text-text-tertiary">Custom links are easier to guess than random links.</p>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className="px-2.5 py-1 text-xs rounded bg-black text-white disabled:opacity-60"
        >
          {isSaving ? 'Saving...' : 'Save'}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={isSaving}
          className="px-2.5 py-1 text-xs rounded border border-border-gray hover:bg-bg-gray"
        >
          Cancel
        </button>
        {currentSlug && (
          <button
            type="button"
            onClick={handleUseRandomLink}
            disabled={isSaving}
            className="px-2.5 py-1 text-xs rounded border border-border-gray hover:bg-bg-gray"
          >
            Use random
          </button>
        )}
      </div>
    </div>
  );
}
