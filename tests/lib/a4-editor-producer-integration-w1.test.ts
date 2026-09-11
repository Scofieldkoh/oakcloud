/** @vitest-environment jsdom */

import { describe, expect, it } from 'vitest';
import {
  mapA4ProjectedStructuralPoint,
  partitionA4SemanticBreaks,
} from '@/components/documents/a4-pagination/semantic-break-projection';
import { paginateA4StructuralHtml } from '@/components/documents/a4-pagination/structural-pagination';
import {
  assertA4WriterCanPreserve,
  readA4StoredDocument,
} from '@/lib/document-editor/a4-editor-format';
import {
  preserveStoredFieldDefinitions,
} from '@/lib/document-editor/template-field-workflow';
import { loadStoredFieldRegistry } from '@/lib/template-field-registry';
import {
  createDocumentTemplateSchema,
  updateDocumentTemplateSchema,
} from '@/lib/validations/document-template';
import { createTemplatePartialSchema } from '@/lib/validations/template-partial';
import { ErrorCodes } from '@/lib/errors';

const source = { sessionKey: 'document:w1-reader', documentRevision: 17 } as const;

function projectedElement(fragment: string, nodeId: string): HTMLElement | null {
  const root = document.createElement('div');
  root.innerHTML = fragment;
  return Array.from(root.querySelectorAll<HTMLElement>('[data-flow-id]'))
    .find((element) => element.dataset.flowId === nodeId) ?? null;
}

describe('W1 integrated S1 reader/pagination adapters', () => {
  it('reads legacy top-level hard breaks without promoting the stored format', () => {
    const html = '<p>Alpha</p><div class="page-break" data-break-type="hard"></div><p>Omega</p>';
    const reader = readA4StoredDocument(html);
    expect(reader.formatLevel).toBe(1);
    expect(reader.hasLegacyBreaks).toBe(true);
    expect(reader.hasSemanticBreaks).toBe(false);

    const projection = partitionA4SemanticBreaks(reader.canonical, source);
    expect(projection.fragments).toHaveLength(2);
    expect(projection.fragments[1]?.hardBreakBefore).toBe(true);
    expect(projection.positionMap).toMatchObject(source);
  });

  it('reads nested C03 breaks and keeps one logical list item across projection', () => {
    const html = '<ol start="5"><li><p>Before<span data-a4-break="page"></span>After</p></li></ol>';
    const reader = readA4StoredDocument(html);
    expect(reader.formatLevel).toBe(2);
    expect(reader.hasSemanticBreaks).toBe(true);

    const projection = partitionA4SemanticBreaks(reader.canonical, source);
    expect(projection.fragments).toHaveLength(2);
    expect(projection.fragments.every((fragment) => /<ol\b[^>]*start="5"/i.test(fragment.content))).toBe(true);
    expect(projection.fragments.every((fragment) => /<li\b/i.test(fragment.content))).toBe(true);
    expect(projection.positionMap).toMatchObject(source);
  });

  it('retains exact zero-text structural child-boundary mappings through the W reader', () => {
    const html = '<p>Before<br><span data-a4-break="page"></span><span data-field-ref="custom.note"></span>After</p>';
    const reader = readA4StoredDocument(html);
    const projection = partitionA4SemanticBreaks(reader.canonical, source);

    const candidate = projection.positionMap.fragments.flatMap((fragmentMap) =>
      fragmentMap.childBoundaries.map((binding) => ({ fragmentMap, binding })),
    ).find(({ fragmentMap, binding }) => {
      const fragment = projection.fragments[fragmentMap.fragmentIndex];
      if (!fragment) return false;
      const owner = projectedElement(fragment.content, binding.projectedNodeId);
      if (!owner) return false;
      const left = owner.childNodes[binding.projectedIndex - 1];
      const right = owner.childNodes[binding.projectedIndex];
      return (left instanceof HTMLBRElement)
        || (right instanceof HTMLBRElement)
        || (left instanceof HTMLElement && left.hasAttribute('data-field-ref'))
        || (right instanceof HTMLElement && right.hasAttribute('data-field-ref'));
    });

    expect(candidate).toBeDefined();
    if (!candidate) return;
    const mapped = mapA4ProjectedStructuralPoint(reader.canonical, projection, {
      fragmentIndex: candidate.fragmentMap.fragmentIndex,
      position: {
        kind: 'children',
        nodeId: candidate.binding.projectedNodeId,
        index: candidate.binding.projectedIndex,
        affinity: 'after',
      },
    });
    expect(mapped).toMatchObject({
      ...source,
      position: {
        kind: 'children',
        nodeId: candidate.binding.sourceNodeId,
        index: candidate.binding.sourceIndex,
      },
    });
  });

  it('uses revision-qualified S1 pagination instead of the synthetic legacy identity', () => {
    const html = '<p>First</p><span data-a4-break="page"></span><p>Last</p>';
    const result = paginateA4StructuralHtml(
      html,
      source,
      { measure: (candidate) => candidate.length },
      10_000,
    );
    expect(result.pages).toHaveLength(2);
    expect(result.pages[1]?.hardBreakBefore).toBe(true);
    expect(result.positionMap).toMatchObject(source);
  });

  it('keeps level-2 writes disabled after level-2 reader rollout', () => {
    expect(() => assertA4WriterCanPreserve('<p>A<span data-a4-break="page"></span>B</p>'))
      .toThrowError(expect.objectContaining({ code: ErrorCodes.UNSUPPORTED_EDITOR_FORMAT }));
  });
});

