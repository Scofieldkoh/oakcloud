import { ValidationError } from '@/lib/errors';

/**
 * Annual Return share-capital reconciliation.
 * Count shares (not issued/paid-up dollar amounts), by class, using exact integers.
 * This is a final-submission check; partially completed drafts are allowed.
 */
export interface AnnualReturnShareClassBalance {
  shareClass: string;
  issued: string;
  held: string;
  difference: string;
  matches: boolean;
}
export interface AnnualReturnShareReconciliation {
  valid: boolean;
  rows: AnnualReturnShareClassBalance[];
  issues: string[];
}

const normalizeClass = (value: unknown): string =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').toLocaleUpperCase('en') : '';
const quantities = (value: unknown): bigint | null => {
  const text = typeof value === 'string' ? value.trim() :
    typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : '';
  return /^\d{1,30}$/.test(text) ? BigInt(text) : null;
};

export function getAnnualReturnShareReconciliation(
  answers: Record<string, unknown>,
): AnnualReturnShareReconciliation | null {
  if (answers.prefill_source !== 'company_record'
    || answers.company_type === 'Public Company Limited by Guarantee') return null;
  const issuedClasses = Array.isArray(answers.capital_class) ? answers.capital_class : [];
  const issuedCounts = Array.isArray(answers.capital_shares) ? answers.capital_shares : [];
  const holdings = Array.isArray(answers.person_shareholding) ? answers.person_shareholding : [];

  const totals = new Map<string, { issued: bigint; held: bigint }>();
  const issues: string[] = [];
  if (!issuedClasses.length || issuedClasses.length !== issuedCounts.length) {
    issues.push('Complete the share capital classes and their number of issued shares.');
  }
  issuedClasses.forEach((value, index) => {
    const name = normalizeClass(value);
    const count = quantities(issuedCounts[index]);
    if (!name || count === null) {
      issues.push(`Share capital row ${index + 1}: select a share class and enter a whole number of issued shares.`);
      return;
    }
    const current = totals.get(name) ?? { issued: BigInt(0), held: BigInt(0) };
    current.issued += count;
    totals.set(name, current);
  });

  if (!Array.isArray(answers.person_shareholding)) {
    issues.push('Complete the people and shareholders shareholding records.');
  } else {
    holdings.forEach((person, index) => {
      if (!Array.isArray(person)) {
        issues.push(`Person ${index + 1}: shareholdings must be listed by class.`);
        return;
      }
      const personClasses = new Set<string>();
      person.forEach((value, row) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          issues.push(`Person ${index + 1}, shareholding ${row + 1}: invalid row.`);
          return;
        }
        const item = value as Record<string, unknown>;
        const name = normalizeClass(item.shareClass);
        const count = quantities(item.shares);
        if (!name || count === null || count <= BigInt(0) || personClasses.has(name)) {
          issues.push(`Person ${index + 1}, shareholding ${row + 1}: enter a unique share class and a positive whole number of shares.`);
          return;
        }
        personClasses.add(name);
        const current = totals.get(name) ?? { issued: BigInt(0), held: BigInt(0) };
        current.held += count;
        totals.set(name, current);
      });
    });
  }

  const rows = Array.from(totals, ([shareClass, value]) => ({
    shareClass,
    issued: value.issued.toString(),
    held: value.held.toString(),
    difference: (value.issued - value.held).toString(),
    matches: value.issued === value.held,
  })).sort((a, b) => a.shareClass.localeCompare(b.shareClass));

  for (const row of rows) {
    if (!row.matches) {
      const gap = BigInt(row.difference);
      issues.push(`${row.shareClass}: ${row.issued} shares issued, ${row.held} held by people (${gap > BigInt(0) ? `short by ${gap}` : `excess of ${-gap}`}).`);
    }
  }
  return { valid: issues.length === 0, rows, issues };
}

/** Throws only at final submission, never during an in-progress draft save. */
export function validateAnnualReturnSharesOnSubmission(
  answers: Record<string, unknown>,
): void {
  const result = getAnnualReturnShareReconciliation(answers);
  if (result && !result.valid) {
    throw new ValidationError(`Shareholding reconciliation failed: ${result.issues.join(' ')}`);
  }
}
