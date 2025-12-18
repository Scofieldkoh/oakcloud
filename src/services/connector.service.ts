/**
 * Connector Service
 *
 * Business logic for connector management including CRUD operations,
 * credential encryption, connection testing, and resolution logic.
 */

import { prisma } from '@/lib/prisma';
import { Prisma } from '@/generated/prisma';
import type { Connector, ConnectorType, ConnectorProvider } from '@/generated/prisma';
import { encrypt, decrypt, maskSensitive } from '@/lib/encryption';
import { createAuditLog, computeChanges } from '@/lib/audit';
import type {
  CreateConnectorInput,
  UpdateConnectorInput,
  ConnectorSearchInput,
  UpdateTenantAccessInput,
} from '@/lib/validations/connector';
import { validateCredentials } from '@/lib/validations/connector';

// ============================================================================
// Types
// ============================================================================

export interface ConnectorWithDecryptedCredentials extends Omit<Connector, 'credentials'> {
  credentials: Record<string, unknown>;
}

export interface ConnectorWithMaskedCredentials extends Omit<Connector, 'credentials'> {
  credentials: Record<string, unknown>;
  credentialsMasked: boolean;
}

export interface ResolvedConnector {
  connector: ConnectorWithDecryptedCredentials;
  source: 'tenant' | 'system';
}

export interface TenantAwareParams {
  tenantId?: string | null;
  userId: string;
  isSuperAdmin: boolean;
}

export interface TenantAccessEntry {
  tenantId: string;
  tenantName: string;
  isEnabled: boolean;
}

export interface TestResult {
  success: boolean;
  error?: string;
  latencyMs?: number;
}

// Fields tracked for audit logging
const TRACKED_FIELDS = ['name', 'isEnabled', 'isDefault', 'settings'];

// ============================================================================
// Create Connector
// ============================================================================

export async function createConnector(
  data: CreateConnectorInput,
  params: TenantAwareParams
): Promise<Connector> {
  const { userId, isSuperAdmin } = params;

  // Only SUPER_ADMIN can create system connectors (tenantId = null)
  if (data.tenantId === null && !isSuperAdmin) {
    throw new Error('Only super admins can create system connectors');
  }

  // Validate credentials for provider
  const credentialValidation = validateCredentials(
    data.provider as ConnectorProvider,
    data.credentials
  );
  if (!credentialValidation.valid) {
    throw new Error(`Invalid credentials: ${credentialValidation.errors.join(', ')}`);
  }

  // Check for duplicate provider within scope
  const existing = await prisma.connector.findFirst({
    where: {
      tenantId: data.tenantId ?? null,
      provider: data.provider as ConnectorProvider,
      deletedAt: null,
    },
  });

  if (existing) {
    throw new Error(`A ${data.provider} connector already exists in this scope`);
  }

  // Encrypt credentials
  const encryptedCredentials = encrypt(JSON.stringify(data.credentials));

  // If setting as default, unset other defaults for same type/scope
  if (data.isDefault) {
    await prisma.connector.updateMany({
      where: {
        tenantId: data.tenantId ?? null,
        type: data.type as ConnectorType,
        isDefault: true,
        deletedAt: null,
      },
      data: { isDefault: false },
    });
  }

  const connector = await prisma.connector.create({
    data: {
      tenantId: data.tenantId ?? null,
      name: data.name,
      type: data.type as ConnectorType,
      provider: data.provider as ConnectorProvider,
      credentials: encryptedCredentials,
      settings: data.settings ? (data.settings as Prisma.InputJsonValue) : Prisma.JsonNull,
      isEnabled: data.isEnabled ?? true,
      isDefault: data.isDefault ?? false,
    },
  });

  await createAuditLog({
    tenantId: data.tenantId ?? undefined,
    userId,
    action: 'CONNECTOR_CREATED',
    entityType: 'Connector',
    entityId: connector.id,
    entityName: connector.name,
    summary: `Created ${data.provider} connector "${connector.name}"${data.tenantId === null ? ' (system)' : ''}`,
    changeSource: 'MANUAL',
    metadata: {
      type: data.type,
      provider: data.provider,
      isSystem: data.tenantId === null,
    },
  });

  return connector;
}

// ============================================================================
// Update Connector
// ============================================================================

