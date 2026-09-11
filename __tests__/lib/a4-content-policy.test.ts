import { describe, expect, it } from 'vitest';

import {
  A4_ALWAYS_REJECTED_TAGS,
  A4_CANONICAL_ATTRIBUTES,
  A4_CANONICAL_TAGS,
  A4_CONTENT_POLICY_CONTRACT,
  A4_EDITOR_DECORATION_ATTRIBUTES,
  A4_LEGACY_PRESERVE_ONLY_TAGS,
  A4_STRUCTURAL_ATTRIBUTES,
} from '@/lib/a4-content-policy';

describe('C06 F0 content-policy contract proof', () => {
  it('covers semantic structures currently lost between editor and export policies', () => {
    expect(A4_CANONICAL_TAGS).toEqual(expect.arrayContaining([
      'blockquote', 'caption', 'tfoot', 'sup', 'sub', 'img',
    ]));
    expect(A4_CANONICAL_ATTRIBUTES).toEqual(expect.arrayContaining([
      'scope', 'start', 'id', 'src', 'alt',
    ]));
  });

  it('keeps SEMANTICS-owned break attributes explicit without treating flow metadata as canonical', () => {
    expect(A4_STRUCTURAL_ATTRIBUTES).toEqual(expect.arrayContaining([
      'data-break-type', 'data-a4-break',
    ]));
    for (const attribute of A4_EDITOR_DECORATION_ATTRIBUTES) {
      expect(A4_CANONICAL_ATTRIBUTES).not.toContain(attribute);
    }
  });

  it('marks legacy images preserve-only while retaining safe semantic inline elements', () => {
    expect(A4_LEGACY_PRESERVE_ONLY_TAGS).toContain('img');
    expect(A4_LEGACY_PRESERVE_ONLY_TAGS).not.toContain('sup');
    expect(A4_LEGACY_PRESERVE_ONLY_TAGS).not.toContain('sub');
  });

  it('keeps executable/embed/form controls outside the canonical schema', () => {
    for (const tag of A4_ALWAYS_REJECTED_TAGS) {
      expect(A4_CANONICAL_TAGS).not.toContain(tag as never);
    }
  });

  it('freezes text/rich compatibility as policy data without activating it', () => {
    expect(A4_CONTENT_POLICY_CONTRACT).toMatchObject({
      plainTextResolution: 'escape-at-interpolation-boundary',
      multilineResolution: 'single-canonical-newline-conversion',
      unknownLegacyRichValue: 'preserve-source-and-block-conversion',
    });
  });
});
