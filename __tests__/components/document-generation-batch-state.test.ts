import { describe, it, expect } from 'vitest';
import {
  createInitialBatchWorkspaceState,
  documentGenerationBatchReducer,
  selectCanEnterConfigure,
  selectCanRequestPreflight,
  selectReadyCount,
  type EditableBatchItem,
  type EditableDocumentGenerationBatch,
} from '@/components/documents/generation-batch/batch-workspace-state';

function item(
  id: string,
  overrides: Partial<Omit<EditableBatchItem, 'configuration'>> & {
    configuration?: Partial<EditableBatchItem['configuration']>;
  } = {},
): EditableBatchItem {
  const configuration = {
    version: 1 as const,
    title: `Document ${id}`,
    contactIds: [],
    selectedDirectorId: null,
    selectedShareholderId: null,
    selectedContactId: null,
    itemValues: {},
    masterOverrides: {},
    useLetterhead: true,
    serviceAgreement: null,
    ...(overrides.configuration ?? {}),
  };
  const { configuration: _ignored, ...restOverrides } = overrides;
  return {
    key: id,
    id,
    templateId: `template-${id}`,
    templateName: `Template ${id}`,
    templateKind: 'STANDARD',
    templateVersion: 1,
    status: 'READY',
    configuration,
    previewContent: '<p>x</p>',
    editedContent: null,
    editedContentJson: null,
    previewFingerprint: 'preview-1',
    reviewedFingerprint: 'reviewed-1',
    validationDiagnostics: null,
    lastError: null,
    ...restOverrides,
  };
}

function batch(items: EditableBatchItem[], overrides: Partial<EditableDocumentGenerationBatch> = {}) {
  return createInitialBatchWorkspaceState({
    id: 'batch-1',
    primaryCompanyId: 'company-1',
    activeItemId: items[0]?.id ?? null,
    currentStage: 3,
    revision: 4,
    status: 'DRAFT',
    masterFieldValues: {
      'billing_address::text': '1 Main Street',
      'client_name::text': 'Acme',
    },
    masterFields: {
      fields: [
        {
          id: 'billing_address::text',
          key: 'billing_address',
          type: 'text',
          label: 'Billing address',
          templateIds: ['template-a', 'template-b'],
          requiredTemplateIds: [],
          defaultsByTemplateId: {},
        },
        {
          id: 'client_name::text',
          key: 'client_name',
          type: 'text',
          label: 'Client legal name',
          templateIds: ['template-a', 'template-b'],
          requiredTemplateIds: [],
          defaultsByTemplateId: {},
        },
      ],
      conflicts: [],
    },
    items,
    ...overrides,
  });
}

describe('document generation batch workspace state', () => {
  it('invalidates only the changed item after an item override', () => {
    const first = item('a');
    const second = item('b', {
      configuration: { masterOverrides: { billing_address: 'Old address' } },
    });
    const state = batch([first, second]);

    const next = documentGenerationBatchReducer(state, {
      type: 'item/patch',
      itemId: 'b',
      patch: { masterOverrides: { billing_address: 'New address' } },
    });

    expect(next.batch.items[0].reviewedFingerprint).toBe(first.reviewedFingerprint);
    expect(next.batch.items[1]).toMatchObject({
      reviewedFingerprint: null,
      previewFingerprint: null,
    });
    expect(next.dirty).toBe(true);
    expect(next.savedSnapshot).toBe(state.savedSnapshot);
  });

  it('freezes composition and shared setup after one output succeeds', () => {
    const state = batch([
      item('a', { status: 'GENERATED' }),
      item('b'),
    ]);
    expect(state.capabilities.canEditComposition).toBe(false);
    expect(state.capabilities.canEditSharedSetup).toBe(false);
    expect(state.capabilities.canEditItems).toBe(true);

    const unchanged = documentGenerationBatchReducer(state, {
      type: 'template/add',
      template: {
        id: 'template-c',
        name: 'KYC Checklist',
        category: 'OTHER',
        compositionType: 'STANDARD',
        version: 1,
        isActive: true,
        content: '',
        placeholders: [],
        createdAt: '',
        updatedAt: '',
      },
    });
    expect(unchanged.batch.items).toHaveLength(2);
  });

  it('requires a company and valid items before advancing', () => {
    const withoutCompany = batch([item('a')], { primaryCompanyId: null });
    expect(selectCanEnterConfigure(withoutCompany)).toBe(false);
    expect(selectCanEnterConfigure(batch([item('a')]))).toBe(true);

    const needsInput = batch([item('a', { status: 'NEEDS_INPUT' })]);
    expect(selectCanRequestPreflight(needsInput)).toBe(false);
    expect(selectCanRequestPreflight(batch([item('a', { status: 'READY' })]))).toBe(true);
    expect(selectReadyCount(batch([
      item('a', { status: 'READY' }),
      item('b', { status: 'GENERATED' }),
      item('c', { status: 'FAILED' }),
    ]))).toEqual({ ready: 2, total: 3 });
  });

  it('invalidates only items consuming a changed master value without an override', () => {
    const first = item('a');
    const second = item('b', {
      configuration: {
        masterOverrides: { 'client_name::text': 'Override' },
      },
    });
    const state = batch([first, second]);

    const next = documentGenerationBatchReducer(state, {
      type: 'shared/masterValue',
      fieldId: 'client_name::text',
      value: 'New shared name',
    });

    expect(next.batch.items[0].reviewedFingerprint).toBeNull();
    expect(next.batch.items[1].reviewedFingerprint).toBe(second.reviewedFingerprint);
    expect(next.batch.masterFieldValues['client_name::text']).toBe('New shared name');
  });

  it('keeps item configuration editable for incomplete items in a partial batch', () => {
    const state = batch([
      item('a', { status: 'GENERATED' }),
      item('b'),
    ]);

    const next = documentGenerationBatchReducer(state, {
      type: 'item/patch',
      itemId: 'b',
      patch: { itemValues: { reference: 'REF-1' } },
    });

    expect(next.batch.items[1].configuration.itemValues).toEqual({ reference: 'REF-1' });
    expect(next.batch.items[0].configuration.itemValues).toEqual({});
  });

  it('reorders templates and removes items without allowing an empty selection', () => {
    const state = batch([item('a'), item('b'), item('c')]);
    const reordered = documentGenerationBatchReducer(state, {
      type: 'template/reorder',
      itemId: 'c',
      direction: -1,
    });
    expect(reordered.batch.items.map((entry) => entry.key)).toEqual(['a', 'c', 'b']);

    const removed = documentGenerationBatchReducer(reordered, {
      type: 'template/remove',
      itemId: 'a',
    });
    expect(removed.batch.items.map((entry) => entry.key)).toEqual(['c', 'b']);
    expect(removed.activeItemId).toBe('c');
  });
});
