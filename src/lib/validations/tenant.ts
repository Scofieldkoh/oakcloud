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

// Company assignment - just links user to company (permissions via role assignments)
export const companyAssignmentSchema = z.object({
  companyId: z.string().uuid('Invalid company ID'),
  isPrimary: z.boolean().optional(),
});

// Role assignment - can be tenant-wide (companyId = null) or company-specific
export const roleAssignmentSchema = z.object({
  roleId: z.string().uuid('Invalid role ID'),
  companyId: z.string().uuid('Invalid company ID').nullable().optional(), // null = "All Companies"
});

export const inviteUserSchema = z.object({
  email: z.string().email('Invalid email'),
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
  // Legacy: single company assignment
  companyId: z.string().uuid('Invalid company ID').optional(),
  // Multi-company assignments (which companies user can access)
  companyAssignments: z.array(companyAssignmentSchema).optional(),
  // Role assignments (required - at least one role assignment needed)
  roleAssignments: z.array(roleAssignmentSchema).min(1, 'At least one role assignment is required'),
});

export type CompanyAssignmentInput = z.infer<typeof companyAssignmentSchema>;
export type RoleAssignmentInput = z.infer<typeof roleAssignmentSchema>;
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

// ============================================================================
// Tenant Setup Wizard
// ============================================================================

// Admin user for setup (simplified - no role or companyId needed)
export const setupAdminUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
});

export type SetupAdminUserInput = z.infer<typeof setupAdminUserSchema>;

// First company for setup (optional)
export const setupFirstCompanySchema = z.object({
  uen: z
    .string()
    .min(9, 'UEN must be at least 9 characters')
    .max(10, 'UEN must be at most 10 characters')
    .regex(/^[A-Z0-9]+$/, 'UEN must contain only uppercase letters and numbers'),
  name: z.string().min(1, 'Company name is required').max(200),
  entityType: z
    .enum([
      'PRIVATE_LIMITED',
      'PUBLIC_LIMITED',
      'SOLE_PROPRIETORSHIP',
      'PARTNERSHIP',
      'LIMITED_PARTNERSHIP',
      'LIMITED_LIABILITY_PARTNERSHIP',
      'FOREIGN_COMPANY',
      'VARIABLE_CAPITAL_COMPANY',
      'OTHER',
    ])
    .default('PRIVATE_LIMITED'),
});

export type SetupFirstCompanyInput = z.infer<typeof setupFirstCompanySchema>;

// Tenant info update for setup (subset of update schema)
export const setupTenantInfoSchema = z.object({
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be at most 100 characters')
    .optional(),
  contactEmail: z.string().email('Invalid email').optional().nullable(),
  contactPhone: z.string().max(20).optional().nullable(),
});

export type SetupTenantInfoInput = z.infer<typeof setupTenantInfoSchema>;

// Complete setup wizard payload
export const tenantSetupWizardSchema = z.object({
  tenantInfo: setupTenantInfoSchema.optional(),
  adminUser: setupAdminUserSchema,
  firstCompany: setupFirstCompanySchema.optional().nullable(),
});

export type TenantSetupWizardInput = z.infer<typeof tenantSetupWizardSchema>;
