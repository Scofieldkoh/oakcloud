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

export interface A4ProjectionRevision {
  sessionKey: EditorSessionKey;
  documentRevision: EditorRevision;
  layoutRevision: number;
  fontRevision: number;
}

export type NativeInputTarget<TSelection> =
  | {
      ok: true;
      baseRevision: EditorRevision;
      selection: TSelection;
      source: 'rendered-projection' | 'pending-canonical-selection';
    }
  | {
      ok: false;
      reason: 'stale-projection' | 'composition-active' | 'unreconciled-input';
      currentRevision: EditorRevision;
      renderedRevision: EditorRevision;
    };

export type NativeDomCommitResult =
  | { status: 'applied'; revision: EditorRevision }
  | {
      status: 'rejected';
      reason: 'stale-projection' | 'composition-active' | 'unreconciled-input';
      currentRevision: EditorRevision;
      renderedRevision: EditorRevision;
    };

export type CanonicalEditorIntentKind =
  | 'insert-text'
  | 'insert-paragraph'
  | 'insert-line-break'
  | 'delete-backward'
  | 'delete-forward'
  | 'paste'
  | 'cut'
  | 'format'
  | 'structural'
  | 'field'
  | 'layout'
  | 'native-reconcile'
  | 'replace-document'
  | 'draft-restore'
  | 'external-load';

export interface CanonicalEditorIntent {
  kind: CanonicalEditorIntentKind;
  origin?: NativeInputOrigin | 'programmatic';
  history?: 'typing' | 'separate' | 'none';
  affectsLayout?: boolean;
  affectsFont?: boolean;
}

export interface CanonicalEditorSessionState<
  TSelection,
  TField = unknown,
  TTypingMarks = unknown,
  TMetadata = unknown,
> {
  sessionKey: EditorSessionKey;
  revision: EditorRevision;
  internalHtml: string;
  selection: TSelection;
  typingMarks: TTypingMarks;
  contentJson: Record<string, unknown>;
  fields?: readonly TField[];
  metadata: TMetadata;
  layoutRevision: number;
  fontRevision: number;
}

export type CanonicalSessionTransactionResult<
  TSelection,
  TField = unknown,
  TTypingMarks = unknown,
  TMetadata = unknown,
> =
  | {
      status: 'applied';
      internalHtml: string;
      selection: TSelection;
      typingMarks?: TTypingMarks;
      contentJson?: Record<string, unknown>;
      fields?: readonly TField[];
      metadata?: TMetadata;
    }
  | { status: 'unchanged'; reason: string }
  | { status: 'rejected'; code: string; message: string };

export type CanonicalSessionDispatchResult<TSelection> =
  | {
      status: 'applied';
      revision: EditorRevision;
      selection: TSelection;
      projection: A4ProjectionRevision;
    }
  | { status: 'unchanged'; reason: string }
  | { status: 'rejected'; code: string; message: string };

export interface CanonicalSessionDispatchInput<
  TSelection,
  TField = unknown,
  TTypingMarks = unknown,
  TMetadata = unknown,
> {
  sessionKey: EditorSessionKey;
  baseRevision: EditorRevision;
  intent: CanonicalEditorIntent;
  selection: TSelection;
  apply(
    state: Readonly<
      CanonicalEditorSessionState<
        TSelection,
        TField,
        TTypingMarks,
        TMetadata
      >
    >,
  ): CanonicalSessionTransactionResult<
    TSelection,
    TField,
    TTypingMarks,
    TMetadata
  >;
}

export interface CompositionRange<TSelection> {
  baseRevision: EditorRevision;
  selection: TSelection;
  affectedNodeIds: readonly string[];
}

interface RestorableSessionState<
  TSelection,
  TField,
  TTypingMarks,
  TMetadata,
> {
  internalHtml: string;
  selection: TSelection;
  typingMarks: TTypingMarks;
  contentJson: Record<string, unknown>;
  fields?: readonly TField[];
  metadata: TMetadata;
}