export async function updateConnector(
  id: string,
  data: UpdateConnectorInput,
  params: TenantAwareParams
): Promise<Connector> {
  const { tenantId, userId, isSuperAdmin } = params;

  const existing = await prisma.connector.findFirst({
    where: { id, deletedAt: null },
  });

  if (!existing) {
    throw new Error('Connector not found');
  }

  // Access control
  if (existing.tenantId === null && !isSuperAdmin) {
    throw new Error('Only super admins can modify system connectors');
  }
  if (existing.tenantId !== null && existing.tenantId !== tenantId && !isSuperAdmin) {
    throw new Error('Access denied');
  }

  const updateData: Prisma.ConnectorUpdateInput = {};

  if (data.name !== undefined) updateData.name = data.name;
  if (data.settings !== undefined) {
    updateData.settings = data.settings ? (data.settings as Prisma.InputJsonValue) : Prisma.JsonNull;
  }
  if (data.isEnabled !== undefined) updateData.isEnabled = data.isEnabled;

  // Handle credentials update
  if (data.credentials !== undefined) {
    // Validate new credentials
    const credentialValidation = validateCredentials(
      existing.provider,
      data.credentials
    );
    if (!credentialValidation.valid) {
      throw new Error(`Invalid credentials: ${credentialValidation.errors.join(', ')}`);
    }
    updateData.credentials = encrypt(JSON.stringify(data.credentials));
  }

  // Handle default flag
  if (data.isDefault === true) {
    await prisma.connector.updateMany({
      where: {
        tenantId: existing.tenantId,
        type: existing.type,
        isDefault: true,
        deletedAt: null,
        NOT: { id },
      },
      data: { isDefault: false },
    });
    updateData.isDefault = true;
  } else if (data.isDefault === false) {
    updateData.isDefault = false;
  }

  const connector = await prisma.connector.update({
    where: { id },
    data: updateData,
  });

  // Compute and log changes (excluding credentials for security)
  const changes = computeChanges(
    existing as unknown as Record<string, unknown>,
    data as Record<string, unknown>,
    TRACKED_FIELDS
  );

  if (changes || data.credentials) {
    // Log enable/disable as separate action
    const action =
      data.isEnabled === true
        ? 'CONNECTOR_ENABLED'
        : data.isEnabled === false
          ? 'CONNECTOR_DISABLED'
          : 'CONNECTOR_UPDATED';

    await createAuditLog({
      tenantId: existing.tenantId ?? undefined,
      userId,
      action,
      entityType: 'Connector',
      entityId: connector.id,
      entityName: connector.name,
      summary: `Updated connector "${connector.name}"`,
      changeSource: 'MANUAL',
      changes: changes ?? undefined,
      metadata: {
        credentialsUpdated: data.credentials !== undefined,
      },
    });
  }

  return connector;
}

// ============================================================================
// Delete Connector
// ============================================================================

export async function deleteConnector(
  id: string,
  params: TenantAwareParams,
  reason: string
): Promise<Connector> {
  const { tenantId, userId, isSuperAdmin } = params;

  const existing = await prisma.connector.findFirst({
    where: { id, deletedAt: null },
  });

  if (!existing) {
    throw new Error('Connector not found');
  }

  // Access control
  if (existing.tenantId === null && !isSuperAdmin) {
    throw new Error('Only super admins can delete system connectors');
  }
  if (existing.tenantId !== null && existing.tenantId !== tenantId && !isSuperAdmin) {
    throw new Error('Access denied');
  }

  const connector = await prisma.connector.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  await createAuditLog({
    tenantId: existing.tenantId ?? undefined,
    userId,
    action: 'CONNECTOR_DELETED',
    entityType: 'Connector',
    entityId: connector.id,
    entityName: connector.name,
    summary: `Deleted connector "${connector.name}"`,
    changeSource: 'MANUAL',
    reason,
    metadata: {
      provider: existing.provider,
      isSystem: existing.tenantId === null,
    },
  });

  return connector;
}

// ============================================================================
// Get Connector
// ============================================================================

export async function getConnectorById(
  id: string,
  params: TenantAwareParams
): Promise<ConnectorWithDecryptedCredentials | null> {
  const { tenantId, isSuperAdmin } = params;

  const connector = await prisma.connector.findFirst({
    where: { id, deletedAt: null },
  });

  if (!connector) return null;

  // Access control
  if (connector.tenantId === null && !isSuperAdmin) {
    // TENANT_ADMIN can see system connectors but not credentials
    throw new Error('Access denied to system connector credentials');
  }
  if (connector.tenantId !== null && connector.tenantId !== tenantId && !isSuperAdmin) {
    throw new Error('Access denied');
  }

  return {
    ...connector,
    credentials: JSON.parse(decrypt(connector.credentials)),
  };
}

