import { ApiError, ErrorCodes } from '@/lib/errors';

export type A4EditorFormatLevel = 1 | 2;
export type RevisionPreconditionMode = 'optional' | 'required';

export interface A4EditorCapabilities {
  readerFormatLevel: A4EditorFormatLevel;
  allowedWriterFormatLevel: A4EditorFormatLevel;
  revisionPrecondition: RevisionPreconditionMode;
}

export const DEFAULT_A4_EDITOR_CAPABILITIES: Readonly<A4EditorCapabilities> = Object.freeze({
  readerFormatLevel: 1,
  allowedWriterFormatLevel: 1,
  revisionPrecondition: 'optional',
});

function isFormatLevel(value: unknown): value is A4EditorFormatLevel {
  return value === 1 || value === 2;
}

function isRevisionPreconditionMode(value: unknown): value is RevisionPreconditionMode {
  return value === 'optional' || value === 'required';
}

/**
 * Server-owned production capability. W1 intentionally leaves level-2 writing
 * disabled until the S1/F1 readers and policy adapters have been integrated.
 */
export function getA4EditorCapabilities(): A4EditorCapabilities {
  return { ...DEFAULT_A4_EDITOR_CAPABILITIES };
}

/**
 * Parse capability data received from a trusted server bootstrap. Missing or
 * malformed data always falls back to the conservative level-1/optional mode.
 */
export function parseA4EditorCapabilities(value: unknown): A4EditorCapabilities {
  if (!value || typeof value !== 'object') {
    return getA4EditorCapabilities();
  }

  const candidate = value as Partial<A4EditorCapabilities>;
  if (
    !isFormatLevel(candidate.readerFormatLevel)
    || !isFormatLevel(candidate.allowedWriterFormatLevel)
    || !isRevisionPreconditionMode(candidate.revisionPrecondition)
  ) {
    return getA4EditorCapabilities();
  }

  return {
    readerFormatLevel: candidate.readerFormatLevel,
    allowedWriterFormatLevel: candidate.allowedWriterFormatLevel,
    revisionPrecondition: candidate.revisionPrecondition,
  };
}

/**
 * Client/runtime claims can request less authority, never more. Revision mode
 * is server policy and cannot be relaxed or strengthened by a client claim.
 */
export function constrainA4EditorCapabilities(
  requested: Partial<A4EditorCapabilities> | null | undefined,
  server: A4EditorCapabilities = getA4EditorCapabilities(),
): A4EditorCapabilities {
  const requestedReader = isFormatLevel(requested?.readerFormatLevel)
    ? requested.readerFormatLevel
    : server.readerFormatLevel;
  const requestedWriter = isFormatLevel(requested?.allowedWriterFormatLevel)
    ? requested.allowedWriterFormatLevel
    : server.allowedWriterFormatLevel;

  return {
    readerFormatLevel: Math.min(server.readerFormatLevel, requestedReader) as A4EditorFormatLevel,
    allowedWriterFormatLevel: Math.min(
      server.allowedWriterFormatLevel,
      requestedWriter,
    ) as A4EditorFormatLevel,
    revisionPrecondition: server.revisionPrecondition,
  };
}

export function assertA4EditorWriterFormatLevel(
  requiredFormatLevel: A4EditorFormatLevel,
  capabilities: A4EditorCapabilities = getA4EditorCapabilities(),
): void {
  if (requiredFormatLevel <= capabilities.allowedWriterFormatLevel) return;

  throw new ApiError(
    ErrorCodes.UNSUPPORTED_EDITOR_FORMAT,
    'This content uses an editor format this server cannot safely write.',
    409,
    {
      requiredFormatLevel,
      allowedWriterFormatLevel: capabilities.allowedWriterFormatLevel,
      action: 'reload-read-only',
    },
  );
}
