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

const baseFormats: A4EditorToolbarProps['activeFormats'] = {
  bold: false,
  italic: false,
  underline: false,
  alignment: 'left',
  list: 'none',
  listStart: 1,
  listMarkersBold: false,
  paragraphStyle: 'p',
  fontFamily: DEFAULT_A4_DOCUMENT_LAYOUT.fontFamily,
  fontSize: DEFAULT_A4_DOCUMENT_LAYOUT.fontSize,
  textColor: '#000000',
  highlightColor: '#ffffff',
};

function renderToolbar(overrides: Partial<A4EditorToolbarProps> = {}) {
  const props: A4EditorToolbarProps = {
    disabled: false,
    layout: DEFAULT_A4_DOCUMENT_LAYOUT,
    activeFormats: baseFormats,
    showPageNumbers: true,
    canDeletePage: true,
    canRemovePageBreak: true,
    onCommand: vi.fn(),
    onLayoutChange: vi.fn(),
    onInsertPageBreak: vi.fn(),
    onAddBlankPage: vi.fn(),
    onDeleteCurrentPage: vi.fn(),
    onRemovePageBreak: vi.fn(),
    onTogglePageNumbers: vi.fn(),
    onSaveSelection: vi.fn(),
    ...overrides,
  };

  return render(<A4EditorToolbar {...props} />);
}

function openMenu(name: string) {
  fireEvent.click(screen.getByRole('button', { name }));
}

