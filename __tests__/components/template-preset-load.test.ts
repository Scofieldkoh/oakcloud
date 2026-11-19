import { describe, it, expect } from 'vitest';
import {
  createInitialBatchWorkspaceState,
  documentGenerationBatchReducer,
  type EditableBatchItem,
} from '@/components/documents/generation-batch/batch-workspace-state';
import {
  describePresetLoad,
  planPresetLoad,
} from '@/components/documents/generation-batch/template-preset-load';
import type { DocumentTemplateSummary } from '@/types/document-generation';
import type {
  DocumentTemplatePresetDto,
  DocumentTemplatePresetItemDto,
} from '@/types/document-template-preset';

function template(id: string, name: string, overrides: Partial<DocumentTemplateSummary> = {}): DocumentTemplateSummary {
  return {
    id,
    name,
    description: null,
    category: 'OTHER',
    compositionType: 'STANDARD',
    version: 1,
    isActive: true,
    engine: 'OAKDOC',
    content: '',
    placeholders: [],
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

function presetItem(
  templateId: string,
  name: string,
  overrides: Partial<DocumentTemplatePresetItemDto> = {},
): DocumentTemplatePresetItemDto {
  return { templateId, resolvedTemplateId: templateId, templateName: name, available: true, ...overrides };
}

function preset(items: DocumentTemplatePresetItemDto[], name = 'AGM pack'): DocumentTemplatePresetDto {
  return { id: 'preset-1', name, version: 1, createdAt: '', updatedAt: '', items };
}

// The AGM example uses four ordinary templates; nothing here is tenant specific.
const convening = template('t-convene', 'Board Resolution - Convening of AGM', { compositionType: 'RESOLUTION' });
const notice = template('t-notice', 'Notice of Annual General Meeting');
const minutes = template('t-minutes', 'Minutes of Annual General Meeting');
const attendance = template('t-attendance', 'AGM Attendance List');
const catalogue = [convening, notice, minutes, attendance];
const agm = preset([
  presetItem('t-convene', convening.name),
  presetItem('t-notice', notice.name),
  presetItem('t-minutes', minutes.name),
  presetItem('t-attendance', attendance.name),
]);

describe('planPresetLoad', () => {
  it('loads the AGM preset as four templates in preset order', () => {
    const plan = planPresetLoad(agm, catalogue, 20);
    expect(plan.templates.map((entry) => entry.id)).toEqual(['t-convene', 't-notice', 't-minutes', 't-attendance']);
    expect(plan.skipped).toEqual([]);
  });

  it('uses current server template metadata rather than the catalogue snapshot', () => {
    const current = { ...notice, name: 'Current notice', version: 7 };
    const saved = preset([presetItem(notice.id, current.name, { template: current })]);
    expect(planPresetLoad(saved, catalogue, 20).templates).toEqual([current]);
    expect(planPresetLoad(saved, [], 20).templates).toEqual([current]);
  });

  it('keeps repeats and their order', () => {
    const repeated = preset([
      presetItem('t-notice', notice.name),
      presetItem('t-minutes', minutes.name),
      presetItem('t-notice', notice.name),
    ]);
    const plan = planPresetLoad(repeated, catalogue, 20);
    expect(plan.templates.map((entry) => entry.id)).toEqual(['t-notice', 't-minutes', 't-notice']);
  });

  it('skips a member the server marks unavailable, naming it and why, and loads the rest', () => {
    const stale = preset([
      presetItem('t-convene', convening.name),
      presetItem('t-notice', notice.name, { available: false, unavailableReason: 'inactive' }),
      presetItem('t-minutes', minutes.name, { available: false, unavailableReason: 'deleted' }),
      presetItem('t-attendance', attendance.name, { available: false, unavailableReason: 'not-word' }),
    ]);
    const plan = planPresetLoad(stale, catalogue, 20);
    expect(plan.templates.map((entry) => entry.id)).toEqual(['t-convene']);
    expect(plan.skipped).toEqual([
      { name: notice.name, reason: 'inactive' },
      { name: minutes.name, reason: 'deleted' },
      { name: attendance.name, reason: 'not-word' },
    ]);
  });

  it('loads the Word replacement for an A4 member', () => {
    const migrated = preset([presetItem('t-old-a4', 'Old notice', { resolvedTemplateId: 't-notice', templateName: notice.name })]);
    const plan = planPresetLoad(migrated, catalogue, 20);
    expect(plan.templates.map((entry) => entry.id)).toEqual(['t-notice']);
  });

  it('skips a member missing from the loaded catalogue instead of failing', () => {
    const plan = planPresetLoad(agm, [convening, notice], 20);
    expect(plan.templates.map((entry) => entry.id)).toEqual(['t-convene', 't-notice']);
    expect(plan.skipped).toEqual([
      { name: minutes.name, reason: 'not-in-catalogue' },
      { name: attendance.name, reason: 'not-in-catalogue' },
    ]);
  });

  it('skips a catalogue template that is inactive or not a Word template', () => {
    const plan = planPresetLoad(
      agm,
      [convening, { ...notice, isActive: false }, { ...minutes, engine: 'A4' }, attendance],
      20,
    );
    expect(plan.templates.map((entry) => entry.id)).toEqual(['t-convene', 't-attendance']);
    expect(plan.skipped.map((entry) => entry.name)).toEqual([notice.name, minutes.name]);
  });

  it('cuts off at the room left and reports the overflow in order', () => {
    const plan = planPresetLoad(agm, catalogue, 2);
    expect(plan.templates.map((entry) => entry.id)).toEqual(['t-convene', 't-notice']);
    expect(plan.skipped).toEqual([
      { name: minutes.name, reason: 'limit' },
      { name: attendance.name, reason: 'limit' },
    ]);
  });

  it('loads nothing and reports everything when there is no room', () => {
    const plan = planPresetLoad(agm, catalogue, 0);
    expect(plan.templates).toEqual([]);
    expect(plan.skipped).toHaveLength(4);
    expect(plan.skipped.every((entry) => entry.reason === 'limit')).toBe(true);
  });
});

describe('describePresetLoad', () => {
  it('is a plain success when everything loads', () => {
    const message = describePresetLoad(agm, planPresetLoad(agm, catalogue, 20));
    expect(message).toEqual({ variant: 'success', text: 'Added 4 templates from “AGM pack”.' });
  });

  it('names each skipped template with its reason', () => {
    const stale = preset([
      presetItem('t-convene', convening.name),
      presetItem('t-notice', notice.name, { available: false, unavailableReason: 'inactive' }),
    ]);
    const message = describePresetLoad(stale, planPresetLoad(stale, catalogue, 20));
    expect(message.variant).toBe('warning');
    expect(message.text).toContain('Added 1 of 2 templates from “AGM pack”.');
    expect(message.text).toContain(`${notice.name} (inactive)`);
  });

  it('explains the 20 document limit', () => {
    const message = describePresetLoad(agm, planPresetLoad(agm, catalogue, 3));
    expect(message.variant).toBe('warning');
    expect(message.text).toContain(`${attendance.name} (over the 20 document limit)`);
  });

  it('reports a preset that adds nothing as an error', () => {
    const message = describePresetLoad(agm, planPresetLoad(agm, catalogue, 0));
    expect(message.variant).toBe('error');
    expect(message.text).toContain('No templates were added');
  });
});

describe('template/add-many reducer action', () => {
  const existing = [template('t-existing', 'Existing Letter')];

  it('appends in order after what is already selected and leaves existing items untouched', () => {
    const state = createInitialBatchWorkspaceState(existing);
    const before: EditableBatchItem = state.batch.items[0];
    const next = documentGenerationBatchReducer(state, { type: 'template/add-many', templates: catalogue });
    expect(next.batch.items.map((entry) => entry.templateId)).toEqual([
      't-existing', 't-convene', 't-notice', 't-minutes', 't-attendance',
    ]);
    expect(next.batch.items[0]).toBe(before);
    expect(next.activeItemId).toBe(state.activeItemId ?? 't-existing');
  });

  it('is the whole selection when nothing was selected', () => {
    const state = createInitialBatchWorkspaceState([]);
    const next = documentGenerationBatchReducer(state, { type: 'template/add-many', templates: catalogue });
    expect(next.batch.items.map((entry) => entry.templateId)).toEqual(['t-convene', 't-notice', 't-minutes', 't-attendance']);
    expect(next.activeItemId).toBe(next.batch.items[0].key);
  });

  it('keeps repeats as separate items with their own keys', () => {
    const state = createInitialBatchWorkspaceState([template('t-notice', notice.name)]);
    const next = documentGenerationBatchReducer(state, {
      type: 'template/add-many',
      templates: [notice, minutes, notice],
    });
    expect(next.batch.items.map((entry) => entry.templateId)).toEqual(['t-notice', 't-notice', 't-minutes', 't-notice']);
    expect(new Set(next.batch.items.map((entry) => entry.key)).size).toBe(4);
  });

  it('applies a resolution template preset the way a single add does', () => {
    const resolution = template('t-res', 'Resolution', {
      compositionType: 'RESOLUTION',
      resolutionPreset: { subject: 'Annual matters', sections: [] },
    } as Partial<DocumentTemplateSummary>);
    const single = documentGenerationBatchReducer(createInitialBatchWorkspaceState([]), { type: 'template/add', template: resolution });
    const many = documentGenerationBatchReducer(createInitialBatchWorkspaceState([]), { type: 'template/add-many', templates: [resolution] });
    expect(many.batch.items[0].configuration.resolution?.subject).toBe(single.batch.items[0].configuration.resolution?.subject);
  });

  it('never goes past 20 documents', () => {
    const full = Array.from({ length: 19 }, (_, index) => template(`t-${index}`, `Template ${index}`));
    const state = createInitialBatchWorkspaceState(full);
    const next = documentGenerationBatchReducer(state, { type: 'template/add-many', templates: catalogue });
    expect(next.batch.items).toHaveLength(20);
    expect(next.batch.items[19].templateId).toBe('t-convene');
  });

  it('does nothing once a document has been generated (composition locked)', () => {
    const generated: EditableBatchItem = {
      ...createInitialBatchWorkspaceState([template('t-existing', 'Existing Letter')]).batch.items[0],
      status: 'GENERATED',
    };
    const state = createInitialBatchWorkspaceState({
      primaryCompanyId: null,
      currentStage: 0,
      status: 'DRAFT',
      masterFieldValues: {},
      masterFields: { fields: [], conflicts: [] },
      items: [generated],
    });
    expect(state.capabilities.canEditComposition).toBe(false);
    const next = documentGenerationBatchReducer(state, { type: 'template/add-many', templates: catalogue });
    expect(next).toBe(state);
  });

  it('does nothing for an empty list', () => {
    const state = createInitialBatchWorkspaceState(existing);
    expect(documentGenerationBatchReducer(state, { type: 'template/add-many', templates: [] })).toBe(state);
  });
});
