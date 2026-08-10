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
      listStart: 1,
      paragraphStyle: 'p',
      fontFamily: DEFAULT_A4_DOCUMENT_LAYOUT.fontFamily,
      fontSize: DEFAULT_A4_DOCUMENT_LAYOUT.fontSize,
      textColor: '#000000',
      highlightColor: '#ffffff',
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

  it('keeps insert controls in the overflow menu while font and view controls stay visible', () => {
    renderToolbar();

    expect(screen.getByLabelText('Document editor toolbar')).not.toHaveClass('flex-wrap');
    expect(
      within(screen.getByRole('group', { name: 'Insert' })).getByRole('button', {
        name: 'Tables',
      }),
    ).toBeVisible();
    expect(
      within(screen.getByRole('group', { name: 'View' })).getByLabelText(
        'Show page numbers',
      ),
    ).toBeVisible();
    expect(screen.getByLabelText('Font family')).toBeVisible();
    expect(screen.getByLabelText('Font size')).toBeVisible();
    expect(screen.getByLabelText('Paragraph style')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Insert table' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Tables' }));
    expect(screen.getByRole('button', { name: 'Insert table' })).toBeVisible();
    expect(screen.getByRole('dialog', { name: 'Tables popover' }).parentElement).toBe(document.body);
  });

  it('dismisses an overflow menu with Escape and restores trigger focus', () => {
    renderToolbar();

    const overflow = screen.getByRole('button', { name: 'Tables' });
    fireEvent.click(overflow);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('button', { name: 'Insert table' })).not.toBeInTheDocument();
    expect(overflow).toHaveFocus();
  });

  it('keeps font family and font size commands available directly in the toolbar', () => {
    const onLegacyCommand = vi.fn();
    renderToolbar({ onLegacyCommand });

    fireEvent.change(screen.getByLabelText('Font family'), {
      target: { value: 'Georgia, serif' },
    });
    fireEvent.change(screen.getByLabelText('Font size'), {
      target: { value: '14pt' },
    });

    expect(onLegacyCommand).toHaveBeenCalledWith('fontName', 'Georgia, serif');
    expect(onLegacyCommand).toHaveBeenCalledWith('customFontSize', '14pt');
  });

  it('keeps every shared typography option available in the toolbar', () => {
    renderToolbar({ onLegacyCommand: vi.fn() });

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

  it('shows the active font size in the visible font size dropdown', () => {
    renderToolbar({
      activeFormats: {
        bold: false,
        italic: false,
        underline: false,
        alignment: 'left',
        list: 'none',
        listStart: 1,
        paragraphStyle: 'p',
        fontFamily: DEFAULT_A4_DOCUMENT_LAYOUT.fontFamily,
        fontSize: '14pt',
        textColor: '#000000',
        highlightColor: '#ffffff',
      },
    });

    expect(screen.getByLabelText('Font size')).toHaveValue('14pt');
    expect(
      screen.queryByRole('button', { name: 'Formats' }),
    ).not.toBeInTheDocument();
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

  it('reflects changed active formatting in every controlled control', () => {
    const baseProps: A4EditorToolbarProps = {
      disabled: false,
      layout: DEFAULT_A4_DOCUMENT_LAYOUT,
      activeFormats: {
        bold: false,
        italic: false,
        underline: false,
        alignment: 'left',
        list: 'none',
        listStart: 1,
        paragraphStyle: 'p',
        fontFamily: DEFAULT_A4_DOCUMENT_LAYOUT.fontFamily,
        fontSize: DEFAULT_A4_DOCUMENT_LAYOUT.fontSize,
        textColor: '#000000',
        highlightColor: '#ffffff',
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
    };
    const { rerender } = render(<A4EditorToolbar {...baseProps} />);

    rerender(
      <A4EditorToolbar
        {...baseProps}
        activeFormats={{
          bold: true,
          italic: false,
          underline: true,
          alignment: 'center',
          list: 'ordered',
          listStart: 1,
          paragraphStyle: 'h1',
          fontFamily: 'Georgia, serif',
          fontSize: '14pt',
          textColor: '#ff0000',
          highlightColor: '#ffff00',
        }}
      />,
    );

    expect(screen.getByLabelText('Font family')).toHaveValue('Georgia, serif');
    expect(screen.getByLabelText('Font size')).toHaveValue('14pt');
    expect(screen.getByLabelText('Paragraph style')).toHaveValue('h1');
    expect(screen.getByLabelText('Text color')).toHaveValue('#ff0000');
    expect(screen.getByLabelText('Highlight color')).toHaveValue('#ffff00');
    expect(screen.getByRole('button', { name: 'Bold' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Underline' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Align center' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Numbered list' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('blocks document mutations while reflow is pending without owning global layout controls', () => {
    renderToolbar({ mutationDisabled: true, onLegacyCommand: vi.fn() });

    expect(screen.getByRole('button', { name: 'Bold' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Italic' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Delete current page' }),
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add blank page' })).toBeDisabled();
    expect(screen.queryByLabelText('Line spacing')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Page margins')).not.toBeInTheDocument();
  });

  it('shows alphabetical and nested list actions in the paragraph group', () => {
    renderToolbar();
    const group = screen.getByRole('group', { name: 'Paragraph' });
    expect(
      within(group).getByRole('button', { name: 'Alphabetical list' }),
    ).toBeVisible();
    expect(within(group).getByRole('button', { name: 'Nested list' }))
      .toBeVisible();
  });

  it('shows the start-at input only inside ordered and alpha lists', () => {
    const ordered = renderToolbar({
      activeFormats: {
        bold: false,
        italic: false,
        underline: false,
        alignment: 'left',
        list: 'ordered',
        listStart: 2,
        paragraphStyle: 'p',
        fontFamily: DEFAULT_A4_DOCUMENT_LAYOUT.fontFamily,
        fontSize: DEFAULT_A4_DOCUMENT_LAYOUT.fontSize,
        textColor: '#000000',
        highlightColor: '#ffffff',
      },
    });
    expect(ordered.getByLabelText('List start number')).toHaveValue(2);
    ordered.unmount();

    const alpha = renderToolbar({
      activeFormats: {
        bold: false,
        italic: false,
        underline: false,
        alignment: 'left',
        list: 'alpha',
        listStart: 1,
        paragraphStyle: 'p',
        fontFamily: DEFAULT_A4_DOCUMENT_LAYOUT.fontFamily,
        fontSize: DEFAULT_A4_DOCUMENT_LAYOUT.fontSize,
        textColor: '#000000',
        highlightColor: '#ffffff',
      },
    });
    expect(alpha.getByLabelText('List start number')).toBeVisible();
    alpha.unmount();

    const bullet = renderToolbar({
      activeFormats: {
        bold: false,
        italic: false,
        underline: false,
        alignment: 'left',
        list: 'unordered',
        listStart: 1,
        paragraphStyle: 'p',
        fontFamily: DEFAULT_A4_DOCUMENT_LAYOUT.fontFamily,
        fontSize: DEFAULT_A4_DOCUMENT_LAYOUT.fontSize,
        textColor: '#000000',
        highlightColor: '#ffffff',
      },
    });
    expect(bullet.queryByLabelText('List start number')).not.toBeInTheDocument();
  });

  it('dispatches list-start commands from the start-at input', () => {
    const onCommand = vi.fn();
    const view = renderToolbar({
      activeFormats: {
        bold: false,
        italic: false,
        underline: false,
        alignment: 'left',
        list: 'ordered',
        listStart: 1,
        paragraphStyle: 'p',
        fontFamily: DEFAULT_A4_DOCUMENT_LAYOUT.fontFamily,
        fontSize: DEFAULT_A4_DOCUMENT_LAYOUT.fontSize,
        textColor: '#000000',
        highlightColor: '#ffffff',
      },
      onCommand,
    });
    fireEvent.change(view.getByLabelText('List start number'), {
      target: { value: '5' },
    });
    expect(onCommand).toHaveBeenCalledWith({ type: 'list-start', value: 5 });
  });
});
