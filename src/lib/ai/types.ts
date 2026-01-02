/**
 * AI Service Types
 *
 * Shared types for the multi-provider AI service.
 */

// Supported AI providers
export type AIProvider = 'openai' | 'anthropic' | 'google';

// Supported AI models
export type AIModel =
  // OpenAI models
  | 'gpt-5.2'
  // | 'gpt-5' // Disabled: use gpt-5.2 instead
  | 'gpt-4.1'
  // Anthropic models
  | 'claude-opus-4.5'
  | 'claude-sonnet-4.5'
  // Google models
  | 'gemini-3'
  | 'gemini-3-flash';
  // | 'gemini-2.5-flash' // Disabled: use gemini-3-flash instead

// Model configuration
export interface AIModelConfig {
  id: AIModel;
  name: string;
  provider: AIProvider;
  providerModelId: string; // The actual model ID used by the provider API
  description: string;
  maxTokens: number;
  inputPricePerMillion: number; // Price per million input tokens in USD
  outputPricePerMillion: number; // Price per million output tokens in USD
  supportsJson: boolean;
  supportsVision: boolean;
  supportsTemperature?: boolean; // Whether the model supports custom temperature (default: true)
  isDefault?: boolean;
}

// Image input for vision models
export interface AIImageInput {
  /** Base64-encoded image data (without data URL prefix) */
  base64: string;
  /** MIME type of the image (e.g., 'image/png', 'image/jpeg', 'application/pdf') */
  mimeType: string;
}

// AI request options
export interface AIRequestOptions {
  model: AIModel;
  systemPrompt?: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  /** Images to include with the request (for vision models) */
  images?: AIImageInput[];
}

// AI response
export interface AIResponse {
  content: string;
  model: AIModel;
  provider: AIProvider;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  finishReason?: string;
}

// Provider availability status
export interface ProviderStatus {
  provider: AIProvider;
  available: boolean;
  configured: boolean;
  error?: string;
}

// Model availability including provider status
export interface ModelAvailability extends AIModelConfig {
  available: boolean;
  providerConfigured: boolean;
}

// Credentials for AI providers (from connectors)
export interface AICredentials {
  openai: {
    apiKey: string;
    organization?: string;
  };
  anthropic: {
    apiKey: string;
  };
  google: {
    apiKey: string;
  };
}
