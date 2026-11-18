import {
  SENTROWEB_ERROR_MESSAGES,
  type SentrowebErrorCode,
} from '@/lib/sentroweb/error-codes';

export { SENTROWEB_ERROR_CODES, SENTROWEB_ERROR_MESSAGES } from '@/lib/sentroweb/error-codes';
export type { SentrowebErrorCode } from '@/lib/sentroweb/error-codes';

/**
 * A failure while driving Sentroweb. The message is always the fixed text for the code, never
 * page text, so it is safe to store, log and show.
 */
export class SentrowebError extends Error {
  readonly code: SentrowebErrorCode;
  /**
   * True once CONFIRM was clicked for the current search: the credit may already be spent, so
   * nothing may submit that search again.
   */
  readonly searchSubmitted: boolean;
  /**
   * Credits this search is known to have cost when it failed after being sent. Only set when
   * Sentroweb itself said nothing is deducted (0). Absent means unknown, and the search is counted
   * as one credit.
   */
  readonly creditsCharged: number | undefined;

  constructor(
    code: SentrowebErrorCode,
    options: { searchSubmitted?: boolean; creditsCharged?: number; cause?: unknown } = {},
  ) {
    super(SENTROWEB_ERROR_MESSAGES[code], options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'SentrowebError';
    this.code = code;
    this.searchSubmitted = options.searchSubmitted ?? false;
    this.creditsCharged = options.creditsCharged;
  }
}

/** HTTP status for the errors the API returns itself (not the ones recorded on a run). */
export const SENTROWEB_HTTP_STATUS: Partial<Record<SentrowebErrorCode, number>> = {
  SENTROWEB_NOT_CONFIGURED: 503,
  ALREADY_RUNNING: 409,
  COOLDOWN: 409,
  TOO_MANY_ENTITIES: 422,
  NO_ENTITIES_SELECTED: 422,
};

/** An error raised by the service for a request it refuses (cooldown, too many entities...). */
export class SentrowebRequestError extends SentrowebError {
  readonly httpStatus: number;
  readonly details?: Record<string, unknown>;

  constructor(code: SentrowebErrorCode, details?: Record<string, unknown>) {
    super(code);
    this.name = 'SentrowebRequestError';
    this.httpStatus = SENTROWEB_HTTP_STATUS[code] ?? 400;
    this.details = details;
  }
}

export function toSentrowebError(error: unknown): SentrowebError {
  if (error instanceof SentrowebError) return error;
  return new SentrowebError('UNEXPECTED_ERROR');
}
