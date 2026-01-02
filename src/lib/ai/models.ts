/**
 * AI Model Registry
 *
 * Configuration for all supported AI models.
 */

import type { AIModel, AIModelConfig, AIProvider } from './types';

// Model configurations
export const AI_MODELS: Record<AIModel, AIModelConfig> = {
  // OpenAI Models
  'gpt-5.2': {
    id: 'gpt-5.2',
    name: 'GPT-5.2',
    provider: 'openai',
    providerModelId: 'gpt-5.2',
    description: 'Most advanced model for coding and agentic tasks',
    maxTokens: 400000, // 400K context window
    inputPricePerMillion: 1.75,
    outputPricePerMillion: 14.0,
    supportsJson: true,
    supportsVision: true,
    supportsTemperature: false, // GPT-5.2 doesn't support custom temperature
  },
  // GPT-5 disabled - use GPT-5.2 instead (better performance, lower cost)
  // 'gpt-5': {
  //   id: 'gpt-5',
  //   name: 'GPT-5',
  //   provider: 'openai',
  //   providerModelId: 'gpt-5',
  //   description: 'Most capable OpenAI model',
  //   maxTokens: 128000,
  //   inputPricePerMillion: 5.0,
  //   outputPricePerMillion: 15.0,
  //   supportsJson: true,
  //   supportsVision: true,
  //   supportsTemperature: false,
  // },
  'gpt-4.1': {
    id: 'gpt-4.1',
    name: 'GPT-4.1',
    provider: 'openai',
    providerModelId: 'gpt-4.1',
    description: 'Fast and efficient GPT model',
    maxTokens: 128000,
    inputPricePerMillion: 2.0,
    outputPricePerMillion: 8.0,
    supportsJson: true,
    supportsVision: true,
  },

  // Anthropic Models
  'claude-opus-4.5': {
    id: 'claude-opus-4.5',
    name: 'Claude Opus 4.5',
    provider: 'anthropic',
    providerModelId: 'claude-opus-4-5-20251101',
    description: 'Most intelligent Claude model',
    maxTokens: 200000,
    inputPricePerMillion: 5.0,
    outputPricePerMillion: 25.0,
    supportsJson: true,
    supportsVision: true,
  },
  'claude-sonnet-4.5': {
    id: 'claude-sonnet-4.5',
    name: 'Claude Sonnet 4.5',
    provider: 'anthropic',
    providerModelId: 'claude-sonnet-4-5-20250929',
    description: 'Best for complex agents and coding',
    maxTokens: 200000,
    inputPricePerMillion: 3.0,
    outputPricePerMillion: 15.0,
    supportsJson: true,
    supportsVision: true,
  },

  // Google Models
  'gemini-3': {
    id: 'gemini-3',
    name: 'Gemini 3 Pro',
    provider: 'google',
    providerModelId: 'gemini-3-pro-preview',
    description: 'Most powerful Google model (preview)',
    maxTokens: 1000000,
    inputPricePerMillion: 2.5,
    outputPricePerMillion: 10.0,
    supportsJson: true,
    supportsVision: true,
  },
  'gemini-3-flash': {
    id: 'gemini-3-flash',
    name: 'Gemini 3 Flash',
    provider: 'google',
    providerModelId: 'gemini-3-flash-preview',
    description: 'Fast frontier model with strong multimodal capabilities',
    maxTokens: 1000000,
    inputPricePerMillion: 0.5,
    outputPricePerMillion: 3.0,
    supportsJson: true,
    supportsVision: true,
  },
  // Gemini 2.5 Flash disabled - use Gemini 3 Flash instead
  // 'gemini-2.5-flash': {
  //   id: 'gemini-2.5-flash',
  //   name: 'Gemini 2.5 Flash',
  //   provider: 'google',
  //   providerModelId: 'gemini-2.5-flash',
  //   description: 'Fast and cost-effective (previous gen)',
  //   maxTokens: 1000000,
  //   inputPricePerMillion: 0.15,
  //   outputPricePerMillion: 0.6,
  //   supportsJson: true,
  //   supportsVision: true,
  // },
};

// Get model config by ID
export function getModelConfig(modelId: AIModel): AIModelConfig {
  const config = AI_MODELS[modelId];
  if (!config) {
    throw new Error(`Unknown AI model: ${modelId}`);
  }
  return config;
}

// Get all models for a provider
export function getModelsByProvider(provider: AIProvider): AIModelConfig[] {
  return Object.values(AI_MODELS).filter((m) => m.provider === provider);
}

// Get all models grouped by provider
export function getModelsGroupedByProvider(): Record<AIProvider, AIModelConfig[]> {
  return {
    openai: getModelsByProvider('openai'),
    anthropic: getModelsByProvider('anthropic'),
    google: getModelsByProvider('google'),
  };
}

// Get the default model (checks env variable first, then falls back to code default)
export function getDefaultModel(): AIModelConfig {
  // Check for environment variable override
  const envDefault = process.env.DEFAULT_AI_MODEL as AIModel | undefined;
  if (envDefault && AI_MODELS[envDefault]) {
    return AI_MODELS[envDefault];
  }

  // Fall back to code-defined default
  const defaultModel = Object.values(AI_MODELS).find((m) => m.isDefault);
  return defaultModel || AI_MODELS['gpt-5.2'];
}

// Get the default model ID (for frontend)
export function getDefaultModelId(): AIModel {
  return getDefaultModel().id;
}

// Get all model IDs
export function getAllModelIds(): AIModel[] {
  return Object.keys(AI_MODELS) as AIModel[];
}

// Provider display names
export const PROVIDER_NAMES: Record<AIProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
};

// Provider icons (for UI)
export const PROVIDER_ICONS: Record<AIProvider, string> = {
  openai: '🤖',
  anthropic: '🔮',
  google: '✨',
};

/**
 * Calculate estimated cost for AI usage
 * @param modelId - The model ID
 * @param inputTokens - Number of input tokens
 * @param outputTokens - Number of output tokens
 * @returns Estimated cost in USD
 */
export function calculateCost(
  modelId: AIModel,
  inputTokens: number,
  outputTokens: number
): number {
  const config = AI_MODELS[modelId];
  if (!config) return 0;

  const inputCost = (inputTokens / 1_000_000) * config.inputPricePerMillion;
  const outputCost = (outputTokens / 1_000_000) * config.outputPricePerMillion;

  return inputCost + outputCost;
}

/**
 * Format cost for display (always 4 decimal places)
 * @param cost - Cost in USD
 * @returns Formatted cost string
 */
export function formatCost(cost: number): string {
  return `$${cost.toFixed(4)}`;
}
