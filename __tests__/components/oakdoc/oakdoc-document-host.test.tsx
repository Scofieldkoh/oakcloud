import { act, render, screen, waitFor } from '@testing-library/react';
import { forwardRef, useImperativeHandle } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const editorState = vi.hoisted(() => ({
  onChange: null as null | (() => void),
  saveImpl: vi.fn(async () => new Uint8Array([1, 2, 3]).buffer as ArrayBuffer),
  mounts: 0,
}));

vi.mock('@docx-editor.dev/react', () => ({
  DocxEditor: forwardRef(function MockDocxEditor(
    props: { onChange?: () => void; onReady?: () => void },
    ref,
  ) {
    useImperativeHandle(ref, () => ({
      save: editorState.saveImpl,
      snapshot: () => ({ selectionCollapsed: true, selection: null }),
      getEditor: () => null,
    }));
    editorState.onChange = props.onChange ?? null;
    if (props.onReady) queueMicrotask(props.onReady);
    return <div data-testid="docx-editor" />;
  }),
}));

import { OakDocDocumentHost } from '@/components/documents/oakdoc/oakdoc-document-host';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

describe('OakDocDocumentHost', () => {
  beforeEach(() => {
    editorState.onChange = null;
    editorState.saveImpl.mockClear();
  });

  it('keeps edits typed during an in-flight save dirty and never reloads submitted bytes', async () => {
    const load = vi.fn(async () => new Uint8Array([9]));
    const pending = deferred<{ revision: number }>();
    const persist = vi.fn(() => pending.promise);
    const onDirtyChange = vi.fn();

    render(
      <OakDocDocumentHost
        entityKey="generated:doc-1"
        baseRevision={4}
        title="Letter"
        readOnly={false}
        description="editable generated document"
        loadingLabel="Loading…"
        load={load}
        persist={persist}
        onDirtyChange={onDirtyChange}
      />,
    );
    await screen.findByTestId('docx-editor');
    await act(async () => { await Promise.resolve(); });

    act(() => editorState.onChange?.());
    expect(screen.getByRole('button', { name: /save docx/i })).toBeEnabled();

    act(() => { screen.getByRole('button', { name: /save docx/i }).click(); });
    await waitFor(() => expect(persist).toHaveBeenCalledOnce());
    const [, snapshot, operationId] = persist.mock.calls[0] as unknown as [Uint8Array, { localRevision: number; baseRevision: number }, string];
    expect(snapshot).toMatchObject({ localRevision: 1, baseRevision: 4 });
    expect(operationId).toBeTruthy();

    act(() => editorState.onChange?.()); // typing during save
    await act(async () => { pending.resolve({ revision: 5 }); await pending.promise; });

    expect(load).toHaveBeenCalledOnce();
    expect(screen.getByRole('status')).toHaveTextContent(/unsaved/i);
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);

    persist.mockResolvedValueOnce({ revision: 6 });
    act(() => { screen.getByRole('button', { name: /save docx/i }).click(); });
    await waitFor(() => expect(persist).toHaveBeenCalledTimes(2));
    const second = persist.mock.calls[1] as unknown as [Uint8Array, { localRevision: number; baseRevision: number }];
    expect(second[1]).toMatchObject({ localRevision: 2, baseRevision: 5 });
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false));
  });

  it('reuses the operation id when retrying the same unsaved revision after a failure', async () => {
    const persist = vi.fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ revision: 2 });
    render(
      <OakDocDocumentHost
        entityKey="generated:doc-2"
        baseRevision={1}
        title="Letter"
        readOnly={false}
        description="editable generated document"
        loadingLabel="Loading…"
        load={async () => new Uint8Array([1])}
        persist={persist}
      />,
    );
    await screen.findByTestId('docx-editor');
    await act(async () => { await Promise.resolve(); });
    act(() => editorState.onChange?.());

    act(() => { screen.getByRole('button', { name: /save docx/i }).click(); });
    await screen.findByText('network');
    act(() => { screen.getByRole('button', { name: /save docx/i }).click(); });
    await waitFor(() => expect(persist).toHaveBeenCalledTimes(2));
    expect(persist.mock.calls[1][2]).toBe(persist.mock.calls[0][2]);
  });

  it('does not reload or reset dirty state when the persisted revision prop changes', async () => {
    const load = vi.fn(async () => new Uint8Array([1]));
    const props = {
      entityKey: 'generated:doc-3',
      title: 'Letter',
      readOnly: false,
      description: 'editable generated document',
      loadingLabel: 'Loading…',
      load,
      persist: vi.fn(),
    };
    const { rerender } = render(<OakDocDocumentHost {...props} baseRevision={1} />);
    await screen.findByTestId('docx-editor');
    await act(async () => { await Promise.resolve(); });
    act(() => editorState.onChange?.());

    rerender(<OakDocDocumentHost {...props} baseRevision={7} />);
    expect(load).toHaveBeenCalledOnce();
    expect(screen.getByRole('status')).toHaveTextContent(/unsaved/i);
  });
});
