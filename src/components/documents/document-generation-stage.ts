import type { Step } from '@/components/ui/stepper';

export const DOCUMENT_GENERATION_STAGES = [
  { id: 'setup', label: 'Setup' },
  { id: 'details', label: 'Details' },
  { id: 'review', label: 'Review & Generate' },
] as const satisfies readonly Step[];

export const SERVICE_AGREEMENT_GENERATION_STAGES = [
  { id: 'setup', label: 'Setup' },
  { id: 'services', label: 'Services' },
  { id: 'agreement-details', label: 'Agreement details' },
  { id: 'review', label: 'Review & Generate' },
] as const satisfies readonly Step[];

export type DocumentGenerationStageIndex = 0 | 1 | 2;

export function normalizeDocumentGenerationStage(step: number): DocumentGenerationStageIndex {
  if (!Number.isFinite(step) || step <= 1) return 0;
  if (step <= 3) return 1;
  return 2;
}

export function normalizeServiceAgreementGenerationStage(step: number): 0 | 1 | 2 | 3 {
  if (!Number.isFinite(step) || step <= 0) return 0;
  if (step >= 3) return 3;
  return step as 1 | 2;
}
