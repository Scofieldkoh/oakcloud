import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import {
  getAvailableModels,
  getAllProviderStatuses,
  getBestAvailableModel,
  getBestAvailableModelForTenant,
  getAvailableProvidersForTenant,
  PROVIDER_NAMES,
  getModelsGroupedByProvider,
  getDefaultModelId,
  AI_MODELS,
} from '@/lib/ai';
import type { AIProvider } from '@/lib/ai';

/**
 * GET /api/ai/models
 *
 * Returns available AI models and provider status.
 * Used by the frontend to populate model selector components.
 * Now connector-aware: checks both env vars AND tenant connectors.
 *
 * Query params:
 * - tenantId: Optional tenant ID for SUPER_ADMIN to check a specific tenant's providers
 */
export async function GET(request: NextRequest) {
  try {
    // Require authentication
    const session = await requireAuth();

    // Get tenantId from query params (for SUPER_ADMIN) or session
    const { searchParams } = new URL(request.url);
    const queryTenantId = searchParams.get('tenantId');

    // SUPER_ADMIN can specify a tenant, otherwise use session's tenant
    let tenantId: string | null = session.tenantId;
    if (session.isSuperAdmin && queryTenantId) {
      tenantId = queryTenantId;
    }

    // Get available providers for this tenant (includes both connectors and env vars)
    const availableProviders = await getAvailableProvidersForTenant(tenantId);

    // Get all models and mark availability based on tenant's providers
    const allModels = Object.values(AI_MODELS);
    const models = allModels.map((model) => ({
      ...model,
      available: availableProviders.includes(model.provider as AIProvider),
      providerConfigured: availableProviders.includes(model.provider as AIProvider),
    }));

    // Build provider status based on tenant's available providers
    const providerList: AIProvider[] = ['openai', 'anthropic', 'google'];
    const providers = providerList.map((provider) => ({
      provider,
      available: availableProviders.includes(provider),
      configured: availableProviders.includes(provider),
    }));

    // Get best available model for this tenant
    const bestAvailableModel = await getBestAvailableModelForTenant(tenantId);
    const configuredDefault = getDefaultModelId();
    const groupedModels = getModelsGroupedByProvider();

    // Use the configured default if it's available, otherwise use best available
    const configuredDefaultAvailable = models.find((m) => m.id === configuredDefault && m.available);
    const defaultModel = configuredDefaultAvailable
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
          available: availableProviders.includes('openai'),
        })),
        anthropic: groupedModels.anthropic.map((m) => ({
          id: m.id,
          name: m.name,
          description: m.description,
          available: availableProviders.includes('anthropic'),
        })),
        google: groupedModels.google.map((m) => ({
          id: m.id,
          name: m.name,
          description: m.description,
          available: availableProviders.includes('google'),
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
