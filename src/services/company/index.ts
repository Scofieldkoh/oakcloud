/**
 * Company Service Module
 *
 * This module handles company management, officers, and shareholders.
 * Re-exports from the main service file for backward compatibility.
 *
 * Module Structure:
 * - types.ts: Type definitions and constants
 * - index.ts: Re-exports (this file)
 * - ../company.service.ts: Main implementation (to be split in future)
 *
 * Future Refactoring Plan:
 * - company.service.ts: Core CRUD operations (create, update, delete, restore)
 * - officer.service.ts: Officer management (update, link, unlink, remove)
 * - shareholder.service.ts: Shareholder management (update, link, unlink, remove)
 * - company-query.service.ts: Query operations (getById, search, stats)
 */

// Re-export types
export * from './types';

// Re-export main service functions
// Note: These are re-exported from the original file for backward compatibility
export {
  // Company CRUD
  createCompany,
  updateCompany,
  deleteCompany,
  restoreCompany,

  // Company Queries
  getCompanyById,
  getCompanyByUen,
  searchCompanies,
  getCompanyFullDetails,

  // Company Statistics
  getCompanyStats,
  getCompanyLinkInfo,

  // Officer Management
  updateOfficer,
  linkOfficerToContact,
  unlinkOfficerFromContact,
  removeOfficer,

  // Shareholder Management
  updateShareholder,
  linkShareholderToContact,
  unlinkShareholderFromContact,
  removeShareholder,
} from '../company.service';

// Re-export legacy types for backward compatibility
export type {
  CompanyWithRelations as LegacyCompanyWithRelations,
  GetCompanyOptions as LegacyGetCompanyOptions,
  SearchCompaniesOptions as LegacySearchCompaniesOptions,
  GetCompanyStatsOptions as LegacyGetCompanyStatsOptions,
  CompanyLinkInfo as LegacyCompanyLinkInfo,
} from '../company.service';
