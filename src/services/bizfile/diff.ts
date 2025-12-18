/**
 * BizFile Diff Service
 *
 * Handles generating diffs between extracted BizFile data and existing company data.
 */

import { prisma } from '@/lib/prisma';
import { normalizeName, normalizeCompanyName } from '@/lib/utils';
import type { OfficerRole, IdentificationType, ContactType } from '@/generated/prisma';
import type {
  ExtractedBizFileData,
  ExtractedOfficerData,
  ExtractedShareholderData,
  BizFileDiffEntry,
  OfficerDiffEntry,
  ShareholderDiffEntry,
  ExtendedBizFileDiffResult,
} from './types';
import { mapEntityType, mapCompanyStatus, mapOfficerRole, mapIdentificationType } from './types';
import { buildFullAddress } from './normalizer';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format date for display
 */
function formatDate(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString().split('T')[0];
}

/**
 * Match extracted officer to existing officers
 */
function matchOfficer(
  extracted: ExtractedOfficerData,
  existingOfficers: Array<{ id: string; name: string; role: OfficerRole; identificationType: IdentificationType | null; identificationNumber: string | null; isCurrent: boolean }>
): { officer: typeof existingOfficers[number] | null; confidence: 'high' | 'medium' | 'low' } {
  // Priority 1: Match by identification (NRIC/FIN/Passport)
  if (extracted.identificationNumber && extracted.identificationType) {
    const idMatch = existingOfficers.find(o =>
      o.identificationNumber?.toUpperCase() === extracted.identificationNumber?.toUpperCase() &&
      o.identificationType === mapIdentificationType(extracted.identificationType)
    );
    if (idMatch) return { officer: idMatch, confidence: 'high' };
  }

  // Priority 2: Match by name + role
  const extractedRole = mapOfficerRole(extracted.role);
  const nameMatch = existingOfficers.find(o =>
    normalizeName(o.name)?.toLowerCase() === normalizeName(extracted.name)?.toLowerCase() &&
    o.role === extractedRole &&
    o.isCurrent
  );
  if (nameMatch) return { officer: nameMatch, confidence: 'medium' };

  return { officer: null, confidence: 'low' };
}

/**
 * Match extracted shareholder to existing shareholders
 */
function matchShareholder(
  extracted: ExtractedShareholderData,
  existingShareholders: Array<{ id: string; name: string; shareholderType: ContactType; identificationType: IdentificationType | null; identificationNumber: string | null; isCurrent: boolean; shareClass: string; numberOfShares: number }>
): { shareholder: typeof existingShareholders[number] | null; confidence: 'high' | 'medium' | 'low' } {
  const extractedType = extracted.type === 'CORPORATE' ? 'CORPORATE' : 'INDIVIDUAL';

  // Priority 1: Match by identification
  if (extracted.identificationNumber) {
    const idMatch = existingShareholders.find(s =>
      s.identificationNumber?.toUpperCase() === extracted.identificationNumber?.toUpperCase() &&
      s.shareholderType === extractedType &&
      s.isCurrent
    );
    if (idMatch) return { shareholder: idMatch, confidence: 'high' };
  }

  // Priority 2: Match by name
  const normalizedName = extractedType === 'CORPORATE'
    ? normalizeCompanyName(extracted.name)?.toLowerCase()
    : normalizeName(extracted.name)?.toLowerCase();

  const nameMatch = existingShareholders.find(s => {
    const existingNormalized = s.shareholderType === 'CORPORATE'
      ? normalizeCompanyName(s.name)?.toLowerCase()
      : normalizeName(s.name)?.toLowerCase();
    return existingNormalized === normalizedName && s.shareholderType === extractedType && s.isCurrent;
  });
  if (nameMatch) return { shareholder: nameMatch, confidence: 'medium' };

  return { shareholder: null, confidence: 'low' };
}

// ============================================================================
// Main Diff Function
// ============================================================================

/**
 * Generate a diff between existing company data and extracted BizFile data
 * Only returns fields that have actual differences
 */
