import { createHash } from 'node:crypto';

/**
 * Canonical JSON serialization.
 *
 * Object keys are sorted recursively; array order is preserved so that
 * reordered service items or contacts produce a different fingerprint.
 */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export interface PreviewFingerprintInput {
  templateId: string;
  templateVersion: number;
  partials: Array<{
    name: string;
    version?: number | null;
    updatedAt?: string | null;
  }>;
  serviceAgreement?: {
    id: string;
    items: Array<{
      itemId: string;
      variantVersion: number;
      partialVersion: number;
      dependencies: unknown;
    }>;
  };
  primaryCompanyId: string | null;
  contactIds: string[];
  selectedDirectorId: string | null;
  selectedDirectorIds?: string[];
  selectedShareholderId: string | null;
  selectedContactId: string | null;
  /** Exact typed values are hashed; false/zero must not be stringified away. */
  effectiveCustomData: Record<string, unknown>;
  itemValues: Record<string, unknown>;
  useLetterhead: boolean;
  agreementData?: unknown;
}

export function createPreviewFingerprint(input: PreviewFingerprintInput): string {
  return createHash('sha256').update(canonicalJson(input)).digest('hex');
}

export function createReviewedFingerprint(input: {
  previewFingerprint: string;
  editedContent: string;
  editedContentJson: unknown;
}): string {
  return createHash('sha256').update(canonicalJson(input)).digest('hex');
}
