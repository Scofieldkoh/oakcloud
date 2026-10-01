import {
  OAKDOC_DIRECTORS_REPEATER_TAG,
  OAKDOC_SHAREHOLDERS_REPEATER_TAG,
} from '@/lib/document-editor/oakdoc-repeater-definitions';
import {
  getRequiredLegacyContactSelection,
  getRequiredPartySelections,
  getTemplatePartyCollections,
} from '@/lib/template-analysis';
import type { BatchItemConfiguration } from '@/types/document-generation-batch';

/** Party choices a template asks for on Configure. */
export interface TemplatePartyNeeds {
  director: boolean;
  directors: boolean;
  shareholder: boolean;
  shareholders: boolean;
  contact: boolean;
  /** Legacy contact placeholders, chosen as a contact list. */
  contacts: boolean;
}

/**
 * A template without known content asks for every single party; Word
 * repeaters add the director and shareholder lists.
 */
export function templatePartyNeeds(
  templateContent: string | undefined,
  templateFieldTags?: readonly string[],
): TemplatePartyNeeds {
  const selections = templateContent === undefined
    ? { director: true, shareholder: true, contact: true }
    : getRequiredPartySelections(templateContent);
  const legacy = templateContent === undefined
    ? { directors: false, shareholders: false }
    : getTemplatePartyCollections(templateContent);
  const tags = new Set(templateFieldTags ?? []);
  return {
    director: selections.director,
    directors: legacy.directors || tags.has(OAKDOC_DIRECTORS_REPEATER_TAG),
    shareholder: selections.shareholder,
    shareholders: legacy.shareholders || tags.has(OAKDOC_SHAREHOLDERS_REPEATER_TAG),
    contact: selections.contact,
    contacts: templateContent === undefined ? true : getRequiredLegacyContactSelection(templateContent),
  };
}

/** Configuration keys behind each party choice, in display order. */
export const PARTY_CONFIGURATION_KEYS = [
  ['director', 'selectedDirectorId'],
  ['directors', 'selectedDirectorIds'],
  ['shareholder', 'selectedShareholderId'],
  ['shareholders', 'selectedShareholderIds'],
  ['contact', 'selectedContactId'],
] as const satisfies ReadonlyArray<readonly [keyof TemplatePartyNeeds, keyof BatchItemConfiguration]>;

export function partyConfigurationKeys(needs: TemplatePartyNeeds): Array<keyof BatchItemConfiguration> {
  return PARTY_CONFIGURATION_KEYS.filter(([need]) => needs[need]).map(([, key]) => key);
}
