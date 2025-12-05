/**
 * AI Service
 *
 * Unified interface for calling multiple AI providers (OpenAI, Anthropic, Google).
 * Provides a consistent API regardless of the underlying model.
 *
 * Supports two modes:
 * 1. Environment-based: Uses API keys from environment variables
 * 2. Connector-based: Uses credentials from database connectors (tenant-aware)
 */

export * from './types';
export * from './models';

import type {
  AIModel,
  AIProvider,
  AIRequestOptions,
  AIResponse,
  AICredentials,
  ModelAvailability,
  ProviderStatus,
} from './types';
import { AI_MODELS, getModelConfig, getDefaultModel } from './models';
import { callOpenAI, isOpenAIConfigured } from './providers/openai';
import { callAnthropic, isAnthropicConfigured } from './providers/anthropic';
import { callGoogle, isGoogleConfigured } from './providers/google';

/**
 * Check provider configuration status
 */
export function getProviderStatus(provider: AIProvider): ProviderStatus {
  switch (provider) {
    case 'openai':
      return {
        provider: 'openai',
        available: isOpenAIConfigured(),
        configured: isOpenAIConfigured(),
      };
    case 'anthropic':
      return {
        provider: 'anthropic',
        available: isAnthropicConfigured(),
        configured: isAnthropicConfigured(),
      };
    case 'google':
      return {
        provider: 'google',
        available: isGoogleConfigured(),
        configured: isGoogleConfigured(),
      };
    default:
      return {
        provider,
        available: false,
        configured: false,
        error: `Unknown provider: ${provider}`,
      };
  }
}

/**
 * Get all provider statuses
 */
export function getAllProviderStatuses(): ProviderStatus[] {
  return [
    getProviderStatus('openai'),
    getProviderStatus('anthropic'),
    getProviderStatus('google'),
  ];
}

/**
 * Get available models with their availability status
 */
export function getAvailableModels(): ModelAvailability[] {
  return Object.values(AI_MODELS).map((model) => {
    const providerStatus = getProviderStatus(model.provider);
    return {
      ...model,
      available: providerStatus.available,
      providerConfigured: providerStatus.configured,
    };
  });
}

/**
 * Get only models that are currently usable (provider is configured)
 */
export function getUsableModels(): ModelAvailability[] {
  return getAvailableModels().filter((m) => m.available);
}

/**
 * Check if a specific model is available
 */
export function isModelAvailable(modelId: AIModel): boolean {
  const model = AI_MODELS[modelId];
  if (!model) return false;
  return getProviderStatus(model.provider).available;
}

/**
 * Get the best available model (prefers default if available)
 */
export function getBestAvailableModel(): AIModel | null {
  // First, try the default model
  const defaultModel = getDefaultModel();
  if (isModelAvailable(defaultModel.id)) {
    return defaultModel.id;
  }

  // Otherwise, return the first available model
  const usableModels = getUsableModels();
  if (usableModels.length > 0) {
    return usableModels[0].id;
  }

  return null;
}

/**
 * Main AI call function - routes to the appropriate provider
 */
export async function callAI(options: AIRequestOptions): Promise<AIResponse> {
  const modelConfig = getModelConfig(options.model);

  // Check if the provider is configured
  const providerStatus = getProviderStatus(modelConfig.provider);
  if (!providerStatus.configured) {
    throw new Error(
      `${modelConfig.provider.charAt(0).toUpperCase() + modelConfig.provider.slice(1)} API key not configured. ` +
        `Please set the appropriate environment variable.`
    );
  }

  // Route to the appropriate provider
  switch (modelConfig.provider) {
    case 'openai':
      return callOpenAI(options);
    case 'anthropic':
      return callAnthropic(options);
    case 'google':
      return callGoogle(options);
    default:
      throw new Error(`Unknown provider: ${modelConfig.provider}`);
  }
}

/**
 * Convenience function for JSON extraction tasks
 */
