import {
  generationSessionStateSchema,
  type GenerationSessionState,
} from '@/lib/validations/generated-document';

export interface GenerationSessionEnvelope {
  id: string;
  savedAt: string;
  state: GenerationSessionState;
}

export function readActiveGenerationSession(metadata: unknown): GenerationSessionState | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }

  const result = generationSessionStateSchema.safeParse(
    (metadata as Record<string, unknown>).generationSession,
  );
  return result.success ? result.data : null;
}

export function isActiveGenerationSessionMetadata(metadata: unknown): boolean {
  return readActiveGenerationSession(metadata) !== null;
}
