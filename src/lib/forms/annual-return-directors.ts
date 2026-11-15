import { readAdditionalPositions } from '@/lib/forms/additional-positions';

const DIRECTOR_ROLES = new Set(['Director', 'Managing Director', 'Alternate Director', 'Nominee Director']);
const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

export function personHasRole(answers: Record<string, unknown>, index: number, role: string): boolean {
  if ([1, 2, 3].some((number) => text(list(answers[`person_role_${number}`])[index]) === role)) return true;
  return readAdditionalPositions(list(answers.person_additional_positions)[index])
    .some((item) => item.role === role);
}

export function personHasDirectorRole(answers: Record<string, unknown>, index: number): boolean {
  if ([1, 2, 3].some((number) => DIRECTOR_ROLES.has(text(list(answers[`person_role_${number}`])[index])))) return true;
  return readAdditionalPositions(list(answers.person_additional_positions)[index])
    .some((item) => DIRECTOR_ROLES.has(item.role));
}

/** Stable source IDs are used as checkbox values. New rows use their row index. */
export function getDirectorReelectionOptions(
  answers: Record<string, unknown>,
): Array<{ value: string; label: string }> {
  const names = list(answers.person_name);
  const kinds = list(answers.person_kind);
  const ids = list(answers.person_record_id);
  return names.flatMap((name, index) => {
    if (kinds[index] === 'Corporate' || !personHasDirectorRole(answers, index)) return [];
    const label = text(name);
    if (!label) return [];
    const value = text(ids[index]) || `new-person:${index}`;
    return [{ value, label }];
  });
}

export function isReelectionMatterSelected(answers: Record<string, unknown>): boolean {
  const value = 'Re-election of directors';
  return ['agm_agenda', 'resolution_matters'].some((field) =>
    list(answers[field]).some((choice) => choice === value ||
      (!!choice && typeof choice === 'object' && !Array.isArray(choice) &&
        (choice as Record<string, unknown>).value === value)));
}
