/**
 * MAS Exchange Rate API Client
 *
 * Fetches daily exchange rates from the Monetary Authority of Singapore (MAS).
 * API Documentation: https://eservices.mas.gov.sg/api/action/datastore/search.json
 *
 * Key features:
 * - Fetches daily exchange rates against SGD
 * - Handles rate divisors (e.g., JPY/100, CNY/100)
 * - Supports date-specific and latest rate queries
 * - No API key required (public API)
 */

import { createLogger } from '@/lib/logger';
import type { SupportedCurrency } from '@/lib/validations/exchange-rate';

const log = createLogger('mas-api');

// ============================================================================
// CONSTANTS
// ============================================================================

const MAS_API_BASE = 'https://eservices.mas.gov.sg/api/action/datastore/search.json';
const MAS_DAILY_RATES_RESOURCE_ID = '95932927-c8bc-4e7a-b484-68a66a24edfe';

/**
 * Mapping of MAS API field names to currency codes and divisors.
 * MAS returns some rates per 100 units (e.g., jpy_100_sgd = 100 JPY in SGD).
 */
export const MAS_CURRENCY_MAP: Record<string, { code: SupportedCurrency; divisor: number }> = {
  usd_sgd: { code: 'USD', divisor: 1 },
  eur_sgd: { code: 'EUR', divisor: 1 },
  gbp_sgd: { code: 'GBP', divisor: 1 },
  aud_sgd: { code: 'AUD', divisor: 1 },
  nzd_sgd: { code: 'NZD', divisor: 1 },
  chf_sgd: { code: 'CHF', divisor: 1 },
  jpy_100_sgd: { code: 'JPY', divisor: 100 },
  cny_100_sgd: { code: 'CNY', divisor: 100 },
  hkd_100_sgd: { code: 'HKD', divisor: 100 },
  inr_100_sgd: { code: 'INR', divisor: 100 },
  idr_100_sgd: { code: 'IDR', divisor: 100 },
  krw_100_sgd: { code: 'KRW', divisor: 100 },
  myr_100_sgd: { code: 'MYR', divisor: 100 },
  php_100_sgd: { code: 'PHP', divisor: 100 },
  qar_100_sgd: { code: 'QAR', divisor: 100 },
  sar_100_sgd: { code: 'SAR', divisor: 100 },
  twd_100_sgd: { code: 'TWD', divisor: 100 },
  thb_100_sgd: { code: 'THB', divisor: 100 },
  aed_100_sgd: { code: 'AED', divisor: 100 },
  vnd_100_sgd: { code: 'VND', divisor: 100 },
};

// ============================================================================
// TYPES
// ============================================================================

/**
 * Raw response from MAS API.
 */
export interface MASApiResponse {
  success: boolean;
  result: {
    resource_id: string;
    fields: Array<{ type: string; id: string }>;
    records: MASExchangeRateRecord[];
    total: number;
    _links?: {
      start: string;
      next?: string;
    };
  };
}

/**
 * Raw exchange rate record from MAS API.
 * Each field is a string representing the rate.
 */
export interface MASExchangeRateRecord {
  end_of_day: string; // Date in YYYY-MM-DD format
  preliminary: string; // "0" (final) or "1" (preliminary)
  timestamp: string; // Last updated timestamp
  [key: string]: string | undefined; // Currency rate fields
}

/**
 * Parsed exchange rate ready for database storage.
 */
export interface ParsedExchangeRate {
  sourceCurrency: SupportedCurrency;
  targetCurrency: 'SGD';
  rate: number; // Rate per 1 unit of source currency
  inverseRate: number; // 1/rate
  rateDate: Date;
  isPreliminary: boolean;
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

/**
 * Fetch exchange rates for a specific date from MAS API.
 *
 * @param date - The date to fetch rates for (defaults to today)
 * @returns Array of parsed exchange rates
 */
export async function fetchDailyRates(date?: Date): Promise<ParsedExchangeRate[]> {
  const targetDate = date || new Date();
  const dateStr = formatDateForMAS(targetDate);

  log.debug(`Fetching MAS daily rates for ${dateStr}`);

  try {
    const url = buildMASUrl({
      filters: JSON.stringify({ end_of_day: dateStr }),
      limit: 1,
    });

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      // No cache for API calls
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`MAS API returned ${response.status}: ${response.statusText}`);
    }

    const data: MASApiResponse = await response.json();

    if (!data.success) {
      throw new Error('MAS API returned success: false');
    }

    if (!data.result.records || data.result.records.length === 0) {
      log.warn(`No rates found for date ${dateStr}`);
      return [];
    }

    const record = data.result.records[0];
    const rates = parseExchangeRateRecord(record);

