/**
 * Document Validation Service
 *
 * Pre-generation validation to check if all required data is available
 * before generating a document from a template.
 */

import { prisma } from '@/lib/prisma';
import { extractPlaceholders, type CompanyData, type OfficerData, type ShareholderData, type CompanyAddressData } from '@/lib/placeholder-resolver';
import { resolvePartials } from '@/services/template-partial.service';
import type { PlaceholderDefinition, PlaceholderRequirement, PlaceholderSource } from '@/types/placeholders';

// ============================================================================
// Types
// ============================================================================

export interface ValidationError {
  field: string;
  message: string;
  category: 'company' | 'directors' | 'shareholders' | 'contacts' | 'officers' | 'custom';
  fixUrl?: string;
}

export interface ValidationWarning {
  field: string;
  message: string;
  suggestion?: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  resolvedData: {
    company?: CompanyData | null;
    directors?: OfficerData[];
    shareholders?: ShareholderData[];
    requiredPlaceholders: string[];
    availablePlaceholders: string[];
    missingPlaceholders: string[];
  };
}

export interface ValidateForGenerationInput {
  templateId: string;
  companyId?: string;
  contactIds?: string[];
  customData?: Record<string, unknown>;
}

// PlaceholderRequirement is imported from @/types/placeholders

// ============================================================================
// Placeholder Category Detection
// ============================================================================

/**
 * Determines the source category of a placeholder key.
 */
function getPlaceholderCategory(key: string): PlaceholderSource {
  const lowerKey = key.toLowerCase();

  if (lowerKey.startsWith('company.') || lowerKey === 'company') {
    return 'company';
  }
  if (lowerKey.startsWith('contact.') || lowerKey === 'contact') {
    return 'contact';
  }
  if (lowerKey.startsWith('director') || lowerKey.includes('director')) {
    return 'officer';
  }
  if (lowerKey.startsWith('secretary') || lowerKey.includes('secretary')) {
    return 'officer';
  }
  if (lowerKey.startsWith('officer') || lowerKey.includes('officer')) {
    return 'officer';
  }
  if (lowerKey.startsWith('shareholder') || lowerKey.includes('shareholder')) {
    return 'shareholder';
  }
  if (lowerKey.startsWith('system.') || lowerKey === 'system') {
    return 'system';
  }
  if (lowerKey.startsWith('custom.')) {
    return 'custom';
  }

  return 'custom';
}

/**
 * Analyzes template placeholders to determine requirements.
 */
