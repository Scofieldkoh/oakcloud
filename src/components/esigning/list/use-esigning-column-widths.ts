'use client';

import { useCallback, useEffect, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useUpsertUserPreference, useUserPreference } from '@/hooks/use-user-preferences';
import {
  DEFAULT_ESIGNING_COLUMN_WIDTHS,
  ESIGNING_COLUMN_WIDTH_PREF_KEY,
  ESIGNING_TABLE_COLUMNS,
  type EsigningTableColumnId,
} from './esigning-list-config';

type ColumnWidths = Partial<Record<EsigningTableColumnId, number>>;

/**
 * Envelope table column widths, loaded from and saved to the user's preferences.
 * Columns resize by dragging the header handle or with the arrow keys, never below 30px.
 */
export function useEsigningColumnWidths() {
  const columnWidthPreference = useUserPreference<ColumnWidths>(ESIGNING_COLUMN_WIDTH_PREF_KEY);
  const saveColumnWidthPreference = useUpsertUserPreference<Record<string, number>>();
  const [columnWidths, setColumnWidths] = useState<ColumnWidths>({});

  useEffect(() => {
    const value = columnWidthPreference.data?.value;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;

    const sanitized = Object.fromEntries(
      ESIGNING_TABLE_COLUMNS.flatMap((columnId) => {
        const width = value[columnId];
        return typeof width === 'number' && Number.isFinite(width)
          ? [[columnId, Math.max(30, width)]]
          : [];
      })
    ) as ColumnWidths;
    setColumnWidths(sanitized);
  }, [columnWidthPreference.data?.value]);

  const startColumnResize = useCallback((
    event: PointerEvent<HTMLElement>,
    columnId: EsigningTableColumnId,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    const handle = event.currentTarget;
    const header = handle.closest('th') as HTMLTableCellElement | null;
    // A header that has not been laid out measures 0px; fall back to the default width.
    const startWidth =
      columnWidths[columnId]
      ?? (header?.getBoundingClientRect().width || DEFAULT_ESIGNING_COLUMN_WIDTHS[columnId]);
    const startX = event.clientX;
    const pointerId = event.pointerId;
    let latestWidth = startWidth;

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    try {
      handle.setPointerCapture(pointerId);
    } catch {
      // Pointer capture is best-effort; window listeners still handle resizing.
    }

    const onMove = (pointerEvent: globalThis.PointerEvent) => {
      const nextWidth = Math.max(30, startWidth + (pointerEvent.clientX - startX));
      latestWidth = nextWidth;
      setColumnWidths((current) => ({ ...current, [columnId]: nextWidth }));
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      try {
        handle.releasePointerCapture(pointerId);
      } catch {
        // Ignore browsers that already released pointer capture.
      }
      document.body.style.userSelect = '';
      document.body.style.cursor = '';

      const nextWidths = { ...columnWidths, [columnId]: latestWidth };
      setColumnWidths(nextWidths);
      saveColumnWidthPreference.mutate({
        key: ESIGNING_COLUMN_WIDTH_PREF_KEY,
        value: nextWidths,
      });
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [columnWidths, saveColumnWidthPreference]);

  const resizeColumnByKeyboard = useCallback((
    event: KeyboardEvent<HTMLSpanElement>,
    columnId: EsigningTableColumnId,
  ) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();

    const currentWidth = columnWidths[columnId] ?? DEFAULT_ESIGNING_COLUMN_WIDTHS[columnId];
    const nextWidth = Math.max(30, currentWidth + (event.key === 'ArrowRight' ? 10 : -10));
    const nextWidths = { ...columnWidths, [columnId]: nextWidth };
    setColumnWidths(nextWidths);
    saveColumnWidthPreference.mutate({
      key: ESIGNING_COLUMN_WIDTH_PREF_KEY,
      value: nextWidths,
    });
  }, [columnWidths, saveColumnWidthPreference]);

  return { columnWidths, startColumnResize, resizeColumnByKeyboard };
}
