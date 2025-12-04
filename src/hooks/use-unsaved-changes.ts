'use client';

import { useEffect } from 'react';

/**
 * Hook to warn users when they try to leave the page with unsaved changes.
 * Uses the browser's beforeunload event to show a confirmation dialog.
 *
 * @param isDirty - Whether there are unsaved changes (typically from react-hook-form's formState.isDirty)
 * @param enabled - Whether the warning is enabled (default: true). Set to false when form is submitted.
 */
export function useUnsavedChangesWarning(isDirty: boolean, enabled: boolean = true) {
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty && enabled) {
        // Standard way to show browser's confirmation dialog
        e.preventDefault();
        // For older browsers
        e.returnValue = '';
        return '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isDirty, enabled]);
}
