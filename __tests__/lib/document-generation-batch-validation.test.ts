import { describe, expect, it } from 'vitest';
import {
  batchExecutionSchema,
  batchItemConfigurationSchema,
  createDocumentGenerationBatchSchema,
  updateDocumentGenerationBatchSchema,
} from '@/lib/validations/document-generation-batch';

const templateA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const templateB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const uuid = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function validBatchInput() {
  return {
    items: [{ templateId: templateA }, { templateId: templateB }],
  };
}

function validItemConfiguration() {
  return {
    version: 1 as const,
    title: 'Engagement letter',
    contactIds: [],
    selectedDirectorId: null,
    selectedShareholderId: null,
    selectedContactId: null,
    itemValues: {},
    masterOverrides: {},
    useLetterhead: true,
    serviceAgreement: null,
  };
}

describe('document generation batch validation', () => {
  it('accepts 1 to 20 distinct ordered templates and rejects duplicates', () => {
    expect(createDocumentGenerationBatchSchema.safeParse(validBatchInput()).success).toBe(true);
    expect(createDocumentGenerationBatchSchema.safeParse({
      ...validBatchInput(),
      items: [validBatchInput().items[0], validBatchInput().items[0]],
    }).success).toBe(false);
    expect(createDocumentGenerationBatchSchema.safeParse({ items: [] }).success).toBe(false);
    expect(createDocumentGenerationBatchSchema.safeParse({
      items: Array.from({ length: 21 }, (_, index) => ({
        templateId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      })),
    }).success).toBe(false);
  });

  it('requires exactly one item for legacy draft adoption', () => {
    expect(createDocumentGenerationBatchSchema.safeParse({
      items: [validBatchInput().items[0]],
      legacyDraftId: uuid,
    }).success).toBe(true);
    expect(createDocumentGenerationBatchSchema.safeParse({
      ...validBatchInput(),
      legacyDraftId: uuid,
    }).success).toBe(false);
  });

  it('rejects extra client-owned fields and malformed UUIDs', () => {
    expect(createDocumentGenerationBatchSchema.safeParse({
      ...validBatchInput(),
      tenantId: uuid,
    }).success).toBe(false);
    expect(createDocumentGenerationBatchSchema.safeParse({
      items: [{ templateId: 'not-a-uuid' }],
    }).success).toBe(false);
  });

  it('validates update payloads with shared expected revision and unique order', () => {
    expect(updateDocumentGenerationBatchSchema.safeParse({
      expectedRevision: 3,
      items: [
        { templateId: templateA, configuration: validItemConfiguration() },
        { templateId: templateB, configuration: validItemConfiguration() },
      ],
    }).success).toBe(true);
    expect(updateDocumentGenerationBatchSchema.safeParse({
      expectedRevision: -1,
      items: [],
    }).success).toBe(false);
    expect(updateDocumentGenerationBatchSchema.safeParse({
      expectedRevision: 0,
      items: [
        { templateId: templateA, displayOrder: 0 },
        { templateId: templateB, displayOrder: 0 },
      ],
    }).success).toBe(false);
  });

  it('accepts an empty Service Agreement workspace while still validating entered items', () => {
    const workspace = {
      authorizedContactId: null,
      entityIds: [],
      agreementDate: '2026-08-12',
      effectiveDate: null,
      termMonths: 12,
      items: [],
    };
    expect(batchItemConfigurationSchema.safeParse({
      ...validItemConfiguration(),
      serviceAgreement: workspace,
    }).success).toBe(true);
    expect(batchItemConfigurationSchema.safeParse({
      ...validItemConfiguration(),
      serviceAgreement: {
        ...workspace,
        items: [{
          clientKey: 'item-1',
          variantId: uuid,
          entityIds: ['not-a-uuid'],
          startDate: '2026-08-12',
          endDate: null,
          fieldValues: {},
          displayOrder: 0,
          feeLines: [],
        }],
      },
    }).success).toBe(false);
  });

  it('requires expected revision for execution payloads', () => {
    expect(batchExecutionSchema.safeParse({ expectedRevision: 2 }).success).toBe(true);
    expect(batchExecutionSchema.safeParse({}).success).toBe(false);
  });
});