/**
 * Get connector with masked credentials (safe for non-owners)
 */
export async function getConnectorWithMaskedCredentials(
  id: string,
  params: TenantAwareParams
): Promise<ConnectorWithMaskedCredentials | null> {
  const { tenantId, isSuperAdmin } = params;

  const connector = await prisma.connector.findFirst({
    where: { id, deletedAt: null },
  });

  if (!connector) return null;

  // Access control - can view but not necessarily see full credentials
  const canSeeFullCredentials =
    isSuperAdmin ||
    (connector.tenantId !== null && connector.tenantId === tenantId);

  let credentials: Record<string, unknown>;
  let credentialsMasked = true;

  if (canSeeFullCredentials) {
    credentials = JSON.parse(decrypt(connector.credentials));
    credentialsMasked = false;
  } else {
    // Mask sensitive values
    const decrypted = JSON.parse(decrypt(connector.credentials)) as Record<string, unknown>;
    credentials = {};
    for (const [key, value] of Object.entries(decrypted)) {
      if (typeof value === 'string') {
        credentials[key] = maskSensitive(value);
      } else {
        credentials[key] = value;
      }
    }
  }

  return {
    ...connector,
    credentials,
    credentialsMasked,
  };
}

// ============================================================================
// Search Connectors
// ============================================================================

export async function searchConnectors(
  searchParams: ConnectorSearchInput,
  params: TenantAwareParams
): Promise<{
  connectors: ConnectorWithMaskedCredentials[];
  total: number;
  page: number;
  limit: number;
}> {
  const { tenantId, isSuperAdmin } = params;

  const where: Prisma.ConnectorWhereInput = {
    deletedAt: null,
  };

  // Build scope filter
  if (isSuperAdmin) {
    // SUPER_ADMIN can see all
    if (searchParams.tenantId) {
      // Filter to specific tenant + system connectors
      if (searchParams.includeSystem) {
        where.OR = [{ tenantId: searchParams.tenantId }, { tenantId: null }];
      } else {
        where.tenantId = searchParams.tenantId;
      }
    }
    // If no tenantId filter, show all connectors
  } else {
    // TENANT_ADMIN can see their own + system
    if (searchParams.includeSystem) {
      where.OR = [{ tenantId: tenantId }, { tenantId: null }];
    } else {
      where.tenantId = tenantId;
    }
  }

  if (searchParams.type) where.type = searchParams.type as ConnectorType;
  if (searchParams.provider) where.provider = searchParams.provider as ConnectorProvider;
  if (searchParams.isEnabled !== undefined) where.isEnabled = searchParams.isEnabled;

  const skip = (searchParams.page - 1) * searchParams.limit;

  const [connectors, total] = await Promise.all([
    prisma.connector.findMany({
      where,
      orderBy: [{ tenantId: 'asc' }, { type: 'asc' }, { name: 'asc' }],
      skip,
      take: searchParams.limit,
    }),
    prisma.connector.count({ where }),
  ]);

  // Map to masked credentials
  const connectorsWithMasked: ConnectorWithMaskedCredentials[] = connectors.map((connector) => {
    const canSeeFullCredentials =
      isSuperAdmin ||
      (connector.tenantId !== null && connector.tenantId === tenantId);

    let credentials: Record<string, unknown>;

    if (canSeeFullCredentials) {
      credentials = JSON.parse(decrypt(connector.credentials));
    } else {
      // Mask sensitive values for system connectors viewed by tenant admin
      const decrypted = JSON.parse(decrypt(connector.credentials)) as Record<string, unknown>;
      credentials = {};
      for (const [key, value] of Object.entries(decrypted)) {
        if (typeof value === 'string') {
          credentials[key] = maskSensitive(value);
        } else {
          credentials[key] = value;
        }
      }
    }

    return {
      ...connector,
      credentials,
      credentialsMasked: !canSeeFullCredentials,
    };
  });

  return {
    connectors: connectorsWithMasked,
    total,
    page: searchParams.page,
    limit: searchParams.limit,
  };
}

// ============================================================================
// Connector Resolution (Tenant -> System fallback)
// ============================================================================

/**
 * Resolve the best available connector for a given type/provider
 *
 * Resolution logic:
 * 1. Check tenant-specific connector → use if exists & enabled
 * 2. Check TenantConnectorAccess for system connector → blocked if isEnabled=false
 * 3. Check system connector → use if exists & enabled
 * 4. No connector → return null
 */
