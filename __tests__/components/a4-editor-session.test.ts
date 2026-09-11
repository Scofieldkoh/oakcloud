import { describe, expect, it, vi } from 'vitest';
import {
  createCanonicalEditorSession,
  createCanonicalInputBridge,
} from '@/components/documents/a4-pagination/editor-session';

function createSession(sessionKey = 'template:c1') {
  return createCanonicalEditorSession<string, { id: string }, string, { layout: string }>({
    sessionKey,
    internalHtml: '<p>Alpha</p><p>Later</p>',
    selection: 'after-alpha',
    typingMarks: 'plain',
    contentJson: { untouched: true },
    fields: [{ id: 'field-1' }],
    metadata: { layout: 'default' },
    serializeContent: (content) => content,
  });
}

function apply(
  session: ReturnType<typeof createSession>,
  kind: 'insert-text' | 'insert-paragraph' | 'format' | 'paste' | 'layout',
  internalHtml: string,
  selection: string,
  extra: Record<string, unknown> = {},
) {
  const state = session.getState();
  return session.dispatch({
    sessionKey: state.sessionKey,
    baseRevision: state.revision,
    intent: {
      kind,
      origin: 'keyboard',
      history: kind === 'insert-text' ? 'typing' : 'separate',
      ...(extra as object),
    },
    selection,
    apply: () => ({ status: 'applied', internalHtml, selection }),
  });
}

