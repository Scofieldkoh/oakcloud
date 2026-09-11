import { describe, expect, it } from 'vitest';

import {
  classifyFieldValue,
  createScopedFieldIdentity,
  parseFieldExpressionContract,
} from '@/lib/template-field-contract';

describe('C05 F0 field contract proof', () => {
  it.each([
    ['{{custom.note}}', 'reference', '{{custom.note}}', 'custom.note'],
    ['{{ custom.note }}', 'reference', '{{custom.note}}', 'custom.note'],
    ['{{PCASE(company.name)}}', 'modifier', '{{PCASE(company.name)}}', 'company.name'],
    ['PCASE({{company.name}})', 'modifier', 'PCASE({{company.name}})', 'company.name'],
    ['{{DESIGNATION({{selectedDirector.role}})}}', 'modifier', '{{DESIGNATION({{selectedDirector.role}})}}', 'selectedDirector.role'],
    ['{{> terms-and-conditions}}', 'partial', '{{> terms-and-conditions}}', undefined],
    ['{{#each directors}}', 'block-open', '{{#each directors}}', 'directors'],
    ['{{#with company}}', 'block-open', '{{#with company}}', 'company'],
    ['{{#if custom.enabled == "yes"}}', 'block-open', '{{#if custom.enabled == "yes"}}', 'custom.enabled'],
    ['{{#unless custom.disabled}}', 'block-open', '{{#unless custom.disabled}}', 'custom.disabled'],
    ['{{/each}}', 'block-close', '{{/each}}', undefined],
    ['{{else}}', 'else', '{{else}}', undefined],
    ['{{@number}}', 'loop-variable', '{{@number}}', undefined],
  ])('normalizes supported grammar %s', (source, kind, normalized, path) => {
    const result = parseFieldExpressionContract(source);
    expect(result).toMatchObject({ status: 'supported', kind, normalized });
    if (path) expect(result).toMatchObject({ path });
  });

  it.each([
    ['{{custom.<b>note</b>}}', 'formatted-expression'],
    ['{{ custom note }}', 'invalid-expression'],
    ['{{custom.note', 'dangling-expression'],
  ])('keeps malformed syntax visible instead of guessing: %s', (source, code) => {
    expect(parseFieldExpressionContract(source)).toEqual({
      status: 'malformed',
      code,
    });
  });

  it('does not reinterpret ordinary literal text as a field', () => {
    expect(parseFieldExpressionContract('Meeting date')).toEqual({ status: 'literal' });
  });

  it('uses owner IDs for deterministic scoped identity without display-name concatenation', () => {
    const parent = createScopedFieldIdentity({
      scope: { kind: 'template', id: 'template-1', label: 'Parent template' },
      key: 'custom.note',
    });
    const partialA = createScopedFieldIdentity({
      scope: { kind: 'partial', id: 'partial-a', label: 'Terms' },
      key: 'custom.note',
    });
    const partialB = createScopedFieldIdentity({
      scope: { kind: 'partial', id: 'partial-b', label: 'Terms copy' },
      key: 'custom.note',
    });

    expect(new Set([parent, partialA, partialB]).size).toBe(3);
    expect(partialA).toBe(createScopedFieldIdentity({
      scope: { kind: 'partial', id: 'partial-a', label: 'Renamed display label' },
      key: 'custom.note',
    }));
    expect(partialA).not.toContain('Terms');
  });

  it('prefers a persisted stable ID while retaining owner scope', () => {
    const before = createScopedFieldIdentity({
      scope: { kind: 'partial', id: 'partial-a' },
      key: 'custom.old_key',
      persistedId: 'field-123',
    });
    const afterLabelAndKeyEdit = createScopedFieldIdentity({
      scope: { kind: 'partial', id: 'partial-a' },
      key: 'custom.new_key',
      persistedId: 'field-123',
    });
    const otherScope = createScopedFieldIdentity({
      scope: { kind: 'partial', id: 'partial-b' },
      key: 'custom.new_key',
      persistedId: 'field-123',
    });

    expect(afterLabelAndKeyEdit).toBe(before);
    expect(otherScope).not.toBe(before);
  });

  it('keeps missing, empty, false, zero-like and ISO-looking text distinguishable', () => {
    expect(classifyFieldValue({ storedType: 'text', present: false, value: undefined })).toEqual({ kind: 'missing' });
    expect(classifyFieldValue({ storedType: 'text', present: true, value: '' })).toEqual({ kind: 'empty' });
    expect(classifyFieldValue({ storedType: 'boolean', present: true, value: false })).toEqual({ kind: 'boolean', value: false });
    expect(classifyFieldValue({ storedType: 'number', present: true, value: '0' })).toEqual({ kind: 'number', value: '0' });
    expect(classifyFieldValue({ storedType: 'text', present: true, value: '2026-09-11' })).toEqual({ kind: 'text', value: '2026-09-11' });
    expect(classifyFieldValue({ storedType: 'boolean', present: true, value: 'false' })).toEqual({
      kind: 'legacy',
      declaredType: 'boolean',
      value: 'false',
    });
  });

  it('preserves unsupported legacy values without pretending they are text', () => {
    expect(classifyFieldValue({ storedType: 'list', present: true, value: ['A', 'B'] })).toEqual({
      kind: 'legacy',
      declaredType: 'list',
      value: ['A', 'B'],
    });
  });
});