function analyzeTemplatePlaceholders(content: string, templatePlaceholders?: PlaceholderDefinition[]): PlaceholderRequirement[] {
  const extractedKeys = extractPlaceholders(content);
  const requirements: PlaceholderRequirement[] = [];

  // Array placeholders that are handled by {{#each}} loops and don't need individual validation
  const arrayPlaceholders = ['directors', 'shareholders', 'secretaries', 'officers', 'contacts'];

  // Process extracted placeholders
  for (const key of extractedKeys) {
    // Skip array placeholders - they're validated separately via #each
    if (arrayPlaceholders.includes(key)) {
      continue;
    }

    const source = getPlaceholderCategory(key);

    // Check if this placeholder has explicit definition
    const definition = templatePlaceholders?.find(p => p.key === key);

    requirements.push({
      key,
      source,
      required: definition?.required ?? true, // Default to required
      minItems: undefined,
      maxItems: undefined,
      linkedTo: definition?.linkedTo, // Pass through conditional visibility link
    });
  }

  // Check for array requirements from #each blocks (these are warnings, not errors)
  const eachRegex = /\{\{#each\s+([a-zA-Z_][a-zA-Z0-9_.]*)\}\}/g;
  let match;
  while ((match = eachRegex.exec(content)) !== null) {
    const path = match[1];
    // Only add as requirement if not already in the list
    const existing = requirements.find(r => r.key === path);
    if (existing) {
      existing.minItems = 1; // If using #each, at least 1 item is expected
    }
    // Don't add array paths as required - they're optional and handled gracefully
  }

  return requirements;
}

// PlaceholderDefinition is imported from @/types/placeholders

// ============================================================================
// Data Fetching
// ============================================================================

/**
 * Fetches company data with all related information.
 */
async function fetchCompanyData(companyId: string, tenantId: string): Promise<CompanyData | null> {
  const company = await prisma.company.findFirst({
    where: { id: companyId, tenantId, deletedAt: null },
    include: {
      addresses: {
        select: {
          addressType: true,
          fullAddress: true,
          isCurrent: true,
        },
      },
      officers: {
        select: {
          name: true,
          role: true,
          nationality: true,
          address: true,
          appointmentDate: true,
          cessationDate: true,
          isCurrent: true,
          contact: {
            select: {
              email: true,
              phone: true,
            },
          },
        },
      },
      shareholders: {
        select: {
          name: true,
          shareholderType: true,
          nationality: true,
          numberOfShares: true,
          percentageHeld: true,
          shareClass: true,
          isCurrent: true,
          contact: {
            select: {
              email: true,
              phone: true,
            },
          },
        },
      },
    },
  });

  if (!company) return null;

  return {
    id: company.id,
    name: company.name,
    uen: company.uen,
    formerName: company.formerName,
    entityType: company.entityType,
    status: company.status,
    incorporationDate: company.incorporationDate,
    homeCurrency: company.homeCurrency,
    paidUpCapitalAmount: company.paidUpCapitalAmount,
    issuedCapitalAmount: company.issuedCapitalAmount,
    financialYearEndMonth: company.financialYearEndMonth,
    financialYearEndDay: company.financialYearEndDay,
    isGstRegistered: company.isGstRegistered,
    gstRegistrationNumber: company.gstRegistrationNumber,
    addresses: company.addresses as CompanyAddressData[],
    officers: company.officers as OfficerData[],
    shareholders: company.shareholders as ShareholderData[],
  };
}

// ============================================================================
// Validation Logic
// ============================================================================

/**
 * Validates company data against placeholder requirements.
 */
function validateCompanyData(
  company: CompanyData | null,
  requirements: PlaceholderRequirement[],
  companyId: string | undefined
): { errors: ValidationError[]; warnings: ValidationWarning[] } {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Check if company is required but not provided
  const companyRequirements = requirements.filter(r => r.source === 'company');
  if (companyRequirements.length > 0 && !companyId) {
    errors.push({
      field: 'company',
      message: 'Company selection is required for this template',
      category: 'company',
    });
    return { errors, warnings };
  }

  if (!company && companyRequirements.length > 0) {
    errors.push({
      field: 'company',
      message: 'Selected company not found or access denied',
      category: 'company',
    });
    return { errors, warnings };
  }

  if (!company) return { errors, warnings };

  // Validate specific company fields
  for (const req of companyRequirements) {
    const field = req.key.replace('company.', '');
    let value: unknown;

    // Special handling for computed fields
    if (field === 'registeredAddress') {
      // registeredAddress is computed from the addresses array
      const regAddress = company.addresses?.find(
        (a: CompanyAddressData) => a.addressType === 'REGISTERED_OFFICE' && a.isCurrent
      );
      value = regAddress?.fullAddress;
    } else {
      value = getNestedValue(company, field);
    }

    if (req.required && (value === null || value === undefined || value === '')) {
      errors.push({
        field: req.key,
        message: `${formatFieldName(field)} is required`,
        category: 'company',
        fixUrl: `/companies/${company.id}`,
      });
    }
  }

  return { errors, warnings };
}

/**
 * Validates officer data (directors/secretaries) against requirements.
 */
function validateOfficerData(
  company: CompanyData | null,
  requirements: PlaceholderRequirement[],
  _companyId: string | undefined
): { errors: ValidationError[]; warnings: ValidationWarning[] } {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (!company) return { errors, warnings };

  const officerRequirements = requirements.filter(r => r.source === 'officer');
  if (officerRequirements.length === 0) return { errors, warnings };

  const currentDirectors = (company.officers || []).filter(
    o => o.isCurrent && o.role === 'DIRECTOR'
  );
  const currentSecretaries = (company.officers || []).filter(
    o => o.isCurrent && o.role === 'SECRETARY'
  );

  // Check director requirements
  const directorReqs = officerRequirements.filter(r =>
    r.key.toLowerCase().includes('director')
  );

  for (const req of directorReqs) {
    const minRequired = req.minItems || 0;
    if (minRequired > 0 && currentDirectors.length < minRequired) {
      errors.push({
        field: req.key,
        message: `At least ${minRequired} director(s) required, but only ${currentDirectors.length} found`,
        category: 'directors',
        fixUrl: `/companies/${company.id}/officers`,
      });
    }

    if (req.maxItems && currentDirectors.length > req.maxItems) {
      warnings.push({
        field: req.key,
        message: `Template supports max ${req.maxItems} directors, but ${currentDirectors.length} found`,
        suggestion: 'Some directors may be excluded from the generated document',
      });
    }
  }

  // Check secretary requirements
  const secretaryReqs = officerRequirements.filter(r =>
    r.key.toLowerCase().includes('secretary')
  );

  for (const req of secretaryReqs) {
    const minRequired = req.minItems || 0;
    if (minRequired > 0 && currentSecretaries.length < minRequired) {
      errors.push({
        field: req.key,
        message: `At least ${minRequired} secretary(ies) required, but only ${currentSecretaries.length} found`,
        category: 'officers',
        fixUrl: `/companies/${company.id}/officers`,
      });
    }
  }

  return { errors, warnings };
}

/**
 * Validates shareholder data against requirements.
 */
function validateShareholderData(
  company: CompanyData | null,
  requirements: PlaceholderRequirement[]
): { errors: ValidationError[]; warnings: ValidationWarning[] } {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (!company) return { errors, warnings };

  const shareholderRequirements = requirements.filter(r => r.source === 'shareholder');
  if (shareholderRequirements.length === 0) return { errors, warnings };

  const currentShareholders = (company.shareholders || []).filter(s => s.isCurrent);

  for (const req of shareholderRequirements) {
    const minRequired = req.minItems || 0;
    if (minRequired > 0 && currentShareholders.length < minRequired) {
      errors.push({
        field: req.key,
        message: `At least ${minRequired} shareholder(s) required, but only ${currentShareholders.length} found`,
        category: 'shareholders',
        fixUrl: `/companies/${company.id}/shareholders`,
      });
    }

    if (req.maxItems && currentShareholders.length > req.maxItems) {
      warnings.push({
        field: req.key,
        message: `Template supports max ${req.maxItems} shareholders, but ${currentShareholders.length} found`,
        suggestion: 'Some shareholders may be excluded from the generated document',
      });
    }
  }

  return { errors, warnings };
}

/**
 * Validates custom data against requirements.
 * Respects linkedTo conditional visibility - if a placeholder is linked to a boolean
 * that is false, the placeholder is not required.
 */
function validateCustomData(
  customData: Record<string, unknown> | undefined,
  requirements: PlaceholderRequirement[]
): { errors: ValidationError[]; warnings: ValidationWarning[] } {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  const customRequirements = requirements.filter(r => r.source === 'custom');

  for (const req of customRequirements) {
    const key = req.key.replace('custom.', '');
    const value = customData?.[key];

    // Check if this placeholder is conditionally visible via linkedTo
    if (req.linkedTo) {
      const linkedBooleanValue = customData?.[req.linkedTo];
      // If the linked boolean is false/empty, skip validation for this field
      if (linkedBooleanValue !== 'true' && linkedBooleanValue !== '1' && linkedBooleanValue !== true) {
        continue; // Skip - the field is hidden and not required
      }
    }

    if (req.required && (value === undefined || value === null || value === '')) {
      errors.push({
        field: req.key,
        message: `Custom field "${formatFieldName(key)}" is required`,
        category: 'custom',
      });
    }
  }

  return { errors, warnings };
}

// ============================================================================
// Main Validation Function
// ============================================================================

/**
 * Validates all data required for document generation.
 */
export async function validateForGeneration(
  tenantId: string,
  input: ValidateForGenerationInput
): Promise<ValidationResult> {
  const { templateId, companyId, customData } = input;

  // Fetch template
  const template = await prisma.documentTemplate.findFirst({
    where: { id: templateId, tenantId, deletedAt: null },
    select: {
      id: true,
      name: true,
      content: true,
      placeholders: true,
    },
  });

  if (!template) {
    return {
      isValid: false,
      errors: [{
        field: 'template',
        message: 'Template not found or access denied',
        category: 'custom',
      }],
      warnings: [],
      resolvedData: {
        requiredPlaceholders: [],
        availablePlaceholders: [],
        missingPlaceholders: [],
      },
    };
  }

  // Resolve partials first to include their placeholders in validation
  let contentToValidate = template.content;
  try {
    contentToValidate = await resolvePartials(template.content, tenantId);
  } catch (partialError) {
    // If partial resolution fails, continue with original content
    console.warn('Failed to resolve partials for validation:', partialError);
  }

  // Analyze template requirements (with resolved partials)
  const requirements = analyzeTemplatePlaceholders(
    contentToValidate,
    (template.placeholders as unknown) as PlaceholderDefinition[] | undefined
  );

  // Fetch company data if needed
  const company = companyId ? await fetchCompanyData(companyId, tenantId) : null;

  // Run all validations
  const companyValidation = validateCompanyData(company, requirements, companyId);
  const officerValidation = validateOfficerData(company, requirements, companyId);
  const shareholderValidation = validateShareholderData(company, requirements);
  const customValidation = validateCustomData(customData, requirements);

  // Combine results
  const allErrors = [
    ...companyValidation.errors,
    ...officerValidation.errors,
    ...shareholderValidation.errors,
    ...customValidation.errors,
  ];

  const allWarnings = [
    ...companyValidation.warnings,
    ...officerValidation.warnings,
    ...shareholderValidation.warnings,
    ...customValidation.warnings,
  ];

  // Calculate placeholder availability
  const requiredPlaceholders = requirements.filter(r => r.required).map(r => r.key);
  const availablePlaceholders = calculateAvailablePlaceholders(company, customData);
  const missingPlaceholders = requiredPlaceholders.filter(
    p => !availablePlaceholders.includes(p)
  );

  return {
    isValid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
    resolvedData: {
      company,
      directors: company?.officers?.filter(o => o.isCurrent && o.role === 'DIRECTOR'),
      shareholders: company?.shareholders?.filter(s => s.isCurrent),
      requiredPlaceholders,
      availablePlaceholders,
      missingPlaceholders,
    },
  };
}

/**
 * Calculates which placeholders have available data.
 */
function calculateAvailablePlaceholders(
  company: CompanyData | null,
  customData?: Record<string, unknown>
): string[] {
  const available: string[] = [];

  // System placeholders are always available
  available.push('system.currentDate', 'system.tenantName', 'system.generatedBy');

  if (company) {
    // Company fields
    if (company.name) available.push('company.name');
    if (company.uen) available.push('company.uen');
    if (company.formerName) available.push('company.formerName');
    if (company.entityType) available.push('company.entityType');
    if (company.status) available.push('company.status');
    if (company.incorporationDate) available.push('company.incorporationDate');
    if (company.homeCurrency) available.push('company.homeCurrency');
    if (company.paidUpCapitalAmount) available.push('company.paidUpCapitalAmount');
    if (company.issuedCapitalAmount) available.push('company.issuedCapitalAmount');
    if (company.financialYearEndMonth) available.push('company.financialYearEndMonth');
    if (company.gstRegistrationNumber) available.push('company.gstRegistrationNumber');

    // Address
    const regAddress = company.addresses?.find(
      a => a.addressType === 'REGISTERED_OFFICE' && a.isCurrent
    );
    if (regAddress) available.push('company.registeredAddress');

    // Officers
    const directors = company.officers?.filter(o => o.isCurrent && o.role === 'DIRECTOR') || [];
    if (directors.length > 0) {
      available.push('directors');
      available.push('custom.directors');
      available.push('custom.directorCount');
      available.push('custom.firstDirector');
    }

    const secretaries = company.officers?.filter(o => o.isCurrent && o.role === 'SECRETARY') || [];
    if (secretaries.length > 0) {
      available.push('secretaries');
      available.push('custom.secretaries');
      available.push('custom.firstSecretary');
    }

    // Shareholders
    const shareholders = company.shareholders?.filter(s => s.isCurrent) || [];
    if (shareholders.length > 0) {
      available.push('shareholders');
      available.push('custom.shareholders');
      available.push('custom.shareholderCount');
    }
  }

  // Custom data
  if (customData) {
    for (const key of Object.keys(customData)) {
      if (customData[key] !== null && customData[key] !== undefined && customData[key] !== '') {
        available.push(`custom.${key}`);
      }
    }
  }

  return available;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Gets a nested value from an object by path.
 */
function getNestedValue(obj: unknown, path: string): unknown {
  if (!obj || typeof obj !== 'object') return undefined;

  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/**
 * Formats a field name for display.
 */
function formatFieldName(field: string): string {
  return field
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim();
}

// ============================================================================
// Section Detection
// ============================================================================

export interface DocumentSection {
  id: string;
  title: string;
  level: number;
  startIndex: number;
  endIndex: number;
}

/**
 * Extracts sections from document HTML content.
 * Detects headings (h1-h6) and explicit section markers.
 */
export function extractSections(content: string): DocumentSection[] {
  const sections: DocumentSection[] = [];
  let sectionIndex = 0;

  // Match heading tags with optional data-section attribute
  const headingRegex = /<h([1-6])(?:\s+[^>]*data-section="([^"]*)")?[^>]*>([\s\S]*?)<\/h\1>/gi;

  let match;
  while ((match = headingRegex.exec(content)) !== null) {
    const level = parseInt(match[1], 10);
    const explicitId = match[2];
    const titleHtml = match[3];

    // Strip HTML tags from title
    const title = titleHtml.replace(/<[^>]*>/g, '').trim();

    if (title) {
      sections.push({
        id: explicitId || `section-${sectionIndex}`,
        title,
        level,
        startIndex: match.index,
        endIndex: match.index + match[0].length,
      });
      sectionIndex++;
    }
  }

  // Also check for explicit section markers: <!-- SECTION: Title -->
  const markerRegex = /<!--\s*SECTION:\s*([^-]+?)-->/gi;
  while ((match = markerRegex.exec(content)) !== null) {
    const title = match[1].trim();

    if (title) {
      sections.push({
        id: `section-marker-${sectionIndex}`,
        title,
        level: 2, // Default level for explicit markers
        startIndex: match.index,
        endIndex: match.index + match[0].length,
      });
      sectionIndex++;
    }
  }

  // Sort by position in document
  sections.sort((a, b) => a.startIndex - b.startIndex);

  // Re-assign sequential IDs
  return sections.map((section, index) => ({
    ...section,
    id: section.id.startsWith('section-marker-') || section.id.startsWith('section-')
      ? `section-${index}`
      : section.id,
  }));
}

/**
 * Detects page breaks in document content.
 */
export function detectPageBreaks(content: string): number[] {
  const pageBreaks: number[] = [];

  // HTML comment style: <!-- PAGE_BREAK -->
  const commentRegex = /<!--\s*PAGE_BREAK\s*-->/gi;
  let match;
  while ((match = commentRegex.exec(content)) !== null) {
    pageBreaks.push(match.index);
  }

  // CSS style: page-break-after: always
  const cssRegex = /style="[^"]*page-break-(?:after|before):\s*always[^"]*"/gi;
  while ((match = cssRegex.exec(content)) !== null) {
    pageBreaks.push(match.index);
  }

  // Class-based: class="page-break"
  const classRegex = /class="[^"]*page-break[^"]*"/gi;
  while ((match = classRegex.exec(content)) !== null) {
    pageBreaks.push(match.index);
  }

  return pageBreaks.sort((a, b) => a - b);
}

/**
 * Adds anchor IDs to sections in HTML content for navigation.
 */
export function addSectionAnchors(content: string): string {
  let sectionIndex = 0;

  // Add IDs to heading tags
  const headingRegex = /<h([1-6])(\s+[^>]*)?>([\s\S]*?)<\/h\1>/gi;

  return content.replace(headingRegex, (match, level, attrs, innerContent) => {
    const existingId = attrs?.match(/id="([^"]*)"/)?.[1];
    const id = existingId || `section-${sectionIndex++}`;

    // Remove existing id if present
    const cleanAttrs = attrs?.replace(/\s*id="[^"]*"/, '') || '';

    return `<h${level} id="${id}"${cleanAttrs}>${innerContent}</h${level}>`;
  });
}
