import { describe, expect, it } from 'vitest';

import {
  analyzeTemplateContent,
  extractTemplatePlaceholderKeys,
  getRequiredPartySelections,
  isCustomPlaceholder,
} from '@/lib/template-analysis';

describe('template-analysis', () => {
  it('detects singular party requirements in templates and partials', () => {
    expect(getRequiredPartySelections(
      '<p>{{selectedDirector.name}}</p>{{>signature}}',
      [{
        name: 'signature',
        content: '{{selectedContact.email}}{{selectedShareholder.phone}}',
      }],
    )).toEqual({
      director: true,
      shareholder: true,
      contact: true,
    });
  });

  it('recognises singular party roots and excludes guided letter addresses from loop requirements', () => {
    expect(analyzeTemplateContent({
      content: '{{selectedDirector.email}}{{selectedShareholder.phone}}{{selectedContact.name}}',
    }).unknownPlaceholders).toEqual([]);

    expect(extractTemplatePlaceholderKeys(
      '{{#each directors}}{{this.letterAddress}}{{/each}}',
    )).toEqual(['directors']);
  });

  describe('isCustomPlaceholder', () => {
    it('returns false for a non-custom placeholder without a key', () => {
      expect(isCustomPlaceholder({ category: 'system', source: 'system' })).toBe(false);
    });
  });
});
