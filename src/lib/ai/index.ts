/**
 * AI Service
 *
 * Unified interface for calling multiple AI providers (OpenAI, Anthropic, Google).
 * Provides a consistent API regardless of the underlying model.
 */

export * from './types';
export * from './models';

import type {
  AIModel,
  AIProvider,
  AIRequestOptions,
  AIResponse,
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
