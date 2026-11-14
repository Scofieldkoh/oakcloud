/** Generic form prefill comparison. Repeat rows are matched by stable record IDs, not position. */
import { AR_RECORD_SECTIONS } from '@/lib/forms/annual-return-prefill';

export const OAK_PREFILL_METADATA_KEY = '__oak_prefill';

export interface StoredPrefill {
  companyId: string;
  companyAggregateRevision: number;
  createdAt: string;
  createdById: string;
  baseline: Record<string, unknown>;
}
export interface PrefillFieldChange {
  key: string;
  previous: string;
  current: string;
  section?: string;
  recordId?: string;
}
export interface PrefillRowChange {
  section: string;
  recordId: string;
  label: string;
}
export interface PrefillChanges {
  fields: PrefillFieldChange[];
  addedRows: PrefillRowChange[];
  removedRows: PrefillRowChange[];
}
export const EDITED_VALUE_CLASS = 'bg-amber-50 border-amber-400 dark:bg-amber-950/30 dark:border-amber-600';

const normalized = (value: unknown): string => {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');
  }
  return JSON.stringify(value);
};
export const valuesDifferFromPrefill = (original: unknown, current: unknown): boolean =>
  normalized(original) !== normalized(current);

const text = (value: unknown) => value === undefined || value === null ? '' : String(value);
const asArray = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const asObject = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
export function readStoredPrefill(metadata: unknown): StoredPrefill | null {
  const stored = asObject(asObject(metadata)?.[OAK_PREFILL_METADATA_KEY]);
  if (!stored || typeof stored.companyId !== 'string' || typeof stored.createdAt !== 'string'
    || typeof stored.createdById !== 'string' || typeof stored.companyAggregateRevision !== 'number'
    || !asObject(stored.baseline)) return null;
  return stored as unknown as StoredPrefill;
}

export function protectPrefillAnswers(
  current: Record<string, unknown>,
  baseline: Record<string, unknown>,
): Record<string, unknown> {
  const protectedAnswers: Record<string, unknown> = { ...current, prefill_source: 'company_record', record_as_at: baseline.record_as_at };
  for (const section of AR_RECORD_SECTIONS) {
    const allowed = new Set(asArray(baseline[section.id]).map(text).filter(Boolean));
    const ids = asArray(current[section.id]).map(text);
    // The repeat renderer can create a new row without touching its HIDDEN ID
    // field. Fill missing ID slots so other parallel answer arrays stay aligned.
    const rowCount = Math.max(ids.length, ...section.fields.map((key) => asArray(current[key]).length));
    if (rowCount > 50) throw new Error(`Too many rows in ${section.section}`);
    while (ids.length < rowCount) ids.push('');
    const assigned = new Set<string>();
    for (const id of ids) {
      if (!id) continue; // A blank ID means the client added the row.
      if (!allowed.has(id) || assigned.has(id)) throw new Error(`Invalid record ID in ${section.section}`);
      assigned.add(id);
    }
    // If the client removed every row, leave the array empty; never restore removed records implicitly.
    protectedAnswers[section.id] = ids;
  }
  if (Object.prototype.hasOwnProperty.call(baseline, 'person_record_id')) {
    const roles = [1, 2, 3].flatMap((number) => {
      const rows = asArray(protectedAnswers[`person_role_${number}`]);
      return rows.map((role, index) => ({ role, index }));
    });
    const kinds = asArray(protectedAnswers.person_kind);
    protectedAnswers.ceo_role_listed = roles.some(({ role, index }) =>
      role === 'CEO' && kinds[index] !== 'Corporate') ? 'Yes' : 'No';
    const selected = text(protectedAnswers.ceo_existing_person);
    if (protectedAnswers.ceo_source === 'Existing listed person' && selected) {
      const ids = asArray(protectedAnswers.person_record_id).map(text);
      const matchedIndex = ids.indexOf(selected);
      const newRowIndex = /^new-person:(\\d+)$/.exec(selected);
      const rowIndex = matchedIndex >= 0 ? matchedIndex : newRowIndex ? Number(newRowIndex[1]) : -1;
      const isExistingOfficer = [1, 2, 3].some((number) =>
        text(asArray(protectedAnswers[`person_role_${number}`])[rowIndex]).trim().length > 0);
      if (rowIndex < 0 || rowIndex >= ids.length ||
        (newRowIndex && ids[rowIndex] !== '') || kinds[rowIndex] === 'Corporate' ||
        !text(asArray(protectedAnswers.person_name)[rowIndex]).trim() || !isExistingOfficer) {
        throw new Error('Invalid existing CEO selection');
      }
    }
  }
  return protectedAnswers;
}

