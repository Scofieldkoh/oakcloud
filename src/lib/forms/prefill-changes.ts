/** Generic form prefill comparison. Repeat rows are matched by stable record IDs, not position. */
import { AR_RECORD_SECTIONS } from '@/lib/forms/annual-return-prefill';
import { ValidationError } from '@/lib/errors';
import { formatPersonShareholdings, readPersonShareholdings } from '@/lib/forms/person-shareholdings';
import { additionalPositionsError, formatAdditionalPositions, readAdditionalPositions } from '@/lib/forms/additional-positions';
import { getDirectorReelectionOptions, personHasRole } from '@/lib/forms/annual-return-directors';

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

const classKey = (name: string) => name.trim().replace(/\s+/g, ' ').toLocaleUpperCase('en');
function canonicalShareholdings(value: unknown): string | null {
  if (value === undefined || value === null) return '[]';
  if (!Array.isArray(value)) return null;
  const rows = readPersonShareholdings(value);
  if (rows.length !== value.length) return null;
  return JSON.stringify(rows.map((row) => ({
    shareClass: classKey(row.shareClass),
    shares: /^\d{1,30}$/.test(row.shares.trim()) ? BigInt(row.shares.trim()).toString() : row.shares.trim(),
  })).sort((a, b) => a.shareClass.localeCompare(b.shareClass)));
}
function valuesDifferForField(key: string, original: unknown, current: unknown): boolean {
  if (key === 'person_shareholding') {
    const a = canonicalShareholdings(original);
    const b = canonicalShareholdings(current);
    return a === null || b === null ? valuesDifferFromPrefill(original, current) : a !== b;
  }
  if (key === 'person_additional_positions') {
    const a = readAdditionalPositions(original);
    const b = readAdditionalPositions(current);
    if ((Array.isArray(original) && a.length !== original.length)
      || (Array.isArray(current) && b.length !== current.length)) {
      return valuesDifferFromPrefill(original, current);
    }
    return JSON.stringify(a) !== JSON.stringify(b);
  }
  return valuesDifferFromPrefill(original, current);
}

export function formatOriginalPrefillValue(key: string, value: unknown): string {
  if (key === 'person_shareholding') return formatPersonShareholdings(value) || '(no shares)';
  if (key === 'person_additional_positions') return formatAdditionalPositions(value) || '(no additional positions)';
  return value === undefined || value === null || value === '' ? '(blank)' : String(value);
}

