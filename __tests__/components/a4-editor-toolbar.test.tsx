import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  A4EditorToolbar,
  type A4EditorToolbarProps,
} from '@/components/documents/a4-editor-toolbar';
import { DEFAULT_A4_DOCUMENT_LAYOUT } from '@/components/documents/a4-pagination/layout';
import {
  DOCUMENT_FONT_OPTIONS,
  DOCUMENT_FONT_SIZE_OPTIONS,
} from '@/components/documents/document-typography';

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

  it('leaves document layout controls to the template side panel', () => {
    renderToolbar();
    expect(screen.queryByRole('button', { name: 'Page margins' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Line spacing')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Paragraph spacing')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Uniform page margin')).not.toBeInTheDocument();
  });

  it('keeps lower-frequency insert and view controls in the toolbar overflow menu', () => {
    renderToolbar();

    expect(screen.getByLabelText('Document editor toolbar')).not.toHaveClass('flex-wrap');
    expect(
      within(screen.getByRole('group', { name: 'View' })).getByRole('button', {
        name: 'Formats',
      }),
    ).toBeVisible();
    expect(
      within(screen.getByRole('group', { name: 'Insert' })).getByRole('button', {
        name: 'Tables',
      }),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Insert table' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Show page numbers' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Tables' }));
    expect(screen.getByRole('button', { name: 'Insert table' })).toBeVisible();
    expect(screen.getByRole('dialog', { name: 'Tables popover' }).parentElement).toBe(document.body);

    fireEvent.click(screen.getByRole('button', { name: 'Formats' }));
    expect(screen.queryByRole('button', { name: 'Insert table' })).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Show page numbers' })).toBeVisible();
  });

  it('dismisses an overflow menu with Escape and restores trigger focus', () => {
    renderToolbar();

    const overflow = screen.getByRole('button', { name: 'Formats' });
    fireEvent.click(overflow);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('button', { name: 'Insert table' })).not.toBeInTheDocument();
    expect(overflow).toHaveFocus();
  });

  it('keeps font family and font size commands available in the accessible toolbar menu', () => {
    const onLegacyCommand = vi.fn();
    renderToolbar({ onLegacyCommand });

    fireEvent.click(screen.getByRole('button', { name: 'Formats' }));
    fireEvent.change(screen.getByLabelText('Font family'), {
      target: { value: 'Georgia, serif' },
    });
    fireEvent.change(screen.getByLabelText('Font size'), {
      target: { value: '14pt' },
    });

    expect(onLegacyCommand).toHaveBeenCalledWith('fontName', 'Georgia, serif');
    expect(onLegacyCommand).toHaveBeenCalledWith('customFontSize', '14pt');
  });

  it('keeps every shared typography option available through the Formats popover', () => {
    renderToolbar({ onLegacyCommand: vi.fn() });

    fireEvent.click(screen.getByRole('button', { name: 'Formats' }));
    const fontFamilySelect = screen.getByLabelText('Font family');
    const fontSizeSelect = screen.getByLabelText('Font size');

    for (const font of DOCUMENT_FONT_OPTIONS) {
      expect(within(fontFamilySelect).getByRole('option', { name: font.label }))
        .toHaveValue(font.value);
    }
    for (const size of DOCUMENT_FONT_SIZE_OPTIONS) {
      expect(within(fontSizeSelect).getByRole('option', { name: size.replace('pt', '') }))
        .toHaveValue(size);
    }
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
