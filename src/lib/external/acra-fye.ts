/**
 * ACRA Financial Year End Retrieval Utility
 *
 * Fetches account_due_date from data.gov.sg ACRA dataset and calculates
 * the Financial Year End (FYE) based on company type.
 *
 * Usage:
 *   const fye = await retrieveFYEFromACRA(companyName, uen, entityType);
 *   // fye = { day: 31, month: 12 }
 */

import logger from '@/lib/logger';

// Dataset mapping by first letter of company name
const ACRA_DATASETS: Record<string, string> = {
  A: 'd_8575e84912df3c28995b8e6e0e05205a',
  B: 'd_3a3807c023c61ddfba947dc069eb53f2',
  C: 'd_c0650f23e94c42e7a20921f4c5b75c24',
  D: 'd_acbc938ec77af18f94cecc4a7c9ec720',
  E: 'd_124a9bd407c7a25f8335b93b86e50fdd',
  F: 'd_4526d47d6714d3b052eed4a30b8b1ed6',
  G: 'd_b58303c68e9cf0d2ae93b73ffdbfbfa1',
  H: 'd_fa2ed456cf2b8597bb7e064b08fc3c7c',
  I: 'd_85518d970b8178975850457f60f1e738',
  J: 'd_478f45a9c541cbe679ca55d1cd2b970b',
  K: 'd_5573b0db0575db32190a2ad27919a7aa',
  L: 'd_a2141adf93ec2a3c2ec2837b78d6d46e',
  M: 'd_9af9317c646a1c881bb5591c91817cc6',
  N: 'd_67e99e6eabc4aad9b5d48663b579746a',
  O: 'd_5c4ef48b025fdfbc80056401f06e3df9',
  P: 'd_181005ca270b45408b4cdfc954980ca2',
  Q: 'd_4130f1d9d365d9f1633536e959f62bb7',
  R: 'd_2b8c54b2a490d2fa36b925289e5d9572',
  S: 'd_df7d2d661c0c11a7c367c9ee4bf896c1',
  T: 'd_72f37e5c5d192951ddc5513c2b134482',
  U: 'd_0cc5f52a1f298b916f317800251057f3',
  V: 'd_e97e8e7fc55b85a38babf66b0fa46b73',
  W: 'd_af2042c77ffaf0db5d75561ce9ef5688',
  X: 'd_1cd970d8351b42be4a308d628a6dd9d3',
  Y: 'd_31af23fdb79119ed185c256f03cb5773',
  Z: 'd_4e3db8955fdcda6f9944097bef3d2724',
  Other: 'd_300ddc8da4e8f7bdc1bfc62d0d99e2e7',
};

const DATA_GOV_BASE_URL = 'https://data.gov.sg/api/action/datastore_search';
const MAX_RETRY_ATTEMPTS = 2; // Total attempts = 1 initial + 2 retries
const BASE_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 10000;

// Entity types that are considered "company" structures
export const COMPANY_ENTITY_TYPES = [
  'PRIVATE_LIMITED',
  'EXEMPTED_PRIVATE_LIMITED',
  'PUBLIC_LIMITED',
  'FOREIGN_COMPANY',
  'VARIABLE_CAPITAL_COMPANY',
] as const;

export type CompanyEntityType = (typeof COMPANY_ENTITY_TYPES)[number];

export interface FYEResult {
  day: number;
  month: number;
}

export interface ACRARecord {
  uen: string;
  entity_name: string;
  account_due_date?: string;
  // Other fields exist but we only need account_due_date
}

interface DataGovResponse {
  success: boolean;
  result: {
    records: ACRARecord[];
    total: number;
  };
}

export class ACRARateLimitError extends Error {
  retryAfterSeconds?: number;

