/**
 * Placeholder Resolver
 *
 * Resolves template placeholders with actual data from companies, contacts,
 * and custom values. Supports Handlebars-inspired syntax including conditionals
 * and loops.
 */

import { format as formatDate, parseISO } from 'date-fns';
import { Decimal } from '@prisma/client/runtime/library';

// ============================================================================
// Types
// ============================================================================

export interface PlaceholderContext {
  company?: CompanyData | null;
  contact?: ContactData | null;
  custom?: Record<string, unknown>;
  system?: SystemData;
}

export interface CompanyData {
  id: string;
  name: string;
  uen: string;
  formerName?: string | null;
  entityType?: string | null;
  status?: string | null;
  incorporationDate?: Date | null;
  homeCurrency?: string | null;
  paidUpCapitalAmount?: Decimal | number | null;
  issuedCapitalAmount?: Decimal | number | null;
  financialYearEndMonth?: number | null;
  financialYearEndDay?: number | null;
  isGstRegistered?: boolean;
  gstRegistrationNumber?: string | null;
  addresses?: CompanyAddressData[];
  officers?: OfficerData[];
  shareholders?: ShareholderData[];
}

export interface CompanyAddressData {
  addressType: string;
  fullAddress: string;
  isCurrent: boolean;
}

export interface OfficerData {
  name: string;
  role: string;
  nationality?: string | null;
  address?: string | null;
  appointmentDate?: Date | null;
  cessationDate?: Date | null;
  isCurrent: boolean;
  contact?: {
    email?: string | null;
    phone?: string | null;
  } | null;
}

export interface ShareholderData {
  name: string;
  shareholderType?: string | null;
  nationality?: string | null;
  numberOfShares: number;
  percentageHeld?: Decimal | number | null;
  shareClass?: string | null;
  isCurrent: boolean;
  contact?: {
    email?: string | null;
    phone?: string | null;
  } | null;
}

export interface ContactData {
  id: string;
  fullName: string;
  firstName?: string | null;
  lastName?: string | null;
  contactType: string;
  email?: string | null;
  phone?: string | null;
  fullAddress?: string | null;
  nationality?: string | null;
  identificationNumber?: string | null;
}

export interface SystemData {
  currentDate: Date;
  tenantName?: string;
  generatedBy?: string;
}

export interface ResolveOptions {
  dateFormat?: string;
  currencySymbol?: string;
  missingPlaceholder?: 'blank' | 'keep' | 'highlight';
  numberLocale?: string;
}

const DEFAULT_OPTIONS: ResolveOptions = {
  dateFormat: 'dd MMMM yyyy',
  currencySymbol: 'S$',
  missingPlaceholder: 'highlight',
  numberLocale: 'en-SG',
};

// ============================================================================
// Main Resolver
// ============================================================================

/**
 * Resolves all placeholders in template content with provided context data.
 */
export function resolvePlaceholders(
  content: string,
  context: PlaceholderContext,
  options: ResolveOptions = {}
): { resolved: string; missing: string[] } {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const missing: string[] = [];

  // Add system data if not provided
  const fullContext: PlaceholderContext = {
    ...context,
    system: context.system || {
      currentDate: new Date(),
    },
  };

  let resolved = content;

  // Process #each loops first (most complex)
  resolved = processEachBlocks(resolved, fullContext, opts, missing);

  // Process #if conditionals
  resolved = processIfBlocks(resolved, fullContext, opts);

  // Process #with blocks
  resolved = processWithBlocks(resolved, fullContext, opts, missing);

  // Process simple placeholders last
  resolved = processSimplePlaceholders(resolved, fullContext, opts, missing);

  return { resolved, missing: [...new Set(missing)] };
}

// ============================================================================
// Block Processors
// ============================================================================

/**
 * Process {{#each items}}...{{/each}} blocks
 */