export async function extractJSON<T = unknown>(
  options: Omit<AIRequestOptions, 'jsonMode'>
): Promise<{ data: T; response: AIResponse }> {
  const response = await callAI({
    ...options,
    jsonMode: true,
  });

  try {
    const data = JSON.parse(response.content) as T;
    return { data, response };
  } catch (error) {
    throw new Error(
      `Failed to parse AI response as JSON: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Create a preconfigured AI caller for a specific use case
 */
export function createAICaller(defaultOptions: Partial<AIRequestOptions>) {
  return async function call(options: Omit<AIRequestOptions, 'model'> & { model?: AIModel }) {
    const mergedOptions: AIRequestOptions = {
      ...defaultOptions,
      ...options,
      model: options.model || defaultOptions.model || getBestAvailableModel() || 'gpt-4.1',
    };
    return callAI(mergedOptions);
  };
}

// ============================================================================
// Connector-aware AI calls (tenant-aware using database connectors)
// ============================================================================

/**
 * Map AI provider name to connector provider enum value
 */
function mapProviderToConnectorProvider(provider: AIProvider): 'OPENAI' | 'ANTHROPIC' | 'GOOGLE' {
  switch (provider) {
    case 'openai':
      return 'OPENAI';
    case 'anthropic':
      return 'ANTHROPIC';
    case 'google':
      return 'GOOGLE';
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

/**
 * Options for connector-aware AI calls
 */
export interface ConnectorAIOptions extends AIRequestOptions {
  /** Tenant ID for connector resolution (null for system-level calls) */
  tenantId: string | null;
  /** User ID who triggered the call (for usage tracking) */
  userId?: string | null;
  /** Preferred provider (if not specified, uses model's default provider) */
  preferredProvider?: AIProvider;
  /** Operation type for usage tracking (e.g., 'bizfile_extraction') */
  operation?: string;
  /** Additional metadata for usage tracking */
  usageMetadata?: Record<string, unknown>;
}

/**
 * Call AI using connector credentials (tenant-aware)
 *
 * Resolution order:
 * 1. Tenant connector for the provider → use if exists & enabled
 * 2. System connector for the provider → use if exists & enabled & tenant has access
 * 3. Fall back to environment variables
 * 4. Throw error if no provider available
 */
export async function callAIWithConnector(options: ConnectorAIOptions): Promise<AIResponse> {
  // Lazy import to avoid circular dependencies
  const { resolveConnector } = await import('@/services/connector.service');
  const { logConnectorUsage } = await import('@/services/connector-usage.service');

  const modelConfig = getModelConfig(options.model);
  const provider = options.preferredProvider || modelConfig.provider;
  const connectorProvider = mapProviderToConnectorProvider(provider);

  // Try to resolve a connector for this tenant/provider
  const resolved = await resolveConnector(options.tenantId, 'AI_PROVIDER', connectorProvider);

  if (resolved) {
    // Credentials are already decrypted by resolveConnector
    const credentials = resolved.connector.credentials as Record<string, unknown>;
    const startTime = Date.now();
    let response: AIResponse;
    let error: Error | null = null;

    try {
      switch (provider) {
        case 'openai':
          response = await callOpenAI(options, {
            apiKey: credentials.apiKey as string,
            organization: credentials.organization as string | undefined,
          });
          break;
        case 'anthropic':
          response = await callAnthropic(options, {
            apiKey: credentials.apiKey as string,
          });
          break;
        case 'google':
          response = await callGoogle(options, {
            apiKey: credentials.apiKey as string,
          });
          break;
        default:
          throw new Error(`Unknown provider: ${provider}`);
      }
    } catch (err) {
      error = err instanceof Error ? err : new Error(String(err));
      throw error;
    } finally {
      const latencyMs = Date.now() - startTime;

      // Log usage (non-blocking)
      logConnectorUsage({
        connectorId: resolved.connector.id,
        tenantId: options.tenantId,
        userId: options.userId,
        model: options.model,
        provider,
        inputTokens: response?.usage?.inputTokens ?? 0,
        outputTokens: response?.usage?.outputTokens ?? 0,
        totalTokens: response?.usage?.totalTokens ?? 0,
        latencyMs,
        operation: options.operation,
        success: !error,
        errorMessage: error?.message,
        metadata: options.usageMetadata,
      }).catch((err) => {
        console.error('Failed to log connector usage:', err);
      });
    }

    return response!;
  }

  // No connector found, fall back to environment variables
  const providerStatus = getProviderStatus(provider);
  if (!providerStatus.configured) {
    throw new Error(
      `No AI provider available. ` +
        `No ${connectorProvider} connector configured for this tenant, ` +
        `and no environment variable fallback is set.`
    );
  }

  // Use environment-based call (no usage tracking for env-based calls)
  return callAI(options);
}

/**
 * Get available AI providers for a tenant
 * Returns providers that have either:
 * 1. A tenant-specific connector
 * 2. A system connector with tenant access
 * 3. Environment variable configuration
 */
export async function getAvailableProvidersForTenant(
  tenantId: string | null
): Promise<AIProvider[]> {
  const { getAvailableConnectors } = await import('@/services/connector.service');

  const availableProviders = new Set<AIProvider>();

  // Check connector-based providers
  try {
    const resolvedConnectors = await getAvailableConnectors(tenantId, 'AI_PROVIDER');

    for (const resolved of resolvedConnectors) {
      switch (resolved.connector.provider) {
        case 'OPENAI':
          availableProviders.add('openai');
          break;
        case 'ANTHROPIC':
          availableProviders.add('anthropic');
          break;
        case 'GOOGLE':
          availableProviders.add('google');
          break;
      }
    }
  } catch (error) {
    console.error('[getAvailableProvidersForTenant] Error getting connectors:', error);
  }

  // Check environment-based providers as fallback
  if (isOpenAIConfigured()) availableProviders.add('openai');
  if (isAnthropicConfigured()) availableProviders.add('anthropic');
  if (isGoogleConfigured()) availableProviders.add('google');

  return Array.from(availableProviders);
}

/**
 * Check if a specific provider is available for a tenant
 */
export async function isProviderAvailableForTenant(
  tenantId: string | null,
  provider: AIProvider
): Promise<boolean> {
  const availableProviders = await getAvailableProvidersForTenant(tenantId);
  return availableProviders.includes(provider);
}

/**
 * Get the best available model for a tenant
 * Checks both connector and environment configurations
 */
export async function getBestAvailableModelForTenant(
  tenantId: string | null
): Promise<AIModel | null> {
  const availableProviders = await getAvailableProvidersForTenant(tenantId);

  if (availableProviders.length === 0) {
    return null;
  }

  // First, try the default model if its provider is available
  const defaultModel = getDefaultModel();
  if (availableProviders.includes(defaultModel.provider)) {
    return defaultModel.id;
  }

  // Otherwise, return the first model from an available provider
  const usableModels = Object.values(AI_MODELS).filter((model) =>
    availableProviders.includes(model.provider)
  );

  if (usableModels.length > 0) {
    return usableModels[0].id;
  }

  return null;
}
