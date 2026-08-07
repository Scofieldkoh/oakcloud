/**
 * GoBusiness eAdviser Company Name Availability Check
 *
 * Checks whether a proposed Singapore company name appears to be available
 * for incorporation by querying the public GoBusiness eAdviser "Start a
 * Business" name search. The endpoint returns similar ACRA-registered
 * business names (accurate as of 23:59 the previous day).
 *
 * Usage:
 *   const result = await checkCompanyNameAvailability('Acme Holdings');
 *   // result = { available: boolean, checkedAt: ISO string, records: [...] }
 */

import logger from '@/lib/logger';

const GOBIZ_EADVISER_API_BASE_URL =
  process.env.GOBIZ_EADVISER_API_BASE_URL || 'https://api.eadviser.gobusiness.gov.sg';

const SEARCH_PATH = '/api/ipos/search';
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RETRY_ATTEMPTS = 1; // Total attempts = 1 initial + 1 retry
const MAX_RECORDS = 10;

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
  records: CompanyNameCheckRecord[];
}

export class CompanyNameCheckUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CompanyNameCheckUnavailableError';
  }
}

interface GobizBusinessNameRecord {
  uen?: unknown;
  entityName?: unknown;
  entityStatus?: unknown;
}

interface GobizIposResponse {
  data?: {
    businessNameService?: {
      status?: unknown;
      records?: GobizBusinessNameRecord[];
    };
  };
  hasError?: unknown;
}

export function normalizeCompanyName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function normalizeRecord(record: GobizBusinessNameRecord): CompanyNameCheckRecord | null {
  if (!record || typeof record !== 'object') return null;

  const uen = typeof record.uen === 'string' ? record.uen.trim().slice(0, 32) : '';
  const entityName = typeof record.entityName === 'string' ? record.entityName.trim().slice(0, 500) : '';
  const entityStatus = typeof record.entityStatus === 'string' ? record.entityStatus.trim().slice(0, 200) : '';

  if (!uen && !entityName) return null;

  return { uen, entityName, entityStatus };
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Check whether a proposed company name appears to be available for
 * incorporation. Returns the similar ACRA records returned by GoBusiness
 * plus an `available` flag (true when no similar names are found).
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

  const url = new URL(SEARCH_PATH, GOBIZ_EADVISER_API_BASE_URL);
  url.searchParams.set('search-term', normalizedName);

  logger.info('Checking company name availability', { name: normalizedName });

  for (let attempt = 0; attempt <= MAX_RETRY_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchWithTimeout(url.toString(), REQUEST_TIMEOUT_MS);

      if (!response.ok) {
        const isLastAttempt = attempt >= MAX_RETRY_ATTEMPTS;
        logger.warn('GoBusiness name check returned non-OK status', {
          status: response.status,
          attempt: attempt + 1,
        });
        if (!isLastAttempt) continue;
        throw new CompanyNameCheckUnavailableError(
          `GoBusiness name check returned ${response.status}`
        );
      }

      const data = (await response.json()) as GobizIposResponse;
      const businessNameService = data?.data?.businessNameService;

      if (data?.hasError === true || !businessNameService) {
        throw new CompanyNameCheckUnavailableError('GoBusiness name check returned an invalid response');
      }

      const records = (businessNameService.records || [])
        .map(normalizeRecord)
        .filter((record): record is CompanyNameCheckRecord => !!record)
        .slice(0, MAX_RECORDS);

      logger.info('Company name availability check completed', {
        name: normalizedName,
        recordCount: records.length,
      });

      return {
        available: records.length === 0,
        checkedAt: new Date().toISOString(),
        records,
      };
    } catch (error) {
      if (error instanceof CompanyNameCheckUnavailableError) {
        throw error;
      }

      const isLastAttempt = attempt >= MAX_RETRY_ATTEMPTS;
      logger.warn('GoBusiness name check request failed', {
        error,
        attempt: attempt + 1,
        isLastAttempt,
      });

      if (!isLastAttempt) continue;

      throw new CompanyNameCheckUnavailableError(
        'GoBusiness name check is temporarily unavailable'
      );
    }
  }

  throw new CompanyNameCheckUnavailableError(
    'GoBusiness name check is temporarily unavailable'
  );
}
