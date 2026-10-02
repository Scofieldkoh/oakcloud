import { describe, expect, it } from 'vitest';
import { resolutionItemFields } from '@/components/documents/generation-batch/resolution-item-fields';
import { appendOakDocPartialCustomFields } from '@/lib/document-editor/oakdoc-custom-fields';
import { resolutionPartialIds, type ResolutionComposition } from '@/lib/resolution-composition';
import { normalizeStoredPlaceholders, storageFormatToCustomPlaceholders } from '@/lib/template-analysis';

const field = (key: string, type: string, extra: Record<string, unknown> = {}) => ({
  key: `custom.${key}`,
  path: `custom.${key}`,
  label: key,
  type,
  source: 'custom',
  category: 'custom',
  required: true,
  ...extra,
});

const partials = [
  { id: 'p-fee', placeholders: [field('fee', 'currency')] },
  { id: 'p-meeting', placeholders: [field('meeting_date', 'date'), field('fee', 'text')] },
  { id: 'p-unused', placeholders: [field('unused', 'text')] },
];

const composition: ResolutionComposition = {
  subject: '',
  sections: [
    { id: 's1', kind: 'PARTIAL', heading: 'FEE', partialId: 'p-fee' },
    { id: 's2', kind: 'PARTIAL', heading: 'MEETING', partialId: 'p-meeting' },
    { id: 's3', kind: 'PARTIAL', heading: 'EDITED', partialId: 'p-unused', body: 'Edited text' },
    { id: 's4', kind: 'CUSTOM', heading: 'OTHER', body: 'Text' },
    { id: 's5', kind: 'PARTIAL', heading: 'FEE AGAIN', partialId: 'p-fee' },
  ],
};

describe('resolution partial custom fields', () => {
  it('lists the partials whose saved wording prints, once each', () => {
    expect(resolutionPartialIds(composition)).toEqual(['p-fee', 'p-meeting']);
    expect(resolutionPartialIds(null)).toEqual([]);
  });

  it('keeps everything the template carries and adds new partial fields', () => {
    const template = [field('fee', 'number'), field('legacy', 'text', { oakDocPartialId: 'p-old' })];
    const merged = appendOakDocPartialCustomFields(template, partials.slice(0, 2));
    expect(merged.map((definition) => [definition.key, definition.type, definition.oakDocPartialId])).toEqual([
      ['custom.fee', 'number', undefined],
      ['custom.legacy', 'text', 'p-old'],
      ['custom.meeting_date', 'date', 'p-meeting'],
    ]);
  });

  it('asks a resolution document for the fields of its chosen partials', () => {
    const templateFields = storageFormatToCustomPlaceholders(normalizeStoredPlaceholders([field('board_date', 'date')]));
    const fields = resolutionItemFields(templateFields, composition, partials);
    expect(fields.map((item) => [item.key, item.type, item.required])).toEqual([
      ['board_date', 'date', true],
      ['fee', 'currency', true],
      ['meeting_date', 'date', true],
    ]);
    expect(resolutionItemFields(templateFields, null, partials)).toBe(templateFields);
  });
});
