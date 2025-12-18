/**
 * Authentication & Authorization
 *
 * Provides JWT-based authentication with secure HTTP-only cookies.
 * Fully integrated with multi-tenancy support.
 */

import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { prisma } from './prisma';
import type { TenantStatus } from '@/generated/prisma';
import { logAuthEvent } from './audit';
import {
  AUTH_COOKIE_NAME,
  DEFAULT_JWT_EXPIRES_IN,
  COOKIE_MAX_AGE_SECONDS,
  COOKIE_OPTIONS,
  MIN_JWT_SECRET_LENGTH,
  ERROR_MESSAGES,
  TENANT_STATUSES,
} from './constants/application';

// ============================================================================
// Configuration
// ============================================================================

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET environment variable is required in production');
    }
    // Development fallback with warning
    console.warn('⚠️  JWT_SECRET not set. Using insecure default for development only.');
    return new TextEncoder().encode('development-only-secret-do-not-use-in-production');
  }

  if (secret.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(`JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters long`);
  }

  return new TextEncoder().encode(secret);
}

const JWT_SECRET = getJwtSecret();
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || DEFAULT_JWT_EXPIRES_IN;

// ============================================================================
// Types
// ============================================================================

export interface JWTPayload {
  userId: string;
  email: string;
  tenantId?: string | null;
}

export interface SessionUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  tenantId: string | null;
  // Computed from role assignments (authoritative source)
  isSuperAdmin: boolean;
  isTenantAdmin: boolean;
  // True if user has any role with "All Companies" scope (companyId = null)
  hasAllCompaniesAccess: boolean;
  // All company IDs the user has access to via role assignments (excludes "All Companies" assignments)
  companyIds: string[];
}

export interface SessionWithTenant extends SessionUser {
  tenant: {
    id: string;
    name: string;
    slug: string;
    status: TenantStatus;
  } | null;
}

// ============================================================================
// Token Management
// ============================================================================

/**
 * Create a JWT token for a user
 */
export async function createToken(payload: JWTPayload): Promise<string> {
  const expiresIn = parseExpiration(JWT_EXPIRES_IN);

  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(JWT_SECRET);
}

/**
 * Verify a JWT token
 */
export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as JWTPayload;
  } catch {
    return null;
  }
}

/**
 * Parse expiration string to jose-compatible format
 */
function parseExpiration(exp: string): string {
  // Convert formats like '7d' to jose format
  const match = exp.match(/^(\d+)([smhd])$/);
  if (!match) return '7d';

  const [, value, unit] = match;
  const unitMap: Record<string, string> = {
    s: 'seconds',
    m: 'minutes',
    h: 'hours',
    d: 'days',
  };

  return `${value} ${unitMap[unit] || 'days'}`;
}

// ============================================================================
// Session Management
// ============================================================================

/**
 * Get current session from cookies (basic user info)
 */
export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;

  if (!token) return null;

  const payload = await verifyToken(token);
  if (!payload) return null;

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      tenantId: true,
      isActive: true,
      deletedAt: true,
      roleAssignments: {
        select: {
          companyId: true,
          role: {
            select: {
              systemRoleType: true,
            },
          },
        },
      },
    },
  });

  if (!user || !user.isActive || user.deletedAt) return null;

  // Compute flags from role assignments (authoritative source)
  const isSuperAdmin = user.roleAssignments.some(
    (a) => a.role.systemRoleType === 'SUPER_ADMIN'
  );
  const isTenantAdmin = user.roleAssignments.some(
    (a) => a.role.systemRoleType === 'TENANT_ADMIN'
  );

  // Check if user has any "All Companies" role assignment (companyId = null)
  const hasAllCompaniesAccess = user.roleAssignments.some(
    (a) => a.companyId === null && a.role.systemRoleType !== 'SUPER_ADMIN' && a.role.systemRoleType !== 'TENANT_ADMIN'
  );

  // Get all unique company IDs from role assignments (excludes null/"All Companies")
  const companyIds = [
    ...new Set(
      user.roleAssignments
        .map((a) => a.companyId)
        .filter((id): id is string => id !== null)
    ),
  ];

  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    tenantId: user.tenantId,
    isSuperAdmin,
    isTenantAdmin,
    hasAllCompaniesAccess,
    companyIds,
  };
}

/**
 * Get session with full tenant information
 */