export async function resolveConnector(
  tenantId: string | null,
  type: ConnectorType,
  provider?: ConnectorProvider
): Promise<ResolvedConnector | null> {
  // Step 1: Try tenant-specific connector
  if (tenantId) {
    const tenantConnector = await prisma.connector.findFirst({
      where: {
        tenantId,
        type,
        isEnabled: true,
        deletedAt: null,
        ...(provider ? { provider } : { isDefault: true }),
      },
      orderBy: { isDefault: 'desc' },
    });

    if (tenantConnector) {
      return {
        connector: {
          ...tenantConnector,
          credentials: JSON.parse(decrypt(tenantConnector.credentials)),
        },
        source: 'tenant',
      };
    }
  }

  // Step 2: Check for system connector
  const systemConnector = await prisma.connector.findFirst({
    where: {
      tenantId: null,
      type,
      isEnabled: true,
      deletedAt: null,
      ...(provider ? { provider } : { isDefault: true }),
    },
    orderBy: { isDefault: 'desc' },
  });

  if (!systemConnector) {
    return null;
  }

  // Step 3: Check TenantConnectorAccess if tenant is specified
  if (tenantId) {
    const access = await prisma.tenantConnectorAccess.findUnique({
      where: {
        tenantId_connectorId: {
          tenantId,
          connectorId: systemConnector.id,
        },
      },
    });

    // If access record exists and is disabled, block
    if (access && !access.isEnabled) {
      return null;
    }
  }

  return {
    connector: {
      ...systemConnector,
      credentials: JSON.parse(decrypt(systemConnector.credentials)),
    },
    source: 'system',
  };
}

/**
 * Get all available connectors for a tenant (resolved)
 * Checks each provider type individually to find all available connectors
 */
export async function getAvailableConnectors(
  tenantId: string | null,
  type?: ConnectorType
): Promise<ResolvedConnector[]> {
  const results: ResolvedConnector[] = [];
  const types: ConnectorType[] = type ? [type] : ['AI_PROVIDER', 'STORAGE'];

  // Define all providers per type
  const providersPerType: Record<ConnectorType, ConnectorProvider[]> = {
    AI_PROVIDER: ['OPENAI', 'ANTHROPIC', 'GOOGLE'],
    STORAGE: ['ONEDRIVE'],
  };

  // Check each provider individually
  for (const t of types) {
    const providers = providersPerType[t];
    for (const provider of providers) {
      const resolved = await resolveConnector(tenantId, t, provider);
      if (resolved) {
        results.push(resolved);
      }
    }
  }

  return results;
}

// ============================================================================
// Connection Testing
// ============================================================================

export async function testConnector(
  id: string,
  params: TenantAwareParams
): Promise<TestResult> {
  const connector = await getConnectorById(id, params);
  if (!connector) {
    throw new Error('Connector not found');
  }

  const startTime = Date.now();
  let success = false;
  let error: string | undefined;

  try {
    switch (connector.provider) {
      case 'OPENAI':
        await testOpenAI(connector.credentials as { apiKey: string });
        break;
      case 'ANTHROPIC':
        await testAnthropic(connector.credentials as { apiKey: string });
        break;
      case 'GOOGLE':
        await testGoogle(connector.credentials as { apiKey: string });
        break;
      case 'ONEDRIVE':
        await testOneDrive(
          connector.credentials as { clientId: string; clientSecret: string; tenantId: string }
        );
        break;
      default:
        throw new Error(`Unknown provider: ${connector.provider}`);
    }
    success = true;
  } catch (e) {
    error = e instanceof Error ? e.message : 'Unknown error';
  }

  const latencyMs = Date.now() - startTime;

  // Update connector test results
  await prisma.connector.update({
    where: { id },
    data: {
      lastTestedAt: new Date(),
      lastTestResult: success ? 'success' : `error:${error}`,
    },
  });

  await createAuditLog({
    tenantId: connector.tenantId ?? undefined,
    userId: params.userId,
    action: 'CONNECTOR_TESTED',
    entityType: 'Connector',
    entityId: id,
    entityName: connector.name,
    summary: `Tested connector "${connector.name}" - ${success ? 'Success' : 'Failed'}`,
    changeSource: 'MANUAL',
    metadata: { success, error, latencyMs },
  });

  return { success, error, latencyMs };
}

