/**
 * Sentroweb check error codes and their fixed, user-safe messages.
 *
 * Pure data with no server imports, so the UI and the services share it. What the database
 * and the API store or return for a failure is always one of these messages, never raw page
 * text, so a changed Sentroweb page can never leak names, balances or account details.
 */

export const SENTROWEB_ERROR_CODES = [
  'SENTROWEB_NOT_CONFIGURED',
  'LOGIN_FAILED',
  'MFA_OR_CAPTCHA_REQUIRED',
  'LAYOUT_CHANGED',
  'TIMEOUT',
  'SESSION_EXPIRED',
  'INSUFFICIENT_CREDITS',
  'UNEXPECTED_CREDIT_COST',
  'RESULT_MISMATCH',
  'EVIDENCE_MISSING',
  'INTERRUPTED',
  'TOO_MANY_ENTITIES',
  'COOLDOWN',
  'ALREADY_RUNNING',
  'NO_ENTITIES_SELECTED',
  'UNEXPECTED_ERROR',
] as const;

export type SentrowebErrorCode = (typeof SENTROWEB_ERROR_CODES)[number];

export const SENTROWEB_ERROR_MESSAGES: Record<SentrowebErrorCode, string> = {
  SENTROWEB_NOT_CONFIGURED: "Sentroweb isn't configured on this server.",
  LOGIN_FAILED: 'Sentroweb rejected the saved login. Check the Sentroweb credentials.',
  MFA_OR_CAPTCHA_REQUIRED:
    'Sentroweb asked for an extra verification step that this check cannot complete.',
  LAYOUT_CHANGED:
    'The Sentroweb page did not look as expected, so the result could not be read. It has not been treated as clear.',
  TIMEOUT: 'Sentroweb took too long to respond. The result is unknown.',
  SESSION_EXPIRED: 'The Sentroweb session expired during the check.',
  INSUFFICIENT_CREDITS: 'The Sentroweb account does not have enough credits for this check.',
  UNEXPECTED_CREDIT_COST:
    'Sentroweb asked for a different credit cost than expected, so the search was cancelled.',
  RESULT_MISMATCH:
    'The two sources of the Sentroweb result disagreed or one was missing. The result is unknown.',
  EVIDENCE_MISSING:
    "The result looked clear but Sentroweb's PDF report could not be saved, so it is not shown as clear.",
  INTERRUPTED:
    'The check was interrupted before it finished. Searches already submitted are not repeated.',
  TOO_MANY_ENTITIES: 'A check can screen at most 10 people and companies at a time.',
  COOLDOWN: 'This company was checked recently. Run it again only if you really need to.',
  ALREADY_RUNNING: 'A Sentroweb check is already running for this company.',
  NO_ENTITIES_SELECTED: 'Select at least one person or company to check.',
  UNEXPECTED_ERROR: 'The check failed unexpectedly.',
};

export function isSentrowebErrorCode(value: unknown): value is SentrowebErrorCode {
  return typeof value === 'string' && (SENTROWEB_ERROR_CODES as readonly string[]).includes(value);
}

/** The fixed message for a stored code. Unknown or missing codes never echo stored text. */
export function sentrowebErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  return isSentrowebErrorCode(code) ? SENTROWEB_ERROR_MESSAGES[code] : SENTROWEB_ERROR_MESSAGES.UNEXPECTED_ERROR;
}
