import { ApiError, ErrorCodes } from '@/lib/errors';

export type A4EditorFormatLevel = 1 | 2;
export type RevisionPreconditionMode = 'optional' | 'required';

export interface A4EditorCapabilities {
  readerFormatLevel: A4EditorFormatLevel;
  allowedWriterFormatLevel: A4EditorFormatLevel;
  revisionPrecondition: RevisionPreconditionMode;
}

/**
 * Compatibility interpretation for an old/missing page bootstrap. This is
 * intentionally more conservative than the current server reader capability.
 */
export const DEFAULT_A4_EDITOR_CAPABILITIES: Readonly<A4EditorCapabilities> = Object.freeze({
  readerFormatLevel: 1,
  allowedWriterFormatLevel: 1,
  revisionPrecondition: 'optional',
});

/**
 * W1 server authority after the integrated S1/F1 reader/policy work. Reading
 * level 2 is enabled; authoring level 2 remains deliberately disabled.
 */
export const SERVER_A4_EDITOR_CAPABILITIES: Readonly<A4EditorCapabilities> = Object.freeze({
  readerFormatLevel: 2,
  allowedWriterFormatLevel: 1,
  revisionPrecondition: 'optional',
});

function isFormatLevel(value: unknown): value is A4EditorFormatLevel {
  return value === 1 || value === 2;
}

function isRevisionPreconditionMode(value: unknown): value is RevisionPreconditionMode {
  return value === 'optional' || value === 'required';
}

/** Single server-owned production capability. */
export function getA4EditorCapabilities(): A4EditorCapabilities {
  return { ...SERVER_A4_EDITOR_CAPABILITIES };
}

/**
 * Parse capability data received by a compatibility client. Missing or
 * malformed bootstrap data must behave as reader 1 / writer 1 / optional even
 * when the current server itself has a newer reader.
 */
export function parseA4EditorCapabilities(value: unknown): A4EditorCapabilities {
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_A4_EDITOR_CAPABILITIES };
  }

  const candidate = value as Partial<A4EditorCapabilities>;
  if (
    !isFormatLevel(candidate.readerFormatLevel)
    || !isFormatLevel(candidate.allowedWriterFormatLevel)
    || !isRevisionPreconditionMode(candidate.revisionPrecondition)
  ) {
    return { ...DEFAULT_A4_EDITOR_CAPABILITIES };
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

export function assertA4EditorReaderFormatLevel(
  requiredFormatLevel: A4EditorFormatLevel,
  capabilities: A4EditorCapabilities = getA4EditorCapabilities(),
): void {
  if (requiredFormatLevel <= capabilities.readerFormatLevel) return;

  throw new ApiError(
    ErrorCodes.UNSUPPORTED_EDITOR_FORMAT,
    'This content uses an editor format this server cannot safely read.',
    409,
    {
      requiredFormatLevel,
      readerFormatLevel: capabilities.readerFormatLevel,
      action: 'upgrade-or-reload-read-only',
    },
  );
}
