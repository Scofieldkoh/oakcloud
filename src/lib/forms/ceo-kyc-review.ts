/** Staff-controlled linkage of an Annual Return CEO KYC/CDD prerequisite.
 * Public form responses cannot supply this metadata.
 */
export const CEO_KYC_REVIEW_METADATA_KEY = 'ceoKycReview';
export const INDIVIDUAL_KYC_FORM_SLUG = 'kyccdd-individual';

export type CeoKycReviewStatus = 'RECEIVED' | 'REVIEWED';

export interface CeoKycReview {
  status: CeoKycReviewStatus;
  linkedSubmissionId: string;
  linkedFormId: string;
  linkedAt: string;
  linkedById: string;
  reviewedAt?: string;
  reviewedById?: string;
}

export function isCeoKycRequired(answers: Record<string, unknown>): boolean {
  if (answers.ceo_exists !== 'Yes' || answers.ceo_role_listed === 'Yes') return false;
  return answers.prefill_source === 'company_record'
    ? answers.ceo_source === 'New individual'
    : true;
}

export function readCeoKycReview(metadata: unknown): CeoKycReview | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const raw = (metadata as Record<string, unknown>)[CEO_KYC_REVIEW_METADATA_KEY];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const entry = raw as Record<string, unknown>;
  if ((entry.status !== 'RECEIVED' && entry.status !== 'REVIEWED')
    || typeof entry.linkedSubmissionId !== 'string'
    || typeof entry.linkedFormId !== 'string'
    || typeof entry.linkedAt !== 'string'
    || typeof entry.linkedById !== 'string') return null;
  return {
    status: entry.status,
    linkedSubmissionId: entry.linkedSubmissionId,
    linkedFormId: entry.linkedFormId,
    linkedAt: entry.linkedAt,
    linkedById: entry.linkedById,
    ...(typeof entry.reviewedAt === 'string' ? { reviewedAt: entry.reviewedAt } : {}),
    ...(typeof entry.reviewedById === 'string' ? { reviewedById: entry.reviewedById } : {}),
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Accept a raw response UUID or the internal staff response URL. */
export function parseKycSubmissionReference(input: string): { submissionId: string; formId?: string } | null {
  const value = input.trim();
  if (UUID.test(value)) return { submissionId: value };
  const match = /(?:^|\/)forms\/([0-9a-f-]{36})\/responses\/([0-9a-f-]{36})(?:[/?#]|$)/i.exec(value);
  if (!match || !UUID.test(match[1]) || !UUID.test(match[2])) return null;
  return { formId: match[1], submissionId: match[2] };
}
