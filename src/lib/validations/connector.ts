/**
 * Connector Validation Schemas
 *
 * Zod schemas for validating connector-related API inputs.
 */

import { z } from 'zod';

// ============================================================================
// Enums
// ============================================================================

export const connectorTypeEnum = z.enum(['AI_PROVIDER', 'STORAGE']);
export type ConnectorType = z.infer<typeof connectorTypeEnum>;

export const connectorProviderEnum = z.enum(['OPENAI', 'ANTHROPIC', 'GOOGLE', 'ONEDRIVE']);
export type ConnectorProvider = z.infer<typeof connectorProviderEnum>;

// ============================================================================
// Provider-Specific Credential Schemas
// ============================================================================

export const openaiCredentialsSchema = z.object({
  apiKey: z.string().min(1, 'API key is required'),
  organization: z.string().optional(),
});

export const anthropicCredentialsSchema = z.object({
  apiKey: z.string().min(1, 'API key is required'),
});

export const googleCredentialsSchema = z.object({
  apiKey: z.string().min(1, 'API key is required'),
});

export const onedriveCredentialsSchema = z.object({
  clientId: z.string().min(1, 'Client ID is required'),
  clientSecret: z.string().min(1, 'Client Secret is required'),
  tenantId: z.string().min(1, 'Microsoft Tenant ID is required'),
});

export type OpenAICredentials = z.infer<typeof openaiCredentialsSchema>;
export type AnthropicCredentials = z.infer<typeof anthropicCredentialsSchema>;
export type GoogleCredentials = z.infer<typeof googleCredentialsSchema>;
export type OneDriveCredentials = z.infer<typeof onedriveCredentialsSchema>;

// Union type for all credentials
export type ConnectorCredentials =
  | OpenAICredentials
  | AnthropicCredentials
  | GoogleCredentials
  | OneDriveCredentials;

// ============================================================================
// Provider-Specific Settings Schemas
// ============================================================================

export const aiProviderSettingsSchema = z
  .object({
    defaultModel: z.string().optional(),
    maxTokens: z.number().int().min(1).max(200000).optional(),
    temperature: z.number().min(0).max(2).optional(),
  })
  .optional();

export const onedriveSettingsSchema = z
  .object({
    rootFolder: z.string().optional(), // Default folder path
    syncEnabled: z.boolean().optional(),
  })
  .optional();

// ============================================================================
// Create Connector
// ============================================================================

export const createConnectorSchema = z.object({
  tenantId: z.string().uuid('Invalid tenant ID').optional().nullable(),
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be at most 100 characters'),
  type: connectorTypeEnum,
  provider: connectorProviderEnum,
  credentials: z.record(z.unknown()),
  settings: z.record(z.unknown()).optional().nullable(),
  isEnabled: z.boolean().default(true),
  isDefault: z.boolean().default(false),
});

export type CreateConnectorInput = z.infer<typeof createConnectorSchema>;

// ============================================================================
// Update Connector
// ============================================================================

export const updateConnectorSchema = z.object({
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be at most 100 characters')
    .optional(),
  credentials: z.record(z.unknown()).optional(),
  settings: z.record(z.unknown()).optional().nullable(),
  isEnabled: z.boolean().optional(),
  isDefault: z.boolean().optional(),
});

export type UpdateConnectorInput = z.infer<typeof updateConnectorSchema>;

// ============================================================================
// Connector Search
// ============================================================================

export const connectorSearchSchema = z.object({
  tenantId: z.string().uuid('Invalid tenant ID').optional(),
  type: connectorTypeEnum.optional(),
  provider: connectorProviderEnum.optional(),
  isEnabled: z.coerce.boolean().optional(),
  includeSystem: z.coerce.boolean().default(true),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ConnectorSearchInput = z.infer<typeof connectorSearchSchema>;

// ============================================================================
// Tenant Connector Access
// ============================================================================

export const updateTenantAccessSchema = z.object({
  tenantAccess: z.array(
    z.object({
      tenantId: z.string().uuid('Invalid tenant ID'),
      isEnabled: z.boolean(),
    })
  ),
});

export type UpdateTenantAccessInput = z.infer<typeof updateTenantAccessSchema>;

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Validate credentials based on provider type
 */
export function validateCredentials(
  provider: ConnectorProvider,
  credentials: Record<string, unknown>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  switch (provider) {
    case 'OPENAI': {
      const result = openaiCredentialsSchema.safeParse(credentials);
      if (!result.success) {
        errors.push(...result.error.issues.map((i) => i.message));
      }
      break;
    }
    case 'ANTHROPIC': {
      const result = anthropicCredentialsSchema.safeParse(credentials);
      if (!result.success) {
        errors.push(...result.error.issues.map((i) => i.message));
      }
      break;
    }
    case 'GOOGLE': {
      const result = googleCredentialsSchema.safeParse(credentials);
      if (!result.success) {
        errors.push(...result.error.issues.map((i) => i.message));
      }
      break;
    }
    case 'ONEDRIVE': {
      const result = onedriveCredentialsSchema.safeParse(credentials);
      if (!result.success) {
        errors.push(...result.error.issues.map((i) => i.message));
      }
      break;
    }
    default:
      errors.push(`Unknown provider: ${provider}`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Get provider type for a given provider
 */
export function getProviderType(provider: ConnectorProvider): ConnectorType {
  switch (provider) {
    case 'OPENAI':
    case 'ANTHROPIC':
    case 'GOOGLE':
      return 'AI_PROVIDER';
    case 'ONEDRIVE':
      return 'STORAGE';
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

/**
 * Get providers for a given type
 */
export function getProvidersForType(type: ConnectorType): ConnectorProvider[] {
  switch (type) {
    case 'AI_PROVIDER':
      return ['OPENAI', 'ANTHROPIC', 'GOOGLE'];
    case 'STORAGE':
      return ['ONEDRIVE'];
    default:
      return [];
  }
}

/**
 * Get display name for provider
 */
export function getProviderDisplayName(provider: ConnectorProvider): string {
  const names: Record<ConnectorProvider, string> = {
    OPENAI: 'OpenAI',
    ANTHROPIC: 'Anthropic',
    GOOGLE: 'Google AI',
    ONEDRIVE: 'OneDrive',
  };
  return names[provider] || provider;
}

/**
 * Get display name for connector type
 */
export function getTypeDisplayName(type: ConnectorType): string {
  const names: Record<ConnectorType, string> = {
    AI_PROVIDER: 'AI Provider',
    STORAGE: 'Storage',
  };
  return names[type] || type;
}
