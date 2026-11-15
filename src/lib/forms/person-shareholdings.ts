/** Structured shareholdings for a single person in Annual Return declarations.
 * Values are JSON, not free text: each person can own multiple share classes.
 * Keep the quantity as a decimal string to avoid floating-point rounding.
 */
export interface PersonShareholding {
  shareClass: string;
  shares: string;
}

export const MAX_PERSON_SHARE_CLASSES = 20;
const MAX_SHARE_CLASS_LENGTH = 120;
const MAX_SHARES_DIGITS = 20;

export function readPersonShareholdings(value: unknown): PersonShareholding[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is Record<string, unknown> =>
    !!entry && typeof entry === 'object' && !Array.isArray(entry)
  ).map((entry) => ({
    shareClass: typeof entry.shareClass === 'string' ? entry.shareClass : '',
    shares: typeof entry.shares === 'string' ? entry.shares
      : typeof entry.shares === 'number' && Number.isSafeInteger(entry.shares) ? String(entry.shares) : '',
  }));
}

/** Null means valid, including an empty list for a non-shareholder. */
export function personShareholdingError(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value)) return 'Shareholdings must be entered as share-class and quantity rows.';
  if (value.length > MAX_PERSON_SHARE_CLASSES) return `Maximum ${MAX_PERSON_SHARE_CLASSES} share classes per person.`;
  const used = new Set<string>();
  for (const [index, row] of value.entries()) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      return `Shareholding row ${index + 1} is invalid.`;
    }
    const entry = row as Record<string, unknown>;
    const shareClass = typeof entry.shareClass === 'string' ? entry.shareClass.trim() : '';
    const shares = typeof entry.shares === 'string' ? entry.shares.trim() : '';
    if (!shareClass || shareClass.length > MAX_SHARE_CLASS_LENGTH) {
      return `Select a share class for shareholding row ${index + 1}.`;
    }
    if (!/^\d{1,20}$/.test(shares) || BigInt(shares) <= BigInt(0)) {
      return `Enter a positive whole number (maximum ${MAX_SHARES_DIGITS} digits) for ${shareClass}.`;
    }
    const key = shareClass.toLocaleUpperCase('en');
    if (used.has(key)) return `Share class ${shareClass} is repeated; combine its quantity into one row.`;
    used.add(key);
  }
  return null;
}

export function sanitizePersonShareholdings(value: unknown): PersonShareholding[] {
  const error = personShareholdingError(value);
  if (error) throw new Error(error);
  return readPersonShareholdings(value).map((entry) => ({
    shareClass: entry.shareClass.trim(),
    shares: BigInt(entry.shares.trim()).toString(),
  }));
}

export function formatPersonShareholdings(value: unknown): string | null {
  // Old published v3 responses stored a free-text summary. Display them as-is.
  if (typeof value === 'string') return value.trim() || null;
  const rows = readPersonShareholdings(value);
  return rows.length
    ? rows.map((entry) => `${entry.shareClass || '(unspecified class)'}: ${entry.shares || '(no quantity)'} shares`).join('\n')
    : null;
}
