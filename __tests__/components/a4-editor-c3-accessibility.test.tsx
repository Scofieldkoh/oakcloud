import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { A4PageEditor } from '@/components/documents/a4-page-editor';

describe('A4PageEditor C3 accessibility', () => {
  it('exposes the editable document as a named multiline textbox', () => {
    render(
      <A4PageEditor
        value="<p>Accessible content</p>"
        ariaLabel="Agreement document body"
      />,
    );

    const editor = screen.getByRole('textbox', { name: 'Agreement document body' });
    expect(editor).toHaveAttribute('aria-multiline', 'true');
    expect(editor).toHaveAttribute('aria-readonly', 'false');
    expect(editor.className).toContain('focus-visible:ring-2');
  });

  it('labels page navigation controls and keeps exactly one blank-page action', () => {
    render(<A4PageEditor value="<p>Page controls</p>" />);

    expect(screen.getByRole('button', { name: 'Previous page' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeVisible();
    expect(screen.getAllByRole('button', { name: 'Add blank page' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Insert page break' })).toBeVisible();
  });

  it('does not disable editing commands merely because pagination is busy', () => {
    render(<A4PageEditor value="<p>Editable while pages settle</p>" />);

    expect(screen.getByTestId('a4-document-surface')).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Bold' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Insert page break' })).toBeEnabled();
  });

  it('hides page-number chrome until persistence/output support is enabled', () => {
    render(
      <A4PageEditor
        value={'<p>Page one</p><div data-a4-break="page"></div><p>Page two</p>'}
      />,
    );

    expect(screen.queryByTestId('a4-page-number-1')).not.toBeInTheDocument();
  });

  it('surfaces W3 revision-derived workflow status without a local timer', async () => {
    render(
      <A4PageEditor
        value="<p>Status</p>"
        workflowStatus={{
          phase: 'saving',
          serverRevision: 4,
          acknowledgedRevision: 4,
          localRevision: 5,
          dirty: true,
          canSave: false,
          shouldRetry: false,
          message: null,
        }}
      />,
    );

    expect(await screen.findByTestId('a4-editor-status')).toHaveTextContent(/Saving|Repaginating/);
  });

  it('keeps pagination state visual rather than announcing each reflow', () => {
    render(<A4PageEditor value="<p>Status</p>" />);

    const status = screen.getByTestId('a4-editor-status');
    expect(status).not.toHaveAttribute('aria-live');
    expect(status).not.toHaveAttribute('role', 'status');
    expect(status).toHaveTextContent('Repaginating…');
  });
});
