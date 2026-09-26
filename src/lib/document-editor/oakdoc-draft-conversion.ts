import type { OakDocDiagnostic } from '@/types/oakdoc';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * P8 (D04) provenance recorded on an OakDoc copy of an A4 draft. Shared by
 * the conversion service and the review screen.
 */

export const A4_DRAFT_CONVERSION_METHOD = 'a4-html-import/1';

export type A4DraftConversionStatus = 'PENDING_REVIEW' | 'ACCEPTED';

export interface A4DraftConversionMetadata {
  schemaVersion: 1;
  kind: 'A4_DRAFT_CONVERSION';
  method: string;
  sourceDocumentId: string;
  sourceRevision: number;
  sourceContentSha256: string;
  diagnostics: OakDocDiagnostic[];
  status: A4DraftConversionStatus;
  convertedAt: string;
  convertedById: string;
  reviewedAt?: string;
  reviewedById?: string;
  acknowledgedCodes?: string[];
}

export function readA4DraftConversionMetadata(metadata: unknown): A4DraftConversionMetadata | null {
  if (!isRecord(metadata) || !isRecord(metadata.oakDocMigration)) return null;
  const raw = metadata.oakDocMigration;
  if (
    raw.schemaVersion !== 1
    || raw.kind !== 'A4_DRAFT_CONVERSION'
    || typeof raw.sourceDocumentId !== 'string'
    || typeof raw.sourceRevision !== 'number'
    || typeof raw.sourceContentSha256 !== 'string'
    || !Array.isArray(raw.diagnostics)
    || (raw.status !== 'PENDING_REVIEW' && raw.status !== 'ACCEPTED')
  ) {
    return null;
  }
  return raw as unknown as A4DraftConversionMetadata;
}

/** True while a converted copy still waits for explicit review. */
export function isPendingA4DraftConversion(metadata: unknown): boolean {
  return readA4DraftConversionMetadata(metadata)?.status === 'PENDING_REVIEW';
}
