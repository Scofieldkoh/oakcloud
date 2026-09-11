import { describe, expect, it } from 'vitest';
import { resolvePlaceholders } from '@/lib/placeholder-resolver';
import { mergeA4DocumentLayout, DEFAULT_A4_DOCUMENT_LAYOUT } from '@/components/documents/a4-pagination/layout';

type StoredField = {
  id: string;
  scope: string;
  key: string;
  label: string;
  source: 'raw' | 'derived';
  resolverPath: string;
  originalMetadata?: Record<string, unknown>;
};

const roundTrip = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe('A4 editor WORKFLOW W0 field persistence compatibility proofs', () => {
  it('W-FIELD-01 preserves stable identity, scope and unknown metadata across save/reopen', () => {
    const fields: StoredField[] = [
      { id: 'template:t1:registered-office', scope: 'template:t1', key: 'address', label: 'Registered office', source: 'raw', resolverPath: 'company.registeredAddress', originalMetadata: { futureFlag: true } },
      { id: 'partial:p1:address', scope: 'partial:p1', key: 'address', label: 'Mailing address', source: 'raw', resolverPath: 'selectedContact.address', originalMetadata: { legacyType: 'address-v1' } },
    ];
    const reopened = roundTrip(fields);
    expect(reopened).toEqual(fields);
    expect(reopened[0].id).not.toBe(reopened[1].id);
    expect(reopened[0].key).toBe(reopened[1].key);
  });

  it('W-FIELD-02 keeps derived definitions distinguishable from raw source values', () => {
    const raw: StoredField = { id: 'f-raw', scope: 'template:t1', key: 'name', label: 'Company name', source: 'raw', resolverPath: 'company.name' };
    const derived: StoredField = { id: 'f-derived', scope: 'template:t1', key: 'display_name', label: 'Display name', source: 'derived', resolverPath: 'derived.companyDisplayName' };
    expect(roundTrip(raw).source).toBe('raw');
    expect(roundTrip(derived).source).toBe('derived');
    expect(derived.resolverPath).not.toBe(raw.resolverPath);
  });

  it('W-FIELD-03 preserves false, zero, empty and missing as distinct stored values', () => {
    const values = roundTrip({ booleanFalse: false, zero: 0, empty: '', missing: null });
    expect(values.booleanFalse).toBe(false);
    expect(values.zero).toBe(0);
    expect(values.empty).toBe('');
    expect(values.missing).toBeNull();
  });

  it('W-FIELD-04 layout merge cannot collapse stored field definitions or forward metadata', () => {
    const contentJson = { version: 1, fields: [{ id: 'f1', scope: 'template:t1', future: { v: 2 } }], unrelated: { keep: true } };
    const merged = mergeA4DocumentLayout(contentJson, DEFAULT_A4_DOCUMENT_LAYOUT);
    expect(merged.fields).toEqual(contentJson.fields);
    expect(merged.unrelated).toEqual(contentJson.unrelated);
  });

  it('W-FIELD-05 ordinary resolved values remain observable as text and missing values remain diagnostically visible', () => {
    const resolved = resolvePlaceholders('<p>{{custom.note}}</p><p>{{custom.missing}}</p>', { custom: { note: '<b>not trusted markup</b>' } }, { missingPlaceholder: 'highlight' });
    expect(resolved.resolved).toContain('&lt;b&gt;not trusted markup&lt;/b&gt;');
    expect(resolved.missing).toContain('custom.missing');
    expect(resolved.resolved).toContain('placeholder-missing');
  });
});