interface HistoryEntry<TSelection, TField, TTypingMarks, TMetadata> {
  before: RestorableSessionState<TSelection, TField, TTypingMarks, TMetadata>;
  after: RestorableSessionState<TSelection, TField, TTypingMarks, TMetadata>;
  intentKind: CanonicalEditorIntentKind;
  typingEdits: number;
}

interface CompositionState<TSelection> extends CompositionRange<TSelection> {
  latestDomState: string | null;
}

export interface CanonicalEditorSession<
  TSelection,
  TField = unknown,
  TTypingMarks = unknown,
  TMetadata = unknown,
> {
  getState(): Readonly<
    CanonicalEditorSessionState<TSelection, TField, TTypingMarks, TMetadata>
  >;
  getSnapshot(): SnapshotResult<TField>;
  prepareSnapshot(): SnapshotResult<TField>;
  getRenderedProjection(): A4ProjectionRevision;
  createProjectionRevision(): A4ProjectionRevision;
  publishProjection(revision: A4ProjectionRevision): boolean;
  resolveNativeInputTarget(input: {
    renderedRevision: EditorRevision;
    origin: NativeInputOrigin;
    renderedSelection: TSelection;
  }): NativeInputTarget<TSelection>;
  dispatch(
    input: CanonicalSessionDispatchInput<
      TSelection,
      TField,
      TTypingMarks,
      TMetadata
    >,
  ): CanonicalSessionDispatchResult<TSelection>;
  beginComposition(input: {
    renderedRevision: EditorRevision;
    renderedSelection: TSelection;
    affectedNodeIds?: readonly string[];
  }): NativeInputTarget<TSelection>;
  updateCompositionDom(latestDomState: string): boolean;
  finishComposition(input: {
    internalHtml: string;
    selection: TSelection;
    typingMarks?: TTypingMarks;
  }): NativeDomCommitResult;
  markUnreconciledInput(message?: string): void;
  clearUnreconciledInput(): void;
  endTypingGroup(): void;
  updateSelection(selection: TSelection): void;
  undo(): CanonicalSessionDispatchResult<TSelection>;
  redo(): CanonicalSessionDispatchResult<TSelection>;
  canUndo(): boolean;
  canRedo(): boolean;
  acknowledgeRevision(revision: EditorRevision): boolean;
  isDirty(): boolean;
  replaceExternalState(input: {
    internalHtml: string;
    selection: TSelection;
    contentJson?: Record<string, unknown>;
    fields?: readonly TField[];
    typingMarks?: TTypingMarks;
    metadata?: TMetadata;
    resetHistory?: boolean;
    acknowledged?: boolean;
  }): EditorRevision;
}

export interface CanonicalEditorSessionOptions<
  TSelection,
  TField = unknown,
  TTypingMarks = unknown,
  TMetadata = unknown,
> {
  sessionKey: EditorSessionKey;
  internalHtml: string;
  selection: TSelection;
  typingMarks: TTypingMarks;
  contentJson?: Record<string, unknown>;
  fields?: readonly TField[];
  metadata: TMetadata;
  serializeContent(internalHtml: string): string;
  onSnapshotChange?(snapshot: A4EditorSnapshot<TField>): void;
}

const MAX_HISTORY_ENTRIES = 100;
const MAX_TYPING_EDITS_PER_GROUP = 32;

function cloneJson(value: Record<string, unknown>): Record<string, unknown> {
  return { ...value };
}

function cloneFields<TField>(
  fields: readonly TField[] | undefined,
): readonly TField[] | undefined {
  return fields ? [...fields] : undefined;
}

function sameProjection(
  left: A4ProjectionRevision,
  right: A4ProjectionRevision,
): boolean {
  return (
    left.sessionKey === right.sessionKey &&
    left.documentRevision === right.documentRevision &&
    left.layoutRevision === right.layoutRevision &&
    left.fontRevision === right.fontRevision
  );
}

export function createCanonicalEditorSession<
  TSelection,
  TField = unknown,
  TTypingMarks = unknown,
  TMetadata = unknown,
