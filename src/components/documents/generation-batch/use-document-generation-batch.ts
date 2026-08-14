'use client';

import { useCallback, useEffect, useReducer, useRef } from 'react';
import { useUnsavedNavigationGuard } from '@/hooks/use-unsaved-navigation-guard';
import {
  DocumentGenerationBatchApiError,
  createDocumentGenerationBatch,
  generateDocumentGenerationBatch,
  getDocumentGenerationBatch,
  preflightDocumentGenerationBatch,
  previewDocumentGenerationBatchItem,
  retryDocumentGenerationBatchItem,
  reviewDocumentGenerationBatchItem,
  saveDocumentGenerationBatch,
} from '@/lib/document-generation-batch-api';
import type {
  BatchExecutionInput,
  BatchGenerationResult,
  DocumentGenerationBatchDto,
  UpdateDocumentGenerationBatchInput,
} from '@/types/document-generation-batch';
import {
  BATCH_STAGES,
  createInitialBatchWorkspaceState,
  editableBatchFromDto,
  documentGenerationBatchReducer,
  deriveCapabilitiesForCommit,
  type BatchStage,
  type BatchWorkspaceState,
  type EditableDocumentGenerationBatch,
} from './batch-workspace-state';

export interface UseDocumentGenerationBatchOptions {
  initialBatch?: EditableDocumentGenerationBatch | null;
}

export interface DocumentGenerationBatchCommands {
  state: BatchWorkspaceState;
  dispatch: React.Dispatch<Parameters<typeof documentGenerationBatchReducer>[1]>;
  saveDraft: () => Promise<EditableDocumentGenerationBatch>;
  continueTo: (stage: BatchStage) => Promise<void>;
  previewItem: (
    itemId: string,
    replaceEditedContent?: boolean,
  ) => Promise<EditableDocumentGenerationBatch>;
  reviewItem: (itemId: string) => Promise<EditableDocumentGenerationBatch>;
  preflight: () => Promise<EditableDocumentGenerationBatch>;
  generate: () => Promise<BatchGenerationResult>;
  retry: (itemId: string) => Promise<EditableDocumentGenerationBatch>;
  reload: () => Promise<EditableDocumentGenerationBatch>;
  /** Re-saves local edits on top of the newer server revision. */
  overwriteConflict: () => Promise<EditableDocumentGenerationBatch>;
  requestNavigation: (destination: string) => void;
  dialog: React.ReactNode;
}

function buildUpdateInput(state: BatchWorkspaceState): UpdateDocumentGenerationBatchInput {
  return {
    expectedRevision: state.batch.revision ?? 0,
    currentStage: BATCH_STAGES.indexOf(state.stage),
    primaryCompanyId: state.batch.primaryCompanyId,
    activeItemId: state.activeItemId,
    masterFieldValues: state.batch.masterFieldValues,
    items: state.batch.items.map((item, index) => ({
      id: item.id,
      templateId: item.templateId,
      displayOrder: index,
      configuration: item.configuration,
      editedContent: item.editedContent,
      editedContentJson: item.editedContentJson,
    })),
    ...(state.batch.taskContext !== undefined
      ? { taskContext: state.batch.taskContext }
      : {}),
  };
}

