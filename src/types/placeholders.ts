/**
 * Placeholder Types
 *
 * Centralized type definitions for document template placeholders.
 * These types are used across:
 * - Template editor (admin/template-partials/editor/page.tsx)
 * - Document generation wizard (document-generation-wizard.tsx)
 * - Document validation service (document-validation.service.ts)
 * - Placeholder resolver (placeholder-resolver.ts)
 */

// ============================================================================
// Placeholder Value Types
// ============================================================================

/**
 * Supported data types for placeholder values
 */
export type PlaceholderValueType =
  | 'text'
  | 'date'
  | 'number'
  | 'currency'
  | 'boolean'
  | 'textarea';

/**
 * Source category of a placeholder
 */
export type PlaceholderSource =
  | 'company'
  | 'contact'
  | 'officer'
  | 'shareholder'
  | 'custom'
  | 'system';

// ============================================================================
// Placeholder Definition Types
// ============================================================================

/**
 * Custom placeholder definition - user-defined placeholders in templates
 */
export interface CustomPlaceholderDefinition {
  /** Unique identifier */
  id: string;
  /** Placeholder key (used in template syntax: {{custom.key}}) */
  key: string;
  /** Human-readable label */
  label: string;
  /** Data type for validation and input rendering */
  type: PlaceholderValueType;
  /** Whether this placeholder is required for document generation */
  required: boolean;
  /** Default value if not provided */
  defaultValue?: string;
  /** Description/help text for the placeholder */
  description?: string;
  /** Key of template boolean placeholder that controls visibility (without 'custom.' prefix) */
  linkedTo?: string;
  /** Name of the partial this placeholder originated from */
  sourcePartial?: string;
}

/**
 * Placeholder definition stored in template JSON
 * Used by the validation service and resolver
 */
export interface PlaceholderDefinition {
  /** Placeholder key */
  key: string;
  /** Whether this placeholder is required */
  required?: boolean;
  /** Minimum items for array placeholders */
  minItems?: number;
  /** Maximum items for array placeholders */
  maxItems?: number;
  /** Key of boolean placeholder that controls visibility */
  linkedTo?: string;
  /** Name of the partial this placeholder came from */
  sourcePartial?: string;
}

/**
 * Extended placeholder definition with source tracking
 * Used when merging placeholders from templates and partials
 */
export interface MergedPlaceholder extends CustomPlaceholderDefinition {
  /** Where this placeholder came from */
  source: 'template' | 'partial';
  /** Name of the source template/partial */
  sourceName?: string;
  /** Display name of the source */
  sourceDisplayName?: string;
}

/**
 * Placeholder requirement for validation
 */
export interface PlaceholderRequirement {
  /** Placeholder key */
  key: string;
  /** Source category */
  source: PlaceholderSource;
  /** Whether this placeholder is required */
  required: boolean;
  /** Minimum items for array placeholders */
  minItems?: number;
  /** Maximum items for array placeholders */
  maxItems?: number;
  /** Key of boolean placeholder that controls visibility */
  linkedTo?: string;
}

// ============================================================================
// Mock Data Types (for template preview/testing)
// ============================================================================

/**
 * Address data structure
 */
export interface AddressData {
  block: string;
  street: string;
  level: string;
  unit: string;
  building: string;
  postalCode: string;
}

/**
 * Company data for mock preview
 */
export interface MockCompanyData {
  name: string;
  uen: string;
  registeredAddress: string;
  address: AddressData;
  incorporationDate: Date;
  entityType: string;
  capital: number;
}

/**
 * Director data for mock preview
 */
export interface MockDirectorData {
  name: string;
  identificationNumber: string;
  nationality: string;
  role: string;
  address: string;
}

/**
 * Shareholder data for mock preview
 */
export interface MockShareholderData {
  name: string;
  shareClass: string;
  numberOfShares: number;
  percentageHeld: number;
  identificationNumber: string;
  nationality: string;
}

/**
 * Custom data values - dynamic based on user-defined placeholders
 */
export type CustomData = Record<string, string | number | Date | undefined>;

/**
 * System data for templates
 */
export interface SystemData {
  currentDate: Date;
  generatedBy: string;
  tenantName?: string;
}

/**
 * Complete mock data values for template preview
 */
export interface MockDataValues {
  company: MockCompanyData;
  directors: MockDirectorData[];
  shareholders: MockShareholderData[];
  custom: CustomData;
  system: SystemData;
}

// ============================================================================
// Template Partial Type
// ============================================================================

/**
 * Template partial data structure
 */
export interface TemplatePartialData {
  id: string;
  name: string;
  displayName?: string | null;
  description?: string | null;
  content?: string;
  placeholders?: unknown;
}

// ============================================================================
// Re-exports from placeholder-resolver for convenience
// ============================================================================

// Note: The following types are defined in @/lib/placeholder-resolver.ts
// and should be imported from there for actual data operations:
// - CompanyData
// - OfficerData
// - ShareholderData
// - ContactData
// - PlaceholderContext
