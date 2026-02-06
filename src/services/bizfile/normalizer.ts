/**
 * BizFile Normalizer Service
 *
 * Handles data normalization and address formatting for BizFile data.
 */

import { normalizeName, normalizeCompanyName, normalizeAddress } from '@/lib/utils';
import type { ExtractedBizFileData } from './types';

const CURRENCY_NAME_MAP: Record<string, string> = {
  'SINGAPORE DOLLAR': 'SGD',
  'SINGAPORE DOLLARS': 'SGD',
  S: 'SGD',
};

/**
 * Normalize currency values to ISO 4217 3-letter codes when possible.
 * Example: "SINGAPORE DOLLAR" -> "SGD"
 */
function normalizeCurrency(value?: string): string | undefined {
  if (!value) return undefined;

  const trimmed = value.trim();
  if (!trimmed) return undefined;

  // Handle clean 3-letter ISO codes (case-insensitive)
  const compact = trimmed.toUpperCase().replace(/[^A-Z]/g, '');
  if (compact.length === 3) {
    return compact;
  }

  // Handle currency names / aliases
  const normalizedName = trimmed.toUpperCase().replace(/[^A-Z]+/g, ' ').trim();
  const codeToken = normalizedName.match(/\b[A-Z]{3}\b/)?.[0];
  if (codeToken) {
    return codeToken;
  }

  if (CURRENCY_NAME_MAP[normalizedName]) {
    return CURRENCY_NAME_MAP[normalizedName];
  }

  // Preserve unknown values (uppercase) to avoid silent data loss
  return trimmed.toUpperCase();
}

/**
 * Build full address string from address components
 */
export function buildFullAddress(addr: {
  block?: string;
  streetName: string;
  level?: string;
  unit?: string;
  buildingName?: string;
  postalCode: string;
}): string {
  const parts: string[] = [];
  if (addr.block) parts.push(addr.block);
  parts.push(addr.streetName);

  // Handle unit - strip any existing # prefix to avoid duplication (e.g., ##09-355)
  const cleanUnit = addr.unit?.replace(/^#/, '');
  const cleanLevel = addr.level?.replace(/^#/, '');

  if (cleanLevel && cleanUnit) {
    parts.push(`#${cleanLevel}-${cleanUnit}`);
  } else if (cleanUnit) {
    // Unit might already include level (e.g., "09-355"), just add # prefix
    parts.push(`#${cleanUnit}`);
  }
  if (addr.buildingName) parts.push(addr.buildingName);
  parts.push(`Singapore ${addr.postalCode}`);
  return normalizeAddress(parts.join(' '));
}

/**
 * Normalize extracted BizFile data before saving to database
 * Applies proper casing to names, company names, and addresses
 */
export function normalizeExtractedData(data: ExtractedBizFileData): ExtractedBizFileData {
  const normalized = { ...data };

  // Normalize currency values
  normalized.homeCurrency = normalizeCurrency(normalized.homeCurrency);

  if (normalized.paidUpCapital) {
    normalized.paidUpCapital = {
      ...normalized.paidUpCapital,
      currency: normalizeCurrency(normalized.paidUpCapital.currency) || 'SGD',
    };
  }

  if (normalized.issuedCapital) {
    normalized.issuedCapital = {
      ...normalized.issuedCapital,
      currency: normalizeCurrency(normalized.issuedCapital.currency) || 'SGD',
    };
  }

  if (normalized.shareCapital) {
    normalized.shareCapital = normalized.shareCapital.map((capital) => ({
      ...capital,
      currency: normalizeCurrency(capital.currency) || 'SGD',
    }));
  }

  if (normalized.treasuryShares) {
    normalized.treasuryShares = {
      ...normalized.treasuryShares,
      currency: normalizeCurrency(normalized.treasuryShares.currency),
    };
  }

  // Normalize entity details
  if (normalized.entityDetails) {
    normalized.entityDetails = {
      ...normalized.entityDetails,
      name: normalizeCompanyName(normalized.entityDetails.name) || normalized.entityDetails.name,
      formerName: normalized.entityDetails.formerName
        ? normalizeCompanyName(normalized.entityDetails.formerName)
        : undefined,
    };

    // Normalize former names array
    if (normalized.entityDetails.formerNames) {
      normalized.entityDetails.formerNames = normalized.entityDetails.formerNames.map((fn) => ({
        ...fn,
        name: normalizeCompanyName(fn.name) || fn.name,
      }));
    }
  }

  // Normalize SSIC descriptions (but not codes)
  if (normalized.ssicActivities) {
    if (normalized.ssicActivities.primary?.description) {
      normalized.ssicActivities.primary.description = normalizeCompanyName(
        normalized.ssicActivities.primary.description
      ) || normalized.ssicActivities.primary.description;
    }
    if (normalized.ssicActivities.secondary?.description) {
      normalized.ssicActivities.secondary.description = normalizeCompanyName(
        normalized.ssicActivities.secondary.description
      ) || normalized.ssicActivities.secondary.description;
    }
  }

  // Normalize addresses
  if (normalized.registeredAddress) {
    normalized.registeredAddress = {
      ...normalized.registeredAddress,
      streetName: normalizeAddress(normalized.registeredAddress.streetName) || normalized.registeredAddress.streetName,
      buildingName: normalized.registeredAddress.buildingName
        ? normalizeAddress(normalized.registeredAddress.buildingName)
        : undefined,
    };
  }

  if (normalized.mailingAddress) {
    normalized.mailingAddress = {
      ...normalized.mailingAddress,
      streetName: normalizeAddress(normalized.mailingAddress.streetName) || normalized.mailingAddress.streetName,
      buildingName: normalized.mailingAddress.buildingName
        ? normalizeAddress(normalized.mailingAddress.buildingName)
        : undefined,
    };
  }

  // Normalize officers
  if (normalized.officers) {
    normalized.officers = normalized.officers.map((officer) => ({
      ...officer,
      name: normalizeName(officer.name) || officer.name,
      nationality: officer.nationality ? normalizeCompanyName(officer.nationality) : undefined,
      address: officer.address ? normalizeAddress(officer.address) : undefined,
    }));
  }

  // Normalize shareholders
  if (normalized.shareholders) {
    normalized.shareholders = normalized.shareholders.map((shareholder) => ({
      ...shareholder,
      name: shareholder.type === 'CORPORATE'
        ? normalizeCompanyName(shareholder.name) || shareholder.name
        : normalizeName(shareholder.name) || shareholder.name,
      nationality: shareholder.nationality ? normalizeCompanyName(shareholder.nationality) : undefined,
      placeOfOrigin: shareholder.placeOfOrigin ? normalizeCompanyName(shareholder.placeOfOrigin) : undefined,
      address: shareholder.address ? normalizeAddress(shareholder.address) : undefined,
      currency: normalizeCurrency(shareholder.currency),
    }));
  }

  // Normalize auditor
  if (normalized.auditor) {
    normalized.auditor = {
      ...normalized.auditor,
      name: normalizeCompanyName(normalized.auditor.name) || normalized.auditor.name,
      address: normalized.auditor.address ? normalizeAddress(normalized.auditor.address) : undefined,
    };
  }

  // Normalize charges
  if (normalized.charges) {
    normalized.charges = normalized.charges.map((charge) => ({
      ...charge,
      chargeHolderName: normalizeCompanyName(charge.chargeHolderName) || charge.chargeHolderName,
      description: charge.description ? normalizeCompanyName(charge.description) : undefined,
      currency: normalizeCurrency(charge.currency),
    }));
  }

  return normalized;
}
