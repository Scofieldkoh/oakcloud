import {
  OAKDOC_CONTACTS_REPEATER_TAG,
  OAKDOC_DIRECTORS_REPEATER_TAG,
  OAKDOC_OFFICERS_REPEATER_TAG,
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
  /** Officers of any role, ticked on Configure, for the Word officers repeater. */
  officers: boolean;
  /** A contact list: the Word contacts repeater or legacy contact placeholders. */
  contacts: boolean;
}

function usesField(tags: ReadonlySet<string>, root: string): boolean {
  for (const tag of tags) if (tag.startsWith(`${root}.`)) return true;
  return false;
}

/**
 * A template without known content asks for every single party. A Word
 * template asks for the parties its fields and repeaters use.
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
    director: selections.director || usesField(tags, 'selectedDirector'),
    directors: legacy.directors || tags.has(OAKDOC_DIRECTORS_REPEATER_TAG),
    shareholder: selections.shareholder || usesField(tags, 'selectedShareholder'),
    shareholders: legacy.shareholders || tags.has(OAKDOC_SHAREHOLDERS_REPEATER_TAG),
    contact: selections.contact || usesField(tags, 'selectedContact'),
    officers: tags.has(OAKDOC_OFFICERS_REPEATER_TAG),
    contacts: templateContent === undefined
      || tags.has(OAKDOC_CONTACTS_REPEATER_TAG)
      || getRequiredLegacyContactSelection(templateContent),
  };
}

/** Configuration keys behind each party choice, in display order. */
export const PARTY_CONFIGURATION_KEYS = [
  ['director', 'selectedDirectorId'],
  ['directors', 'selectedDirectorIds'],
  ['shareholder', 'selectedShareholderId'],
  ['shareholders', 'selectedShareholderIds'],
  ['officers', 'selectedOfficerIds'],
  ['contact', 'selectedContactId'],
] as const satisfies ReadonlyArray<readonly [keyof TemplatePartyNeeds, keyof BatchItemConfiguration]>;

export function partyConfigurationKeys(needs: TemplatePartyNeeds): Array<keyof BatchItemConfiguration> {
  return PARTY_CONFIGURATION_KEYS.filter(([need]) => needs[need]).map(([, key]) => key);
}
