import { describe, expect, it } from 'vitest';
import {
  formatDocumentGenerationTitle,
  isAutoDocumentGenerationTitle,
} from '@/lib/document-generation-title';

describe('document generation titles', () => {
  it('formats the default title with the template, company, and local date', () => {
    expect(formatDocumentGenerationTitle(
      'Appointment of Corp Sec',
      'Flowmind AI Pte. Limited',
      new Date(2026, 7, 29, 12),
    )).toBe('Appointment of Corp Sec_Flowmind AI Pte. Limited_29 Aug 2026');
  });

  it('recognises generated defaults while leaving custom titles alone', () => {
    expect(isAutoDocumentGenerationTitle('Untitled - Appointment of Corp Sec', 'Appointment of Corp Sec'))
      .toBe(true);
    expect(isAutoDocumentGenerationTitle(
      'Appointment of Corp Sec_Flowmind AI Pte. Limited_29 Aug 2026',
      'Appointment of Corp Sec',
    )).toBe(true);
    expect(isAutoDocumentGenerationTitle('Board approval - August', 'Appointment of Corp Sec'))
      .toBe(false);
  });
});