// Provider-specific test functions
async function testOpenAI(credentials: { apiKey: string }): Promise<void> {
  const OpenAI = (await import('openai')).default;
  const client = new OpenAI({ apiKey: credentials.apiKey });
  await client.models.list();
}

async function testAnthropic(credentials: { apiKey: string }): Promise<void> {
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = new Anthropic({ apiKey: credentials.apiKey });
  // Just verify the API key by making a minimal request
  await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 10,
    messages: [{ role: 'user', content: 'Hi' }],
  });
}

async function testGoogle(credentials: { apiKey: string }): Promise<void> {
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const client = new GoogleGenerativeAI(credentials.apiKey);
  const model = client.getGenerativeModel({ model: 'gemini-2.5-flash' });
  await model.generateContent('Hi');
}

async function testOneDrive(credentials: {
  clientId: string;
  clientSecret: string;
  tenantId: string;
}): Promise<void> {
  // Test OAuth token acquisition using client credentials flow
  const tokenUrl = `https://login.microsoftonline.com/${credentials.tenantId}/oauth2/v2.0/token`;
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error_description || errorData.error || 'Failed to acquire access token'
    );
  }
}

// ============================================================================
// Usage Tracking
// ============================================================================

export async function incrementConnectorUsage(id: string): Promise<void> {
  await prisma.connector.update({
    where: { id },
    data: {
      callCount: { increment: 1 },
      lastUsedAt: new Date(),
    },
  });
}

// ============================================================================
// Tenant Access Management (for system connectors)
// ============================================================================

/**
 * Get tenant access list for a system connector
 */
export async function getTenantAccess(
  connectorId: string,
  params: TenantAwareParams
): Promise<TenantAccessEntry[]> {
  if (!params.isSuperAdmin) {
    throw new Error('Only super admins can view tenant access');
  }

  const connector = await prisma.connector.findFirst({
    where: { id: connectorId, deletedAt: null },
  });

  if (!connector) {
    throw new Error('Connector not found');
  }

  if (connector.tenantId !== null) {
    throw new Error('Tenant access only applies to system connectors');
  }

  // Get all tenants with their access status
  const tenants = await prisma.tenant.findMany({
    where: { deletedAt: null, status: 'ACTIVE' },
    orderBy: { name: 'asc' },
  });

  const accessRecords = await prisma.tenantConnectorAccess.findMany({
    where: { connectorId },
  });

  const accessMap = new Map(accessRecords.map((a) => [a.tenantId, a.isEnabled]));

  return tenants.map((tenant) => ({
    tenantId: tenant.id,
    tenantName: tenant.name,
    // Default to enabled if no record exists
    isEnabled: accessMap.get(tenant.id) ?? true,
  }));
}

/**
 * Update tenant access for a system connector
 */
export async function updateTenantAccess(
  connectorId: string,
  data: UpdateTenantAccessInput,
  params: TenantAwareParams
): Promise<void> {
  if (!params.isSuperAdmin) {
    throw new Error('Only super admins can update tenant access');
  }

  const connector = await prisma.connector.findFirst({
    where: { id: connectorId, deletedAt: null },
  });

  if (!connector) {
    throw new Error('Connector not found');
  }

  if (connector.tenantId !== null) {
    throw new Error('Tenant access only applies to system connectors');
  }

  // Upsert access records
  for (const access of data.tenantAccess) {
    await prisma.tenantConnectorAccess.upsert({
      where: {
        tenantId_connectorId: {
          tenantId: access.tenantId,
          connectorId,
        },
      },
      create: {
        tenantId: access.tenantId,
        connectorId,
        isEnabled: access.isEnabled,
      },
      update: {
        isEnabled: access.isEnabled,
      },
    });

    // Log the change
    const tenant = await prisma.tenant.findUnique({ where: { id: access.tenantId } });
    await createAuditLog({
      tenantId: access.tenantId,
      userId: params.userId,
      action: access.isEnabled ? 'CONNECTOR_ENABLED' : 'CONNECTOR_DISABLED',
      entityType: 'Connector',
      entityId: connectorId,
      entityName: connector.name,
      summary: `${access.isEnabled ? 'Enabled' : 'Disabled'} system connector "${connector.name}" for tenant "${tenant?.name}"`,
      changeSource: 'MANUAL',
      metadata: {
        isSystemConnector: true,
        tenantId: access.tenantId,
        tenantName: tenant?.name,
      },
    });
  }
}
