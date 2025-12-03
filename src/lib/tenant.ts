/**
 * Tenant Context and Utilities
 *
 * Provides multi-tenancy support for data isolation and access control.
 * All tenant-scoped queries should use these utilities to ensure proper isolation.
 */

import { prisma } from './prisma';
import type { Tenant, TenantStatus, User } from '@prisma/client';
import type { SessionUser } from './auth';

// ============================================================================
// Types
// ============================================================================

export interface TenantContext {
  tenantId: string;
  tenant: TenantInfo;
  userId: string;
  isSuperAdmin: boolean;
  isTenantAdmin: boolean;
}

export interface TenantInfo {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  settings: Record<string, unknown> | null;
  maxUsers: number;
  maxCompanies: number;
  maxStorageMb: number;
}

export interface TenantLimits {
  maxUsers: number;
  maxCompanies: number;
  maxStorageMb: number;
  currentUsers: number;
  currentCompanies: number;
  currentStorageMb: number;
}

// ============================================================================
// Tenant Retrieval
// ============================================================================

/**
 * Get tenant by ID
 */
export async function getTenantById(tenantId: string): Promise<TenantInfo | null> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId, deletedAt: null },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      settings: true,
      maxUsers: true,
      maxCompanies: true,
      maxStorageMb: true,
    },
  });

  if (!tenant) return null;

  return {
    ...tenant,
    settings: tenant.settings as Record<string, unknown> | null,
  };
}

/**
 * Get tenant by slug (URL-friendly identifier)
 */
export async function getTenantBySlug(slug: string): Promise<TenantInfo | null> {
  const tenant = await prisma.tenant.findUnique({
    where: { slug, deletedAt: null },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      settings: true,
      maxUsers: true,
      maxCompanies: true,
      maxStorageMb: true,
    },
  });

  if (!tenant) return null;

  return {
    ...tenant,
    settings: tenant.settings as Record<string, unknown> | null,
  };
}

// ============================================================================
// Tenant Context Resolution
// ============================================================================

/**
 * Resolve tenant context from session user
 * Returns null if user is SUPER_ADMIN (has access to all tenants)
 */
export async function resolveTenantContext(
  session: SessionUser
): Promise<TenantContext | null> {
  // SUPER_ADMIN has cross-tenant access
  if (session.isSuperAdmin) {
    return null;
  }

  // Get user with tenant info
  const user = await prisma.user.findUnique({
    where: { id: session.id },
    include: {
      tenant: {
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          settings: true,
          maxUsers: true,
          maxCompanies: true,
          maxStorageMb: true,
        },
      },
    },
  });

  if (!user?.tenant) {
    throw new Error('User has no tenant association');
  }

  // Check tenant is active
  if (user.tenant.status !== 'ACTIVE') {
    throw new Error(`Tenant is ${user.tenant.status.toLowerCase()}`);
  }

  return {
    tenantId: user.tenant.id,
    tenant: {
      ...user.tenant,
      settings: user.tenant.settings as Record<string, unknown> | null,
    },
    userId: user.id,
    isSuperAdmin: session.isSuperAdmin,
    isTenantAdmin: session.isTenantAdmin,
  };
}

// ============================================================================
// Access Control
// ============================================================================

/**
 * Check if user can access a specific tenant
 */
export function canAccessTenant(session: SessionUser, tenantId: string): boolean {
  // SUPER_ADMIN can access any tenant
  if (session.isSuperAdmin) {
    return true;
  }

  // User must belong to the tenant
  return session.tenantId === tenantId;
}

/**
 * Check if user has tenant admin privileges
 */
export function isTenantAdmin(session: SessionUser): boolean {
  return session.isSuperAdmin || session.isTenantAdmin;
}

/**
 * Check if user can manage tenant settings
 */
export function canManageTenant(session: SessionUser, tenantId: string): boolean {
  if (session.isSuperAdmin) return true;
  if (!session.isTenantAdmin) return false;
  // User must belong to the tenant they're managing
  return session.tenantId === tenantId;
}

// ============================================================================
// Tenant Limits & Usage
// ============================================================================

/**
 * Get current usage and limits for a tenant
 */
export async function getTenantLimits(tenantId: string): Promise<TenantLimits> {
  const [tenant, userCount, companyCount, storageUsage] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        maxUsers: true,
        maxCompanies: true,
        maxStorageMb: true,
      },
    }),
    prisma.user.count({
      where: { tenantId, deletedAt: null, isActive: true },
    }),
    prisma.company.count({
      where: { tenantId, deletedAt: null },
    }),
    prisma.document.aggregate({
      where: { tenantId },
      _sum: { fileSize: true },
    }),
  ]);

  if (!tenant) {
    throw new Error('Tenant not found');
  }

  return {
    maxUsers: tenant.maxUsers,
    maxCompanies: tenant.maxCompanies,
    maxStorageMb: tenant.maxStorageMb,
    currentUsers: userCount,
    currentCompanies: companyCount,
    currentStorageMb: Math.ceil((storageUsage._sum.fileSize || 0) / (1024 * 1024)),
  };
}

/**
 * Check if tenant can add more users
 */
export async function canAddUser(tenantId: string): Promise<boolean> {
  const limits = await getTenantLimits(tenantId);
  return limits.currentUsers < limits.maxUsers;
}

/**
 * Check if tenant can add more companies
 */
export async function canAddCompany(tenantId: string): Promise<boolean> {
  const limits = await getTenantLimits(tenantId);
  return limits.currentCompanies < limits.maxCompanies;
}

/**
 * Check if tenant has storage capacity for a file
 */
export async function hasStorageCapacity(
  tenantId: string,
  fileSizeBytes: number
): Promise<boolean> {
  const limits = await getTenantLimits(tenantId);
  const fileSizeMb = fileSizeBytes / (1024 * 1024);
  return limits.currentStorageMb + fileSizeMb <= limits.maxStorageMb;
}

// ============================================================================
// Tenant-Scoped Query Helpers
// ============================================================================

/**
 * Add tenant filter to Prisma where clause
 * Returns the filter or undefined for SUPER_ADMIN
 */
export function tenantFilter(
  context: TenantContext | null
): { tenantId: string } | undefined {
  return context ? { tenantId: context.tenantId } : undefined;
}

/**
 * Build where clause with tenant scope
 */
export function withTenantScope<T extends Record<string, unknown>>(
  context: TenantContext | null,
  where: T
): T & { tenantId?: string } {
  if (!context) return where;
  return { ...where, tenantId: context.tenantId };
}

/**
 * Create data with tenant ID included
 */
export function withTenantId<T extends Record<string, unknown>>(
  context: TenantContext,
  data: T
): T & { tenantId: string } {
  return { ...data, tenantId: context.tenantId };
}

// ============================================================================
// Tenant Validation
// ============================================================================

/**
 * Validate tenant status before operations
 */
export async function validateTenantStatus(tenantId: string): Promise<void> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { status: true, deletedAt: true },
  });

  if (!tenant || tenant.deletedAt) {
    throw new Error('Tenant not found');
  }

  if (tenant.status === 'SUSPENDED') {
    throw new Error('Tenant is suspended');
  }

  if (tenant.status === 'DEACTIVATED') {
    throw new Error('Tenant is deactivated');
  }

  if (tenant.status === 'PENDING_SETUP') {
    throw new Error('Tenant setup is incomplete');
  }
}

/**
 * Generate a unique slug from tenant name
 */
export async function generateTenantSlug(name: string): Promise<string> {
  const baseSlug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);

  let slug = baseSlug;
  let counter = 1;

  while (await prisma.tenant.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  return slug;
}
