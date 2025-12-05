/**
 * OpenAI Provider
 *
 * Implementation for OpenAI GPT models.
 */

import type { AIRequestOptions, AIResponse, AICredentials } from '../types';
import { getModelConfig } from '../models';

// Lazy load OpenAI SDK to reduce initial bundle size
let openaiInstance: import('openai').default | null = null;

async function getOpenAI(credentials?: AICredentials['openai']) {
  // If custom credentials provided, create a new instance
  if (credentials?.apiKey) {
    const OpenAI = (await import('openai')).default;
    return new OpenAI({
      apiKey: credentials.apiKey,
      // Only pass organization if it has a non-empty value
      ...(credentials.organization ? { organization: credentials.organization } : {}),
    });
  }

  // Fall back to singleton with env var
  if (!openaiInstance) {
    const OpenAI = (await import('openai')).default;
    openaiInstance = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openaiInstance;
}

/**
 * Check if OpenAI is configured (via env var)
 */
export function isOpenAIConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}


/**
 * Call OpenAI API (supports vision)
 * @param options - Request options
 * @param credentials - Optional custom credentials (from connector)
 */
export async function callOpenAI(
  options: AIRequestOptions,
  credentials?: AICredentials['openai']
): Promise<AIResponse> {
  // Allow either env var or provided credentials
  if (!isOpenAIConfigured() && !credentials?.apiKey) {
    throw new Error('OpenAI API key not configured');
  }

  const modelConfig = getModelConfig(options.model);
  if (modelConfig.provider !== 'openai') {
    throw new Error(`Model ${options.model} is not an OpenAI model`);
  }

  const openai = await getOpenAI(credentials);

  // We use 'any' for messages to avoid complex SDK type gymnastics while ensuring runtime correctness
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = [];

  if (options.systemPrompt) {
    messages.push({ role: 'system', content: options.systemPrompt });
  }

  // Build user message content (text + optional images/files)
  if (options.images && options.images.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const contentParts: any[] = [];

    // Add images/files first
    for (const image of options.images) {
      if (image.mimeType === 'application/pdf') {
        // PDFs use file type with base64 data (supported since March 2025)
        contentParts.push({
          type: 'file',
          file: {
            filename: 'document.pdf',
            file_data: `data:application/pdf;base64,${image.base64}`,
          },
        });
      } else {
        // Images use image_url type
        contentParts.push({
          type: 'image_url',
          image_url: {
            url: `data:${image.mimeType};base64,${image.base64}`,
            detail: 'high',
          },
        });
      }
    }

    // Add text prompt
    contentParts.push({ type: 'text', text: options.userPrompt });

    messages.push({ role: 'user', content: contentParts });
  } else {
    messages.push({ role: 'user', content: options.userPrompt });
  }

  const response = await openai.chat.completions.create({
    model: modelConfig.providerModelId,
    messages,
    temperature: options.temperature ?? 0.1,
    max_tokens: options.maxTokens,
    ...(options.jsonMode && { response_format: { type: 'json_object' } }),
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No response from OpenAI');
  }

  return {
    content,
    model: options.model,
    provider: 'openai',
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
