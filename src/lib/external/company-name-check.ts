/**
 * ACRA Company Name Availability Check (via the local acra_entity table)
 *
 * Checks whether a proposed Singapore company name appears to be available for
 * incorporation by searching the locally mirrored ACRA "Information on
 * Corporate Entities" data (the `acra_entity` table kept current by the daily
 * ACRA sync task).
 *
 * The check is DB-only: there is no live data.gov.sg fallback. While the local
 * table is empty (before the first sync/bootstrap completes) the check throws
 * `CompanyNameCheckUnavailableError`.
 *
 * Because the source data is refreshed monthly rather than in real time, every
 * result carries a `dataAsOf` timestamp (the collection's last-updated time)
 * so callers can show how fresh the data used for the check is.
 *
 * Usage:
 *   const result = await checkCompanyNameAvailability('Acme Holdings');
 *   // result = { available: boolean, checkedAt: ISO string, dataAsOf: ISO string | null, records: [...] }
 */

import { Prisma } from '@/generated/prisma';
import logger from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { getAcraSyncState } from '@/services/acra-sync.service';

const MAX_RECORDS = 10;
const DB_QUERY_LIMIT = 500;

// Company-type suffix tokens that are not distinctive when comparing names.
const COMPANY_SUFFIX_WORDS = new Set([
  'pte', 'ltd', 'limited', 'llp', 'llc', 'inc', 'corp', 'corporation',
  'sdn', 'bhd', 'berhad', 'plc', 'gmbh', 'ptd',
]);

export const COMPANY_NAME_MAX_LENGTH = 300;
export const COMPANY_NAME_RECORD_COUNT_CAP = MAX_RECORDS;

export interface CompanyNameCheckRecord {
  uen: string;
  entityName: string;
  entityStatus: string;
}

export interface CompanyNameCheckResult {
  available: boolean;
  checkedAt: string;
  /** Last-updated time of the ACRA collection the check was run against. */
  dataAsOf: string | null;
  records: CompanyNameCheckRecord[];
}

export class CompanyNameCheckUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CompanyNameCheckUnavailableError';
  }
}

export function normalizeCompanyName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function extractWords(value: string): string[] {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
}

function getSignificantWords(words: string[]): string[] {
  return words.filter((word) => word.length >= 3 && !COMPANY_SUFFIX_WORDS.has(word));
}

function wordsMatch(entityWords: string[], significantWords: string[]): boolean {
  return significantWords.every((word) => entityWords.includes(word));
}

/**
 * Check whether a proposed company name appears to be available for
 * incorporation. Searches the local ACRA entity table and returns similar
 * registered business names together with the collection's last-updated time
 * (`dataAsOf`), since the data is refreshed monthly.
 */
export async function checkCompanyNameAvailability(
  name: string
): Promise<CompanyNameCheckResult> {
  const normalizedName = normalizeCompanyName(name);

  if (!normalizedName) {
    throw new Error('Company name is required');
  }

  if (normalizedName.length > COMPANY_NAME_MAX_LENGTH) {
    throw new Error(`Company name must be at most ${COMPANY_NAME_MAX_LENGTH} characters`);
  }

  const queryWords = extractWords(normalizedName);
  const significantWords = getSignificantWords(queryWords);

  let syncState: { collectionLastUpdatedAt: string | null; entityCount: number } | null = null;
  try {
    syncState = await getAcraSyncState();
  } catch (error) {
    logger.warn('Reading the ACRA sync state failed', { error });
  }

  if (!syncState || syncState.entityCount <= 0) {
    throw new CompanyNameCheckUnavailableError(
      'Company name check is temporarily unavailable'
    );
  }

  logger.info('Checking company name availability', { name: normalizedName });

  // Significant words are >= 3 characters, which the pg_trgm GIN index can
  // accelerate. When none exist, fall back to a single substring condition.
  const where: Prisma.AcraEntityWhereInput = significantWords.length > 0
    ? {
        AND: significantWords.map((word) => ({
          entityName: { contains: word, mode: 'insensitive' },
        })),
      }
    : {
        entityName: { contains: normalizedName.toLowerCase(), mode: 'insensitive' },
      };

  let rawRecords: CompanyNameCheckRecord[];
  try {
    rawRecords = await prisma.acraEntity.findMany({
      where,
      select: { uen: true, entityName: true, entityStatus: true },
      orderBy: { entityName: 'asc' },
      take: DB_QUERY_LIMIT,
    });
  } catch (error) {
    logger.warn('Local ACRA entity query failed', { error });
    throw new CompanyNameCheckUnavailableError(
      'Company name check is temporarily unavailable'
    );
  }

  const seen = new Set<string>();
  const records: CompanyNameCheckRecord[] = [];

  for (const record of rawRecords) {
    const entityWords = extractWords(record.entityName);
    const matches = significantWords.length === 0
      ? record.entityName.toLowerCase().includes(normalizedName.toLowerCase())
      : wordsMatch(entityWords, significantWords);

    if (!matches) continue;

    const dedupeKey = record.uen || record.entityName.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    records.push(record);
    if (records.length >= MAX_RECORDS) break;
  }

  logger.info('Company name availability check completed', {
    name: normalizedName,
    recordCount: records.length,
    dataAsOf: syncState.collectionLastUpdatedAt,
  });

  return {
    available: records.length === 0,
    checkedAt: new Date().toISOString(),
    dataAsOf: syncState.collectionLastUpdatedAt,
    records,
  };
}
