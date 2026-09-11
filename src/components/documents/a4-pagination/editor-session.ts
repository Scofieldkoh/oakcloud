export type EditorSessionKey = string;
export type EditorRevision = number;

export interface A4EditorSnapshot<TField = unknown> {
  sessionKey: EditorSessionKey;
  revision: EditorRevision;
  content: string;
  contentJson: Record<string, unknown>;
  fields?: readonly TField[];
}

export type SnapshotResult<TField = unknown> =
  | { ok: true; snapshot: A4EditorSnapshot<TField> }
  | {
      ok: false;
      reason: 'composition-active' | 'unreconciled-input';
      message: string;
    };

export type NativeInputOrigin = 'keyboard' | 'pointer' | 'composition';

export type NativeInputTarget<TSelection> =
  | {
      ok: true;
      baseRevision: EditorRevision;
      selection: TSelection;
      source: 'rendered-projection' | 'pending-canonical-selection';
    }
  | {
      ok: false;
      reason: 'stale-projection' | 'composition-active';
      currentRevision: EditorRevision;
      renderedRevision: EditorRevision;
    };

export type NativeDomCommitResult =
  | { status: 'applied'; revision: EditorRevision }
  | {
      status: 'rejected';
      reason: 'stale-projection' | 'composition-active';
      currentRevision: EditorRevision;
      renderedRevision: EditorRevision;
    };

interface SessionState<TSelection, TField> {
  snapshot: A4EditorSnapshot<TField>;
  selection: TSelection;
  renderedRevision: EditorRevision;
  pendingKeyboardSelection: TSelection | null;
  composition:
    | {
        baseRevision: EditorRevision;
        selection: TSelection;
      }
    | null;
}

export interface CanonicalInputBridge<TSelection, TField = unknown> {
  getSnapshot(): SnapshotResult<TField>;
  getRenderedRevision(): EditorRevision;
  getSelection(): TSelection;
  commitCanonical(content: string, selection: TSelection): EditorRevision;
  publishProjection(revision: EditorRevision): boolean;
  resolveNativeInputTarget(input: {
    renderedRevision: EditorRevision;
    origin: NativeInputOrigin;
    renderedSelection: TSelection;
  }): NativeInputTarget<TSelection>;
  commitNativeDom(input: {
    renderedRevision: EditorRevision;
    content: string;
    selection: TSelection;
  }): NativeDomCommitResult;
  beginComposition(input: {
    renderedRevision: EditorRevision;
    renderedSelection: TSelection;
  }): NativeInputTarget<TSelection>;
  finishComposition(content: string, selection: TSelection): NativeDomCommitResult;
}

/**
 * C0 executable bridge proof for C01/C04.
 *
 * This intentionally does not drive A4PageEditor yet. It proves the revision
 * rules that C1 will wire into the editor: canonical changes publish
 * synchronously, stale page DOM cannot replace newer canonical content, and an
 * uninterrupted keyboard sequence may use the latest canonical caret while a
 * pointer move on an old projection must wait for an explicit position map.
 */
export function createCanonicalInputBridge<TSelection, TField = unknown>(input: {
  sessionKey: EditorSessionKey;
  content: string;
  selection: TSelection;
  contentJson?: Record<string, unknown>;
  fields?: readonly TField[];
}): CanonicalInputBridge<TSelection, TField> {
  const state: SessionState<TSelection, TField> = {
    snapshot: {
      sessionKey: input.sessionKey,
      revision: 0,
      content: input.content,
      contentJson: input.contentJson ?? {},
      fields: input.fields,
    },
    selection: input.selection,
    renderedRevision: 0,
    pendingKeyboardSelection: null,
    composition: null,
  };

  const commitCanonical = (content: string, selection: TSelection) => {
    const revision = state.snapshot.revision + 1;
    state.snapshot = {
      ...state.snapshot,
      revision,
      content,
    };
    state.selection = selection;
    state.pendingKeyboardSelection = selection;
    return revision;
  };

  const staleResult = (renderedRevision: EditorRevision) => ({
    ok: false as const,
    reason: state.composition ? ('composition-active' as const) : ('stale-projection' as const),
    currentRevision: state.snapshot.revision,
    renderedRevision,
  });

  const resolveNativeInputTarget = ({
    renderedRevision,
    origin,
    renderedSelection,
  }: {
    renderedRevision: EditorRevision;
    origin: NativeInputOrigin;
    renderedSelection: TSelection;
  }): NativeInputTarget<TSelection> => {
    if (state.composition && origin !== 'composition') {
      return staleResult(renderedRevision);
    }

    if (renderedRevision === state.snapshot.revision) {
      return {
        ok: true,
        baseRevision: state.snapshot.revision,
        selection: renderedSelection,
        source: 'rendered-projection',
      };
    }

    if (
      origin === 'keyboard' &&
      renderedRevision < state.snapshot.revision &&
      state.pendingKeyboardSelection !== null
    ) {
      return {
        ok: true,
        baseRevision: state.snapshot.revision,
        selection: state.pendingKeyboardSelection,
        source: 'pending-canonical-selection',
      };
    }

    return staleResult(renderedRevision);
  };

  return {
    getSnapshot() {
      if (state.composition) {
        return {
          ok: false,
          reason: 'composition-active',
          message: 'Finish text composition before preparing a complete editor snapshot.',
        };
      }
      return { ok: true, snapshot: { ...state.snapshot } };
    },
    getRenderedRevision() {
      return state.renderedRevision;
    },
    getSelection() {
      return state.selection;
    },
    commitCanonical,
    publishProjection(revision) {
      if (revision !== state.snapshot.revision) return false;
      state.renderedRevision = revision;
      state.pendingKeyboardSelection = null;
      return true;
    },
    resolveNativeInputTarget,
    commitNativeDom({ renderedRevision, content, selection }) {
      if (state.composition) {
        return {
          status: 'rejected',
          reason: 'composition-active',
          currentRevision: state.snapshot.revision,
          renderedRevision,
        };
      }
      if (renderedRevision !== state.snapshot.revision) {
        return {
          status: 'rejected',
          reason: 'stale-projection',
          currentRevision: state.snapshot.revision,
          renderedRevision,
        };
      }
      return {
        status: 'applied',
        revision: commitCanonical(content, selection),
      };
    },
    beginComposition({ renderedRevision, renderedSelection }) {
      const target = resolveNativeInputTarget({
        renderedRevision,
        origin: 'keyboard',
        renderedSelection,
      });
      if (!target.ok) return target;
      state.composition = {
        baseRevision: target.baseRevision,
        selection: target.selection,
      };
      state.pendingKeyboardSelection = null;
      return target;
    },
    finishComposition(content, selection) {
      const composition = state.composition;
      if (!composition) {
        return {
          status: 'rejected',
          reason: 'stale-projection',
          currentRevision: state.snapshot.revision,
          renderedRevision: state.renderedRevision,
        };
      }
      state.composition = null;
      if (composition.baseRevision !== state.snapshot.revision) {
        return {
          status: 'rejected',
          reason: 'stale-projection',
          currentRevision: state.snapshot.revision,
          renderedRevision: composition.baseRevision,
        };
      }
      return {
        status: 'applied',
        revision: commitCanonical(content, selection),
      };
    },
  };
}
