import { describe, expect, it } from 'vitest';
import { createCanonicalInputBridge } from '@/components/documents/a4-pagination/editor-session';

describe('A4 editor C0 canonical input bridge proof', () => {
  it('rejects a stale DOM write after a canonical command publishes first', () => {
    const bridge = createCanonicalInputBridge({
      sessionKey: 'template:c0-proof',
      content: '<p>Alpha</p>',
      selection: 'after-alpha',
    });

    const revision = bridge.commitCanonical(
      '<p>Alpha</p><p><br></p>',
      'new-paragraph',
    );

    expect(revision).toBe(1);
    expect(bridge.getRenderedRevision()).toBe(0);
    expect(
      bridge.commitNativeDom({
        renderedRevision: 0,
        content: '<p>AlphaSTALE</p>',
        selection: 'stale-caret',
      }),
    ).toEqual({
      status: 'rejected',
      reason: 'stale-projection',
      currentRevision: 1,
      renderedRevision: 0,
    });

    expect(bridge.getSnapshot()).toEqual({
      ok: true,
      snapshot: {
        sessionKey: 'template:c0-proof',
        revision: 1,
        content: '<p>Alpha</p><p><br></p>',
        contentJson: {},
        fields: undefined,
      },
    });
  });

  it('routes uninterrupted keyboard input to the latest canonical caret while projection lags', () => {
    const bridge = createCanonicalInputBridge({
      sessionKey: 'template:c0-rapid-enter',
      content: '<p>Alpha</p>',
      selection: 'after-alpha',
    });

    bridge.commitCanonical(
      '<p>Alpha</p><p><br></p>',
      'new-paragraph',
    );

    expect(
      bridge.resolveNativeInputTarget({
        renderedRevision: 0,
        origin: 'keyboard',
        renderedSelection: 'old-page-caret',
      }),
    ).toEqual({
      ok: true,
      baseRevision: 1,
      selection: 'new-paragraph',
      source: 'pending-canonical-selection',
    });
  });

  it('does not redirect an explicit pointer move made on a stale projection', () => {
    const bridge = createCanonicalInputBridge({
      sessionKey: 'template:c0-pointer',
      content: '<p>Alpha</p>',
      selection: 'after-alpha',
    });

    bridge.commitCanonical(
      '<p>Alpha</p><p>Beta</p>',
      'after-beta',
    );

    expect(
      bridge.resolveNativeInputTarget({
        renderedRevision: 0,
        origin: 'pointer',
        renderedSelection: 'clicked-old-page',
      }),
    ).toEqual({
      ok: false,
      reason: 'stale-projection',
      currentRevision: 1,
      renderedRevision: 0,
    });
  });

  it('accepts a current projection and rejects an obsolete projection publication', () => {
    const bridge = createCanonicalInputBridge({
      sessionKey: 'template:c0-publish',
      content: '<p>Alpha</p>',
      selection: 'after-alpha',
    });

    const revision = bridge.commitCanonical('<p>AlphaX</p>', 'after-x');
    expect(bridge.publishProjection(0)).toBe(false);
    expect(bridge.publishProjection(revision)).toBe(true);
    expect(bridge.getRenderedRevision()).toBe(revision);

    expect(
      bridge.resolveNativeInputTarget({
        renderedRevision: revision,
        origin: 'keyboard',
        renderedSelection: 'after-x-rendered',
      }),
    ).toEqual({
      ok: true,
      baseRevision: revision,
      selection: 'after-x-rendered',
      source: 'rendered-projection',
    });
  });

  it('keeps composition as one bounded canonical commit and blocks snapshots while active', () => {
    const bridge = createCanonicalInputBridge({
      sessionKey: 'template:c0-ime',
      content: '<p>A</p>',
      selection: 'after-a',
    });

    expect(
      bridge.beginComposition({
        renderedRevision: 0,
        renderedSelection: 'after-a',
      }),
    ).toEqual({
      ok: true,
      baseRevision: 0,
      selection: 'after-a',
      source: 'rendered-projection',
    });

    expect(bridge.getSnapshot()).toEqual({
      ok: false,
      reason: 'composition-active',
      message: 'Finish text composition before preparing a complete editor snapshot.',
    });

    expect(
      bridge.commitNativeDom({
        renderedRevision: 0,
        content: '<p>Aintermediate</p>',
        selection: 'intermediate',
      }),
    ).toEqual({
      status: 'rejected',
      reason: 'composition-active',
      currentRevision: 0,
      renderedRevision: 0,
    });

    expect(bridge.finishComposition('<p>A漢</p>', 'after-composed')).toEqual({
      status: 'applied',
      revision: 1,
    });
    expect(bridge.getSnapshot()).toMatchObject({
      ok: true,
      snapshot: {
        revision: 1,
        content: '<p>A漢</p>',
      },
    });
  });

  it('supports rapid current-revision delete commits without waiting for projection', () => {
    const bridge = createCanonicalInputBridge({
      sessionKey: 'template:c0-delete',
      content: '<p>ABC</p>',
      selection: 'after-c',
    });

    bridge.commitCanonical('<p>AB</p>', 'after-b');
    const target = bridge.resolveNativeInputTarget({
      renderedRevision: 0,
      origin: 'keyboard',
      renderedSelection: 'old-after-c',
    });
    expect(target).toMatchObject({
      ok: true,
      baseRevision: 1,
      selection: 'after-b',
    });

    bridge.commitCanonical('<p>A</p>', 'after-a');
    expect(bridge.getSnapshot()).toMatchObject({
      ok: true,
      snapshot: {
        revision: 2,
        content: '<p>A</p>',
      },
    });
  });
});
