import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import {
  getAvailableModels,
  getAllProviderStatuses,
  getBestAvailableModel,
  PROVIDER_NAMES,
  getModelsGroupedByProvider,
  getDefaultModelId,
} from '@/lib/ai';

/**
 * GET /api/ai/models
 *
 * Returns available AI models and provider status.
 * Used by the frontend to populate model selector components.
 */
export async function GET() {
  try {
    // Require authentication
    await requireAuth();

    const models = getAvailableModels();
    const providers = getAllProviderStatuses();
    const bestAvailableModel = getBestAvailableModel();
    const configuredDefault = getDefaultModelId();
    const groupedModels = getModelsGroupedByProvider();

    // Use the configured default if it's available, otherwise use best available
    const defaultModel = models.find((m) => m.id === configuredDefault && m.available)
      ? configuredDefault
      : bestAvailableModel;

    // Format for frontend consumption
    const response = {
      models: models.map((m) => ({
        id: m.id,
        name: m.name,
        provider: m.provider,
        providerName: PROVIDER_NAMES[m.provider],
        description: m.description,
        available: m.available,
        supportsJson: m.supportsJson,
        supportsVision: m.supportsVision,
        isDefault: m.isDefault || false,
      })),
      providers: providers.map((p) => ({
        id: p.provider,
        name: PROVIDER_NAMES[p.provider],
        available: p.available,
        configured: p.configured,
      })),
      defaultModel,
      grouped: {
        openai: groupedModels.openai.map((m) => ({
          id: m.id,
          name: m.name,
          description: m.description,
          available: providers.find((p) => p.provider === 'openai')?.available || false,
        })),
        anthropic: groupedModels.anthropic.map((m) => ({
          id: m.id,
          name: m.name,
          description: m.description,
          available: providers.find((p) => p.provider === 'anthropic')?.available || false,
        })),
        google: groupedModels.google.map((m) => ({
          id: m.id,
          name: m.name,
          description: m.description,
          available: providers.find((p) => p.provider === 'google')?.available || false,
        })),
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Error fetching AI models:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