>(
  options: CanonicalEditorSessionOptions<
    TSelection,
    TField,
    TTypingMarks,
    TMetadata
  >,
): CanonicalEditorSession<TSelection, TField, TTypingMarks, TMetadata> {
  let state: CanonicalEditorSessionState<
    TSelection,
    TField,
    TTypingMarks,
    TMetadata
  > = {
    sessionKey: options.sessionKey,
    revision: 0,
    internalHtml: options.internalHtml,
    selection: options.selection,
    typingMarks: options.typingMarks,
    contentJson: cloneJson(options.contentJson ?? {}),
    fields: cloneFields(options.fields),
    metadata: options.metadata,
    layoutRevision: 0,
    fontRevision: 0,
  };
  let renderedProjection: A4ProjectionRevision = {
    sessionKey: state.sessionKey,
    documentRevision: state.revision,
    layoutRevision: state.layoutRevision,
    fontRevision: state.fontRevision,
  };
  let pendingKeyboardSelection: TSelection | null = null;
  let composition: CompositionState<TSelection> | null = null;
  let unreconciledInput: string | null = null;
  let acknowledgedRevision = 0;
  const past: Array<HistoryEntry<TSelection, TField, TTypingMarks, TMetadata>> = [];
  const future: Array<HistoryEntry<TSelection, TField, TTypingMarks, TMetadata>> = [];
  let typingGroupOpen = false;

  const restorable = (): RestorableSessionState<
    TSelection,
    TField,
    TTypingMarks,
    TMetadata
  > => ({
    internalHtml: state.internalHtml,
    selection: state.selection,
    typingMarks: state.typingMarks,
    contentJson: cloneJson(state.contentJson),
    fields: cloneFields(state.fields),
    metadata: state.metadata,
  });

  const projectionRevision = (): A4ProjectionRevision => ({
    sessionKey: state.sessionKey,
    documentRevision: state.revision,
    layoutRevision: state.layoutRevision,
    fontRevision: state.fontRevision,
  });

  const completeSnapshot = (): A4EditorSnapshot<TField> => ({
    sessionKey: state.sessionKey,
    revision: state.revision,
    content: options.serializeContent(state.internalHtml),
    contentJson: cloneJson(state.contentJson),
    fields: cloneFields(state.fields),
  });

  const emitSnapshot = () => {
    options.onSnapshotChange?.(completeSnapshot());
  };

  const snapshotResult = (): SnapshotResult<TField> => {
    if (composition) {
      return {
        ok: false,
        reason: 'composition-active',
        message: 'Finish text composition before preparing a complete editor snapshot.',
      };
    }
    if (unreconciledInput) {
      return {
        ok: false,
        reason: 'unreconciled-input',
        message: unreconciledInput,
      };
    }
    return { ok: true, snapshot: completeSnapshot() };
  };

  const commitRestorable = (
    next: RestorableSessionState<TSelection, TField, TTypingMarks, TMetadata>,
    optionsInput: {
      intentKind: CanonicalEditorIntentKind;
      origin?: CanonicalEditorIntent['origin'];
      affectsLayout?: boolean;
      affectsFont?: boolean;
      pushHistory?: boolean;
      coalesceTyping?: boolean;
      before?: RestorableSessionState<TSelection, TField, TTypingMarks, TMetadata>;
    },
  ): CanonicalSessionDispatchResult<TSelection> => {
    const before = optionsInput.before ?? restorable();
    const previousRevision = state.revision;
    state = {
      ...state,
      revision: previousRevision + 1,
      internalHtml: next.internalHtml,
      selection: next.selection,
      typingMarks: next.typingMarks,
      contentJson: cloneJson(next.contentJson),
      fields: cloneFields(next.fields),
      metadata: next.metadata,
      layoutRevision:
        state.layoutRevision + (optionsInput.affectsLayout ? 1 : 0),
      fontRevision: state.fontRevision + (optionsInput.affectsFont ? 1 : 0),
    };

    if (optionsInput.pushHistory !== false) {
      const canCoalesce =
        optionsInput.coalesceTyping === true &&
        typingGroupOpen &&
        past.length > 0 &&
        past[past.length - 1].intentKind === 'insert-text' &&
        past[past.length - 1].typingEdits < MAX_TYPING_EDITS_PER_GROUP;
      if (canCoalesce) {
        const entry = past[past.length - 1];
        entry.after = restorable();
        entry.typingEdits += 1;
      } else {
        past.push({
          before,
          after: restorable(),
          intentKind: optionsInput.intentKind,
          typingEdits: optionsInput.coalesceTyping ? 1 : 0,
        });
        if (past.length > MAX_HISTORY_ENTRIES) past.shift();
      }
      future.length = 0;
    }

    typingGroupOpen = optionsInput.coalesceTyping === true;
    pendingKeyboardSelection =
      optionsInput.origin === 'keyboard' ? state.selection : null;
    unreconciledInput = null;
    emitSnapshot();
    return {
      status: 'applied',
      revision: state.revision,
      selection: state.selection,
      projection: projectionRevision(),
    };
  };

  const staleNativeResult = (
    renderedRevision: EditorRevision,
  ): Extract<NativeInputTarget<TSelection>, { ok: false }> => ({
    ok: false,
    reason: composition
      ? 'composition-active'
      : unreconciledInput
        ? 'unreconciled-input'
        : 'stale-projection',
    currentRevision: state.revision,
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
    if ((composition && origin !== 'composition') || unreconciledInput) {
      return staleNativeResult(renderedRevision);
    }
    if (renderedRevision === state.revision) {
      return {
        ok: true,
        baseRevision: state.revision,
        selection: renderedSelection,
        source: 'rendered-projection',
      };
    }
    if (
      origin === 'keyboard' &&
      renderedRevision < state.revision &&
      pendingKeyboardSelection !== null
    ) {
      return {
        ok: true,
        baseRevision: state.revision,
        selection: pendingKeyboardSelection,
        source: 'pending-canonical-selection',
      };
    }
    return staleNativeResult(renderedRevision);
  };

  const historyRestore = (
    direction: 'undo' | 'redo',
  ): CanonicalSessionDispatchResult<TSelection> => {
    if (composition) {
      return {
        status: 'rejected',
        code: 'COMPOSITION_ACTIVE',
        message: 'Finish text composition before changing history.',
      };
    }
    if (unreconciledInput) {
      return {
        status: 'rejected',
        code: 'UNRECONCILED_INPUT',
        message: unreconciledInput,
      };
    }
    const source = direction === 'undo' ? past : future;
    const entry = source.pop();
    if (!entry) return { status: 'unchanged', reason: `nothing-to-${direction}` };
    const target = direction === 'undo' ? entry.before : entry.after;
    const opposite = direction === 'undo' ? future : past;
    opposite.push(entry);
    typingGroupOpen = false;
    const beforeMeta = state.metadata;
    const result = commitRestorable(target, {
      intentKind: entry.intentKind,
      origin: 'keyboard',
      pushHistory: false,
      affectsLayout: target.metadata !== beforeMeta,
    });
    if (result.status === 'applied') {
      pendingKeyboardSelection = target.selection;
    }
    return result;
  };

  return {
    getState() {
      return state;
    },
    getSnapshot: snapshotResult,
    prepareSnapshot: snapshotResult,
    getRenderedProjection() {
      return { ...renderedProjection };
    },
    createProjectionRevision: projectionRevision,
    publishProjection(revision) {
      const current = projectionRevision();
      if (!sameProjection(revision, current)) return false;
      renderedProjection = { ...revision };
      pendingKeyboardSelection = null;
      return true;
    },
    resolveNativeInputTarget,
    dispatch(input) {
      if (input.sessionKey !== state.sessionKey) {
        return {
          status: 'rejected',
          code: 'SESSION_MISMATCH',
          message: 'The edit belongs to a different editor session.',
        };
      }
      if (input.baseRevision !== state.revision) {
        return {
          status: 'rejected',
          code: 'STALE_REVISION',
          message: 'The edit was based on an older editor revision.',
        };
      }
      if (composition && input.intent.origin !== 'composition') {
        return {
          status: 'rejected',
          code: 'COMPOSITION_ACTIVE',
          message: 'Finish text composition before applying this edit.',
        };
      }
      if (unreconciledInput && input.intent.kind !== 'native-reconcile') {
        return {
          status: 'rejected',
          code: 'UNRECONCILED_INPUT',
          message: unreconciledInput,
        };
      }

      const before = restorable();
      const applied = input.apply(state);
      if (applied.status !== 'applied') return applied;
      const next: RestorableSessionState<
        TSelection,
        TField,
        TTypingMarks,
        TMetadata
      > = {
        internalHtml: applied.internalHtml,
        selection: applied.selection,
        typingMarks: applied.typingMarks ?? state.typingMarks,
        contentJson: cloneJson(applied.contentJson ?? state.contentJson),
        fields: cloneFields(applied.fields ?? state.fields),
        metadata: applied.metadata ?? state.metadata,
      };
      const coalesceTyping =
        input.intent.kind === 'insert-text' && input.intent.history !== 'separate';
      return commitRestorable(next, {
        before,
        intentKind: input.intent.kind,
        origin: input.intent.origin,
        affectsLayout: input.intent.affectsLayout,
        affectsFont: input.intent.affectsFont,
        pushHistory: input.intent.history !== 'none',
        coalesceTyping,
      });
    },
    beginComposition({
      renderedRevision,
      renderedSelection,
      affectedNodeIds = [],
    }) {
      const target = resolveNativeInputTarget({
        renderedRevision,
        origin: 'keyboard',
        renderedSelection,
      });
      if (!target.ok) return target;
      composition = {
        baseRevision: target.baseRevision,
        selection: target.selection,
        affectedNodeIds: [...affectedNodeIds],
        latestDomState: null,
      };
      pendingKeyboardSelection = null;
      typingGroupOpen = false;
      return target;
    },
    updateCompositionDom(latestDomState) {
      if (!composition) return false;
      composition.latestDomState = latestDomState;
      return true;
    },
    finishComposition({ internalHtml, selection, typingMarks }) {
      const active = composition;
      if (!active) {
        return {
          status: 'rejected',
          reason: 'stale-projection',
          currentRevision: state.revision,
          renderedRevision: renderedProjection.documentRevision,
        };
      }
      if (active.baseRevision !== state.revision) {
        composition = null;
        unreconciledInput =
          'Text composition could not be reconciled with a newer editor revision. Review the affected text and try again.';
        return {
          status: 'rejected',
          reason: 'stale-projection',
          currentRevision: state.revision,
          renderedRevision: active.baseRevision,
        };
      }
      composition = null;
      const result = commitRestorable(
        {
          ...restorable(),
          internalHtml,
          selection,
          typingMarks: typingMarks ?? state.typingMarks,
        },
        {
          intentKind: 'native-reconcile',
          origin: 'composition',
          coalesceTyping: false,
        },
      );
      return result.status === 'applied'
        ? { status: 'applied', revision: result.revision }
        : {
            status: 'rejected',
            reason: 'unreconciled-input',
            currentRevision: state.revision,
            renderedRevision: active.baseRevision,
          };
    },
    markUnreconciledInput(message) {
      unreconciledInput =
        message ??
        'A native edit has not yet been safely reconciled with the canonical document.';
      typingGroupOpen = false;
    },
    clearUnreconciledInput() {
      unreconciledInput = null;
    },
    endTypingGroup() {
      typingGroupOpen = false;
      pendingKeyboardSelection = null;
    },
    updateSelection(selection) {
      state = { ...state, selection };
      typingGroupOpen = false;
      pendingKeyboardSelection = null;
    },
    undo() {
      return historyRestore('undo');
    },
    redo() {
      return historyRestore('redo');
    },
    canUndo() {
      return past.length > 0;
    },
    canRedo() {
      return future.length > 0;
    },
    acknowledgeRevision(revision) {
      if (revision > state.revision || revision < acknowledgedRevision) return false;
      acknowledgedRevision = revision;
      return true;
    },
    isDirty() {
      return state.revision > acknowledgedRevision;
    },
    replaceExternalState(input) {
      composition = null;
      unreconciledInput = null;
      pendingKeyboardSelection = null;
      typingGroupOpen = false;
      const previous = restorable();
      state = {
        ...state,
        revision: state.revision + 1,
        internalHtml: input.internalHtml,
        selection: input.selection,
        typingMarks: input.typingMarks ?? state.typingMarks,
        contentJson: cloneJson(input.contentJson ?? state.contentJson),
        fields: cloneFields(input.fields ?? state.fields),
        metadata: input.metadata ?? state.metadata,
      };
      if (input.resetHistory !== false) {
        past.length = 0;
        future.length = 0;
      } else {
        past.push({
          before: previous,
          after: restorable(),
          intentKind: 'replace-document',
          typingEdits: 0,
        });
        if (past.length > MAX_HISTORY_ENTRIES) past.shift();
        future.length = 0;
      }
      if (input.acknowledged !== false) acknowledgedRevision = state.revision;
      emitSnapshot();
      return state.revision;
    },
  };
}

interface SessionState<TSelection, TField> {
  session: CanonicalEditorSession<TSelection, TField, null, null>;
}

/**
 * Compatibility surface retained for C0/S0 consumers while C1 routes the real
 * editor through createCanonicalEditorSession. New integrations should consume
 * CanonicalEditorSession and A4ProjectionRevision instead.
 */
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

export function createCanonicalInputBridge<TSelection, TField = unknown>(input: {
  sessionKey: EditorSessionKey;
  content: string;
  selection: TSelection;
  contentJson?: Record<string, unknown>;
  fields?: readonly TField[];
}): CanonicalInputBridge<TSelection, TField> {
  const holder: SessionState<TSelection, TField> = {
    session: createCanonicalEditorSession<TSelection, TField, null, null>({
      sessionKey: input.sessionKey,
      internalHtml: input.content,
      selection: input.selection,
      typingMarks: null,
      contentJson: input.contentJson,
      fields: input.fields,
      metadata: null,
      serializeContent: (content) => content,
    }),
  };

  return {
    getSnapshot() {
      return holder.session.getSnapshot();
    },
    getRenderedRevision() {
      return holder.session.getRenderedProjection().documentRevision;
    },
    getSelection() {
      return holder.session.getState().selection;
    },
    commitCanonical(content, selection) {
      const current = holder.session.getState();
      const result = holder.session.dispatch({
        sessionKey: current.sessionKey,
        baseRevision: current.revision,
        intent: { kind: 'structural', origin: 'keyboard', history: 'separate' },
        selection,
        apply: () => ({ status: 'applied', internalHtml: content, selection }),
      });
      if (result.status !== 'applied') return current.revision;
      return result.revision;
    },
    publishProjection(revision) {
      const current = holder.session.createProjectionRevision();
      return holder.session.publishProjection({
        ...current,
        documentRevision: revision,
      });
    },
    resolveNativeInputTarget(inputTarget) {
      return holder.session.resolveNativeInputTarget(inputTarget);
    },
    commitNativeDom({ renderedRevision, content, selection }) {
      const state = holder.session.getState();
      const snapshot = holder.session.getSnapshot();
      if (!snapshot.ok && snapshot.reason === 'composition-active') {
        return {
          status: 'rejected',
          reason: 'composition-active',
          currentRevision: state.revision,
          renderedRevision,
        };
      }
      if (renderedRevision !== state.revision) {
        return {
          status: 'rejected',
          reason: 'stale-projection',
          currentRevision: state.revision,
          renderedRevision,
        };
      }
      const result = holder.session.dispatch({
        sessionKey: state.sessionKey,
        baseRevision: state.revision,
        intent: { kind: 'native-reconcile', origin: 'keyboard', history: 'separate' },
        selection,
        apply: () => ({ status: 'applied', internalHtml: content, selection }),
      });
      return result.status === 'applied'
        ? { status: 'applied', revision: result.revision }
        : {
            status: 'rejected',
            reason: 'unreconciled-input',
            currentRevision: holder.session.getState().revision,
            renderedRevision,
          };
    },
    beginComposition(inputTarget) {
      return holder.session.beginComposition(inputTarget);
    },
    finishComposition(content, selection) {
      return holder.session.finishComposition({
        internalHtml: content,
        selection,
      });
    },
  };
}
