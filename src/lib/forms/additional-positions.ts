/** Structured officer positions beyond the first three fields in an Annual Return. */
export interface AdditionalPosition {
  role: string;
  date: string;
}

export const MAX_ADDITIONAL_POSITIONS = 20;

export function readAdditionalPositions(value: unknown): AdditionalPosition[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Record<string, unknown> =>
    !!item && typeof item === 'object' && !Array.isArray(item))
    .map((item) => ({
      role: typeof item.role === 'string' ? item.role : '',
      date: typeof item.date === 'string' ? item.date : '',
    }));
}

export function additionalPositionsError(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value)) return 'Additional positions must be entered as position and date rows.';
  if (value.length > MAX_ADDITIONAL_POSITIONS) return `Maximum ${MAX_ADDITIONAL_POSITIONS} additional positions per person.`;
  for (const [index, item] of value.entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return `Position ${index + 4} is invalid.`;
    }
    const role = typeof item.role === 'string' ? item.role.trim() : '';
    const date = typeof item.date === 'string' ? item.date.trim() : '';
    if (!role || role.length > 120) return `Select a role for position ${index + 4}.`;
    if (date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(date + 'T00:00:00Z').getTime())
        || new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) !== date) {
        return `Enter a valid appointment date for position ${index + 4}.`;
      }
    }
  }
  return null;
}

export function sanitizeAdditionalPositions(value: unknown): AdditionalPosition[] {
  const error = additionalPositionsError(value);
  if (error) throw new Error(error);
  return readAdditionalPositions(value).map((item) => ({
    role: item.role.trim(), date: item.date.trim(),
  }));
}

export function formatAdditionalPositions(value: unknown): string | null {
  // Published versions prior to v5 used a free-text summary.
  if (typeof value === 'string') return value.trim() || null;
  const rows = readAdditionalPositions(value);
  return rows.length ? rows.map((item, index) =>
    `Position ${index + 4}: ${item.role}${item.date ? ` (${item.date})` : ''}`).join('\n') : null;
}
