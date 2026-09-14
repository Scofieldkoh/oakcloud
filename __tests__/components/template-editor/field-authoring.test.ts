import { describe, expect, it } from 'vitest';

import {
  collectAtomicFieldReferences,
  collectFieldUsage,
  commitFieldKeyDraft,
  createAtomicFieldClipboardPayload,
  createCatalogFieldDiscoveryDescriptor,
  createCustomFieldDiscoveryDescriptor,
  createFieldAuthoringInputDescriptor,
  createFieldDeletionPreview,
  createFieldKeyDraft,
  createModifierExpression,
  expandAtomicFieldEditRange,
  filterFieldDiscovery,
  parseAtomicFieldPaste,
  parseFieldAuthoringInput,
  parseFieldDiagnosticsForNavigation,
  pushRecentFieldIdentity,
  reconcileRecentFieldIdentities,
  stableCustomFieldIdentity,
  updateFieldKeyDraftKey,
  updateFieldKeyDraftLabel,
} from '@/components/documents/template-editor/field-authoring';
import { createAtomicFieldPresentationDescriptor } from '@/components/documents/template-editor/field-reference-presentation';
import {
  loadLosslessStoredFieldDefinition,
  type FieldOwnerScope,
  type LosslessStoredFieldDefinition,
} from '@/lib/template-field-contract';
import type { CustomPlaceholderDefinition } from '@/types/placeholders';

const SCOPE: FieldOwnerScope = { kind: 'template', id: 'template-f3', label: 'Engagement letter' };

function definition(stored: Readonly<Record<string, unknown>>): LosslessStoredFieldDefinition {
  return loadLosslessStoredFieldDefinition({ scope: SCOPE, definition: stored });
}

describe('FIELDS F3 typed authoring descriptors', () => {
  it('publishes W3 controls for date, multiline, boolean, number and currency without precision coercion', () => {
    const cases = [
      { type: 'date', inputKind: 'date', raw: '2026-09-13', kind: 'date' },
      { type: 'textarea', inputKind: 'multiline', raw: 'line 1\nline 2', kind: 'multiline' },
      { type: 'boolean', inputKind: 'yes-no', raw: false, kind: 'boolean' },
      { type: 'number', inputKind: 'number', raw: '001.2300', kind: 'number' },
      { type: 'currency', inputKind: 'currency', raw: '-00042.5000', kind: 'currency' },
    ] as const;

    for (const item of cases) {
      const field = definition({
        id: `field-${item.type}`,
        key: `custom.${item.type}`,
        label: item.type,
        type: item.type,
        required: true,
      });
      const descriptor = createFieldAuthoringInputDescriptor(field, {
        description: `${item.type} input`,
        sourceLabel: 'Custom',
      });
      expect(descriptor.inputKind).toBe(item.inputKind);
      const parsed = parseFieldAuthoringInput(descriptor, item.raw);
      expect(parsed.ok).toBe(true);
      if (parsed.ok) {
        expect(parsed.value.kind).toBe(item.kind);
        if ('value' in parsed.value) expect(parsed.value.value).toBe(item.raw);
      }
      if (item.type === 'boolean') {
        expect(descriptor.choices).toEqual([
          { label: 'Yes', value: true },
          { label: 'No', value: false },
        ]);
      }
    }
  });

  it('rejects invalid exact-decimal/date input without normalizing its meaning', () => {
    const number = createFieldAuthoringInputDescriptor(definition({
      id: 'number', key: 'custom.number', label: 'Number', type: 'number',
    }));
    const date = createFieldAuthoringInputDescriptor(definition({
      id: 'date', key: 'custom.date', label: 'Date', type: 'date',
    }));
    expect(parseFieldAuthoringInput(number, '1,234.00')).toMatchObject({ ok: false, code: 'invalid-value' });
    expect(parseFieldAuthoringInput(date, '13/09/2026')).toMatchObject({ ok: false, code: 'invalid-value' });
  });

  it('keeps unsupported legacy types preserve-only and explicitly unavailable', () => {
    const descriptor = createFieldAuthoringInputDescriptor(definition({
      id: 'legacy', key: 'custom.rows', label: 'Rows', type: 'list',
    }));
    expect(descriptor.inputKind).toBe('read-only');
    expect(descriptor.disabledReason).toContain('preserve-only');
    expect(parseFieldAuthoringInput(descriptor, 'anything')).toMatchObject({ ok: false, code: 'read-only' });
  });
});

