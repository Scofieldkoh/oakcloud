/**
 * Tenant Validation Schemas
 *
 * Zod schemas for validating tenant-related API inputs.
 */

import { z } from 'zod';

// ============================================================================
// Enums
// ============================================================================

export const tenantStatusEnum = z.enum([
  'ACTIVE',
  'SUSPENDED',
  'PENDING_SETUP',
  'DEACTIVATED',
]);

// ============================================================================
// Create Tenant
// ============================================================================

export const createTenantSchema = z.object({
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be at most 100 characters'),
  slug: z
    .string()
    .min(2, 'Slug must be at least 2 characters')
    .max(50, 'Slug must be at most 50 characters')
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      'Slug must be lowercase alphanumeric with hyphens'
    )
    .optional(),
  contactEmail: z.string().email('Invalid email').optional(),
  contactPhone: z
    .string()
    .max(20, 'Phone must be at most 20 characters')
    .optional(),
  addressLine1: z.string().max(200).optional(),
  addressLine2: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  postalCode: z.string().max(20).optional(),
  country: z.string().max(100).optional(),
  maxUsers: z.number().int().min(1).max(10000).optional(),
  maxCompanies: z.number().int().min(1).max(10000).optional(),
  maxStorageMb: z.number().int().min(100).max(1000000).optional(),
  logoUrl: z.string().url('Invalid logo URL').optional(),
  primaryColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color')
    .optional(),
  settings: z.record(z.unknown()).optional(),
});

export type CreateTenantInput = z.infer<typeof createTenantSchema>;

// ============================================================================
// Update Tenant
// ============================================================================

export const updateTenantSchema = createTenantSchema.partial().extend({
  id: z.string().uuid('Invalid tenant ID'),
});

export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;

// ============================================================================
// Tenant Status Update
// ============================================================================

export const updateTenantStatusSchema = z.object({
  id: z.string().uuid('Invalid tenant ID'),
  status: tenantStatusEnum,
  reason: z.string().min(10, 'Reason must be at least 10 characters').optional(),
});

export type UpdateTenantStatusInput = z.infer<typeof updateTenantStatusSchema>;

// ============================================================================
// Tenant Search
// ============================================================================

export const tenantSearchSchema = z.object({
  query: z.string().optional(),
  status: tenantStatusEnum.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['name', 'createdAt', 'status']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type TenantSearchInput = z.infer<typeof tenantSearchSchema>;

// ============================================================================
// Tenant User Invite
// ============================================================================

export const inviteUserSchema = z.object({
  email: z.string().email('Invalid email'),
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
  role: z.enum(['TENANT_ADMIN', 'COMPANY_ADMIN', 'COMPANY_USER']),
  companyId: z.string().uuid('Invalid company ID').optional(),
});

export type InviteUserInput = z.infer<typeof inviteUserSchema>;

// ============================================================================
// Tenant Settings
// ============================================================================

export const tenantSettingsSchema = z.object({
  // Feature flags
  enableDocumentExtraction: z.boolean().optional(),
  enableAuditExport: z.boolean().optional(),
  enableApiAccess: z.boolean().optional(),

  // Notification settings
  emailNotifications: z.boolean().optional(),
  notifyOnNewCompany: z.boolean().optional(),
  notifyOnDocumentUpload: z.boolean().optional(),

  // Compliance settings
  requireDeleteReason: z.boolean().optional(),
  retentionDays: z.number().int().min(30).max(3650).optional(),

  // Custom settings (extensible)
  custom: z.record(z.unknown()).optional(),
});

export type TenantSettingsInput = z.infer<typeof tenantSettingsSchema>;