describe('A4 editor C1 canonical session', () => {
  it('returns the latest canonical snapshot before projection catches up', () => {
    const session = createSession();
    const result = apply(
      session,
      'insert-paragraph',
      '<p>Alpha</p><p><br></p><p>Later</p>',
      'new-paragraph',
    );
    expect(result).toMatchObject({ status: 'applied', revision: 1 });
    expect(session.getRenderedProjection().documentRevision).toBe(0);
    expect(session.getSnapshot()).toMatchObject({
      ok: true,
      snapshot: {
        revision: 1,
        content: '<p>Alpha</p><p><br></p><p>Later</p>',
      },
    });
  });

  it('routes Enter -> immediate typing to the canonical pending caret', () => {
    const session = createSession();
    apply(
      session,
      'insert-paragraph',
      '<p>Alpha</p><p><br></p><p>Later</p>',
      'new-paragraph',
    );
    expect(
      session.resolveNativeInputTarget({
        renderedRevision: 0,
        origin: 'keyboard',
        renderedSelection: 'stale-rendered-caret',
      }),
    ).toEqual({
      ok: true,
      baseRevision: 1,
      selection: 'new-paragraph',
      source: 'pending-canonical-selection',
    });
    apply(
      session,
      'insert-text',
      '<p>Alpha</p><p>N</p><p>Later</p>',
      'after-n',
    );
    expect(session.getSnapshot()).toMatchObject({
      ok: true,
      snapshot: { revision: 2, content: expect.stringContaining('<p>Later</p>') },
    });
  });

  it('does not redirect a stale pointer selection to the pending keyboard caret', () => {
    const session = createSession();
    apply(session, 'format', '<p><strong>Alpha</strong></p><p>Later</p>', 'after-alpha');
    expect(
      session.resolveNativeInputTarget({
        renderedRevision: 0,
        origin: 'pointer',
        renderedSelection: 'old-pointer-position',
      }),
    ).toEqual({
      ok: false,
      reason: 'stale-projection',
      currentRevision: 1,
      renderedRevision: 0,
    });
  });

  it('rejects stale reflow publication by all source revisions', () => {
    const session = createSession();
    const stale = session.createProjectionRevision();
    apply(session, 'layout', '<p>Alpha</p><p>Later</p>', 'after-alpha', {
      affectsLayout: true,
    });
    expect(session.publishProjection(stale)).toBe(false);
    const current = session.createProjectionRevision();
    expect(current.layoutRevision).toBe(1);
    expect(session.publishProjection(current)).toBe(true);
  });

  it('commits an applied transaction exactly once and ignores unchanged/rejected results', () => {
    const onSnapshotChange = vi.fn();
    const session = createCanonicalEditorSession<string>({
      sessionKey: 'template:once',
      internalHtml: '<p>A</p>',
      selection: 'a',
      typingMarks: null,
      metadata: null,
      serializeContent: (content) => content,
      onSnapshotChange,
    });
    const base = session.getState();
    expect(
      session.dispatch({
        sessionKey: base.sessionKey,
        baseRevision: base.revision,
        intent: { kind: 'insert-text', origin: 'keyboard' },
        selection: 'b',
        apply: () => ({ status: 'unchanged', reason: 'noop' }),
      }),
    ).toEqual({ status: 'unchanged', reason: 'noop' });
    expect(session.getState().revision).toBe(0);
    expect(onSnapshotChange).not.toHaveBeenCalled();

    const rejected = session.dispatch({
      sessionKey: base.sessionKey,
      baseRevision: base.revision,
      intent: { kind: 'insert-text', origin: 'keyboard' },
      selection: 'b',
      apply: () => ({ status: 'rejected', code: 'NO', message: 'No' }),
    });
    expect(rejected).toEqual({ status: 'rejected', code: 'NO', message: 'No' });
    expect(session.getState().revision).toBe(0);

    const appliedResult = session.dispatch({
      sessionKey: base.sessionKey,
      baseRevision: base.revision,
      intent: { kind: 'insert-text', origin: 'keyboard' },
      selection: 'b',
      apply: () => ({ status: 'applied', internalHtml: '<p>AB</p>', selection: 'b' }),
    });
    expect(appliedResult).toMatchObject({ status: 'applied', revision: 1 });
    expect(session.getState().revision).toBe(1);
    expect(onSnapshotChange).toHaveBeenCalledTimes(1);
  });

  it('coalesces bounded continuous typing but keeps paste and format distinct', () => {
    const session = createSession();
    apply(session, 'insert-text', '<p>AlphaA</p><p>Later</p>', 'a');
    apply(session, 'insert-text', '<p>AlphaAB</p><p>Later</p>', 'b');
    apply(session, 'paste', '<p>AlphaABPASTE</p><p>Later</p>', 'paste');
    apply(session, 'format', '<p><strong>AlphaABPASTE</strong></p><p>Later</p>', 'format');
    expect(session.undo()).toMatchObject({ status: 'applied' });
    expect(session.getSnapshot()).toMatchObject({
      ok: true,
      snapshot: { content: '<p>AlphaABPASTE</p><p>Later</p>' },
    });
    expect(session.undo()).toMatchObject({ status: 'applied' });
    expect(session.getSnapshot()).toMatchObject({
      ok: true,
      snapshot: { content: '<p>AlphaAB</p><p>Later</p>' },
    });
    expect(session.undo()).toMatchObject({ status: 'applied' });
    expect(session.getSnapshot()).toMatchObject({
      ok: true,
      snapshot: { content: '<p>Alpha</p><p>Later</p>' },
    });
  });

  it('isolates history between document sessions', () => {
    const a = createSession('template:A');
    const b = createSession('template:B');
    apply(a, 'insert-text', '<p>Alpha!</p><p>Later</p>', 'a!');
    expect(b.undo()).toEqual({ status: 'unchanged', reason: 'nothing-to-undo' });
    expect(b.getSnapshot()).toMatchObject({
      ok: true,
      snapshot: { sessionKey: 'template:B', content: '<p>Alpha</p><p>Later</p>' },
    });
  });

  it('restores complete content/selection/metadata through undo and redo', () => {
    const session = createSession();
    const state = session.getState();
    session.dispatch({
      sessionKey: state.sessionKey,
      baseRevision: state.revision,
      intent: { kind: 'layout', origin: 'programmatic', history: 'separate', affectsLayout: true },
      selection: 'after-layout',
      apply: () => ({
        status: 'applied',
        internalHtml: '<p>Alpha</p><p>Later</p>',
        selection: 'after-layout',
        contentJson: { untouched: true, layout: { margin: 10 } },
        metadata: { layout: 'wide' },
      }),
    });
    expect(session.undo()).toMatchObject({ status: 'applied', selection: 'after-alpha' });
    expect(session.getSnapshot()).toMatchObject({
      ok: true,
      snapshot: { contentJson: { untouched: true } },
    });
    expect(session.redo()).toMatchObject({ status: 'applied', selection: 'after-layout' });
    expect(session.getSnapshot()).toMatchObject({
      ok: true,
      snapshot: { contentJson: { untouched: true, layout: { margin: 10 } } },
    });
  });

  it('blocks complete snapshots during composition and commits composition once', () => {
    const session = createSession();
    expect(
      session.beginComposition({
        renderedRevision: 0,
        renderedSelection: 'after-alpha',
        affectedNodeIds: ['alpha'],
      }),
    ).toMatchObject({ ok: true, baseRevision: 0 });
    expect(session.updateCompositionDom('<p>Alpha漢</p><p>Later</p>')).toBe(true);
    expect(session.getSnapshot()).toMatchObject({ ok: false, reason: 'composition-active' });
    expect(
      session.finishComposition({
        internalHtml: '<p>Alpha漢</p><p>Later</p>',
        selection: 'after-ime',
      }),
    ).toEqual({ status: 'applied', revision: 1 });
    expect(session.getSnapshot()).toMatchObject({
      ok: true,
      snapshot: { revision: 1, content: '<p>Alpha漢</p><p>Later</p>' },
    });
  });

  it('keeps a typed recoverable state for unreconciled native input', () => {
    const session = createSession();
    session.markUnreconciledInput('Review the affected text.');
    expect(session.prepareSnapshot()).toEqual({
      ok: false,
      reason: 'unreconciled-input',
      message: 'Review the affected text.',
    });
    session.clearUnreconciledInput();
    expect(session.prepareSnapshot()).toMatchObject({ ok: true });
  });

  it('acknowledges controlled echoes without generating duplicate history', () => {
    const session = createSession();
    apply(session, 'insert-text', '<p>Alpha!</p><p>Later</p>', 'after-bang');
    expect(session.isDirty()).toBe(true);
    expect(session.acknowledgeRevision(1)).toBe(true);
    expect(session.isDirty()).toBe(false);
    expect(session.undo()).toMatchObject({ status: 'applied' });
    expect(session.getSnapshot()).toMatchObject({
      ok: true,
      snapshot: { content: '<p>Alpha</p><p>Later</p>' },
    });
  });

  it('explicit external load resets only that session history and never crosses identity', () => {
    const session = createSession('batch-item:A');
    apply(session, 'insert-text', '<p>Alpha!</p><p>Later</p>', 'after-bang');
    const nextRevision = session.replaceExternalState({
      internalHtml: '<p>Server B</p>',
      selection: 'after-b',
      resetHistory: true,
      acknowledged: true,
    });
    expect(nextRevision).toBe(2);
    expect(session.undo()).toEqual({ status: 'unchanged', reason: 'nothing-to-undo' });
    expect(session.getSnapshot()).toMatchObject({
      ok: true,
      snapshot: { sessionKey: 'batch-item:A', content: '<p>Server B</p>' },
    });
  });
});

describe('A4 editor C0 bridge compatibility', () => {
  it('retains stale DOM rejection and pending keyboard behavior', () => {
    const bridge = createCanonicalInputBridge({
      sessionKey: 'template:c0-compatible',
      content: '<p>Alpha</p>',
      selection: 'after-alpha',
    });
    const revision = bridge.commitCanonical('<p>Alpha</p><p><br></p>', 'new-paragraph');
    expect(revision).toBe(1);
    expect(
      bridge.resolveNativeInputTarget({
        renderedRevision: 0,
        origin: 'keyboard',
        renderedSelection: 'old',
      }),
    ).toMatchObject({ ok: true, selection: 'new-paragraph' });
    expect(
      bridge.commitNativeDom({
        renderedRevision: 0,
        content: '<p>STALE</p>',
        selection: 'stale',
      }),
    ).toMatchObject({ status: 'rejected', reason: 'stale-projection' });
  });
});