describe('FIELDS F3 key generation and discovery', () => {
  it('keeps generating the complete key until the author intentionally edits it', () => {
    let draft = createFieldKeyDraft();
    draft = updateFieldKeyDraftLabel(draft, 'Reference Number');
    expect(draft).toMatchObject({ key: 'reference_number', keyMode: 'generated' });
    draft = updateFieldKeyDraftLabel(draft, 'Client Reference Number');
    expect(draft.key).toBe('client_reference_number');
    draft = updateFieldKeyDraftKey(draft, 'manual ref');
    draft = updateFieldKeyDraftLabel(draft, 'Label changed again');
    expect(draft).toMatchObject({ key: 'manual ref', keyMode: 'manual' });
    expect(commitFieldKeyDraft(draft).key).toBe('manual_ref');
  });

  it('searches contextual registry entries by business labels and descriptions', () => {
    const company = createCatalogFieldDiscoveryDescriptor({
      key: 'company.registeredAddress',
      label: 'Registered office address',
      category: 'Company',
      description: 'The company address shown on official correspondence.',
      example: '1 Raffles Place',
    });
    const system = createCatalogFieldDiscoveryDescriptor({
      key: 'system.currentDate',
      label: 'Current Date',
      category: 'System',
    });
    expect(filterFieldDiscovery([company, system], 'official correspondence')).toEqual([company]);
    expect(filterFieldDiscovery([company, system], 'system')).toEqual([system]);
    expect(company.key).toBe('company.registeredAddress');
    expect(company.label).toBe('Registered office address');
  });

  it('marks modifier actions unavailable until CORE supplies a valid atomic field', () => {
    const modifier = createCatalogFieldDiscoveryDescriptor({
      key: 'UCASE({{field}})', label: 'Uppercase', category: 'Modifiers',
    });
    expect(modifier.availability).toEqual({
      status: 'unavailable',
      reason: expect.stringContaining('existing valid field'),
    });
  });

  it('keeps applicable service fields on their existing service path and explains preserve-only fields', () => {
    const service: CustomPlaceholderDefinition = {
      id: 'service-software',
      key: 'service.fields.software',
      label: 'Accounting software',
      type: 'textarea',
      required: true,
      storageSource: 'service',
      storagePath: 'service.fields.software',
    };
    const descriptor = createCustomFieldDiscoveryDescriptor(service, SCOPE);
    expect(descriptor.expression).toBe('{{service.fields.software}}');
    expect(descriptor.sourceLabel).toBe('Service');

    const preserveOnly = createCustomFieldDiscoveryDescriptor({
      ...service,
      id: 'legacy-service',
      storedType: 'structured-table',
      preserveOnly: true,
    }, SCOPE);
    expect(preserveOnly.availability).toEqual({
      status: 'unavailable',
      reason: 'Legacy field type "structured-table" is preserve-only.',
    });
  });

  it('uses stable shared identities for custom-field recents and drops deleted fields', () => {
    const field: CustomPlaceholderDefinition = {
      id: 'persisted-custom-id',
      key: 'reference_number',
      label: 'Reference number',
      type: 'text',
      required: true,
      ownerScope: SCOPE,
    };
    const renamed = { ...field, label: 'Client reference number' };
    expect(stableCustomFieldIdentity(renamed)).toBe(stableCustomFieldIdentity(field));
    const descriptor = createCustomFieldDiscoveryDescriptor(field);
    const recents = pushRecentFieldIdentity([], descriptor.identity, [descriptor]);
    expect(recents).toEqual([descriptor.identity]);
    expect(reconcileRecentFieldIdentities(recents, [])).toEqual([]);
  });
});

