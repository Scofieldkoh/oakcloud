'use client';

import { useEffect, useCallback } from 'react';

interface ShortcutConfig {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  handler: () => void;
  description: string;
}

export function useKeyboardShortcuts(shortcuts: ShortcutConfig[], enabled = true) {
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!enabled) return;

    // Don't trigger shortcuts when typing in input fields
    const target = event.target as HTMLElement;
    const isInputField = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);

    // For Escape, allow it even in input fields
    // For Ctrl+S, allow it even in input fields (common save pattern)

    for (const shortcut of shortcuts) {
      const ctrlOrMeta = shortcut.ctrl || shortcut.meta;
      const matchesCtrlMeta = ctrlOrMeta
        ? (event.ctrlKey || event.metaKey)
        : (!event.ctrlKey && !event.metaKey);
      const matchesShift = shortcut.shift ? event.shiftKey : !event.shiftKey;

      if (
        event.key.toLowerCase() === shortcut.key.toLowerCase() &&
        matchesCtrlMeta &&
        matchesShift
      ) {
        // Skip non-modifier shortcuts (like Escape) if in input field, unless it's Escape
        if (isInputField && !ctrlOrMeta && shortcut.key.toLowerCase() !== 'escape') {
          continue;
        }

        event.preventDefault();
        shortcut.handler();
        break;
      }
    }
  }, [shortcuts, enabled]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
