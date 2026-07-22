import type { Step } from '@/components/ui/stepper';

export const DOCUMENT_GENERATION_STAGES = [
  { id: 'setup', label: 'Setup' },
  { id: 'details', label: 'Details' },
  { id: 'review', label: 'Review & Generate' },
] as const satisfies readonly Step[];

export type DocumentGenerationStageIndex = 0 | 1 | 2;

export function normalizeDocumentGenerationStage(step: number): DocumentGenerationStageIndex {
  if (!Number.isFinite(step) || step <= 1) return 0;
  if (step <= 3) return 1;
  return 2;
}
