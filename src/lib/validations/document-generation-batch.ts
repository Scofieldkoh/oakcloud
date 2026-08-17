import { z } from 'zod';
import { serviceAgreementItemSchema } from '@/lib/validations/service-agreement';

const uuid = z.string().uuid();
const nullableUuid = uuid.nullable();
const fieldValues = z
  .record(z.string().max(10_000))
  .refine((value) => Object.keys(value).length <= 200, {
    message: 'At most 200 custom field values are allowed',
  });

export const serviceAgreementWorkspaceSchema = z.object({
  authorizedContactId: nullableUuid,
  entityIds: z.array(uuid).max(100),
  agreementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  termMonths: z.number().int().min(1).max(1200),
  items: z.array(serviceAgreementItemSchema).max(50),
}).strict();

export const batchItemConfigurationSchema = z.object({
  version: z.literal(1),
  title: z.string().max(300),
  contactIds: z.array(uuid).max(100),
  selectedDirectorId: nullableUuid,
  selectedShareholderId: nullableUuid,
  selectedContactId: nullableUuid,
  itemValues: fieldValues,
  masterOverrides: fieldValues,
  useLetterhead: z.boolean(),
  serviceAgreement: serviceAgreementWorkspaceSchema.nullable(),
}).strict();

export const createDocumentGenerationBatchSchema = z.object({
  items: z.array(z.object({
    templateId: uuid,
  }).strict()).min(1).max(20),
  legacyDraftId: uuid.optional(),
}).strict().superRefine((value, context) => {
  const templateIds = value.items.map((item) => item.templateId);
  if (new Set(templateIds).size !== templateIds.length) {
    context.addIssue({
      code: 'custom',
      path: ['items'],
      message: 'Templates must be distinct within one batch',
    });
  }
  if (value.legacyDraftId && value.items.length !== 1) {
    context.addIssue({
      code: 'custom',
      path: ['legacyDraftId'],
      message: 'Legacy draft adoption requires exactly one item',
    });
  }
});

export const updateDocumentGenerationBatchItemSchema = z.object({
  id: uuid.optional(),
  templateId: uuid,
  displayOrder: z.number().int().min(0).max(19).optional(),
  configuration: batchItemConfigurationSchema.optional(),
  editedContent: z.string().max(2_000_000).nullable().optional(),
  editedContentJson: z.unknown().nullable().optional(),
}).strict();

export const updateDocumentGenerationBatchSchema = z.object({
  expectedRevision: z.number().int().min(0),
  currentStage: z.number().int().min(0).max(3).optional(),
  primaryCompanyId: nullableUuid.optional(),
  activeItemId: nullableUuid.optional(),
  masterFieldValues: fieldValues.optional(),
  items: z.array(updateDocumentGenerationBatchItemSchema).min(1).max(20),
  taskContext: z.unknown().optional(),
}).strict().superRefine((value, context) => {
  const templateIds = value.items.map((item) => item.templateId);
  if (new Set(templateIds).size !== templateIds.length) {
    context.addIssue({
      code: 'custom',
      path: ['items'],
      message: 'Templates must be distinct within one batch',
    });
  }
  const orders = value.items
    .map((item, index) => item.displayOrder ?? index);
  if (new Set(orders).size !== orders.length) {
    context.addIssue({
      code: 'custom',
      path: ['items'],
      message: 'Item display order values must be unique',
    });
  }
  if (value.activeItemId) {
    // The client may reference a local item that has not been assigned a
    // server id yet by its template id, so both identifiers are accepted.
    const identifiers = value.items.flatMap((item) => [item.id, item.templateId]);
    if (!identifiers.includes(value.activeItemId)) {
      context.addIssue({
        code: 'custom',
        path: ['activeItemId'],
        message: 'Active item must belong to the batch',
      });
    }
  }
});

export const batchItemMutationSchema = z.object({
  expectedRevision: z.number().int().min(0),
  replaceEditedContent: z.boolean().optional(),
}).strict();

export const batchPreviewSchema = batchItemMutationSchema;
export const batchReviewSchema = z.object({
  expectedRevision: z.number().int().min(0),
}).strict();

export const batchExecutionSchema = z.object({
  expectedRevision: z.number().int().min(0),
}).strict();

export const batchDiscardSchema = z.object({
  expectedRevision: z.number().int().min(0).optional(),
}).strict();

export const discardDocumentGenerationBatchSchema = batchDiscardSchema;

export type CreateDocumentGenerationBatchInput = z.infer<
  typeof createDocumentGenerationBatchSchema
>;
export type UpdateDocumentGenerationBatchInput = z.infer<
  typeof updateDocumentGenerationBatchSchema
>;
export type BatchItemMutationInput = z.infer<typeof batchItemMutationSchema>;
export type BatchReviewInput = z.infer<typeof batchReviewSchema>;
export type BatchExecutionInput = z.infer<typeof batchExecutionSchema>;