describe('A4EditorToolbar', () => {
  it('uses toolbar semantics and keeps primary writing controls directly available', () => {
    renderToolbar({ onLegacyCommand: vi.fn() });

    const toolbar = screen.getByRole('toolbar', { name: 'Document editor toolbar' });
    expect(toolbar).toHaveAttribute('aria-orientation', 'horizontal');
    expect(within(toolbar).getByLabelText('Paragraph style')).toBeVisible();
    expect(within(toolbar).getByRole('button', { name: 'Bold' })).toBeVisible();
    expect(within(toolbar).getByRole('button', { name: 'Bulleted list' })).toBeVisible();
    expect(within(toolbar).getByRole('button', { name: 'Numbered list' })).toBeVisible();
    expect(within(toolbar).getByRole('button', { name: 'Increase indent' })).toBeVisible();
    expect(within(toolbar).getByRole('button', { name: 'Insert page break' })).toBeVisible();
  });

  it('keeps rare numbering and font controls in labelled menus', () => {
    renderToolbar({ onLegacyCommand: vi.fn() });

    expect(screen.queryByLabelText('Font family')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Alphabetical list' })).not.toBeInTheDocument();

    openMenu('List options');
    expect(screen.getByRole('button', { name: 'Alphabetical list' })).toBeVisible();
    expect(screen.getByLabelText('List start number')).toBeVisible();
    fireEvent.keyDown(document, { key: 'Escape' });

    openMenu('Text options');
    expect(screen.getByLabelText('Font family')).toBeVisible();
    expect(screen.getByLabelText('Font size')).toBeVisible();
  });

  it('ports menus to the body and restores trigger focus on Escape', () => {
    renderToolbar();

    const trigger = screen.getByRole('button', { name: 'Tables' });
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog', { name: 'Tables popover' }).parentElement).toBe(document.body);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(trigger).toHaveFocus();
  });

  it('preserves selection on primary pointer-down but executes once on click', () => {
    const onSaveSelection = vi.fn();
    const onCommand = vi.fn();
    renderToolbar({ onSaveSelection, onCommand });

    const bold = screen.getByRole('button', { name: 'Bold' });
    fireEvent.pointerDown(bold, { button: 0, isPrimary: true });
    expect(onSaveSelection).toHaveBeenCalledOnce();
    expect(onCommand).not.toHaveBeenCalled();

    fireEvent.click(bold, { button: 0 });
    expect(onCommand).toHaveBeenCalledTimes(1);
    expect(onCommand).toHaveBeenLastCalledWith({ type: 'bold' });
  });

  it('ignores secondary pointer activation', () => {
    const onSaveSelection = vi.fn();
    const onCommand = vi.fn();
    renderToolbar({ onSaveSelection, onCommand });

    const bold = screen.getByRole('button', { name: 'Bold' });
    fireEvent.pointerDown(bold, { button: 2, isPrimary: true });
    fireEvent.click(bold, { button: 2 });

    expect(onSaveSelection).not.toHaveBeenCalled();
    expect(onCommand).not.toHaveBeenCalled();
  });

  it('keeps keyboard or assistive click activation working without pointer-down', () => {
    const onCommand = vi.fn();
    renderToolbar({ onCommand });

    fireEvent.click(screen.getByRole('button', { name: 'Italic' }), { button: 0, detail: 0 });
    expect(onCommand).toHaveBeenCalledOnce();
    expect(onCommand).toHaveBeenCalledWith({ type: 'italic' });
  });

  it('supports horizontal arrow, Home and End navigation between toolbar buttons', () => {
    renderToolbar();

    const undo = screen.getByRole('button', { name: 'Undo' });
    const redo = screen.getByRole('button', { name: 'Redo' });
    const deletePage = screen.getByRole('button', { name: 'Delete current page' });
    undo.focus();

    fireEvent.keyDown(undo, { key: 'ArrowRight' });
    expect(redo).toHaveFocus();
    fireEvent.keyDown(redo, { key: 'End' });
    expect(deletePage).toHaveFocus();
    fireEvent.keyDown(deletePage, { key: 'Home' });
    expect(undo).toHaveFocus();
  });

  it('keeps every shared typography option available in Text options', () => {
    renderToolbar({ onLegacyCommand: vi.fn() });
    openMenu('Text options');

    const fontFamilySelect = screen.getByLabelText('Font family');
    const fontSizeSelect = screen.getByLabelText('Font size');

    for (const font of DOCUMENT_FONT_OPTIONS) {
      expect(within(fontFamilySelect).getByRole('option', { name: font.label })).toHaveValue(font.value);
    }
    for (const size of DOCUMENT_FONT_SIZE_OPTIONS) {
      expect(within(fontSizeSelect).getByRole('option', { name: size.replace('pt', '') })).toHaveValue(size);
    }
  });

  it('reflects active formatting in direct and advanced controls', () => {
    renderToolbar({
      onLegacyCommand: vi.fn(),
      activeFormats: {
        ...baseFormats,
        bold: true,
        alignment: 'center',
        list: 'ordered',
        listStart: 5,
        listMarkersBold: true,
        paragraphStyle: 'h1',
        fontFamily: 'Georgia, serif',
        fontSize: '14pt',
      },
    });

    expect(screen.getByLabelText('Paragraph style')).toHaveValue('h1');
    expect(screen.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Align center' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Numbered list' })).toHaveAttribute('aria-pressed', 'true');

    openMenu('List options');
    expect(screen.getByLabelText('List start number')).toHaveValue(5);
    expect(screen.getByRole('button', { name: 'Bold list numbers' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.keyDown(document, { key: 'Escape' });

    openMenu('Text options');
    expect(screen.getByLabelText('Font family')).toHaveValue('Georgia, serif');
    expect(screen.getByLabelText('Font size')).toHaveValue('14pt');
  });

  it('uses mutationDisabled only as an explicit command lock', () => {
    renderToolbar({ mutationDisabled: true, onLegacyCommand: vi.fn() });

    expect(screen.getByRole('button', { name: 'Bold' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Insert page break' })).toBeDisabled();
    expect(screen.getByLabelText('Paragraph style')).toBeDisabled();
  });

  it('enables advanced list inputs only for ordered and alphabetical lists', () => {
    const view = renderToolbar({
      activeFormats: { ...baseFormats, list: 'ordered', listStart: 2 },
    });
    openMenu('List options');
    expect(screen.getByLabelText('List start number')).toHaveValue(2);
    expect(screen.getByLabelText('List start number')).toBeEnabled();
    view.unmount();

    renderToolbar({ activeFormats: { ...baseFormats, list: 'unordered' } });
    openMenu('List options');
    expect(screen.getByLabelText('List start number')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Bold list numbers' })).toBeDisabled();
  });

  it('keeps page-number authoring hidden until shared output support is declared', () => {
    const hidden = renderToolbar();
    expect(hidden.queryByLabelText('Show page numbers')).not.toBeInTheDocument();
    hidden.unmount();

    renderToolbar({ pageNumbersSupported: true });
    expect(screen.getByLabelText('Show page numbers')).toBeVisible();
  });

  it('keeps direct page operations labelled and disables them when not applicable', () => {
    renderToolbar({ canDeletePage: false, canRemovePageBreak: false });

    expect(screen.getByRole('button', { name: 'Add blank page' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Remove page break' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete current page' })).toBeDisabled();
  });
});
