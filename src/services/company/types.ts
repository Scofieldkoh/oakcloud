/**
 * Company Service Type Definitions
 *
 * Shared types for the company, officer, and shareholder services.
 */

import type { Company } from '@prisma/client';
import type { Decimal } from '@prisma/client/runtime/library';

// ============================================================================
// Company Types
// ============================================================================

/**
 * Contact info included with officers/shareholders
 */
export interface RelatedContact {
  id: string;
  email?: string | null;
  phone?: string | null;
  nationality?: string | null;
  fullAddress?: string | null;
  identificationType?: string | null;
  identificationNumber?: string | null;
}

/**
 * Company with all related data included
 */
export interface CompanyWithRelations extends Company {
  addresses?: Array<{
    id: string;
    addressType: string;
    block?: string | null;
    streetName: string;
    level?: string | null;
    unit?: string | null;
    buildingName?: string | null;
    postalCode: string;
    country: string;
    fullAddress: string;
    isCurrent: boolean;
    effectiveFrom?: Date | null;
  }>;
  officers?: Array<{
    id: string;
    name: string;
    role: string;
    nationality?: string | null;
    address?: string | null;
    appointmentDate?: Date | null;
    cessationDate?: Date | null;
    isCurrent: boolean;
    contactId?: string | null;
    contact?: RelatedContact | null;
  }>;
  shareholders?: Array<{
    id: string;
    name: string;
    shareholderType?: string | null;
    nationality?: string | null;
    placeOfOrigin?: string | null;
    address?: string | null;
    shareClass?: string | null;
    numberOfShares: number;
    percentageHeld: Decimal | null;
    currency?: string | null;
    allotmentDate?: Date | null;
    isCurrent: boolean;
    contactId?: string | null;
    identificationType?: string | null;
    identificationNumber?: string | null;
    contact?: RelatedContact | null;
  }>;
  charges?: Array<{
    id: string;
    chargeNumber?: string | null;
    chargeType?: string | null;
    description?: string | null;
    chargeHolderName: string;
    amountSecured?: Decimal | null;
    amountSecuredText?: string | null;
    currency?: string | null;
    registrationDate?: Date | null;
    dischargeDate?: Date | null;
    isFullyDischarged: boolean;
  }>;
  _count?: {
    documents: number;
    officers: number;
    shareholders: number;
    charges: number;
  };
}

// ============================================================================
// Query Options
// ============================================================================

/**
 * Options for retrieving a company by ID or UEN
 */
export interface GetCompanyOptions {
  includeDeleted?: boolean;
  /**
   * Skip tenant filtering - ONLY use for SUPER_ADMIN operations that need
   * cross-tenant access. Regular operations MUST always provide tenantId.
   */
  skipTenantFilter?: boolean;
}

/**
 * Options for searching companies
 */
export interface SearchCompaniesOptions {
  /**
   * Skip tenant filtering - ONLY use for SUPER_ADMIN operations that need
   * cross-tenant access. Regular operations MUST always provide tenantId.
   */
  skipTenantFilter?: boolean;
  /**
   * Filter to specific company IDs - used for company-scoped users who have
   * access to multiple companies via role assignments.
   */
  companyIds?: string[];
}

/**
 * Options for company statistics
 */
export interface GetCompanyStatsOptions {
  /**
   * Skip tenant filtering - ONLY use for SUPER_ADMIN operations that need
   * cross-tenant statistics. Regular operations MUST always provide tenantId.
   */
  skipTenantFilter?: boolean;
}

// ============================================================================
// Statistics Types
// ============================================================================

/**
 * Company statistics for a tenant
 */
export interface CompanyStats {
  total: number;
  byStatus: Record<string, number>;
  byEntityType: Record<string, number>;
  recentlyAdded: number;
  withOverdueFilings: number;
}

/**
 * Company link information (for delete confirmation)
 */
export interface CompanyLinkInfo {
  hasLinks: boolean;
  officerCount: number;
  shareholderCount: number;
  chargeCount: number;
  documentCount: number;
  totalLinks: number;
}

// ============================================================================
// Search Result Types
// ============================================================================

/**
 * Paginated company search result
 */
export interface PaginatedCompanies {
  companies: CompanyWithRelations[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ============================================================================
// Officer Types
// ============================================================================

/**
 * Officer update data
 */
export interface OfficerUpdateData {
  appointmentDate?: string | null;
  cessationDate?: string | null;
}

/**
 * Officer update result
 */
export interface OfficerUpdateResult {
  id: string;
  appointmentDate: Date | null;
  cessationDate: Date | null;
  isCurrent: boolean;
}

// ============================================================================
// Shareholder Types
// ============================================================================

/**
 * Shareholder update data
 */
export interface ShareholderUpdateData {
  numberOfShares?: number;
  shareClass?: string;
}

/**
 * Shareholder update result
 */
export interface ShareholderUpdateResult {
  id: string;
  numberOfShares: number;
  shareClass: string | null;
  percentageHeld: number | null;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Fields tracked for audit logging on company updates
 */
export const TRACKED_COMPANY_FIELDS: (keyof Company)[] = [
  'name',
  'formerName',
  'dateOfNameChange',
  'uen',
  'entityType',
  'status',
  'statusDate',
  'incorporationDate',
  'dateOfAddress',
  'primarySsicCode',
  'primarySsicDescription',
  'secondarySsicCode',
  'secondarySsicDescription',
  'financialYearEndDay',
  'financialYearEndMonth',
  'fyeAsAtLastAr',
  'homeCurrency',
  'paidUpCapitalAmount',
  'issuedCapitalAmount',
  'isGstRegistered',
  'gstRegistrationNumber',
];
