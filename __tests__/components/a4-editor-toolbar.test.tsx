import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  A4EditorToolbar,
  type A4EditorToolbarProps,
} from '@/components/documents/a4-editor-toolbar';
import { DEFAULT_A4_DOCUMENT_LAYOUT } from '@/components/documents/a4-pagination/layout';

function renderToolbar(overrides: Partial<A4EditorToolbarProps> = {}) {
  const props: A4EditorToolbarProps = {
    disabled: false,
    layout: DEFAULT_A4_DOCUMENT_LAYOUT,
    activeFormats: {
      bold: false,
      italic: false,
      underline: false,
      alignment: 'left',
      list: 'none',
    },
    showPageNumbers: true,
    canDeletePage: true,
    onCommand: vi.fn(),
    onLayoutChange: vi.fn(),
    onInsertPageBreak: vi.fn(),
    onAddBlankPage: vi.fn(),
    onDeleteCurrentPage: vi.fn(),
    onTogglePageNumbers: vi.fn(),
    onSaveSelection: vi.fn(),
    ...overrides,
  };

  return render(<A4EditorToolbar {...props} />);
}

describe('A4EditorToolbar', () => {
  it('distinguishes all page actions by name and intent', () => {
    renderToolbar();

    expect(screen.getByRole('button', { name: 'Insert page break' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Add blank page' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Delete current page' })).toBeVisible();
  });

  it('edits one margin without changing the other sides when unlinked', () => {
    const onLayoutChange = vi.fn();
    renderToolbar({ onLayoutChange });

    fireEvent.click(screen.getByRole('button', { name: 'Page margins' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Same on all sides' }));
    fireEvent.change(screen.getByLabelText('Left margin'), {
      target: { value: '28' },
    });

    expect(onLayoutChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        marginsMm: { top: 20, right: 20, bottom: 20, left: 28 },
      }),
    );
  });

  it('applies a changed margin to every side when linked', () => {
    const onLayoutChange = vi.fn();
    renderToolbar({ onLayoutChange });

    fireEvent.click(screen.getByRole('button', { name: 'Page margins' }));
    fireEvent.change(screen.getByLabelText('Top margin'), {
      target: { value: '28' },
    });

    expect(onLayoutChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        marginsMm: { top: 28, right: 28, bottom: 28, left: 28 },
      }),
    );
  });

  it('saves the selection before formatting commands and dispatches page callbacks', () => {
    const onSaveSelection = vi.fn();
    const onCommand = vi.fn();
    const onAddBlankPage = vi.fn();
    renderToolbar({ onSaveSelection, onCommand, onAddBlankPage });

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Bold' }));
    fireEvent.click(screen.getByRole('button', { name: 'Bold' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add blank page' }));

    expect(onSaveSelection).toHaveBeenCalled();
    expect(onCommand).toHaveBeenCalledWith({ type: 'bold' });
    expect(onAddBlankPage).toHaveBeenCalledOnce();
  });

  it('disables the delete current page action when no hard section can be removed', () => {
    renderToolbar({ canDeletePage: false });

    expect(screen.getByRole('button', { name: 'Delete current page' })).toBeDisabled();
  });
});
