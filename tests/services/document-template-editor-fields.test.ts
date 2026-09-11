import { describe, expect, it } from 'vitest';
import { mergeA4DocumentLayout, DEFAULT_A4_DOCUMENT_LAYOUT } from '@/components/documents/a4-pagination/layout';
import { resolvePlaceholders } from '@/lib/placeholder-resolver';
import {
  createDocumentTemplateSchema,
  placeholderDefinitionSchema,
  updateDocumentTemplateSchema,
} from '@/lib/validations/document-template';
import {
  createTemplatePartialSchema,
  updateTemplatePartialSchema,
} from '@/lib/validations/template-partial';

const TEMPLATE_ID = '00000000-0000-4000-8000-000000000001';
const PARTIAL_ID = '00000000-0000-4000-8000-000000000002';

const completeDefinition = {
  id: 'field-canonical-001',
  key: 'custom.primary_use',
  label: 'Primary use',
  type: 'text',
  source: 'custom',
  category: 'property',
  path: 'custom.primary_use',
  required: true,
  defaultValue: 'Residential',
  format: 'sentence-case',
  options: ['Residential', 'Commercial'],
  linkedTo: 'include_primary_use',
  sourcePartial: 'property-details',
  futureMetadata: {
    editorHint: 'keep-on-round-trip',
    formatLevel: 2,
  },
} as const;

const omittedRequiredDefinition = {
  id: 'field-canonical-002',
  key: 'custom.optional_note',
  label: 'Optional note',
  type: 'text',
  source: 'custom',
  category: 'custom',
  path: 'custom.optional_note',
  defaultValue: '',
  format: 'plain',
  options: ['A', 'B'],
  linkedTo: 'include_optional_note',
  sourcePartial: 'property-details',
  futureMetadata: { presenceProbe: 'required-omitted' },
} as const;

const fieldTypes = [
  'text',
  'textarea',
  'date',
  'number',
  'currency',
  'boolean',
  'list',
  'conditional',
] as const;

function expectCurrentLossyDefinition(value: unknown) {
  expect(value).toMatchObject({
    key: completeDefinition.key,
    label: completeDefinition.label,
    type: completeDefinition.type,
    source: completeDefinition.source,
    category: completeDefinition.category,
    path: completeDefinition.path,
    required: true,
    defaultValue: completeDefinition.defaultValue,
    format: completeDefinition.format,
    linkedTo: completeDefinition.linkedTo,
    sourcePartial: completeDefinition.sourcePartial,
  });
  expect(value).not.toHaveProperty('id');
  expect(value).not.toHaveProperty('options');
  expect(value).not.toHaveProperty('futureMetadata');
}

describe('A4 editor WORKFLOW W0 field server-boundary compatibility proofs', () => {
  it('W-FIELD-01A records the current placeholderDefinitionSchema lossiness explicitly', () => {
    const parsed = placeholderDefinitionSchema.parse(completeDefinition);
    expectCurrentLossyDefinition(parsed);
  });

  it('W-FIELD-01B records the same lossiness through real DocumentTemplate create/update request schemas', () => {
    const created = createDocumentTemplateSchema.parse({
      name: 'W0 field carrier template',
      content: '<p>{{custom.primary_use}}</p>',
      placeholders: [completeDefinition],
    });
    const updated = updateDocumentTemplateSchema.parse({
      id: TEMPLATE_ID,
      placeholders: [completeDefinition],
    });

    expectCurrentLossyDefinition(created.placeholders[0]);
    expectCurrentLossyDefinition(updated.placeholders?.[0]);
  });

  it('W-FIELD-01C records the same lossiness through real TemplatePartial create/update request schemas', () => {
    const created = createTemplatePartialSchema.parse({
      name: 'w0-field-carrier',
      displayName: 'W0 field carrier partial',
      content: '<p>{{custom.primary_use}}</p>',
      placeholders: [completeDefinition],
    });
    const updated = updateTemplatePartialSchema.parse({
      id: PARTIAL_ID,
      placeholders: [completeDefinition],
    });

    expectCurrentLossyDefinition(created.placeholders[0]);
    expectCurrentLossyDefinition(updated.placeholders?.[0]);
  });

  it('W-FIELD-01D records current required-presence semantics: explicit true survives and omission defaults to false', () => {
    const explicit = placeholderDefinitionSchema.parse(completeDefinition);
    const omitted = placeholderDefinitionSchema.parse(omittedRequiredDefinition);

    expect(explicit.required).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(explicit, 'required')).toBe(true);
    expect(omitted.required).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(omitted, 'required')).toBe(true);
  });

  it('W-FIELD-01E recognizes every current placeholder type, including legacy list and conditional values', () => {
    for (const type of fieldTypes) {
      const parsed = placeholderDefinitionSchema.safeParse({
        key: `custom.type_${type}`,
        label: `Type ${type}`,
        type,
        source: 'custom',
      });
      expect(parsed.success, `expected ${type} to remain recognized`).toBe(true);
    }

    expect(fieldTypes).toContain('list');
    expect(fieldTypes).toContain('conditional');
  });

  it.fails('W-FIELD-01F future F0 lossless contract preserves stable id, options and unknown forward metadata', () => {
    const parsed = placeholderDefinitionSchema.parse(completeDefinition);
    expect(parsed).toEqual(completeDefinition);
  });

  it.fails('W-FIELD-01G future F0 lossless contract preserves omission of required instead of materializing a default', () => {
    const parsed = placeholderDefinitionSchema.parse(omittedRequiredDefinition);
    expect(Object.prototype.hasOwnProperty.call(parsed, 'required')).toBe(false);
  });

  it('W-FIELD-04 layout merge preserves unrelated stored field metadata already present in contentJson', () => {
    const contentJson = {
      version: 1,
      fields: [{ id: 'f1', scope: 'template:t1', future: { v: 2 } }],
      unrelated: { keep: true },
    };
    const merged = mergeA4DocumentLayout(contentJson, DEFAULT_A4_DOCUMENT_LAYOUT);
    expect(merged.fields).toEqual(contentJson.fields);
    expect(merged.unrelated).toEqual(contentJson.unrelated);
  });

  it('W-FIELD-05A records current resolver behavior: ordinary text can presently introduce markup', () => {
    const resolved = resolvePlaceholders(
      '<p>{{custom.note}}</p><p>{{custom.missing}}</p>',
      { custom: { note: '<b>not trusted markup</b>' } },
      { missingPlaceholder: 'highlight' },
    );

    expect(resolved.resolved).toContain('<b>not trusted markup</b>');
    expect(resolved.missing).toContain('custom.missing');
    expect(resolved.resolved).toContain('placeholder-missing');
  });

  it.fails('W-FIELD-05B future C06 contract escapes ordinary values at the interpolation boundary once F2/W integration is authorized', () => {
    const resolved = resolvePlaceholders(
      '<p>{{custom.note}}</p>',
      { custom: { note: '<b>not trusted markup</b>' } },
      { missingPlaceholder: 'highlight' },
    );

    expect(resolved.resolved).toContain('&lt;b&gt;not trusted markup&lt;/b&gt;');
    expect(resolved.resolved).not.toContain('<b>not trusted markup</b>');
  });
});
