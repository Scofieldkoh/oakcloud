import { ApiError, ErrorCodes, NotFoundError } from '@/lib/errors';
import {
  getA4EditorCapabilities,
  type RevisionPreconditionMode,
} from '@/lib/document-editor/a4-editor-capabilities';

export interface RevisionDetails {
  resource: 'document-template' | 'template-partial' | 'generated-document' | 'document-generation-batch';
  expectedRevision?: number;
  revision?: number;
  action?: 'reload' | 'reload-read-only';
}

export class VersionConflictError extends ApiError {
  constructor(details: RevisionDetails) {
    super(
      ErrorCodes.VERSION_CONFLICT,
      'This resource changed after it was loaded. Reload before saving again.',
      409,
      { ...details, action: details.action ?? 'reload' },
    );
    this.name = 'VersionConflictError';
  }
}

export class RevisionPreconditionRequiredError extends ApiError {
  constructor(details: Omit<RevisionDetails, 'expectedRevision'>) {
    super(
      ErrorCodes.REVISION_PRECONDITION_REQUIRED,
      'Reload this resource before saving so the server can verify its revision.',
      428,
      { ...details, action: details.action ?? 'reload' },
    );
    this.name = 'RevisionPreconditionRequiredError';
  }
}

export function assertRevisionPrecondition(
  expectedRevision: number | undefined,
  resource: RevisionDetails['resource'],
  mode: RevisionPreconditionMode = getA4EditorCapabilities().revisionPrecondition,
): void {
  if (expectedRevision !== undefined || mode === 'optional') return;
  throw new RevisionPreconditionRequiredError({ resource });
}

/**
 * Reclassify a zero-row CAS result using only a tenant-scoped lookup supplied
 * by the caller. The lookup must never search by ID outside the current tenant.
 */
export function classifyRevisionMiss(
  state: { revision: number; deleted: boolean; locked: boolean } | null,
  details: Omit<RevisionDetails, 'revision'>,
): never {
  if (!state) {
    throw new NotFoundError('Resource not found');
  }
  if (state.deleted || state.locked) {
    throw new ApiError(
      ErrorCodes.CONFLICT,
      state.deleted ? 'This resource is deleted.' : 'This resource is not editable in its current state.',
      409,
      { resource: details.resource, action: 'reload-read-only' },
    );
  }
  throw new VersionConflictError({ ...details, revision: state.revision });
}