export async function getSessionWithTenant(): Promise<SessionWithTenant | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;

  if (!token) return null;

  const payload = await verifyToken(token);
  if (!payload) return null;

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      tenantId: true,
      isActive: true,
      deletedAt: true,
      tenant: {
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
        },
      },
      roleAssignments: {
        select: {
          companyId: true,
          role: {
            select: {
              systemRoleType: true,
            },
          },
        },
      },
    },
  });

  if (!user || !user.isActive || user.deletedAt) return null;

  // Compute flags from role assignments (authoritative source)
  const isSuperAdmin = user.roleAssignments.some(
    (a) => a.role.systemRoleType === 'SUPER_ADMIN'
  );
  const isTenantAdmin = user.roleAssignments.some(
    (a) => a.role.systemRoleType === 'TENANT_ADMIN'
  );

  // Check tenant is active (for non-SUPER_ADMIN)
  if (user.tenant && user.tenant.status !== TENANT_STATUSES.ACTIVE && !isSuperAdmin) {
    return null;
  }

  // Check if user has any "All Companies" role assignment (companyId = null)
  const hasAllCompaniesAccess = user.roleAssignments.some(
    (a) => a.companyId === null && a.role.systemRoleType !== 'SUPER_ADMIN' && a.role.systemRoleType !== 'TENANT_ADMIN'
  );

  // Get all unique company IDs from role assignments (excludes null/"All Companies")
  const companyIds = [
    ...new Set(
      user.roleAssignments
        .map((a) => a.companyId)
        .filter((id): id is string => id !== null)
    ),
  ];

  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    tenantId: user.tenantId,
    tenant: user.tenant,
    isSuperAdmin,
    isTenantAdmin,
    hasAllCompaniesAccess,
    companyIds,
  };
}

// ============================================================================
// Authentication Enforcement
// ============================================================================

/**
 * Require authentication - throws if not authenticated
 */
export async function requireAuth(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) {
    throw new Error(ERROR_MESSAGES.UNAUTHORIZED);
  }
  return session;
}

/**
 * Require authentication with tenant info - throws if not authenticated
 */
export async function requireAuthWithTenant(): Promise<SessionWithTenant> {
  const session = await getSessionWithTenant();
  if (!session) {
    throw new Error(ERROR_MESSAGES.UNAUTHORIZED);
  }
  return session;
}

/**
 * Require tenant membership - throws if user doesn't belong to a tenant
 */
export async function requireTenant(): Promise<SessionWithTenant & { tenantId: string }> {
  const session = await getSessionWithTenant();
  if (!session) {
    throw new Error(ERROR_MESSAGES.UNAUTHORIZED);
  }
  if (!session.tenantId && !session.isSuperAdmin) {
    throw new Error(ERROR_MESSAGES.NO_TENANT_ASSOCIATION);
  }
  return session as SessionWithTenant & { tenantId: string };
}

// ============================================================================
// Role Checks
// ============================================================================

/**
 * Check if user is a super admin (uses computed flag from role assignments)
 */
export function isSuperAdmin(user: SessionUser): boolean {
  return user.isSuperAdmin;
}

/**
 * Check if user is a tenant admin (uses computed flag from role assignments)
 */
export function isTenantAdmin(user: SessionUser): boolean {
  return user.isTenantAdmin;
}

/**
 * Check if user has admin privileges (super or tenant admin)
 */
export function isAdmin(user: SessionUser): boolean {
  return user.isSuperAdmin || user.isTenantAdmin;
}

// ============================================================================
// Access Control
// ============================================================================

/**
 * Check if user can access a specific tenant
 */
export function canAccessTenant(user: SessionUser, tenantId: string): boolean {
  if (isSuperAdmin(user)) return true;
  return user.tenantId === tenantId;
}

/**
 * Check if user can access a specific company
 * This function verifies:
 * 1. SUPER_ADMIN can access any company
 * 2. TENANT_ADMIN can only access companies within their tenant
 * 3. Users with "All Companies" role can access any company in their tenant
 * 4. Regular users can only access companies they have role assignments for
 */
export async function canAccessCompany(user: SessionUser, companyId: string): Promise<boolean> {
  if (user.isSuperAdmin) return true;

  // For TENANT_ADMIN, verify company belongs to their tenant
  if (user.isTenantAdmin) {
    if (!user.tenantId) return false;
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { tenantId: true },
    });
    return company?.tenantId === user.tenantId;
  }

  // For users with "All Companies" access, verify company belongs to their tenant
  if (user.hasAllCompaniesAccess) {
    if (!user.tenantId) return false;
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { tenantId: true },
    });
    return company?.tenantId === user.tenantId;
  }

  // For company admins/users, check if company is in their role assignments
  return user.companyIds.includes(companyId);
}

/**
 * Check if user can manage tenant settings
 */
export function canManageTenant(user: SessionUser, tenantId: string): boolean {
  if (user.isSuperAdmin) return true;
  if (!user.isTenantAdmin) return false;
  return user.tenantId === tenantId;
}

/**
 * Check if user can manage users within a tenant
 */
export function canManageUsers(user: SessionUser): boolean {
  return user.isSuperAdmin || user.isTenantAdmin;
}

/**
 * Check if user can manage companies within a tenant
 */
export function canManageCompanies(user: SessionUser): boolean {
  // Super admin and tenant admin can manage all companies
  // Company admin status now determined by per-company role assignments
  return user.isSuperAdmin || user.isTenantAdmin;
}

