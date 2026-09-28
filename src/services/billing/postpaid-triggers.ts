/**
 * Filings a postpaid fee line can bill on. Kept free of server imports so
 * client components can use them.
 */

export const BILLING_TIMINGS = ['PREPAID', 'POSTPAID'] as const;

export type BillingTiming = typeof BILLING_TIMINGS[number];

export const BILLING_TIMING_LABELS: Record<BillingTiming, string> = {
  PREPAID: 'Prepaid',
  POSTPAID: 'Postpaid',
};

export const POSTPAID_TRIGGERS = [
  'SG_ECI_FILED',
  'SG_FORM_C_FILED',
  'SG_ECI_OR_FORM_C_FILED',
] as const;

export type PostpaidTrigger = typeof POSTPAID_TRIGGERS[number];

export const POSTPAID_TRIGGER_LABELS: Record<PostpaidTrigger, string> = {
  SG_ECI_FILED: 'ECI filed',
  SG_FORM_C_FILED: 'Form C filed',
  SG_ECI_OR_FORM_C_FILED: 'ECI or Form C filed, whichever is first',
};

/** Company obligation codes whose Filed status raises the bill, once per YA. */
export const POSTPAID_TRIGGER_OBLIGATIONS: Record<PostpaidTrigger, readonly string[]> = {
  SG_ECI_FILED: ['SG_ECI'],
  SG_FORM_C_FILED: ['SG_FORM_C'],
  SG_ECI_OR_FORM_C_FILED: ['SG_ECI', 'SG_FORM_C'],
};

export function isPostpaidTrigger(value: unknown): value is PostpaidTrigger {
  return typeof value === 'string' && (POSTPAID_TRIGGERS as readonly string[]).includes(value);
}

/** The period key a postpaid billing entry is stored under (one per YA). */
export function postpaidBillingPeriodKey(yearOfAssessment: number): string {
  return `YA${yearOfAssessment}`;
}

export const POSTPAID_GENERATION_PREFIX = 'postpaid-';
export const POSTPAID_SCHEDULE_ENTRY_KEY = 'postpaid';

export function postpaidGenerationKey(feeLineId: string): string {
  return `${POSTPAID_GENERATION_PREFIX}${feeLineId}`;
}

export function isPostpaidGenerationKey(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(POSTPAID_GENERATION_PREFIX);
}
