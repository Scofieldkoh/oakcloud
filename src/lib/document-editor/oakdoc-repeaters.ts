import type {
  OakDocAgreementEntity,
  OakDocCompanyDetail,
  OakDocContact,
} from '@/lib/document-editor/oakdoc-context';
import {
  createOakDocGenericRepeater,
  inspectOakDocGenericRepeaters,
  removeOakDocGenericRepeater,
  resolveOakDocGenericRepeaters,
} from '@/lib/document-editor/oakdoc-generic-repeaters';
import {
  OAKDOC_GENERIC_REPEATER_BY_TAG,
  OAKDOC_GENERIC_REPEATER_DEFINITIONS,
  OAKDOC_GENERIC_REPEATER_ITEM_TAGS,
  OAKDOC_GENERIC_REPEATER_TAGS,
  type OakDocGenericRepeaterDefinition,
  type OakDocGenericRepeaterKind,
} from '@/lib/document-editor/oakdoc-repeater-definitions';

export type OakDocRepeaterKind = OakDocGenericRepeaterKind;
export type OakDocRepeaterDefinition = OakDocGenericRepeaterDefinition;

export interface OakDocRepeaterSummary {
  count: number;
  tags: string[];
}

export const OAKDOC_REPEATER_DEFINITIONS = OAKDOC_GENERIC_REPEATER_DEFINITIONS;
export const OAKDOC_REPEATER_BY_TAG = OAKDOC_GENERIC_REPEATER_BY_TAG;
export const OAKDOC_REPEATER_OUTER_TAGS = OAKDOC_GENERIC_REPEATER_TAGS;
export const OAKDOC_REPEATER_ITEM_TAGS = OAKDOC_GENERIC_REPEATER_ITEM_TAGS;

export const createOakDocRepeater = createOakDocGenericRepeater;
export const removeOakDocRepeater = removeOakDocGenericRepeater;
export const inspectOakDocRepeaters = inspectOakDocGenericRepeaters;

export function resolveOakDocRepeaters(input: {
  docxBytes: Uint8Array;
  company: OakDocCompanyDetail;
  signers?: readonly OakDocContact[];
  authorisedRepresentatives?: readonly OakDocContact[];
  agreementEntities?: readonly OakDocAgreementEntity[];
}): {
  bytes: Uint8Array;
  repeatersResolved: number;
  itemsCreated: number;
  fieldsResolved: number;
} {
  return resolveOakDocGenericRepeaters({
    docxBytes: input.docxBytes,
    data: {
      company: input.company,
      signers: input.signers,
      authorisedRepresentatives: input.authorisedRepresentatives,
      agreementEntities: input.agreementEntities,
    },
  });
}
