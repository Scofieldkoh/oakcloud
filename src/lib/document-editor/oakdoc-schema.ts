import type { OakDocFieldDefinition } from '@/lib/document-editor/oakdoc-fields';
import { OAKDOC_AGREEMENT_FIELD_DEFINITIONS } from '@/lib/document-editor/oakdoc-context';
import {
  OAKDOC_GENERIC_REPEATER_DEFINITIONS,
  OAKDOC_GENERIC_REPEATER_ITEM_TAGS,
} from '@/lib/document-editor/oakdoc-repeater-definitions';
import {
  OAKDOC_SIGNATURE_DEFINITIONS,
  OAKDOC_SIGNATURE_TAGS,
} from '@/lib/document-editor/oakdoc-signatures';

export const OAKDOC_SELECTED_CONTACT_FIELD_DEFINITIONS: ReadonlyArray<
  OakDocFieldDefinition & { example: string }
> = [
  { tag: 'selectedContact.name', label: 'Contact Name', category: 'Selected Contact', example: 'Alex Lim' },
  { tag: 'selectedContact.detail', label: 'Contact Detail', category: 'Selected Contact', example: 'Director' },
  { tag: 'selectedContact.role', label: 'Contact Role', category: 'Selected Contact', example: 'Director' },
  { tag: 'selectedContact.email', label: 'Contact Email', category: 'Selected Contact', example: 'alex@example.com' },
  { tag: 'selectedContact.phone', label: 'Contact Phone', category: 'Selected Contact', example: '+65 6123 4567' },
  { tag: 'selectedContact.address.full', label: 'Contact Full Address', category: 'Selected Contact', example: '123 Sample Street, Singapore 123456' },
  { tag: 'selectedContact.address.letter', label: 'Contact Letter Address', category: 'Selected Contact', example: '123 Sample Street, Singapore 123456' },
  { tag: 'selectedContact.nationality', label: 'Contact Nationality', category: 'Selected Contact', example: 'Singaporean' },
  { tag: 'selectedContact.identificationNumber', label: 'Contact Identification Number', category: 'Selected Contact', example: 'S1234567A' },
  { tag: 'selectedContact.contactType', label: 'Contact Type', category: 'Selected Contact', example: 'INDIVIDUAL' },
] as const;

/**
 * Stage-4 additions are explicit and schema-controlled. These are the only
 * generation-context scalar fields accepted by OakDoc; arbitrary custom.*
 * paths are intentionally not added to the schema.
 */
export const OAKDOC_STAGE4_CONTEXT_FIELDS: readonly OakDocFieldDefinition[] = [
  ...OAKDOC_SELECTED_CONTACT_FIELD_DEFINITIONS,
  ...OAKDOC_AGREEMENT_FIELD_DEFINITIONS,
];

export const OAKDOC_STAGE4_CONTEXT_FIELD_TAGS = new Set(
  OAKDOC_STAGE4_CONTEXT_FIELDS.map((field) => field.tag),
);

export const OAKDOC_STAGE4_REPEATER_DEFINITIONS = OAKDOC_GENERIC_REPEATER_DEFINITIONS;
export const OAKDOC_STAGE4_REPEATER_ITEM_TAGS = OAKDOC_GENERIC_REPEATER_ITEM_TAGS;
export const OAKDOC_STAGE4_SIGNATURE_DEFINITIONS = OAKDOC_SIGNATURE_DEFINITIONS;
export const OAKDOC_STAGE4_SIGNATURE_TAGS = OAKDOC_SIGNATURE_TAGS;
