/**
 * OpenRouter Provider
 *
 * Implementation for OpenRouter models using the OpenAI-compatible API.
 * Uses the OpenAI SDK with a custom baseURL.
 */

import type { AIRequestOptions, AIResponse, AICredentials } from '../types';
import { getModelConfig } from '../models';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

// Lazy-loaded singleton for env-var based calls
let openrouterInstance: import('openai').default | null = null;

async function getOpenRouter(credentials?: AICredentials['openrouter']) {
  // If custom credentials provided, create a new instance
  if (credentials?.apiKey) {
    const OpenAI = (await import('openai')).default;
    return new OpenAI({
      apiKey: credentials.apiKey,
      baseURL: OPENROUTER_BASE_URL,
      defaultHeaders: {
        'HTTP-Referer': process.env.OPENROUTER_SITE_URL ?? 'https://localhost',
        'X-Title': process.env.OPENROUTER_APP_NAME ?? 'OakCloud',
      },
    });
  }

  // Fall back to singleton with env var
  if (!openrouterInstance) {
    const OpenAI = (await import('openai')).default;
    openrouterInstance = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: OPENROUTER_BASE_URL,
      defaultHeaders: {
        'HTTP-Referer': process.env.OPENROUTER_SITE_URL ?? 'https://localhost',
        'X-Title': process.env.OPENROUTER_APP_NAME ?? 'OakCloud',
      },
    });
  }
  return openrouterInstance;
}

/**
 * Check if OpenRouter is configured (via env var)
 */
export function isOpenRouterConfigured(): boolean {
  return !!process.env.OPENROUTER_API_KEY;
}

/**
 * Call OpenRouter API (supports vision)
 * @param options - Request options
 * @param credentials - Optional custom credentials (from connector)
 */
export async function callOpenRouter(
  options: AIRequestOptions,
  credentials?: AICredentials['openrouter']
): Promise<AIResponse> {
  if (!isOpenRouterConfigured() && !credentials?.apiKey) {
    throw new Error('OpenRouter API key not configured');
  }

  const modelConfig = getModelConfig(options.model);
  if (modelConfig.provider !== 'openrouter') {
    throw new Error(`Model ${options.model} is not an OpenRouter model`);
  }

  const client = await getOpenRouter(credentials);

  // We use 'any' for messages to avoid complex SDK type gymnastics while ensuring runtime correctness
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = [];

  if (options.systemPrompt) {
    messages.push({ role: 'system', content: options.systemPrompt });
  } else if (options.jsonMode) {
    messages.push({ role: 'system', content: 'You are a helpful assistant. Respond with valid JSON.' });
  }

  if (options.images && options.images.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const contentParts: any[] = [];

    for (const image of options.images) {
      contentParts.push({
        type: 'image_url',
        image_url: {
          url: `data:${image.mimeType};base64,${image.base64}`,
          detail: 'high',
        },
      });
    }

    contentParts.push({ type: 'text', text: options.userPrompt });
    messages.push({ role: 'user', content: contentParts });
  } else {
    messages.push({ role: 'user', content: options.userPrompt });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const requestOptions: any = {
    model: modelConfig.providerModelId,
    messages,
    max_tokens: options.maxTokens,
    ...(options.jsonMode &&
      modelConfig.supportsJsonResponseFormat !== false && {
        response_format: { type: 'json_object' },
      }),
  };

  if (modelConfig.supportsTemperature !== false) {
    requestOptions.temperature = options.temperature ?? 0.1;
  }

  let response;
  try {
    response = await client.chat.completions.create(requestOptions);
  } catch (err: unknown) {
    // Log full error details for debugging OpenRouter provider errors
    const apiErr = err as { status?: number; message?: string; error?: unknown };
    console.error('[OpenRouter] API error:', {
      model: modelConfig.providerModelId,
      status: apiErr.status,
      message: apiErr.message,
      error: apiErr.error,
      requestOptions: { ...requestOptions, messages: `[${requestOptions.messages?.length} messages]` },
    });
    throw err;
  }

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No response from OpenRouter');
  }

  return {
    content,
    model: options.model,
    provider: 'openrouter',
    usage: response.usage
      ? {
          inputTokens: response.usage.prompt_tokens,
          outputTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens,
        }
      : undefined,
    finishReason: response.choices[0]?.finish_reason ?? undefined,
  };
}
