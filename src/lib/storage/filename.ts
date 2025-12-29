/**
 * Document Filename Generation Utilities
 *
 * Generates standardized filenames for approved documents.
 * Format: [Sub-category]-[Vendor]-[Document Number]-[Currency] [Amount].ext
 * Example: Vendor Invoice-Acme-INV-2024-001-SGD 1,234.56.pdf
 */

import type { DocumentSubCategory } from '@/generated/prisma';
import { Prisma } from '@/generated/prisma';
import { getSubCategoryLabel } from '@/lib/document-categories';

type Decimal = Prisma.Decimal;

/**
 * Characters that are invalid in filenames across Windows, macOS, and Linux
 */
const INVALID_FILENAME_CHARS = /[<>:"/\\|?*\x00-\x1F]/g;

/**
 * Common legal suffixes to remove from company names (ordered by specificity)
 * More specific patterns should come first to avoid partial matches
 */
const LEGAL_SUFFIXES = [
  // Singapore
  'Private Limited',
  'Pte. Ltd.',
  'Pte Ltd',
  // Australia
  'Proprietary Limited',
  'Pty. Ltd.',
  'Pty Ltd',
  // General
  'Limited',
  'Ltd.',
  'Ltd',
  'Incorporated',
  'Inc.',
  'Inc',
  'L.L.C.',
  'LLC',
  'L.L.P.',
  'LLP',
  'Corporation',
  'Corp.',
  'Corp',
  'Company',
  'Co.',
  'Co',
  // Malaysia
  'Sdn. Bhd.',
  'Sdn Bhd',
  'Berhad',
  'Bhd',
  // European
  'S.A.',
  'SA',
  'GmbH',
  'AG',
  'B.V.',
  'BV',
  'N.V.',
  'NV',
  // Nordic
  'AB',
  'Oy',
  'A/S',
  'AS',
];

/**
 * Sanitize a string for use in filenames
 * - Removes invalid characters
 * - Replaces multiple spaces with single space
 * - Trims whitespace
 * - Limits length to prevent filesystem issues
 */
export function sanitizeForFilename(input: string, maxLength: number = 100): string {
  return input
    .replace(INVALID_FILENAME_CHARS, '') // Remove invalid chars
    .replace(/\s+/g, ' ') // Collapse multiple spaces
    .trim()
    .slice(0, maxLength); // Limit length
}

/**
 * Remove common legal suffixes from a company name
 * Example: "Acme Pte Ltd" → "Acme"
 */
export function shortenCompanyName(name: string): string {
  let result = name.trim();

  // Try to remove each suffix (case-insensitive)
  for (const suffix of LEGAL_SUFFIXES) {
    // Create case-insensitive regex with word boundary at start
    // Matches suffix at end of string, with optional comma/period before
    const pattern = new RegExp(`[,.]?\\s*${escapeRegex(suffix)}\\s*$`, 'i');
    const newResult = result.replace(pattern, '').trim();

    if (newResult !== result && newResult.length > 0) {
      result = newResult;
      // Continue checking for additional suffixes (e.g., "Holdings Pte Ltd" → "Holdings")
    }
  }

  return result;
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Format amount with commas and 2 decimal places
 * Example: 1234.5 → "1,234.50"
 */
export function formatAmountForFilename(
  amount: Decimal | number | string | null | undefined
): string | null {
  if (amount === null || amount === undefined) return null;

  const num =
    typeof amount === 'object' ? parseFloat(amount.toString()) : parseFloat(String(amount));

  if (isNaN(num)) return null;

  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

/**
 * Input for generating approved document filename
 */
export interface ApprovedDocumentFilenameInput {
  documentSubCategory?: DocumentSubCategory | null;
  vendorName?: string | null;
  documentNumber?: string | null;
  currency: string;
  totalAmount: Decimal | number | string;
  originalExtension: string; // e.g., '.pdf'
}

/**
 * Generate a standardized filename for an approved document
 *
 * Format: [Sub-category]-[Vendor]-[Document Number]-[Currency] [Amount].ext
 *
 * Parts are omitted if not available:
 * - With all parts: Vendor Invoice-Acme-INV-2024-001-SGD 1,234.56.pdf
 * - Missing vendor: Vendor Invoice-INV-2024-001-SGD 1,234.56.pdf
 * - Minimal: SGD 1,234.56.pdf
 */
export function generateApprovedDocumentFilename(input: ApprovedDocumentFilenameInput): string {
  const parts: string[] = [];

  // 1. Sub-category (proper casing via getSubCategoryLabel)
  if (input.documentSubCategory) {
    const label = getSubCategoryLabel(input.documentSubCategory);
    parts.push(label);
  }

  // 2. Vendor name (shortened and sanitized)
  if (input.vendorName) {
    const shortened = shortenCompanyName(input.vendorName);
    const sanitizedVendor = sanitizeForFilename(shortened, 40);
    if (sanitizedVendor) {
      parts.push(sanitizedVendor);
    }
  }

  // 3. Document number (sanitized)
  if (input.documentNumber) {
    const sanitizedDocNumber = sanitizeForFilename(input.documentNumber, 30);
    if (sanitizedDocNumber) {
      parts.push(sanitizedDocNumber);
    }
  }

  // 4. Currency and Amount (always present)
  const formattedAmount = formatAmountForFilename(input.totalAmount);
  if (formattedAmount) {
    parts.push(`${input.currency} ${formattedAmount}`);
  } else {
    // Fallback if amount parsing fails
    parts.push(input.currency);
  }

  // Join parts with hyphens and add extension
  const baseName = parts.join('-');
  const extension = input.originalExtension.startsWith('.')
    ? input.originalExtension
    : `.${input.originalExtension}`;

  return `${baseName}${extension}`;
}

/**
 * Extract file extension from a filename or storage key
 */
export function getFileExtension(filename: string): string {
  const match = filename.match(/\.[^.]+$/);
  return match ? match[0].toLowerCase() : '';
}

/**
 * Build new storage key for an approved document
 * Preserves the tenant/company/document directory structure
 */
export function buildApprovedStorageKey(currentStorageKey: string, newFilename: string): string {
  // Extract directory path from current key
  // e.g., "tenant-123/companies/comp-456/documents/doc-789/original.pdf"
  // -> "tenant-123/companies/comp-456/documents/doc-789/"
  const lastSlashIndex = currentStorageKey.lastIndexOf('/');

  if (lastSlashIndex === -1) {
    // No directory structure, just use new filename
    return newFilename;
  }

  const directory = currentStorageKey.substring(0, lastSlashIndex + 1);
  return `${directory}${newFilename}`;
}