    log.info(`Fetched ${rates.length} rates for ${dateStr}`);
    return rates;
  } catch (error) {
    log.error('Failed to fetch MAS daily rates:', error);
    throw error;
  }
}

/**
 * Fetch the latest available exchange rates from MAS API.
 * This fetches the most recent rates available (usually yesterday's).
 *
 * @returns Array of parsed exchange rates
 */
export async function fetchLatestRates(): Promise<ParsedExchangeRate[]> {
  log.debug('Fetching latest MAS rates');

  try {
    const url = buildMASUrl({
      sort: 'end_of_day desc',
      limit: 1,
    });

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`MAS API returned ${response.status}: ${response.statusText}`);
    }

    const data: MASApiResponse = await response.json();

    if (!data.success) {
      throw new Error('MAS API returned success: false');
    }

    if (!data.result.records || data.result.records.length === 0) {
      log.warn('No rates found in MAS API');
      return [];
    }

    const record = data.result.records[0];
    const rates = parseExchangeRateRecord(record);

    log.info(`Fetched ${rates.length} latest rates (date: ${record.end_of_day})`);
    return rates;
  } catch (error) {
    log.error('Failed to fetch latest MAS rates:', error);
    throw error;
  }
}

/**
 * Fetch exchange rates for a date range from MAS API.
 *
 * @param startDate - Start of date range
 * @param endDate - End of date range
 * @returns Array of parsed exchange rates for all dates in range
 */
export async function fetchRatesForDateRange(
  startDate: Date,
  endDate: Date
): Promise<ParsedExchangeRate[]> {
  const startStr = formatDateForMAS(startDate);
  const endStr = formatDateForMAS(endDate);

  log.debug(`Fetching MAS rates from ${startStr} to ${endStr}`);

  try {
    // MAS API uses SQL-like filters
    const filters = {
      end_of_day: { '>=': startStr, '<=': endStr },
    };

    const url = buildMASUrl({
      filters: JSON.stringify(filters),
      sort: 'end_of_day asc',
      limit: 100, // Max records to fetch
    });

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`MAS API returned ${response.status}: ${response.statusText}`);
    }

    const data: MASApiResponse = await response.json();

    if (!data.success) {
      throw new Error('MAS API returned success: false');
    }

    const allRates: ParsedExchangeRate[] = [];
    for (const record of data.result.records) {
      const rates = parseExchangeRateRecord(record);
      allRates.push(...rates);
    }

    log.info(
      `Fetched ${allRates.length} rates for date range ${startStr} to ${endStr} (${data.result.records.length} days)`
    );
    return allRates;
  } catch (error) {
    log.error('Failed to fetch MAS rates for date range:', error);
    throw error;
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Build MAS API URL with query parameters.
 */
function buildMASUrl(params: Record<string, string | number>): string {
  const url = new URL(MAS_API_BASE);
  url.searchParams.set('resource_id', MAS_DAILY_RATES_RESOURCE_ID);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  return url.toString();
}

/**
 * Format date for MAS API query (YYYY-MM-DD).
 */
function formatDateForMAS(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Parse a single MAS exchange rate record into individual currency rates.
 */
function parseExchangeRateRecord(record: MASExchangeRateRecord): ParsedExchangeRate[] {
  const rates: ParsedExchangeRate[] = [];
  const rateDate = new Date(record.end_of_day);
  const isPreliminary = record.preliminary === '1';

  for (const [field, config] of Object.entries(MAS_CURRENCY_MAP)) {
    const rawValue = record[field];

    // Skip if no value for this currency
    if (!rawValue || rawValue === '' || rawValue === '-') {
      continue;
    }

    const parsedValue = parseFloat(rawValue);
    if (isNaN(parsedValue) || parsedValue <= 0) {
      log.warn(`Invalid rate value for ${field}: ${rawValue}`);
      continue;
    }

    // Calculate rate per 1 unit of source currency
    // MAS returns: X SGD per [divisor] units of foreign currency
    // We want: X SGD per 1 unit of foreign currency
    const rate = parsedValue / config.divisor;
    const inverseRate = 1 / rate;

    rates.push({
      sourceCurrency: config.code,
      targetCurrency: 'SGD',
      rate,
      inverseRate,
      rateDate,
      isPreliminary,
    });
  }

  return rates;
}

/**
 * Check if MAS API is available.
 */
export async function checkMASApiHealth(): Promise<boolean> {
  try {
    const url = buildMASUrl({ limit: 1 });
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });

    if (!response.ok) {
      return false;
    }

    const data: MASApiResponse = await response.json();
    return data.success === true;
  } catch {
    return false;
  }
}
