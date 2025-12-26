/**
 * Exchange Rate Service
 *
 * Business logic for exchange rate management including:
 * - Syncing rates from MAS API
 * - CRUD operations for manual rates
 * - Rate lookup with fallback logic (tenant override → system → fallback)
 * - Historical rate queries
 */

import { prisma } from '@/lib/prisma';
import { Prisma } from '@/generated/prisma';
import type { ExchangeRate, ExchangeRateType } from '@/generated/prisma';
import { createAuditLog } from '@/lib/audit';
import { fetchLatestRates, type ParsedExchangeRate } from '@/lib/external/mas-api';
import type {
  CreateManualRateInput,
  UpdateRateInput,
  RateSearchInput,
  SupportedCurrency,
} from '@/lib/validations/exchange-rate';
import { createLogger } from '@/lib/logger';

const log = createLogger('exchange-rate-service');

// ============================================================================
// Types
// ============================================================================

export interface TenantAwareParams {
  tenantId?: string | null;
  userId: string;
  isSuperAdmin: boolean;
}

export interface ExchangeRateWithMetadata {
  id: string;
  sourceCurrency: string;
  targetCurrency: string;
  rate: Prisma.Decimal;
  inverseRate: Prisma.Decimal | null;
  rateType: ExchangeRateType;
  rateDate: Date;
  isManualOverride: boolean;
  isSystemRate: boolean; // tenantId === null
  tenantId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RateLookupResult {
  rate: Prisma.Decimal;
  inverseRate: Prisma.Decimal;
  source: 'tenant_override' | 'system' | 'fallback';
  rateDate: Date;
  rateType: ExchangeRateType;
}

export interface SyncResult {
  success: boolean;
  ratesCreated: number;
  ratesUpdated: number;
  errors: string[];
  syncedAt: Date;
}

export interface PaginatedRates {
  rates: ExchangeRateWithMetadata[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// ============================================================================
// Sync from MAS
// ============================================================================

/**
 * Sync exchange rates from MAS API.
 * Creates new system rates (tenantId = null) or updates existing ones.
 */
export async function syncFromMAS(): Promise<SyncResult> {
  const syncedAt = new Date();
  const errors: string[] = [];
  let ratesCreated = 0;
  let ratesUpdated = 0;

  log.info('Starting MAS exchange rate sync');

  try {
    // Fetch latest rates from MAS
    const masRates = await fetchLatestRates();

    if (masRates.length === 0) {
      log.warn('No rates returned from MAS API');
      return {
        success: false,
        ratesCreated: 0,
        ratesUpdated: 0,
        errors: ['No rates returned from MAS API'],
        syncedAt,
      };
    }

    // Process each rate
    for (const rate of masRates) {
      try {
        const result = await upsertSystemRate(rate);
        if (result.created) {
          ratesCreated++;
        } else {
          ratesUpdated++;
        }
      } catch (error) {
        const errMsg = `Failed to upsert ${rate.sourceCurrency}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        log.error(errMsg);
        errors.push(errMsg);
      }
    }

    // Audit log the sync operation
    await createAuditLog({
      action: 'EXCHANGE_RATE_SYNCED',
      entityType: 'ExchangeRate',
      entityId: 'MAS_SYNC',
      entityName: 'MAS Daily Rates',
      summary: `Synced ${ratesCreated + ratesUpdated} rates from MAS (${ratesCreated} new, ${ratesUpdated} updated)`,
      metadata: {
        ratesCreated,
        ratesUpdated,
        rateDate: masRates[0]?.rateDate?.toISOString(),
        errors: errors.length > 0 ? errors : undefined,
      },
      changeSource: 'SYSTEM',
    });

    log.info(`MAS sync complete: ${ratesCreated} created, ${ratesUpdated} updated, ${errors.length} errors`);

    return {
      success: errors.length === 0,
      ratesCreated,
      ratesUpdated,
      errors,
      syncedAt,
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    log.error('MAS sync failed:', error);

    return {
      success: false,
      ratesCreated: 0,
      ratesUpdated: 0,
      errors: [errMsg],
      syncedAt,
    };
  }
}

/**
 * Upsert a system rate (tenantId = null) from MAS data.
 */
async function upsertSystemRate(
  rate: ParsedExchangeRate
): Promise<{ created: boolean }> {
  const rateDate = new Date(rate.rateDate);
  // Normalize to start of day
  rateDate.setHours(0, 0, 0, 0);

  // Check if rate already exists
  const existing = await prisma.exchangeRate.findFirst({
    where: {
      tenantId: null,
      sourceCurrency: rate.sourceCurrency,
      targetCurrency: rate.targetCurrency,
      rateDate: rateDate,
      rateType: 'MAS_DAILY_RATE',
    },
  });

  if (existing) {
    // Update if rate changed
    const existingRate = existing.rate.toNumber();
    if (Math.abs(existingRate - rate.rate) > 0.00000001) {
      await prisma.exchangeRate.update({
        where: { id: existing.id },
        data: {
          rate: new Prisma.Decimal(rate.rate),
          inverseRate: new Prisma.Decimal(rate.inverseRate),
        },
      });
    }
    return { created: false };
  }

  // Create new rate
  await prisma.exchangeRate.create({
    data: {
      tenantId: null,
      sourceCurrency: rate.sourceCurrency,
      targetCurrency: rate.targetCurrency,
      rate: new Prisma.Decimal(rate.rate),
      inverseRate: new Prisma.Decimal(rate.inverseRate),
      rateType: 'MAS_DAILY_RATE',
      rateDate: rateDate,
      isManualOverride: false,
    },
  });

  return { created: true };
}

// ============================================================================
// Rate Lookup
// ============================================================================

/**
 * Get exchange rate with fallback logic.
 *
 * Priority:
 * 1. Tenant override (if tenantId provided)
 * 2. System rate for exact date
 * 3. Fallback to most recent system rate
 */
export async function getRate(
  sourceCurrency: SupportedCurrency,
  targetCurrency: SupportedCurrency = 'SGD',
  date: Date,
  tenantId?: string | null
): Promise<RateLookupResult | null> {
  // Normalize date to start of day
  const rateDate = new Date(date);
  rateDate.setHours(0, 0, 0, 0);

  // 1. Check tenant override
  if (tenantId) {
    const tenantRate = await prisma.exchangeRate.findFirst({
      where: {
        tenantId,
        sourceCurrency,
        targetCurrency,
        rateDate,
        isManualOverride: true,
      },
    });

    if (tenantRate) {
      return {
        rate: tenantRate.rate,
        inverseRate: tenantRate.inverseRate || new Prisma.Decimal(1).div(tenantRate.rate),
        source: 'tenant_override',
        rateDate: tenantRate.rateDate,
        rateType: tenantRate.rateType,
      };
    }
  }

  // 2. Check system rate for exact date
  const systemRate = await prisma.exchangeRate.findFirst({
    where: {
      tenantId: null,
      sourceCurrency,
      targetCurrency,
      rateDate,
    },
    orderBy: {
      rateType: 'asc', // Prefer MAS_DAILY_RATE over MANUAL_RATE
    },
  });

  if (systemRate) {
    return {
      rate: systemRate.rate,
      inverseRate: systemRate.inverseRate || new Prisma.Decimal(1).div(systemRate.rate),
      source: 'system',
      rateDate: systemRate.rateDate,
      rateType: systemRate.rateType,
    };
  }

  // 3. Fallback to most recent system rate
  const latestRate = await prisma.exchangeRate.findFirst({
    where: {
      tenantId: null,
      sourceCurrency,
      targetCurrency,
      rateDate: { lte: rateDate },
    },
    orderBy: {
      rateDate: 'desc',
    },
  });

  if (latestRate) {
    return {
      rate: latestRate.rate,
      inverseRate: latestRate.inverseRate || new Prisma.Decimal(1).div(latestRate.rate),
      source: 'fallback',
      rateDate: latestRate.rateDate,
      rateType: latestRate.rateType,
    };
  }

  return null;
}

// ============================================================================
// Query Rates
// ============================================================================

/**
 * Get current rates (latest available for each currency).
 */
export async function getCurrentRates(
  tenantId?: string | null
): Promise<ExchangeRateWithMetadata[]> {
  // Get the latest rate date
  const latestRate = await prisma.exchangeRate.findFirst({
    where: { tenantId: null },
    orderBy: { rateDate: 'desc' },
    select: { rateDate: true },
  });

  if (!latestRate) {
    return [];
  }

  // Get all rates for the latest date
  const rates = await prisma.exchangeRate.findMany({
    where: {
      OR: [
        { tenantId: null }, // System rates
        ...(tenantId ? [{ tenantId }] : []), // Tenant rates if specified
      ],
      rateDate: latestRate.rateDate,
    },
    orderBy: [{ sourceCurrency: 'asc' }],
  });

  return rates.map(mapToMetadata);
}

/**
 * Search rates with filters and pagination.
 */
export async function searchRates(
  params: RateSearchInput,
  tenantContext?: { tenantId?: string; isSuperAdmin?: boolean }
): Promise<PaginatedRates> {
  const { page, limit, sourceCurrency, startDate, endDate, source, includeSystem, tenantId } =
    params;
  const skip = (page - 1) * limit;

  // Build where clause
  const where: Prisma.ExchangeRateWhereInput = {};

  // Scope filtering
  const scopeConditions: Prisma.ExchangeRateWhereInput[] = [];

  if (includeSystem) {
    scopeConditions.push({ tenantId: null });
  }

  if (tenantId) {
    scopeConditions.push({ tenantId });
  } else if (tenantContext?.tenantId && !tenantContext.isSuperAdmin) {
    // Non-super admin can only see their tenant + system
    scopeConditions.push({ tenantId: tenantContext.tenantId });
  }

  if (scopeConditions.length > 0) {
    where.OR = scopeConditions;
  }

  // Currency filter
  if (sourceCurrency) {
    where.sourceCurrency = sourceCurrency;
  }

  // Date range filter
  if (startDate || endDate) {
    where.rateDate = {};
    if (startDate) where.rateDate.gte = startDate;
    if (endDate) where.rateDate.lte = endDate;
  }

  // Source filter
  if (source !== 'ALL') {
    // Map to ExchangeRateType enum values
    const typeMap: Record<string, ExchangeRateType> = {
      'MAS_DAILY': 'MAS_DAILY_RATE',
      'MANUAL': 'MANUAL_RATE',
    };
    where.rateType = typeMap[source] || (source as ExchangeRateType);
  }

  // Execute query
  const [rates, total] = await Promise.all([
    prisma.exchangeRate.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ rateDate: 'desc' }, { sourceCurrency: 'asc' }],
    }),
    prisma.exchangeRate.count({ where }),
  ]);

  return {
    rates: rates.map(mapToMetadata),
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };
}

// ============================================================================
// Manual Rate CRUD
// ============================================================================

/**
 * Create a manual exchange rate override.
 */
export async function createManualRate(
  data: CreateManualRateInput,
  params: TenantAwareParams
): Promise<ExchangeRate> {
  const { userId, isSuperAdmin } = params;

  // Only SUPER_ADMIN can create system rates (tenantId = null)
  if (data.tenantId === null && !isSuperAdmin) {
    throw new Error('Only super admins can create system rates');
  }

  // Check for duplicate
  const existing = await prisma.exchangeRate.findFirst({
    where: {
      tenantId: data.tenantId ?? null,
      sourceCurrency: data.sourceCurrency,
      targetCurrency: data.targetCurrency,
      rateDate: data.rateDate,
      rateType: 'MANUAL_RATE',
    },
  });

  if (existing) {
    throw new Error(
      `A manual rate for ${data.sourceCurrency}/${data.targetCurrency} on this date already exists`
    );
  }

  // Calculate inverse rate
  const inverseRate = 1 / data.rate;

  const rate = await prisma.exchangeRate.create({
    data: {
      tenantId: data.tenantId ?? null,
      sourceCurrency: data.sourceCurrency,
      targetCurrency: data.targetCurrency,
      rate: new Prisma.Decimal(data.rate),
      inverseRate: new Prisma.Decimal(inverseRate),
      rateType: 'MANUAL_RATE',
      rateDate: data.rateDate,
      isManualOverride: true,
      manualReason: data.reason,
      createdById: userId,
    },
  });

  // Audit log
  await createAuditLog({
    tenantId: data.tenantId ?? undefined,
    userId,
    action: 'EXCHANGE_RATE_CREATED',
    entityType: 'ExchangeRate',
    entityId: rate.id,
    entityName: `${data.sourceCurrency}/${data.targetCurrency}`,
    summary: `Created manual rate ${data.sourceCurrency}/${data.targetCurrency} = ${data.rate}`,
    metadata: {
      sourceCurrency: data.sourceCurrency,
      targetCurrency: data.targetCurrency,
      rate: data.rate,
      rateDate: data.rateDate.toISOString(),
      reason: data.reason,
    },
    changeSource: 'MANUAL',
  });

  log.info(`Created manual rate: ${data.sourceCurrency}/${data.targetCurrency} = ${data.rate}`);

  return rate;
}

/**
 * Update an existing exchange rate.
 */
export async function updateRate(
  id: string,
  data: UpdateRateInput,
  params: TenantAwareParams
): Promise<ExchangeRate> {
  const { userId, isSuperAdmin } = params;

  const existing = await prisma.exchangeRate.findUnique({
    where: { id },
  });

  if (!existing) {
    throw new Error('Exchange rate not found');
  }

  // Only SUPER_ADMIN can modify system rates
  if (existing.tenantId === null && !isSuperAdmin) {
    throw new Error('Only super admins can modify system rates');
  }

  // Only allow updating manual rates
  if (!existing.isManualOverride) {
    throw new Error('Cannot modify MAS rates. Create a manual override instead.');
  }

  const updateData: Prisma.ExchangeRateUpdateInput = {};

  if (data.rate !== undefined) {
    updateData.rate = new Prisma.Decimal(data.rate);
    updateData.inverseRate = new Prisma.Decimal(1 / data.rate);
  }

  if (data.reason !== undefined) {
    updateData.manualReason = data.reason;
  }

  const updated = await prisma.exchangeRate.update({
    where: { id },
    data: updateData,
  });

  // Audit log with proper changes format
  const changes: Record<string, { old: unknown; new: unknown }> = {};
  if (data.rate !== undefined) {
    changes.rate = { old: existing.rate.toString(), new: data.rate.toString() };
  }
  if (data.reason !== undefined) {
    changes.reason = { old: existing.manualReason, new: data.reason };
  }

  await createAuditLog({
    tenantId: existing.tenantId ?? undefined,
    userId,
    action: 'EXCHANGE_RATE_UPDATED',
    entityType: 'ExchangeRate',
    entityId: id,
    entityName: `${existing.sourceCurrency}/${existing.targetCurrency}`,
    summary: `Updated rate ${existing.sourceCurrency}/${existing.targetCurrency}`,
    changes,
    changeSource: 'MANUAL',
  });

  return updated;
}

/**
 * Delete an exchange rate.
 */
export async function deleteRate(
  id: string,
  params: TenantAwareParams,
  reason: string
): Promise<void> {
  const { userId, isSuperAdmin } = params;

  const existing = await prisma.exchangeRate.findUnique({
    where: { id },
  });

  if (!existing) {
    throw new Error('Exchange rate not found');
  }

  // Only SUPER_ADMIN can delete system rates
  if (existing.tenantId === null && !isSuperAdmin) {
    throw new Error('Only super admins can delete system rates');
  }

  // Delete the rate
  await prisma.exchangeRate.delete({
    where: { id },
  });

  // Audit log
  await createAuditLog({
    tenantId: existing.tenantId ?? undefined,
    userId,
    action: 'EXCHANGE_RATE_DELETED',
    entityType: 'ExchangeRate',
    entityId: id,
    entityName: `${existing.sourceCurrency}/${existing.targetCurrency}`,
    summary: `Deleted rate ${existing.sourceCurrency}/${existing.targetCurrency}`,
    reason,
    metadata: {
      sourceCurrency: existing.sourceCurrency,
      targetCurrency: existing.targetCurrency,
      rate: existing.rate.toString(),
      rateDate: existing.rateDate.toISOString(),
    },
    changeSource: 'MANUAL',
  });

  log.info(`Deleted rate: ${existing.sourceCurrency}/${existing.targetCurrency}`);
}

/**
 * Get a single rate by ID.
 */
export async function getRateById(
  id: string,
  params?: TenantAwareParams
): Promise<ExchangeRateWithMetadata | null> {
  const rate = await prisma.exchangeRate.findUnique({
    where: { id },
  });

  if (!rate) return null;

  // Access control
  if (params && !params.isSuperAdmin && rate.tenantId !== null && rate.tenantId !== params.tenantId) {
    throw new Error('Access denied');
  }

  return mapToMetadata(rate);
}

// ============================================================================
// Helpers
// ============================================================================

function mapToMetadata(rate: ExchangeRate): ExchangeRateWithMetadata {
  return {
    id: rate.id,
    sourceCurrency: rate.sourceCurrency,
    targetCurrency: rate.targetCurrency,
    rate: rate.rate,
    inverseRate: rate.inverseRate,
    rateType: rate.rateType,
    rateDate: rate.rateDate,
    isManualOverride: rate.isManualOverride,
    isSystemRate: rate.tenantId === null,
    tenantId: rate.tenantId,
    createdAt: rate.createdAt,
    updatedAt: rate.updatedAt,
  };
}