  constructor(message: string, retryAfterSeconds?: number) {
    super(message);
    this.name = 'ACRARateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterSeconds(retryAfterHeader: string | null): number | undefined {
  if (!retryAfterHeader) return undefined;

  const asNumber = Number(retryAfterHeader);
  if (!Number.isNaN(asNumber) && asNumber >= 0) {
    return asNumber;
  }

  const retryDateMs = Date.parse(retryAfterHeader);
  if (Number.isNaN(retryDateMs)) return undefined;

  const secondsUntilRetry = Math.ceil((retryDateMs - Date.now()) / 1000);
  return secondsUntilRetry > 0 ? secondsUntilRetry : undefined;
}

/**
 * Check if an entity type is a company structure (eligible for FYE retrieval)
 */
export function isCompanyEntityType(entityType: string): boolean {
  return COMPANY_ENTITY_TYPES.includes(entityType as CompanyEntityType);
}

/**
 * Check if entity type is a public company (uses 6 months for FYE calculation)
 */
export function isPublicCompany(entityType: string): boolean {
  return entityType === 'PUBLIC_LIMITED';
}

/**
 * Get the dataset ID based on the first letter of the company name
 */
export function getDatasetId(companyName: string): string {
  const firstChar = companyName.trim().charAt(0).toUpperCase();
  if (firstChar >= 'A' && firstChar <= 'Z') {
    return ACRA_DATASETS[firstChar];
  }
  return ACRA_DATASETS.Other;
}

/**
 * Get the last day of a given month
 */
export function getLastDayOfMonth(year: number, month: number): number {
  // Month is 1-indexed (1 = January, 12 = December)
  // Create date for first day of next month, then go back one day
  return new Date(year, month, 0).getDate();
}

/**
 * Fetch account_due_date from data.gov.sg ACRA dataset
 */
export async function fetchAccountDueDate(
  companyName: string,
  uen: string
): Promise<string | null> {
  const datasetId = getDatasetId(companyName);
  const url = `${DATA_GOV_BASE_URL}?resource_id=${datasetId}&q=${encodeURIComponent(uen)}`;

  logger.info('Fetching ACRA data', { companyName, uen, datasetId });

  try {
    for (let attempt = 0; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
      const response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });

      if (response.status === 429) {
        const retryAfterSeconds = parseRetryAfterSeconds(response.headers.get('retry-after'));
        const isLastAttempt = attempt >= MAX_RETRY_ATTEMPTS;

        if (isLastAttempt) {
          logger.error('ACRA API rate limit exceeded', {
            status: response.status,
            url,
            retryAfterSeconds,
            attempts: attempt + 1,
          });
          throw new ACRARateLimitError(
            'ACRA API rate limit exceeded. Please try again shortly.',
            retryAfterSeconds
          );
        }

        const backoffDelayMs = Math.min(
          BASE_RETRY_DELAY_MS * Math.pow(2, attempt),
          MAX_RETRY_DELAY_MS
        );
        const delayMs = retryAfterSeconds
          ? Math.min(retryAfterSeconds * 1000, MAX_RETRY_DELAY_MS)
          : backoffDelayMs;

        logger.warn('ACRA API rate limited, retrying', {
          attempt: attempt + 1,
          nextAttempt: attempt + 2,
          delayMs,
          retryAfterSeconds,
          url,
        });

        await sleep(delayMs);
        continue;
      }

      if (!response.ok) {
        logger.error('ACRA API request failed', { status: response.status, url });
        throw new Error(`ACRA API returned ${response.status}`);
      }

      const data: DataGovResponse = await response.json();

      if (!data.success || !data.result?.records?.length) {
        logger.info('No ACRA records found', { uen });
        return null;
      }

      // Find exact UEN match (search may return partial matches)
      const record = data.result.records.find(
        (r) => r.uen?.toUpperCase() === uen.toUpperCase()
      );

      if (!record) {
        logger.info('No exact UEN match in ACRA response', { uen });
        return null;
      }

      if (!record.account_due_date) {
        logger.info('ACRA record has no account_due_date', { uen });
        return null;
      }

      logger.info('Found ACRA account_due_date', {
        uen,
        account_due_date: record.account_due_date,
      });

      return record.account_due_date;
    }

    return null;
  } catch (error) {
    logger.error('Failed to fetch ACRA data', { error, uen });
    throw error;
  }
}

/**
 * Calculate FYE from account_due_date based on entity type
 *
 * - Public companies: 6 months before account_due_date
 * - All other company types: 7 months before account_due_date
 *
 * FYE is set to the last day of the calculated month.
 *
 * Example: account_due_date = 31 July 2026 for private company
 * → 7 months before = December 2025
 * → FYE = 31 December (day: 31, month: 12)
 */
export function calculateFYEFromAccountDueDate(
  accountDueDate: string,
  entityType: string
): FYEResult {
  const dueDate = new Date(accountDueDate);

  if (isNaN(dueDate.getTime())) {
    throw new Error(`Invalid account_due_date: ${accountDueDate}`);
  }

  // Determine months to subtract based on company type
  const monthsToSubtract = isPublicCompany(entityType) ? 6 : 7;

  // Calculate the FYE month
  const fyeDate = new Date(dueDate);
  fyeDate.setMonth(fyeDate.getMonth() - monthsToSubtract);

  const fyeMonth = fyeDate.getMonth() + 1; // Convert to 1-indexed
  const fyeYear = fyeDate.getFullYear();
  const fyeDay = getLastDayOfMonth(fyeYear, fyeMonth);

  logger.info('Calculated FYE', {
    accountDueDate,
    entityType,
    monthsToSubtract,
    fyeDay,
    fyeMonth,
  });

  return { day: fyeDay, month: fyeMonth };
}

/**
 * Main function: Retrieve FYE from ACRA data
 *
 * @param companyName - Company name (used to determine dataset)
 * @param uen - Company UEN
 * @param entityType - Entity type (e.g., PRIVATE_LIMITED)
 * @returns FYE result with day and month, or null if not found
 */
export async function retrieveFYEFromACRA(
  companyName: string,
  uen: string,
  entityType: string
): Promise<FYEResult | null> {
  if (!isCompanyEntityType(entityType)) {
    logger.info('Entity type not eligible for FYE retrieval', { entityType });
    return null;
  }

  const accountDueDate = await fetchAccountDueDate(companyName, uen);

  if (!accountDueDate) {
    return null;
  }

  return calculateFYEFromAccountDueDate(accountDueDate, entityType);
}
