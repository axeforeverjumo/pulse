import { useEffect } from 'react';
import {
  noteHidden,
  noteVisible,
  shouldRevalidateOnResume,
  revalidateActiveData,
} from '../lib/revalidation';

export function useResumeRevalidation(enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    noteVisible();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        noteHidden();
        return;
      }
      if (document.visibilityState !== 'visible') return;
      noteVisible();
      if (shouldRevalidateOnResume()) {
        revalidateActiveData('visibility');
      }
    };

    const handleFocus = () => {
      noteVisible();
      if (shouldRevalidateOnResume()) {
        revalidateActiveData('focus');
      }
    };

    const handleBlur = () => {
      noteHidden();
    };

    const handleOnline = () => {
      noteVisible();
      revalidateActiveData('online');
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('online', handleOnline);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('online', handleOnline);
    };
  }, [enabled]);
}