export function useDocumentGenerationBatch(
  options: UseDocumentGenerationBatchOptions = {},
): DocumentGenerationBatchCommands {
  const { initialBatch = null } = options;
  const [state, dispatch] = useReducer(
    documentGenerationBatchReducer,
    undefined,
    () => createInitialBatchWorkspaceState(initialBatch ?? []),
  );
  const stateRef = useRef(state);
  stateRef.current = state;
  const initialBatchRef = useRef(initialBatch);
  useEffect(() => {
    if (initialBatch === initialBatchRef.current) return;
    initialBatchRef.current = initialBatch;
    if (
      initialBatch
      && !stateRef.current.batch.id
      && stateRef.current.batch.items.length === 0
    ) {
      const next = createInitialBatchWorkspaceState(initialBatch);
      dispatch({ type: 'local/initialize', batch: initialBatch });
      stateRef.current = next;
    }
  }, [initialBatch]);
  const previewAbortRef = useRef<AbortController | null>(null);
  const { disarm, requestNavigation, dialog } = useUnsavedNavigationGuard(
    state.dirty,
  );

  const commit = useCallback((saved: DocumentGenerationBatchDto) => {
    const normalized = editableBatchFromDto(saved);
    dispatch({ type: 'server/replace', batch: normalized });
    const current = stateRef.current;
    stateRef.current = {
      ...current,
      batch: normalized,
      stage: BATCH_STAGES[Math.min(normalized.currentStage, BATCH_STAGES.length - 1)],
      activeItemId: normalized.activeItemId ?? normalized.items[0]?.key ?? null,
      savedSnapshot: JSON.stringify(normalized),
      dirty: false,
      pending: null,
      conflict: null,
      capabilities: deriveCapabilitiesForCommit(normalized),
    };
    return normalized;
  }, []);

  const resolveItemId = useCallback((itemId: string): string => {
    const item = stateRef.current.batch.items.find(
      (entry) =>
        entry.id === itemId
        || entry.key === itemId
        || entry.templateId === itemId,
    );
    return item?.id ?? item?.key ?? itemId;
  }, []);

  const persist = useCallback(async (): Promise<EditableDocumentGenerationBatch> => {
    const current = stateRef.current;
    if (current.batch.items.length === 0) {
      throw new Error('Select at least one template before saving');
    }
    dispatch({ type: 'request/start', pending: 'save' });
    let batchId = current.batch.id;
    let revision = current.batch.revision;
    let activeItemId = current.activeItemId;
    let items = current.batch.items;
    try {
      if (!batchId) {
        const created = await createDocumentGenerationBatch({
          items: current.batch.items.map((item) => ({
            templateId: item.templateId,
          })),
          ...(current.batch.legacyDraftId
            ? { legacyDraftId: current.batch.legacyDraftId }
            : {}),
          ...(current.batch.taskContext !== undefined
            ? { taskContext: current.batch.taskContext }
            : {}),
        });
        batchId = created.id;
        revision = created.revision;
        activeItemId = created.activeItemId ?? null;
        const serverItemByTemplate = new Map(
          created.items.map((item) => [item.templateId, item]),
        );
        items = current.batch.items.map((item) => {
          const server = serverItemByTemplate.get(item.templateId);
          return server ? { ...item, id: server.id } : item;
        });
      }
      const updateInput = buildUpdateInput({
        ...current,
        activeItemId,
        batch: { ...current.batch, id: batchId, revision, items },
      });
      const saved = await saveDocumentGenerationBatch(batchId, updateInput);
      disarm();
      return commit(saved);
    } catch (error) {
      if (
        error instanceof DocumentGenerationBatchApiError
        && error.status === 409
        && error.details
        && typeof error.details === 'object'
        && 'currentRevision' in error.details
      ) {
        const currentRevision = Number(
          (error.details as { currentRevision: unknown }).currentRevision,
        );
        if (batchId && !stateRef.current.batch.id) {
          dispatch({
            type: 'server/track-id',
            id: batchId,
            revision: revision ?? 0,
            currentRevision,
          });
          stateRef.current = {
            ...stateRef.current,
            batch: { ...stateRef.current.batch, id: batchId, revision: revision ?? 0 },
            conflict: { currentRevision },
            dirty: true,
            pending: null,
          };
        } else {
          dispatch({ type: 'save/conflict', currentRevision });
        }
      } else {
        dispatch({ type: 'request/end' });
      }
      throw error;
    }
  }, [commit, disarm]);

  const ensurePersisted = useCallback(async (): Promise<EditableDocumentGenerationBatch> => {
    const current = stateRef.current;
    if (current.batch.id && !current.dirty) {
      return current.batch;
    }
    return persist();
  }, [persist]);

  const saveDraft = useCallback(() => persist(), [persist]);

  const continueTo = useCallback(async (stage: BatchStage) => {
    await persist();
    dispatch({ type: 'stage/navigate', stage });
  }, [persist]);

  const previewItem = useCallback(async (
    itemId: string,
    replaceEditedContent = false,
  ) => {
    await ensurePersisted();
    const current = stateRef.current;
    const resolvedItemId = resolveItemId(itemId);
    const batchId = current.batch.id!;
    previewAbortRef.current?.abort();
    const controller = new AbortController();
    previewAbortRef.current = controller;
    dispatch({ type: 'request/start', pending: 'preview' });
    try {
      const saved = await previewDocumentGenerationBatchItem(
        batchId,
        resolvedItemId,
        {
          expectedRevision: current.batch.revision ?? 0,
          replaceEditedContent,
        },
        controller.signal,
      );
      return commit(saved);
    } finally {
      dispatch({ type: 'request/end' });
    }
  }, [commit, ensurePersisted, resolveItemId]);

  const reviewItem = useCallback(async (itemId: string) => {
    await ensurePersisted();
    const current = stateRef.current;
    const resolvedItemId = resolveItemId(itemId);
    dispatch({ type: 'request/start', pending: 'review' });
    try {
      const saved = await reviewDocumentGenerationBatchItem(
        current.batch.id!,
        resolvedItemId,
        { expectedRevision: current.batch.revision ?? 0 },
      );
      return commit(saved);
    } finally {
      dispatch({ type: 'request/end' });
    }
  }, [commit, ensurePersisted, resolveItemId]);

  const preflight = useCallback(async () => {
    await ensurePersisted();
    const current = stateRef.current;
    dispatch({ type: 'request/start', pending: 'preflight' });
    try {
      const saved = await preflightDocumentGenerationBatch(
        current.batch.id!,
        { expectedRevision: current.batch.revision ?? 0 },
      );
      return commit(saved);
    } finally {
      dispatch({ type: 'request/end' });
    }
  }, [commit, ensurePersisted]);

  const generate = useCallback(async () => {
    await ensurePersisted();
    const current = stateRef.current;
    dispatch({ type: 'request/start', pending: 'generate' });
    try {
      const result = await generateDocumentGenerationBatch(
        current.batch.id!,
        { expectedRevision: current.batch.revision ?? 0 },
      );
      if (result.batchId) {
        const refreshed = await getDocumentGenerationBatch(result.batchId);
        commit(refreshed);
      }
      return result;
    } finally {
      dispatch({ type: 'request/end' });
    }
  }, [commit, ensurePersisted]);

  const retry = useCallback(async (itemId: string) => {
    await ensurePersisted();
    const current = stateRef.current;
    const resolvedItemId = resolveItemId(itemId);
    dispatch({ type: 'request/start', pending: 'retry' });
    try {
      const saved = await retryDocumentGenerationBatchItem(
        current.batch.id!,
        resolvedItemId,
        { expectedRevision: current.batch.revision ?? 0 },
      );
      return commit(saved);
    } finally {
      dispatch({ type: 'request/end' });
    }
  }, [commit, ensurePersisted, resolveItemId]);

  const overwriteConflict = useCallback(async () => {
    const conflict = stateRef.current.conflict;
    if (conflict) {
      dispatch({ type: 'conflict/accept-revision' });
      stateRef.current = {
        ...stateRef.current,
        batch: { ...stateRef.current.batch, revision: conflict.currentRevision },
        conflict: null,
      };
    }
    return persist();
  }, [persist]);

  const reload = useCallback(async () => {
    const current = stateRef.current;
    if (!current.batch.id) return current.batch;
    const saved = await getDocumentGenerationBatch(current.batch.id);
    return commit(saved);
  }, [commit]);

  return {
    state,
    dispatch,
    saveDraft,
    continueTo,
    previewItem,
    reviewItem,
    preflight,
    generate,
    retry,
    reload,
    overwriteConflict,
    requestNavigation,
    dialog,
  };
}

export type { BatchExecutionInput };