export function getPrefillFieldState(
  key: string,
  current: unknown,
  baseline: Record<string, unknown> | null,
  answers: Record<string, unknown>,
  rowIndex?: number,
): { edited: boolean; original: unknown; added: boolean } {
  if (!baseline) return { edited: false, original: undefined, added: false };
  if (rowIndex === undefined) {
    return { edited: Object.prototype.hasOwnProperty.call(baseline, key) && valuesDifferFromPrefill(baseline[key], current),
      original: baseline[key], added: false };
  }
  const section = AR_RECORD_SECTIONS.find(s => s.fields.includes(key as never));
  if (!section) return { edited: false, original: undefined, added: false };
  const id = text(asArray(answers[section.id])[rowIndex]);
  const baselineIds = asArray(baseline[section.id]).map(text);
  if (!id) return { edited: true, original: undefined, added: true };
  const index = baselineIds.indexOf(id);
  if (index === -1) return { edited: true, original: undefined, added: true };
  const original = asArray(baseline[key])[index];
  return { edited: valuesDifferFromPrefill(original, current), original, added: false };
}

export function getPrefillChanges(
  baseline: Record<string, unknown>,
  answers: Record<string, unknown>,
): PrefillChanges {
  const result: PrefillChanges = { fields: [], addedRows: [], removedRows: [] };
  const repeated = new Set<string>(AR_RECORD_SECTIONS.flatMap(section => [section.id, ...section.fields]));
  for (const [key, previous] of Object.entries(baseline)) {
    if (repeated.has(key) || key === 'prefill_source' || key === 'record_as_at') continue;
    if (valuesDifferFromPrefill(previous, answers[key])) {
      result.fields.push({ key, previous: text(previous), current: text(answers[key]) });
    }
  }
  for (const section of AR_RECORD_SECTIONS) {
    const oldIds = asArray(baseline[section.id]).map(text);
    const newIds = asArray(answers[section.id]).map(text);
    for (const [row, id] of newIds.entries()) {
      if (!id || !oldIds.includes(id)) {
        // Do not count an entirely empty row as a change.
        if (section.fields.some(key => normalized(asArray(answers[key])[row]))) {
          result.addedRows.push({ section: section.section, recordId: id, label: text(asArray(answers[section.label])[row]) || 'New row' });
        }
        continue;
      }
      const oldIndex = oldIds.indexOf(id);
      for (const key of section.fields) {
        const previous = asArray(baseline[key])[oldIndex];
        const current = asArray(answers[key])[row];
        if (valuesDifferFromPrefill(previous, current)) {
          result.fields.push({ key, section: section.section, recordId: id, previous: text(previous), current: text(current) });
        }
      }
    }
    for (const [index, id] of oldIds.entries()) {
      if (id && !newIds.includes(id)) {
        result.removedRows.push({ section: section.section, recordId: id, label: text(asArray(baseline[section.label])[index]) || id });
      }
    }
  }
  return result;
}

/** Restores a removed baseline row to the end of its section. */
export function undoRemovedPrefillRow(
  baseline: Record<string, unknown>,
  answers: Record<string, unknown>,
  sectionKey: string,
  recordId: string,
): Record<string, unknown> {
  const section = AR_RECORD_SECTIONS.find(s => s.section === sectionKey);
  if (!section) return answers;
  const index = asArray(baseline[section.id]).map(text).indexOf(recordId);
  if (index === -1 || asArray(answers[section.id]).includes(recordId)) return answers;
  const next = { ...answers };
  for (const key of [section.id, ...section.fields]) {
    next[key] = [...asArray(next[key]), asArray(baseline[key])[index] ?? ''];
  }
  return next;
}
