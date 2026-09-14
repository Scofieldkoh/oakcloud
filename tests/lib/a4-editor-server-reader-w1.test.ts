/** @vitest-environment node */

import { describe, expect, it } from 'vitest';
import { serializeA4CanonicalBreakDocument } from '@/components/documents/a4-pagination/semantic-break-projection';
import { readA4StoredDocument } from '@/lib/document-editor/a4-editor-format';

describe('W1 server S1 reader environment adapter', () => {
  it('reads and serializes v2 semantic content without a browser-owned DOM', () => {
    const input = '<ol start="5"><li><p>Before<span data-a4-break="page"></span>After</p></li></ol>';
    const reader = readA4StoredDocument(input);

    expect(reader.formatLevel).toBe(2);
    expect(reader.hasSemanticBreaks).toBe(true);
    expect(serializeA4CanonicalBreakDocument(reader.canonical)).toBe(input);
  });

  it('preserves legacy top-level hard breaks through the same S1 boundary', () => {
    const input = '<p>Alpha</p><div class="page-break" data-break-type="hard"></div><p>Omega</p>';
    const reader = readA4StoredDocument(input);

    expect(reader.formatLevel).toBe(1);
    expect(reader.hasLegacyBreaks).toBe(true);
    expect(serializeA4CanonicalBreakDocument(reader.canonical)).toBe(input);
  });
});
