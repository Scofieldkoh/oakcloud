/**
 * Shared Types
 *
 * Centralized type definitions used across multiple components and services.
 * Import these types instead of defining duplicates locally.
 */

import type {
  Company,
  CompanyAddress,
  CompanyOfficer,
  CompanyShareholder,
  CompanyCharge,
  ShareCapital,
  Document,
  Contact,
} from '@/generated/prisma';

// ============================================================================
// Company Types
// ============================================================================

/**
 * Company with all related entities
 */
export interface CompanyWithRelations extends Company {
  addresses?: CompanyAddress[];
  officers?: CompanyOfficer[];
  shareholders?: CompanyShareholder[];
  charges?: CompanyCharge[];
  shareCapital?: ShareCapital[];
  documents?: Document[];
  contacts?: Array<{
    contact: Contact;
    relationship: string;
    isPrimary: boolean;
  }>;
  _count?: {
    documents?: number;
    officers?: number;
    shareholders?: number;
    charges?: number;
    contacts?: number;
  };
}

/**
 * Minimal company representation for lists and dropdowns
 */
export interface CompanyBasic {
  id: string;
  name: string;
  uen: string;
  entityType?: string;
  status?: string;
}

// ============================================================================
// User Company Assignment Types
// ============================================================================

/**
 * User's assignment to a company
 */
export interface UserCompanyAssignment {
  id: string;
  userId: string;
  companyId: string;
  isPrimary: boolean;
  createdAt: Date;
  company: {
    id: string;
    name: string;
    uen: string;
  };
}

// ============================================================================
// Audit Log Types
// ============================================================================

/**
 * Structured changes for audit logging
 * Using specific types instead of unknown for better type safety
 */
export interface AuditChanges {
  [key: string]: {
    old: string | number | boolean | null | undefined;
    new: string | number | boolean | null | undefined;
  };
}

// ============================================================================
// Pagination Types
// ============================================================================

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ============================================================================
// Common API Response Types
// ============================================================================

export interface ApiError {
  error: string;
  details?: Record<string, string>;
}

export interface ApiSuccess<T = void> {
  success: boolean;
  message?: string;
  data?: T;
}
