import { describe, expect, it } from 'vitest';
import {
  deriveCompanyInitials,
  getCompanyDisplayLabel,
  normalizeCompanyAlias,
} from '@/lib/company-display-label';
import { createCompanySchema } from '@/lib/validations/company';

describe('company display labels', () => {
  it('uses every meaningful initial and removes legal suffixes', () => {
    expect(deriveCompanyInitials('Oaktree Accounting & Corporate Solution Pte. Ltd.')).toBe('OACS');
  });

  it('prefers a trimmed stored alias', () => {
    expect(getCompanyDisplayLabel({ name: 'Long Legal Name Pte Ltd', displayAlias: ' LLN ' })).toBe('LLN');
  });

  it('normalizes blank aliases to null', () => {
    expect(normalizeCompanyAlias('   ')).toBeNull();
  });

  it('rejects aliases longer than forty characters', () => {
    expect(() => createCompanySchema.parse({
      uen: '202400001A',
      name: 'Example Pte Ltd',
      displayAlias: 'X'.repeat(41),
    })).toThrow();
  });
});
