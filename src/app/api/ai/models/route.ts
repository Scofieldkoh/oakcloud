import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import {
  getBestAvailableModelForTenant,
  getAvailableProvidersForTenant,
  PROVIDER_NAMES,
  getDefaultModelId,
  AI_MODELS,
} from '@/lib/ai';
import type { AIModel, AIProvider } from '@/lib/ai';
import { resolveConnector } from '@/services/connector.service';
import { prisma } from '@/lib/prisma';

type ConnectorProvider = 'OPENAI' | 'ANTHROPIC' | 'GOOGLE' | 'OPENROUTER';

const PROVIDER_TO_CONNECTOR_PROVIDER: Record<AIProvider, ConnectorProvider> = {
  openai: 'OPENAI',
  anthropic: 'ANTHROPIC',
  google: 'GOOGLE',
  openrouter: 'OPENROUTER',
};

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

    // Resolve active connector per provider (if any), so model overrides can be applied.
    const providerList: AIProvider[] = ['openai', 'anthropic', 'google', 'openrouter'];
    const resolvedConnectors = await Promise.all(
      providerList.map(async (provider) => {
        const resolved = await resolveConnector(
          tenantId,
          'AI_PROVIDER',
          PROVIDER_TO_CONNECTOR_PROVIDER[provider]
        );
        return { provider, connectorId: resolved?.connector.id || null };
      })
    );
    const connectorIdByProvider = new Map<AIProvider, string>();
    for (const item of resolvedConnectors) {
      if (item.connectorId) {
        connectorIdByProvider.set(item.provider, item.connectorId);
      }
    }
    const mistralConnector = await resolveConnector(tenantId, 'AI_PROVIDER', 'MISTRAL');
    const mistralOcrAvailable =
      Boolean(mistralConnector) || Boolean(process.env.MISTRAL_API_KEY?.trim());

    const connectorIds = Array.from(new Set(Array.from(connectorIdByProvider.values())));
    const connectorOverrides = connectorIds.length > 0
      ? await prisma.connectorModelConfig.findMany({
          where: {
            connectorId: { in: connectorIds },
          },
          select: {
            connectorId: true,
            modelId: true,
            isEnabled: true,
          },
        })
      : [];
    const overrideByConnectorAndModel = new Map(
      connectorOverrides.map((item) => [`${item.connectorId}:${item.modelId}`, item.isEnabled])
    );

    // Get all models and mark availability based on tenant providers + connector model overrides
    const allModels = Object.values(AI_MODELS);
    const models = allModels.map((model) => ({
      ...model,
      available: (() => {
        const provider = model.provider as AIProvider;
        if (!availableProviders.includes(provider)) return false;
        const connectorId = connectorIdByProvider.get(provider);
        if (!connectorId) return true;
        const override = overrideByConnectorAndModel.get(`${connectorId}:${model.id}`);
        return override ?? true;
      })(),
      providerConfigured: availableProviders.includes(model.provider as AIProvider),
    }));

    // Build provider status based on tenant's available providers
    const providers = providerList.map((provider) => ({
      provider,
      available: availableProviders.includes(provider),
      configured: availableProviders.includes(provider),
    }));

    // Get best available model for this tenant and reconcile with connector model overrides
    const bestAvailableModel = await getBestAvailableModelForTenant(tenantId);
    const configuredDefault = getDefaultModelId();
    const availableModelIds = new Set(models.filter((m) => m.available).map((m) => m.id));

    // Prefer configured default, then best available, then first available model
    const defaultModel = (
      [configuredDefault, bestAvailableModel, ...Array.from(availableModelIds)]
        .find((modelId): modelId is AIModel => !!modelId && availableModelIds.has(modelId))
      || null
    );

    const groupedModels = {
      openai: models.filter((m) => m.provider === 'openai'),
      anthropic: models.filter((m) => m.provider === 'anthropic'),
      google: models.filter((m) => m.provider === 'google'),
      openrouter: models.filter((m) => m.provider === 'openrouter'),
    };

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
          available: m.available,
        })),
        anthropic: groupedModels.anthropic.map((m) => ({
          id: m.id,
          name: m.name,
          description: m.description,
          available: m.available,
        })),
        google: groupedModels.google.map((m) => ({
          id: m.id,
          name: m.name,
          description: m.description,
          available: m.available,
        })),
        openrouter: groupedModels.openrouter.map((m) => ({
          id: m.id,
          name: m.name,
          description: m.description,
          available: m.available,
        })),
      },
      mistralOcrAvailable,
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
