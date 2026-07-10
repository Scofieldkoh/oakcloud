import { describe, expect, it } from 'vitest';

import { isCustomPlaceholder } from '@/lib/template-analysis';

describe('template-analysis', () => {
  describe('isCustomPlaceholder', () => {
    it('returns false for a non-custom placeholder without a key', () => {
      expect(isCustomPlaceholder({ category: 'system', source: 'system' })).toBe(false);
    });
  });
});
