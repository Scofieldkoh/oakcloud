import type { A4EditorCapabilities } from '@/lib/document-editor/a4-editor-capabilities';

export type A4WorkflowSavePhase =
  | 'clean'
  | 'dirty'
  | 'saving'
  | 'saved'
  | 'conflict'
  | 'error'
  | 'read-only';

export interface A4WorkflowStatusInput {
  serverRevision: number;
  acknowledgedRevision: number;
  localRevision: number;
  saving: boolean;
  readOnly?: boolean;
  conflict?: boolean;
  error?: string | null;
}

export interface A4WorkflowStatus {
  phase: A4WorkflowSavePhase;
  serverRevision: number;
  acknowledgedRevision: number;
  localRevision: number;
  dirty: boolean;
  canSave: boolean;
  shouldRetry: boolean;
  message: string | null;
}

/**
 * One editor-consumable W3 status surface for template, partial and generated
 * document writers. A local edit is acknowledged only when both its local
 * revision and the server revision returned by that save are observed.
 */
export function deriveA4WorkflowStatus(input: A4WorkflowStatusInput): A4WorkflowStatus {
  const dirty = input.localRevision > input.acknowledgedRevision;
  let phase: A4WorkflowSavePhase;
  let message: string | null = null;
  let shouldRetry = false;

  if (input.readOnly) {
    phase = 'read-only';
    message = 'This document is read-only in the current writer capability.';
  } else if (input.conflict) {
    phase = 'conflict';
    message = 'A newer revision exists. Reload or reconcile before saving again.';
  } else if (input.error) {
    phase = 'error';
    message = input.error;
    shouldRetry = true;
  } else if (input.saving) {
    phase = 'saving';
  } else if (dirty) {
    phase = 'dirty';
  } else if (input.localRevision > 0 || input.serverRevision > 0) {
    phase = 'saved';
  } else {
    phase = 'clean';
  }

  return {
    phase,
    serverRevision: input.serverRevision,
    acknowledgedRevision: input.acknowledgedRevision,
    localRevision: input.localRevision,
    dirty,
    canSave: !input.readOnly && !input.conflict && !input.saving,
    shouldRetry,
    message,
  };
}

export interface A4RevisionRolloutReadiness {
  compatible: boolean;
  writerFormatLevel: number;
  readerFormatLevel: number;
  revisionPrecondition: A4EditorCapabilities['revisionPrecondition'];
  blockers: readonly string[];
}

/**
 * C07 rollout probe only. W3 does not mutate the server capability constant or
 * activate strict revision mode; CORE/rollout may do so only after every
 * compatible writer/worker proves this probe with writer level 2 and required
 * revision preconditions.
 */
export function assessA4RevisionRolloutReadiness(
  capabilities: A4EditorCapabilities,
): A4RevisionRolloutReadiness {
  const blockers: string[] = [];
  if (capabilities.readerFormatLevel < 2) blockers.push('reader-format-level-2');
  if (capabilities.allowedWriterFormatLevel < 2) blockers.push('writer-format-level-2');
  if (capabilities.revisionPrecondition !== 'required') blockers.push('required-revision-precondition');
  return {
    compatible: blockers.length === 0,
    writerFormatLevel: capabilities.allowedWriterFormatLevel,
    readerFormatLevel: capabilities.readerFormatLevel,
    revisionPrecondition: capabilities.revisionPrecondition,
    blockers,
  };
}