describe('W1 integrated F1 field persistence adapters', () => {
  const field = {
    id: 'field-stable-1',
    key: 'custom.note',
    label: 'Note',
    type: 'future-preserve-only-type',
    source: 'custom',
    category: 'custom',
    path: 'custom.note',
    defaultValue: 0,
    format: { pattern: 'future' },
    options: [{ value: 'A', metadata: { rank: 1 } }],
    linkedTo: 'includeNote',
    sourcePartial: 'scope-a',
    futureMetadata: { nested: ['keep', false, 0] },
  } as const;

  it('preserves field metadata and omitted required through template request schemas', () => {
    const created = createDocumentTemplateSchema.parse({
      name: 'Lossless',
      content: '<p>{{custom.note}}</p>',
      placeholders: [field],
    });
    const stored = created.placeholders[0] as Record<string, unknown>;
    expect(stored).toEqual(field);
    expect(Object.prototype.hasOwnProperty.call(stored, 'required')).toBe(false);

    const updated = updateDocumentTemplateSchema.parse({
      id: '00000000-0000-4000-8000-000000000001',
      placeholders: [stored],
    });
    expect(updated.placeholders?.[0]).toEqual(field);
  });

  it('preserves the same lossless contract through TemplatePartial validation', () => {
    const parsed = createTemplatePartialSchema.parse({
      name: 'scope-a',
      displayName: 'Scope A',
      content: '<p>{{custom.note}}</p>',
      placeholders: [field],
    });
    expect(parsed.placeholders[0]).toEqual(field);
    expect(Object.prototype.hasOwnProperty.call(parsed.placeholders[0], 'required')).toBe(false);
  });

  it('round-trips unknown metadata through the F1 registry serializer', () => {
    const scope = { kind: 'template', id: 'template-1' } as const;
    expect(preserveStoredFieldDefinitions([field], scope)).toEqual([field]);
    const registry = loadStoredFieldRegistry({ scope, definitions: [field] });
    expect(registry.definitions[0]).toMatchObject({
      persistedId: 'field-stable-1',
      storedType: 'future-preserve-only-type',
      supportedType: null,
      requiredWasExplicit: false,
    });
    expect(registry.definitions[0]?.unknownMetadata).toEqual({
      futureMetadata: field.futureMetadata,
    });
  });

  it('keeps colliding partial field keys distinct by stable owner scope', () => {
    const a = loadStoredFieldRegistry({
      scope: { kind: 'partial', id: 'partial-a' },
      definitions: [{ ...field, id: undefined, type: 'text' }],
    }).definitions[0];
    const b = loadStoredFieldRegistry({
      scope: { kind: 'partial', id: 'partial-b' },
      definitions: [{ ...field, id: undefined, type: 'text' }],
    }).definitions[0];
    expect(a?.key).toBe('custom.note');
    expect(b?.key).toBe('custom.note');
    expect(a?.scope.id).toBe('partial-a');
    expect(b?.scope.id).toBe('partial-b');
    expect(a?.identity).not.toBe(b?.identity);
  });
});