const text = (value: unknown) => value === undefined || value === null ? '' : String(value);
const changedText = (key: string, value: unknown) =>
  key === 'person_shareholding' ? formatPersonShareholdings(value) || ''
    : key === 'person_additional_positions' ? formatAdditionalPositions(value) || ''
    : key.startsWith('person_role_remove_') ? (value === 'Yes' ? 'To remove' : 'Keep') : text(value);
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
    if (baseline.position_record_policy === 'verification_only') {
      // Share capital, holdings and appointments represent records to review,
      // never proposed changes. Do not trust browser disabled/read-only controls.
      protectedAnswers.position_record_policy = 'verification_only';
      const baselineCapitalIds = asArray(baseline.capital_record_id).map(text);
      const currentCapitalIds = asArray(protectedAnswers.capital_record_id).map(text);
      if (baselineCapitalIds.length !== currentCapitalIds.length
        || baselineCapitalIds.some((id, index) => currentCapitalIds[index] !== id)) {
        throw new ValidationError('Share capital records are verification-only and cannot be added or removed.');
      }
      const readonlyCapitalKeys = [
        'capital_class', 'capital_shares', 'capital_currency', 'capital_amount', 'capital_paid_up',
      ];
      for (const [index] of currentCapitalIds.entries()) {
        for (const key of readonlyCapitalKeys) {
          if (valuesDifferForField(key, asArray(baseline[key])[index], asArray(protectedAnswers[key])[index])) {
            throw new ValidationError('Share capital records are verification-only and cannot be edited.');
          }
        }
      }

      const baselinePersonIds = asArray(baseline.person_record_id).map(text);
      const currentPersonIds = asArray(protectedAnswers.person_record_id).map(text);
      const immutableKeys = [
        'person_role_1', 'person_role_2', 'person_role_3',
        'person_role_date_1', 'person_role_date_2', 'person_role_date_3',
        'person_additional_positions', 'person_shareholding',
      ];
      for (const [row, recordId] of currentPersonIds.entries()) {
        const sourceIndex = recordId ? baselinePersonIds.indexOf(recordId) : -1;
        for (const key of immutableKeys) {
          const previous = sourceIndex >= 0 ? asArray(baseline[key])[sourceIndex] : undefined;
          const next = asArray(protectedAnswers[key])[row];
          const isEmptyNew = sourceIndex < 0 && (
            next === undefined || next === '' || (Array.isArray(next) && next.length === 0)
          );
          if (!isEmptyNew && valuesDifferForField(key, previous, next)) {
            throw new ValidationError('Recorded appointments and shareholdings are verification-only and cannot be edited.');
          }
        }
        // Legacy v7 removal flags may exist in source snapshots, but v8
        // declarations never accept them, including forged API requests.
        for (const number of [1, 2, 3]) {
          if (text(asArray(protectedAnswers[`person_role_remove_${number}`])[row]).trim()) {
            throw new ValidationError('Appointment removal requests are not allowed in this declaration.');
          }
        }
      }
    }
    if (baseline.position_record_policy === 'read_only_with_removal') {
      // A user can request that a source appointment be removed, but cannot
      // change its role/date or delete an existing extra position directly.
      protectedAnswers.position_record_policy = baseline.position_record_policy;
      const oldIds = asArray(baseline.person_record_id).map(text);
      const newIds = asArray(protectedAnswers.person_record_id).map(text);
      for (const [row, id] of newIds.entries()) {
        const originalIndex = oldIds.indexOf(id);
        if (!id || originalIndex === -1) {
          for (const number of [1, 2, 3]) {
            if (asArray(protectedAnswers[`person_role_remove_${number}`])[row] === 'Yes') {
              throw new ValidationError('Only existing recorded appointments can be marked To remove.');
            }
          }
          if (readAdditionalPositions(asArray(protectedAnswers.person_additional_positions)[row])
            .some((position) => position.toRemove)) {
            throw new ValidationError('New appointments cannot be marked To remove.');
          }
          continue;
        }
        for (const number of [1, 2, 3]) {
          const roleKey = `person_role_${number}`;
          const dateKey = `person_role_date_${number}`;
          for (const key of [roleKey, dateKey]) {
            const previous = text(asArray(baseline[key])[originalIndex]);
            const current = text(asArray(protectedAnswers[key])[row]);
            if (previous !== current) throw new ValidationError('Recorded appointments cannot be edited. Tick To remove instead.');
          }
          const removal = asArray(protectedAnswers[`person_role_remove_${number}`])[row];
          if (removal !== undefined && removal !== '' && removal !== 'Yes') {
            throw new ValidationError('Invalid appointment removal selection.');
          }
          if (removal === 'Yes' && !text(asArray(baseline[roleKey])[originalIndex]).trim()) {
            throw new ValidationError('Cannot remove a position that is not recorded.');
          }
        }
        const baselineExtra = readAdditionalPositions(asArray(baseline.person_additional_positions)[originalIndex]);
        const suppliedExtraRaw = asArray(protectedAnswers.person_additional_positions)[row] ?? [];
        if (additionalPositionsError(suppliedExtraRaw)) throw new ValidationError('Invalid additional appointments.');
        const currentExtra = readAdditionalPositions(suppliedExtraRaw);
        if (currentExtra.length < baselineExtra.length
          || baselineExtra.some((old, index) =>
            old.role !== currentExtra[index].role || old.date !== currentExtra[index].date)) {
          throw new ValidationError('Recorded additional appointments cannot be edited. Tick To remove instead.');
        }
        if (currentExtra.slice(baselineExtra.length).some((position) => position.toRemove)) {
          throw new ValidationError('New appointments cannot be marked To remove.');
        }
      }
    }
    const kinds = asArray(protectedAnswers.person_kind);
    const people = asArray(protectedAnswers.person_name);
    protectedAnswers.ceo_role_listed = people.some((_, index) =>
      kinds[index] !== 'Corporate' && personHasRole(protectedAnswers, index, 'CEO')) ? 'Yes' : 'No';
    if (Object.prototype.hasOwnProperty.call(protectedAnswers, 'reelection_directors')) {
      const choices = getDirectorReelectionOptions(protectedAnswers);
      const allowedDirectors = new Set(choices.map((director) => director.value));
      const selected = protectedAnswers.reelection_directors;
      if (!Array.isArray(selected) || selected.some((id) => typeof id !== 'string' || !allowedDirectors.has(id))
        || new Set(selected).size !== selected.length) {
        throw new Error('Invalid director re-election selection');
      }
    }
    const selected = text(protectedAnswers.ceo_existing_person);
    if (['Existing listed person', 'Existing listed officer'].includes(text(protectedAnswers.ceo_source)) && selected) {
      const ids = asArray(protectedAnswers.person_record_id).map(text);
      const matchedIndex = ids.indexOf(selected);
      const newRowIndex = /^new-person:(\d+)$/.exec(selected);
      const rowIndex = matchedIndex >= 0 ? matchedIndex : newRowIndex ? Number(newRowIndex[1]) : -1;
      const isExistingOfficer = [1, 2, 3].some((number) =>
        text(asArray(protectedAnswers[`person_role_${number}`])[rowIndex]).trim().length > 0)
        || asArray(protectedAnswers.person_additional_positions)[rowIndex] instanceof Array
          && (asArray(protectedAnswers.person_additional_positions)[rowIndex] as unknown[]).length > 0;
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
    return { edited: Object.prototype.hasOwnProperty.call(baseline, key) && valuesDifferForField(key, baseline[key], current),
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
  return { edited: valuesDifferForField(key, original, current), original, added: false };
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
        if (valuesDifferForField(key, previous, current)) {
          result.fields.push({ key, section: section.section, recordId: id, previous: changedText(key, previous), current: changedText(key, current) });
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
