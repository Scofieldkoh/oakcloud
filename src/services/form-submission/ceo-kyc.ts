/** Audit-backed, tenant-scoped CEO KYC/CDD handoff review. */
import { Prisma } from '@/generated/prisma';
import { createAuditLog } from '@/lib/audit';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import { parseFormTemplateBinding } from '@/lib/form-templates';
import { SG_ANNUAL_RETURN_DECLARATION_TEMPLATE_KEY } from '@/lib/form-templates/sg-annual-return-declaration';
import {
  CEO_KYC_REVIEW_METADATA_KEY,
  INDIVIDUAL_KYC_FORM_SLUG,
  isCeoKycRequired,
  parseKycSubmissionReference,
  readCeoKycReview,
  type CeoKycReview,
} from '@/lib/forms/ceo-kyc-review';
import { prisma } from '@/lib/prisma';
import { parseFormResponseReviewStatus, parseObject, toAnswerRecord } from '@/lib/form-utils';
import type { TenantAwareParams } from '@/lib/types';

export type CeoKycReviewAction =
  | { action: 'LINK'; reference: string }
  | { action: 'REVIEW' }
  | { action: 'CLEAR' };

export async function updateCeoKycReview(
  formId: string,
  submissionId: string,
  command: CeoKycReviewAction,
  params: TenantAwareParams,
): Promise<{ id: string; ceoKycReview: CeoKycReview | null }> {
  const submission = await prisma.formSubmission.findFirst({
    where: { id: submissionId, formId, tenantId: params.tenantId, deletedAt: null },
    include: { form: { select: { title: true, settings: true } } },
  });
  if (!submission) throw new NotFoundError('Annual Return submission not found');
  const binding = parseFormTemplateBinding(submission.form.settings);
  if (binding?.key !== SG_ANNUAL_RETURN_DECLARATION_TEMPLATE_KEY || binding.version < 4) {
    throw new ValidationError('CEO KYC/CDD tracking is only available for Annual Return declaration v4 or later');
  }
  if (!isCeoKycRequired(toAnswerRecord(submission.answers))) {
    throw new ValidationError('A separate individual CEO KYC/CDD form is not required for this response');
  }
  const previous = readCeoKycReview(submission.metadata);
  if (command.action !== 'REVIEW' && parseFormResponseReviewStatus(submission.metadata) === 'reviewed') {
    throw new ValidationError('Set the Annual Return response to Needs follow-up before changing its linked CEO KYC/CDD.');
  }
  const now = new Date().toISOString();
  let next: CeoKycReview | null = null;

  if (command.action === 'LINK' || command.action === 'REVIEW') {
    const input = command.action === 'LINK' ? parseKycSubmissionReference(command.reference) : null;
    if (command.action === 'LINK' && !input) {
      throw new ValidationError('Enter a valid KYC/CDD response UUID or internal response link');
    }
    if (command.action === 'REVIEW' && !previous) {
      throw new ValidationError('Link a completed individual KYC/CDD response before marking it reviewed');
    }
    const targetId = command.action === 'LINK' ? input!.submissionId : previous!.linkedSubmissionId;
    const linked = await prisma.formSubmission.findFirst({
      where: {
        id: targetId, tenantId: params.tenantId, deletedAt: null, status: 'COMPLETED',
        form: { slug: INDIVIDUAL_KYC_FORM_SLUG, deletedAt: null },
      },
      select: { id: true, formId: true },
    });
    if (!linked || (input?.formId && input.formId !== linked.formId)) {
      throw new ValidationError('No completed individual KYC/CDD response was found in this workspace for that reference');
    }

    if (command.action === 'LINK') {
      next = {
        status: 'RECEIVED',
        linkedSubmissionId: linked.id, linkedFormId: linked.formId,
        linkedAt: now, linkedById: params.userId,
      };
    } else {
      next = {
        ...previous!,
        status: 'REVIEWED',
        reviewedAt: now, reviewedById: params.userId,
      };
    }
  } else if (command.action !== 'CLEAR') {
    throw new ValidationError('Unsupported CEO KYC/CDD review action');
  }

  const nextMetadata = { ...(parseObject(submission.metadata) || {}) };
  if (next) nextMetadata[CEO_KYC_REVIEW_METADATA_KEY] = next;
  else delete nextMetadata[CEO_KYC_REVIEW_METADATA_KEY];

  // Optimistic concurrency ensures two staff updates do not silently overwrite
  // each other's review metadata (or another update to the same response).
  const updated = await prisma.formSubmission.updateMany({
    where: {
      id: submission.id, formId, tenantId: params.tenantId,
      deletedAt: null, updatedAt: submission.updatedAt,
    },
    data: {
      metadata: Object.keys(nextMetadata).length
        ? nextMetadata as Prisma.InputJsonValue
        : Prisma.NullableJsonNullValueInput.JsonNull,
    },
  });
  if (updated.count !== 1) throw new ConflictError('The response changed. Refresh before updating CEO KYC/CDD review.');

  await createAuditLog({
    tenantId: params.tenantId,
    userId: params.userId,
    action: 'UPDATE',
    entityType: 'FormSubmission',
    entityId: submission.id,
    entityName: submission.respondentName || submission.respondentEmail || submission.id,
    summary: `CEO KYC/CDD ${command.action.toLowerCase()} on "${submission.form.title}"`,
    changeSource: 'MANUAL',
    metadata: {
      event: 'form_response_ceo_kyc_review_updated',
      formId, command: command.action,
      previousStatus: previous?.status || 'PENDING',
      status: next?.status || 'PENDING',
      previousLinkedSubmissionId: previous?.linkedSubmissionId || null,
      linkedSubmissionId: next?.linkedSubmissionId || null,
    },
  });
  return { id: submission.id, ceoKycReview: next };
}