export async function generateBizFileDiff(
  existingCompanyId: string,
  extractedData: ExtractedBizFileData,
  tenantId: string
): Promise<ExtendedBizFileDiffResult> {
  const company = await prisma.company.findFirst({
    where: { id: existingCompanyId, tenantId },
    include: {
      addresses: { where: { isCurrent: true } },
      officers: { where: { isCurrent: true } },
      shareholders: { where: { isCurrent: true } },
    },
  });

  if (!company) {
    throw new Error('Company not found');
  }

  const differences: BizFileDiffEntry[] = [];
  const { entityDetails, ssicActivities, registeredAddress, compliance, financialYear } = extractedData;

  // Compare entity details
  const entityComparisons: Array<{ field: string; label: string; oldVal: unknown; newVal: unknown }> = [
    { field: 'name', label: 'Company Name', oldVal: company.name, newVal: entityDetails.name },
    { field: 'formerName', label: 'Former Name', oldVal: company.formerName, newVal: entityDetails.formerName },
    { field: 'entityType', label: 'Entity Type', oldVal: company.entityType, newVal: mapEntityType(entityDetails.entityType) },
    { field: 'status', label: 'Status', oldVal: company.status, newVal: mapCompanyStatus(entityDetails.status) },
    { field: 'statusDate', label: 'Status Date', oldVal: formatDate(company.statusDate), newVal: entityDetails.statusDate },
    { field: 'incorporationDate', label: 'Incorporation Date', oldVal: formatDate(company.incorporationDate), newVal: entityDetails.incorporationDate },
  ];

  for (const { field, label, oldVal, newVal } of entityComparisons) {
    const oldStr = oldVal?.toString() || null;
    const newStr = newVal?.toString() || null;
    if (oldStr !== newStr && (oldStr || newStr)) {
      differences.push({ field, label, oldValue: oldStr, newValue: newStr, category: 'entity' });
    }
  }

  // Compare SSIC activities
  if (ssicActivities) {
    const ssicComparisons: Array<{ field: string; label: string; oldVal: unknown; newVal: unknown }> = [
      { field: 'primarySsicCode', label: 'Primary SSIC Code', oldVal: company.primarySsicCode, newVal: ssicActivities.primary?.code },
      { field: 'primarySsicDescription', label: 'Primary SSIC Description', oldVal: company.primarySsicDescription, newVal: ssicActivities.primary?.description },
      { field: 'secondarySsicCode', label: 'Secondary SSIC Code', oldVal: company.secondarySsicCode, newVal: ssicActivities.secondary?.code },
      { field: 'secondarySsicDescription', label: 'Secondary SSIC Description', oldVal: company.secondarySsicDescription, newVal: ssicActivities.secondary?.description },
    ];

    for (const { field, label, oldVal, newVal } of ssicComparisons) {
      const oldStr = oldVal?.toString() || null;
      const newStr = newVal?.toString() || null;
      if (oldStr !== newStr && (oldStr || newStr)) {
        differences.push({ field, label, oldValue: oldStr, newValue: newStr, category: 'ssic' });
      }
    }
  }

  // Compare registered address
  if (registeredAddress) {
    const currentAddress = company.addresses.find(a => a.addressType === 'REGISTERED_OFFICE');
    const newFullAddress = buildFullAddress(registeredAddress);
    const oldFullAddress = currentAddress?.fullAddress || null;

    if (oldFullAddress !== newFullAddress) {
      differences.push({
        field: 'registeredAddress',
        label: 'Registered Address',
        oldValue: oldFullAddress,
        newValue: newFullAddress,
        category: 'address',
      });
    }
  }

  // Compare compliance fields
  if (compliance) {
    const complianceComparisons: Array<{ field: string; label: string; oldVal: unknown; newVal: unknown }> = [
      { field: 'lastAgmDate', label: 'Last AGM Date', oldVal: formatDate(company.lastAgmDate), newVal: compliance.lastAgmDate },
      { field: 'lastArFiledDate', label: 'Last AR Filed Date', oldVal: formatDate(company.lastArFiledDate), newVal: compliance.lastArFiledDate },
      { field: 'accountsDueDate', label: 'Accounts Due Date', oldVal: formatDate(company.accountsDueDate), newVal: compliance.accountsDueDate },
    ];

    for (const { field, label, oldVal, newVal } of complianceComparisons) {
      const oldStr = oldVal?.toString() || null;
      const newStr = newVal?.toString() || null;
      if (oldStr !== newStr && (oldStr || newStr)) {
        differences.push({ field, label, oldValue: oldStr, newValue: newStr, category: 'compliance' });
      }
    }
  }

  // Compare financial year
  if (financialYear) {
    if (company.financialYearEndDay !== financialYear.endDay || company.financialYearEndMonth !== financialYear.endMonth) {
      const oldFye = company.financialYearEndDay && company.financialYearEndMonth
        ? `Day ${company.financialYearEndDay}, Month ${company.financialYearEndMonth}`
        : null;
      const newFye = `Day ${financialYear.endDay}, Month ${financialYear.endMonth}`;
      differences.push({
        field: 'financialYearEnd',
        label: 'Financial Year End',
        oldValue: oldFye,
        newValue: newFye,
        category: 'compliance',
      });
    }
  }

  // Compare share capital
  if (extractedData.shareCapital?.length) {
    // Calculate new capital values
    const newPaidUp = extractedData.shareCapital
      .filter((c) => c.isPaidUp && !c.isTreasury)
      .reduce((sum, c) => sum + c.totalValue, 0);
    const newIssued = extractedData.shareCapital
      .filter((c) => !c.isTreasury)
      .reduce((sum, c) => sum + c.totalValue, 0);
    const newCurrency = extractedData.shareCapital[0]?.currency || 'SGD';

    const oldPaidUp = company.paidUpCapitalAmount ? Number(company.paidUpCapitalAmount) : null;
    const oldIssued = company.issuedCapitalAmount ? Number(company.issuedCapitalAmount) : null;

    if (oldPaidUp !== newPaidUp) {
      differences.push({
        field: 'paidUpCapital',
        label: 'Paid Up Capital',
        oldValue: oldPaidUp ? `${company.paidUpCapitalCurrency || 'SGD'} ${oldPaidUp.toLocaleString()}` : null,
        newValue: `${newCurrency} ${newPaidUp.toLocaleString()}`,
        category: 'capital',
      });
    }

    if (oldIssued !== newIssued) {
      differences.push({
        field: 'issuedCapital',
        label: 'Issued Capital',
        oldValue: oldIssued ? `${company.issuedCapitalCurrency || 'SGD'} ${oldIssued.toLocaleString()}` : null,
        newValue: `${newCurrency} ${newIssued.toLocaleString()}`,
        category: 'capital',
      });
    }
  }

  // Generate officer diffs
  const officerDiffs: OfficerDiffEntry[] = [];
  const existingOfficers = company.officers;
  const extractedOfficers = extractedData.officers || [];
  const matchedExistingOfficerIds = new Set<string>();

  for (const extractedOfficer of extractedOfficers) {
    // Skip officers with cessation dates (they are already ceased)
    if (extractedOfficer.cessationDate) continue;

    const matchResult = matchOfficer(extractedOfficer, existingOfficers);

    if (matchResult.officer) {
      matchedExistingOfficerIds.add(matchResult.officer.id);

      // Check for updates (role changes, dates)
      const changes: Array<{ field: string; label: string; oldValue: string | null; newValue: string | null }> = [];
      const extractedRole = mapOfficerRole(extractedOfficer.role);

      if (matchResult.officer.role !== extractedRole) {
        changes.push({
          field: 'role',
          label: 'Role',
          oldValue: matchResult.officer.role,
          newValue: extractedRole,
        });
      }

      if (changes.length > 0) {
        officerDiffs.push({
          type: 'updated',
          officerId: matchResult.officer.id,
          name: extractedOfficer.name,
          role: extractedRole,
          changes,
          extractedData: extractedOfficer,
          matchConfidence: matchResult.confidence,
        });
      }
    } else {
      // New officer
      officerDiffs.push({
        type: 'added',
        name: extractedOfficer.name,
        role: mapOfficerRole(extractedOfficer.role),
        extractedData: extractedOfficer,
        matchConfidence: 'low',
      });
    }
  }

  // Find potentially ceased officers (in DB but not in extracted data)
  for (const existingOfficer of existingOfficers) {
    if (!matchedExistingOfficerIds.has(existingOfficer.id)) {
      officerDiffs.push({
        type: 'potentially_ceased',
        officerId: existingOfficer.id,
        name: existingOfficer.name,
        role: existingOfficer.role,
        matchConfidence: 'high',
      });
    }
  }

  // Generate shareholder diffs
  const shareholderDiffs: ShareholderDiffEntry[] = [];
  const existingShareholders = company.shareholders;
  const extractedShareholders = extractedData.shareholders || [];
  const matchedExistingShareholderIds = new Set<string>();

  for (const extractedShareholder of extractedShareholders) {
    const matchResult = matchShareholder(extractedShareholder, existingShareholders);

    if (matchResult.shareholder) {
      matchedExistingShareholderIds.add(matchResult.shareholder.id);

      // Check for shareholding changes
      const changes: Array<{ field: string; label: string; oldValue: string | number | null; newValue: string | number | null }> = [];
      const shareholdingChanges: ShareholderDiffEntry['shareholdingChanges'] = {};

      if (matchResult.shareholder.shareClass !== (extractedShareholder.shareClass || 'ORDINARY')) {
        shareholdingChanges.shareClass = {
          old: matchResult.shareholder.shareClass,
          new: extractedShareholder.shareClass || 'ORDINARY',
        };
        changes.push({
          field: 'shareClass',
          label: 'Share Class',
          oldValue: matchResult.shareholder.shareClass,
          newValue: extractedShareholder.shareClass || 'ORDINARY',
        });
      }

      if (matchResult.shareholder.numberOfShares !== extractedShareholder.numberOfShares) {
        shareholdingChanges.numberOfShares = {
          old: matchResult.shareholder.numberOfShares,
          new: extractedShareholder.numberOfShares,
        };
        changes.push({
          field: 'numberOfShares',
          label: 'Number of Shares',
          oldValue: matchResult.shareholder.numberOfShares,
          newValue: extractedShareholder.numberOfShares,
        });
      }

      if (changes.length > 0) {
        shareholderDiffs.push({
          type: 'updated',
          shareholderId: matchResult.shareholder.id,
          name: extractedShareholder.name,
          shareholderType: extractedShareholder.type === 'CORPORATE' ? 'CORPORATE' : 'INDIVIDUAL',
          changes,
          shareholdingChanges: Object.keys(shareholdingChanges).length > 0 ? shareholdingChanges : undefined,
          extractedData: extractedShareholder,
          matchConfidence: matchResult.confidence,
        });
      }
    } else {
      // New shareholder
      shareholderDiffs.push({
        type: 'added',
        name: extractedShareholder.name,
        shareholderType: extractedShareholder.type === 'CORPORATE' ? 'CORPORATE' : 'INDIVIDUAL',
        extractedData: extractedShareholder,
        matchConfidence: 'low',
      });
    }
  }

  // Find removed shareholders (in DB but not in extracted data)
  for (const existingShareholder of existingShareholders) {
    if (!matchedExistingShareholderIds.has(existingShareholder.id)) {
      shareholderDiffs.push({
        type: 'removed',
        shareholderId: existingShareholder.id,
        name: existingShareholder.name,
        shareholderType: existingShareholder.shareholderType === 'CORPORATE' ? 'CORPORATE' : 'INDIVIDUAL',
        matchConfidence: 'high',
      });
    }
  }

  // Build summary
  const summary = {
    officersAdded: officerDiffs.filter(d => d.type === 'added').length,
    officersUpdated: officerDiffs.filter(d => d.type === 'updated').length,
    officersPotentiallyCeased: officerDiffs.filter(d => d.type === 'potentially_ceased').length,
    shareholdersAdded: shareholderDiffs.filter(d => d.type === 'added').length,
    shareholdersUpdated: shareholderDiffs.filter(d => d.type === 'updated').length,
    shareholdersRemoved: shareholderDiffs.filter(d => d.type === 'removed').length,
  };

  const hasDifferences = differences.length > 0 || officerDiffs.length > 0 || shareholderDiffs.length > 0;

  return {
    hasDifferences,
    differences,
    existingCompany: { name: company.name, uen: company.uen },
    officerDiffs,
    shareholderDiffs,
    summary,
  };
}