function processEachBlocks(
  content: string,
  context: PlaceholderContext,
  options: ResolveOptions,
  missing: string[]
): string {
  const eachRegex = /\{\{#each\s+([a-zA-Z_][a-zA-Z0-9_.]*)\}\}([\s\S]*?)\{\{\/each\}\}/g;

  return content.replace(eachRegex, (match, path, blockContent) => {
    const items = getValueByPath(context, path);

    if (!Array.isArray(items)) {
      missing.push(path);
      if (options.missingPlaceholder === 'keep') return match;
      if (options.missingPlaceholder === 'highlight')
        return `<span class="placeholder-missing">[Missing: ${path}]</span>`;
      return '';
    }

    if (items.length === 0) {
      return '';
    }

    // Resolve each item
    return items
      .map((item, index) => {
        // Create context with current item and index
        let itemContent = blockContent;

        // Replace @index, @first, @last
        itemContent = itemContent.replace(/\{\{@index\}\}/g, String(index));
        itemContent = itemContent.replace(/\{\{@first\}\}/g, String(index === 0));
        itemContent = itemContent.replace(/\{\{@last\}\}/g, String(index === items.length - 1));

        // Replace {{this.property}} with item property
        const thisRegex = /\{\{this\.([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;
        itemContent = itemContent.replace(thisRegex, (_: string, prop: string) => {
          const value = item[prop];
          return formatValue(value, options) ?? '';
        });

        // Replace {{property}} directly (shorthand)
        const propRegex = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;
        itemContent = itemContent.replace(propRegex, (fullMatch: string, prop: string) => {
          // Skip block helpers
          if (['if', 'each', 'unless', 'with'].some((h) => prop.startsWith(h))) {
            return fullMatch;
          }
          const value = item[prop];
          if (value === undefined) return fullMatch; // Keep for outer resolution
          return formatValue(value, options) ?? '';
        });

        return itemContent;
      })
      .join('');
  });
}

/**
 * Process {{#if condition}}...{{else}}...{{/if}} blocks
 */
function processIfBlocks(
  content: string,
  context: PlaceholderContext,
  options: ResolveOptions
): string {
  // Handle if-else blocks
  const ifElseRegex =
    /\{\{#if\s+([a-zA-Z_][a-zA-Z0-9_.]*)\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{\/if\}\}/g;
  content = content.replace(ifElseRegex, (_, path, trueBlock, falseBlock) => {
    const value = getValueByPath(context, path);
    return isTruthy(value) ? trueBlock : falseBlock;
  });

  // Handle simple if blocks (no else)
  const ifRegex = /\{\{#if\s+([a-zA-Z_][a-zA-Z0-9_.]*)\}\}([\s\S]*?)\{\{\/if\}\}/g;
  content = content.replace(ifRegex, (_, path, block) => {
    const value = getValueByPath(context, path);
    return isTruthy(value) ? block : '';
  });

  // Handle unless blocks (inverse of if)
  const unlessRegex = /\{\{#unless\s+([a-zA-Z_][a-zA-Z0-9_.]*)\}\}([\s\S]*?)\{\{\/unless\}\}/g;
  content = content.replace(unlessRegex, (_, path, block) => {
    const value = getValueByPath(context, path);
    return !isTruthy(value) ? block : '';
  });

  return content;
}

/**
 * Process {{#with object}}...{{/with}} blocks
 */
function processWithBlocks(
  content: string,
  context: PlaceholderContext,
  options: ResolveOptions,
  missing: string[]
): string {
  const withRegex = /\{\{#with\s+([a-zA-Z_][a-zA-Z0-9_.]*)\}\}([\s\S]*?)\{\{\/with\}\}/g;

  return content.replace(withRegex, (match, path, blockContent) => {
    const obj = getValueByPath(context, path);

    if (obj === null || obj === undefined || typeof obj !== 'object') {
      missing.push(path);
      if (options.missingPlaceholder === 'keep') return match;
      if (options.missingPlaceholder === 'highlight')
        return `<span class="placeholder-missing">[Missing: ${path}]</span>`;
      return '';
    }

    // Replace {{property}} with object property
    const propRegex = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;
    return blockContent.replace(propRegex, (fullMatch: string, prop: string) => {
      if (['if', 'each', 'unless', 'with'].some((h) => prop.startsWith(h))) {
        return fullMatch;
      }
      const value = (obj as Record<string, unknown>)[prop];
      if (value === undefined) return fullMatch;
      return formatValue(value, options) ?? '';
    });
  });
}

/**
 * Process simple {{placeholder}} values
 */
function processSimplePlaceholders(
  content: string,
  context: PlaceholderContext,
  options: ResolveOptions,
  missing: string[]
): string {
  const placeholderRegex = /\{\{([a-zA-Z_][a-zA-Z0-9_.\[\]]*)\}\}/g;

  return content.replace(placeholderRegex, (match, path) => {
    // Skip block helpers
    if (
      path.startsWith('#') ||
      path.startsWith('/') ||
      path.startsWith('@') ||
      ['if', 'each', 'unless', 'with', 'else'].includes(path)
    ) {
      return match;
    }

    const value = getValueByPath(context, path);

    if (value === undefined || value === null) {
      missing.push(path);
      if (options.missingPlaceholder === 'keep') return match;
      if (options.missingPlaceholder === 'highlight')
        return `<span class="placeholder-missing">[${path}]</span>`;
      return '';
    }

    return formatValue(value, options) ?? '';
  });
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Gets a value from a nested object by dot-notation path.
 * Supports array indexing: "officers[0].name"
 */
function getValueByPath(obj: unknown, path: string): unknown {
  if (!obj || typeof obj !== 'object') return undefined;

  const segments = path.split('.');
  let current: unknown = obj;

  for (const segment of segments) {
    if (current === null || current === undefined) return undefined;

    // Check for array index: items[0]
    const arrayMatch = segment.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\[(\d+)\]$/);
    if (arrayMatch) {
      const [, key, indexStr] = arrayMatch;
      const index = parseInt(indexStr, 10);
      const arr = (current as Record<string, unknown>)[key];
      if (!Array.isArray(arr)) return undefined;
      current = arr[index];
    } else {
      current = (current as Record<string, unknown>)[segment];
    }
  }

  return current;
}

/**
 * Formats a value for display based on its type.
 */
function formatValue(value: unknown, options: ResolveOptions): string | null {
  if (value === null || value === undefined) return null;

  // Handle Decimal (from Prisma)
  if (value instanceof Decimal) {
    return formatNumber(value.toNumber(), options);
  }

  // Handle Date
  if (value instanceof Date) {
    return formatDate(value, options.dateFormat || 'dd MMMM yyyy');
  }

  // Handle ISO date strings
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    try {
      const date = parseISO(value);
      return formatDate(date, options.dateFormat || 'dd MMMM yyyy');
    } catch {
      return value;
    }
  }

  // Handle numbers
  if (typeof value === 'number') {
    return formatNumber(value, options);
  }

  // Handle booleans
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  // Handle arrays (join with comma)
  if (Array.isArray(value)) {
    return value.map((v) => formatValue(v, options) ?? '').join(', ');
  }

  // Handle objects
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}

/**
 * Formats a number with locale-aware thousand separators.
 */
function formatNumber(num: number, options: ResolveOptions): string {
  const locale = options.numberLocale || 'en-SG';
  return num.toLocaleString(locale);
}

/**
 * Checks if a value is "truthy" for conditional blocks.
 */
function isTruthy(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return value.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value as object).length > 0;
  return Boolean(value);
}

// ============================================================================
// Placeholder Extraction
// ============================================================================

/**
 * Extracts all placeholder keys from template content.
 */
export function extractPlaceholders(content: string): string[] {
  const placeholders = new Set<string>();

  // Simple placeholders: {{company.name}}
  const simpleRegex = /\{\{([a-zA-Z_][a-zA-Z0-9_.\[\]]*)\}\}/g;
  let match;
  while ((match = simpleRegex.exec(content)) !== null) {
    const placeholder = match[1];
    // Skip helpers
    if (
      !placeholder.startsWith('#') &&
      !placeholder.startsWith('/') &&
      !placeholder.startsWith('@') &&
      !['if', 'each', 'unless', 'with', 'else'].includes(placeholder)
    ) {
      placeholders.add(placeholder);
    }
  }

  // Block paths: {{#each directors}}
  const blockRegex = /\{\{#(each|with)\s+([a-zA-Z_][a-zA-Z0-9_.]*)\}\}/g;
  while ((match = blockRegex.exec(content)) !== null) {
    placeholders.add(match[2]);
  }

  return Array.from(placeholders);
}

// ============================================================================
// Helper Functions for Specific Data Types
// ============================================================================

/**
 * Filters officers to get only current directors.
 */
export function getCurrentDirectors(officers: OfficerData[]): OfficerData[] {
  return officers.filter((o) => o.isCurrent && o.role === 'DIRECTOR');
}

/**
 * Filters officers to get only current secretaries.
 */
export function getCurrentSecretaries(officers: OfficerData[]): OfficerData[] {
  return officers.filter((o) => o.isCurrent && o.role === 'SECRETARY');
}

/**
 * Filters shareholders to get only current shareholders.
 */
export function getCurrentShareholders(shareholders: ShareholderData[]): ShareholderData[] {
  return shareholders.filter((s) => s.isCurrent);
}

/**
 * Gets the registered address from company addresses.
 */
export function getRegisteredAddress(addresses: CompanyAddressData[]): string | null {
  const registered = addresses.find(
    (a) => a.addressType === 'REGISTERED_OFFICE' && a.isCurrent
  );
  return registered?.fullAddress ?? null;
}

/**
 * Prepares company data for placeholder resolution with convenience helpers.
 */
export function prepareCompanyContext(company: CompanyData): PlaceholderContext {
  const directors = getCurrentDirectors(company.officers || []);
  const secretaries = getCurrentSecretaries(company.officers || []);
  const shareholders = getCurrentShareholders(company.shareholders || []);
  const registeredAddress = getRegisteredAddress(company.addresses || []);

  return {
    company: {
      ...company,
      // Add convenience accessors
      registeredAddress,
    } as CompanyData,
    custom: {
      directors,
      secretaries,
      shareholders,
      firstDirector: directors[0] || null,
      firstSecretary: secretaries[0] || null,
      directorCount: directors.length,
      shareholderCount: shareholders.length,
    },
    system: {
      currentDate: new Date(),
    },
  };
}