describe('FIELDS F3 atomic references, clipboard and occurrences', () => {
  const note = definition({
    id: 'note-id', key: 'custom.note', label: 'Note', type: 'text', defaultValue: 'Default note',
  });

  it('finds whole field tokens in bold text, headings, lists, tables, adjacency and page-boundary source', () => {
    const content = [
      '<p><strong>{{custom.note}}</strong></p>',
      '<h2>{{custom.note}}</h2>',
      '<ul><li>{{custom.note}}</li></ul>',
      '<table><tr><td>{{custom.note}}</td></tr></table>',
      '<p>{{custom.note}}{{custom.note}}</p>',
      '<span data-a4-break="page"></span><p>{{custom.note}}</p>',
    ].join('\n');
    const references = collectAtomicFieldReferences({ content, scope: SCOPE, registry: [note] });
    expect(references).toHaveLength(7);
    expect(new Set(references.map((reference) => reference.identity))).toEqual(new Set([note.identity]));
    expect(references.every((reference) => reference.sourceText === '{{custom.note}}')).toBe(true);
  });

  it('expands partial edit/delete/format ranges to the complete token', () => {
    const content = '<p>Hello {{custom.note}} world</p>';
    const [reference] = collectAtomicFieldReferences({ content, scope: SCOPE, registry: [note] });
    const range = expandAtomicFieldEditRange([reference], {
      start: reference.span.start + 2,
      end: reference.span.start + 6,
    });
    expect(range).toEqual({ start: reference.span.start, end: reference.span.end });
  });

  it('copies only canonical source text and ignores pasted presentation attributes that try to spoof identity', () => {
    const [reference] = collectAtomicFieldReferences({
      content: '{{custom.note}}', scope: SCOPE, registry: [note],
    });
    expect(createAtomicFieldClipboardPayload(reference)).toEqual({ text: '{{custom.note}}' });
    const pasted = parseAtomicFieldPaste({
      text: '{{custom.note}}',
      html: '<span data-field-identity="field:v1:template:evil:id:spoof">{{custom.note}}</span>',
      scope: SCOPE,
      registry: [note],
    });
    expect(pasted?.identity).toBe(note.identity);
    expect(parseAtomicFieldPaste({
      text: '<span data-field-identity="evil">{{custom.note}}</span>',
      scope: SCOPE,
      registry: [note],
    })).toBeNull();
  });

  it('creates modifier syntax only from a valid parsed field reference', () => {
    const [reference] = collectAtomicFieldReferences({
      content: '{{custom.note}}', scope: SCOPE, registry: [note],
    });
    expect(createModifierExpression(reference, 'UCASE')).toBe('UCASE({{custom.note}})');
    expect(() => createModifierExpression(reference, 'bad-modifier')).toThrow('Unsupported field modifier');
  });

  it('publishes recognizable presentation metadata while keeping the technical key advanced-only data', () => {
    const [reference] = collectAtomicFieldReferences({
      content: '{{custom.note}}', scope: SCOPE, registry: [note],
    });
    const presentation = createAtomicFieldPresentationDescriptor({
      reference,
      definition: note,
      sourceLabel: 'Custom',
      description: 'Notes supplied for this document.',
      value: { kind: 'text', value: 'Current note' },
    });
    expect(presentation).toMatchObject({
      identity: note.identity,
      label: 'Note',
      sourceLabel: 'Custom',
      typeLabel: 'Text',
      description: 'Notes supplied for this document.',
      valueSummary: 'Current note',
      defaultSummary: 'Default note',
      technicalKey: 'custom.note',
      sourceText: '{{custom.note}}',
    });
  });

  it('reports usage counts and navigable occurrence positions for deletion UX', () => {
    const content = '<p>{{custom.note}}</p>\n<p>Again {{custom.note}}</p>';
    const usage = collectFieldUsage({
      content, scope: SCOPE, path: 'custom.note', identity: note.identity, registry: [note],
    });
    expect(usage.count).toBe(2);
    expect(usage.locations.map((location) => location.label)).toEqual([
      'Line 1, column 4',
      'Line 2, column 10',
    ]);
    expect(createFieldDeletionPreview({ identity: note.identity, usage })).toMatchObject({
      usageCount: 2,
      requiresReferenceDecision: true,
    });
    expect(createFieldDeletionPreview({ identity: note.identity })).toMatchObject({
      usageCount: null,
      requiresReferenceDecision: true,
    });
  });

  it('maps parser diagnostics to exact source positions and occurrence IDs for CORE navigation', () => {
    const targets = parseFieldDiagnosticsForNavigation({
      content: 'Heading\n{{mystery.value}}',
      scope: SCOPE,
    });
    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({
      line: 2,
      column: 1,
      occurrenceId: expect.stringContaining('field-occurrence:v1'),
      diagnostic: { code: 'unknown-root' },
    });
    expect(targets[0].diagnostic.span.raw).toBe('{{mystery.value}}');
  });
});
