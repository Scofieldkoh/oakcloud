import { describe, expect, it } from 'vitest';
import {
  DOCUMENT_GENERATION_STAGES,
  normalizeDocumentGenerationStage,
} from '@/components/documents/document-generation-stage';

describe('document generation stages', () => {
  it('defines Setup, Details, and Review & Generate', () => {
    expect(DOCUMENT_GENERATION_STAGES.map((stage) => stage.label)).toEqual([
      'Setup',
      'Details',
      'Review & Generate',
    ]);
  });

  it.each([
    [0, 0],
    [1, 0],
    [2, 1],
    [3, 1],
    [4, 2],
    [-1, 0],
    [99, 2],
  ])('maps persisted step %s to stage %s', (persisted, expected) => {
    expect(normalizeDocumentGenerationStage(persisted)).toBe(expected);
  });
});
