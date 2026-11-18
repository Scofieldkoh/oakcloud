/**
 * Sentroweb check configuration: fixed limits, the one search-options constant and the
 * environment settings. Credentials are read here only; nothing in this module logs them.
 */

/** At most this many searches (credits) per run. */
export const SENTROWEB_MAX_ENTITIES_PER_RUN = 10;

/** After the last run of a company, another run needs `force` for this long. */
export const SENTROWEB_COOLDOWN_MS = 10 * 60 * 1000;

/** QUEUED runs older than this are picked up by the scheduler (the in-process start missed). */
export const SENTROWEB_QUEUED_PICKUP_MS = 2 * 60 * 1000;

/** Extra time on top of the run timeout before a RUNNING run's lease counts as expired. */
export const SENTROWEB_LEASE_GRACE_MS = 2 * 60 * 1000;

/** Credits Sentroweb charges per confirmed search. The confirm modal must say exactly this. */
export const SENTROWEB_CREDITS_PER_SEARCH = 1;

/**
 * Search inputs (decision D1). Name plus the Individual/Entity tick only: fuzzy matching is off
 * and no country or date of birth is sent, the broadest exact search. Sentroweb has no UEN or
 * ID field, so those stay Oakcloud metadata.
 */
export const SENTROWEB_SEARCH_OPTIONS = {
  fuzzy: false,
  country: '',
  dateOfBirth: '',
} as const;

export interface SentrowebTimeouts {
  /** Every navigation, click and short wait. */
  stepMs: number;
  /** Waiting for a search result after CONFIRM. */
  resultMs: number;
  /** The whole run. */
  runMs: number;
  /** Pause between two searches. */
  searchDelayMs: number;
}

export const SENTROWEB_DEFAULT_TIMEOUTS: SentrowebTimeouts = {
  stepMs: 30_000,
  resultMs: 60_000,
  runMs: 10 * 60_000,
  searchDelayMs: 2_000,
};

export interface SentrowebConfig {
  baseUrl: string;
  accountId: string;
  username: string;
  password: string;
  timeouts: SentrowebTimeouts;
}

function positiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function nonNegativeInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

/** True when the feature switch is on. Anything but "true" (any case) is off. */
export function isSentrowebEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.SENTROWEB_ENABLED?.trim().toLowerCase() === 'true';
}

/**
 * The configuration, or null when the feature is switched off or a required variable is missing.
 * Callers turn null into 503 SENTROWEB_NOT_CONFIGURED. The base URL must be https (or http only
 * for loopback so the local fake server in tests works); only its origin is used.
 */
export function getSentrowebConfig(env: NodeJS.ProcessEnv = process.env): SentrowebConfig | null {
  if (!isSentrowebEnabled(env)) return null;

  const baseUrl = env.SENTROWEB_BASE_URL?.trim();
  const accountId = env.SENTROWEB_ACCOUNT_ID?.trim();
  const username = env.SENTROWEB_USERNAME?.trim();
  const password = env.SENTROWEB_PASSWORD;
  if (!baseUrl || !accountId || !username || !password) return null;

  let origin: string;
  try {
    const url = new URL(baseUrl);
    const loopback = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) return null;
    origin = url.origin;
  } catch {
    return null;
  }

  const stepMs = positiveInt(env.SENTROWEB_STEP_TIMEOUT_MS, SENTROWEB_DEFAULT_TIMEOUTS.stepMs);
  return {
    baseUrl: origin,
    accountId,
    username,
    password,
    timeouts: {
      stepMs,
      resultMs: Math.max(stepMs, SENTROWEB_DEFAULT_TIMEOUTS.resultMs),
      runMs: positiveInt(env.SENTROWEB_RUN_TIMEOUT_MS, SENTROWEB_DEFAULT_TIMEOUTS.runMs),
      searchDelayMs: nonNegativeInt(env.SENTROWEB_SEARCH_DELAY_MS, SENTROWEB_DEFAULT_TIMEOUTS.searchDelayMs),
    },
  };
}

/** Whether the feature is usable, without exposing any value. */
export function isSentrowebConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return getSentrowebConfig(env) !== null;
}