// ============================================================================
// Login & Logout
// ============================================================================

/**
 * Perform login and set auth cookie
 * Returns the session user on success
 */
export async function performLogin(
  email: string,
  passwordHash: string,
  verifyPassword: (hash: string, password: string) => Promise<boolean>,
  password: string
): Promise<SessionUser> {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: {
      tenant: {
        select: {
          id: true,
          status: true,
        },
      },
      roleAssignments: {
        select: {
          companyId: true,
          role: {
            select: {
              systemRoleType: true,
            },
          },
        },
      },
    },
  });

  if (!user || user.deletedAt || !user.isActive) {
    await logAuthEvent('LOGIN_FAILED', undefined, { email, reason: 'User not found or inactive' });
    throw new Error(ERROR_MESSAGES.INVALID_CREDENTIALS);
  }

  // Compute flags from role assignments (authoritative source)
  const isSuperAdmin = user.roleAssignments.some(
    (a) => a.role.systemRoleType === 'SUPER_ADMIN'
  );
  const isTenantAdmin = user.roleAssignments.some(
    (a) => a.role.systemRoleType === 'TENANT_ADMIN'
  );

  // Check tenant status (for non-SUPER_ADMIN)
  if (user.tenant && user.tenant.status !== TENANT_STATUSES.ACTIVE && !isSuperAdmin) {
    await logAuthEvent('LOGIN_FAILED', user.id, { reason: 'Tenant not active', tenantStatus: user.tenant.status });
    throw new Error(ERROR_MESSAGES.ACCOUNT_ACCESS_RESTRICTED);
  }

  const isValid = await verifyPassword(user.passwordHash, password);
  if (!isValid) {
    await logAuthEvent('LOGIN_FAILED', user.id, { reason: 'Invalid password' });
    throw new Error(ERROR_MESSAGES.INVALID_CREDENTIALS);
  }

  // Update last login
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  // Create token
  const token = await createToken({
    userId: user.id,
    email: user.email,
    tenantId: user.tenantId,
  });

  // Set cookie
  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE_NAME, token, {
    ...COOKIE_OPTIONS,
    secure: process.env.NODE_ENV === 'production',
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });

  // Log successful login
  await logAuthEvent('LOGIN', user.id, { tenantId: user.tenantId });

  // Check if user has any "All Companies" role assignment (companyId = null)
  const hasAllCompaniesAccess = user.roleAssignments.some(
    (a) => a.companyId === null && a.role.systemRoleType !== 'SUPER_ADMIN' && a.role.systemRoleType !== 'TENANT_ADMIN'
  );

  // Get all unique company IDs from role assignments (excludes null/"All Companies")
  const companyIds = [
    ...new Set(
      user.roleAssignments
        .map((a) => a.companyId)
        .filter((id): id is string => id !== null)
    ),
  ];

  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    tenantId: user.tenantId,
    isSuperAdmin,
    isTenantAdmin,
    hasAllCompaniesAccess,
    companyIds,
  };
}

/**
 * Perform logout and clear auth cookie
 */
export async function performLogout(): Promise<void> {
  const session = await getSession();

  const cookieStore = await cookies();
  cookieStore.delete(AUTH_COOKIE_NAME);

  if (session) {
    await logAuthEvent('LOGOUT', session.id);
  }
}

// ============================================================================
// Tenant-Scoped Session Helpers
// ============================================================================

/**
 * Get the tenant ID from session (throws if no tenant and not SUPER_ADMIN)
 */
export async function getSessionTenantId(): Promise<string | null> {
  const session = await requireAuth();

  // SUPER_ADMIN doesn't need a tenant
  if (isSuperAdmin(session)) {
    return null;
  }

  if (!session.tenantId) {
    throw new Error(ERROR_MESSAGES.NO_TENANT_ASSOCIATION);
  }

  return session.tenantId;
}

/**
 * Validate that user belongs to the specified tenant
 */
export async function validateTenantAccess(tenantId: string): Promise<SessionUser> {
  const session = await requireAuth();

  if (!canAccessTenant(session, tenantId)) {
    throw new Error(ERROR_MESSAGES.FORBIDDEN);
  }

  return session;
}

/**
 * Validate that user can access the specified company
 */
export async function validateCompanyAccess(companyId: string): Promise<SessionUser> {
  const session = await requireAuth();

  // Get company to check tenant
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { tenantId: true },
  });

  if (!company) {
    throw new Error(ERROR_MESSAGES.COMPANY_NOT_FOUND);
  }

  // Check tenant access first
  if (!canAccessTenant(session, company.tenantId)) {
    throw new Error(ERROR_MESSAGES.FORBIDDEN);
  }

  // Then check company-level access
  if (!(await canAccessCompany(session, companyId))) {
    throw new Error(ERROR_MESSAGES.FORBIDDEN);
  }

  return session;
}
