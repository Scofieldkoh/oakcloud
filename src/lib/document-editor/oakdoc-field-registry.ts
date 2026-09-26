import { TEMPLATE_FIELD_CATEGORIES } from '@/components/documents/template-editor/template-field-catalog';
import type { OakDocFieldDefinition } from '@/lib/document-editor/oakdoc-fields';
import {
  OAKDOC_AGREEMENT_FIELD_DEFINITIONS,
  OAKDOC_RESOLUTION_FIELD_DEFINITIONS,
  OAKDOC_SELECTED_CONTACT_FIELD_DEFINITIONS,
} from '@/lib/document-editor/oakdoc-context';
import {
  OAKDOC_GENERIC_REPEATER_DEFINITIONS,
  OAKDOC_GENERIC_REPEATER_ITEM_TAGS,
  OAKDOC_GENERIC_REPEATER_TAGS,
} from '@/lib/document-editor/oakdoc-repeater-definitions';
import { OAKDOC_SIGNATURE_TAGS } from '@/lib/document-editor/oakdoc-signatures';
import { OAKDOC_CONDITION_TAG_PREFIX } from '@/lib/document-editor/oakdoc-conditions';
import type { OakDocDiagnostic } from '@/types/oakdoc';

/**
 * S1 canonical OakDoc field registry.
 *
 * The single source of truth for which content-control tags OakDoc supports.
 * Authoring panels, template persistence, generation and migration checks
 * all consume this module instead of keeping local allowlists.
 */

/**
 * The context a scalar field needs at generation time. `company` fields
 * resolve from the selected company alone; the others need an explicit
 * party or agreement/resolution input.
 */
export type OakDocFieldContext =
  | 'company'
  | 'selectedDirector'
  | 'selectedShareholder'
  | 'selectedContact'
  | 'agreement'
  | 'resolution'
  | 'system';

export interface OakDocRegisteredField extends OakDocFieldDefinition {
  context: OakDocFieldContext;
}

const CATALOG_CONTEXT: Readonly<Record<string, OakDocFieldContext>> = {
  company: 'company',
  'selected-director': 'selectedDirector',
  'selected-shareholder': 'selectedShareholder',
  system: 'system',
};

/** Catalog categories shared with the legacy field picker. */
export const OAKDOC_CATALOG_FIELD_CATEGORIES = TEMPLATE_FIELD_CATEGORIES
  .filter((category) => category.key in CATALOG_CONTEXT)
  .map((category) => ({
    ...category,
    fields: category.fields.filter(
      (field) => !field.builder && !field.key.includes('{{'),
    ),
  }))
  .filter((category) => category.fields.length > 0);

function withContext(
  fields: readonly OakDocFieldDefinition[],
  context: OakDocFieldContext,
): OakDocRegisteredField[] {
  return fields.map(({ tag, label, category }) => ({ tag, label, category, context }));
}

/** Every scalar (non-repeating) field OakDoc can resolve. */
export const OAKDOC_SCALAR_FIELDS: readonly OakDocRegisteredField[] = [
  ...OAKDOC_CATALOG_FIELD_CATEGORIES.flatMap((category) => category.fields.map((field) => ({
    tag: field.key,
    label: field.label,
    category: category.label,
    context: CATALOG_CONTEXT[category.key],
  }))),
  ...withContext(OAKDOC_SELECTED_CONTACT_FIELD_DEFINITIONS, 'selectedContact'),
  ...withContext(OAKDOC_AGREEMENT_FIELD_DEFINITIONS, 'agreement'),
  ...withContext(OAKDOC_RESOLUTION_FIELD_DEFINITIONS, 'resolution'),
];

/** Fields that live inside a repeater item. */
export const OAKDOC_REPEATER_ITEM_FIELDS: readonly OakDocFieldDefinition[] =
  OAKDOC_GENERIC_REPEATER_DEFINITIONS.flatMap((definition) => definition.fields);

export const OAKDOC_FIELD_BY_TAG: ReadonlyMap<string, OakDocFieldDefinition> = new Map(
  [...OAKDOC_SCALAR_FIELDS, ...OAKDOC_REPEATER_ITEM_FIELDS].map((field) => [field.tag, field]),
);

/** Tags a native field control may carry (scalar or repeater item). */
export const OAKDOC_FIELD_TAGS: ReadonlySet<string> = new Set([
  ...OAKDOC_SCALAR_FIELDS.map((field) => field.tag),
  ...OAKDOC_GENERIC_REPEATER_ITEM_TAGS,
]);

/** Scalar fields a condition may test. */
export const OAKDOC_CONDITION_FIELD_TAGS: ReadonlySet<string> = new Set(
  OAKDOC_SCALAR_FIELDS.map((field) => field.tag),
);

/** Structural Service Agreement slots replaced by the agreement renderer. */
export const OAKDOC_AGREEMENT_SLOT_TAGS = {
  serviceSections: 'agreement.serviceSections',
  feeTable: 'agreement.feeTable',
  entityAppendix: 'agreement.entityAppendix',
} as const;

/** Legacy `@`-prefixed spellings still accepted for the same slots. */
export const OAKDOC_AGREEMENT_SLOT_ALIASES: ReadonlySet<string> = new Set(
  Object.values(OAKDOC_AGREEMENT_SLOT_TAGS).flatMap((tag) => [tag, `@${tag}`]),
);

/** Per-service controls the agreement renderer creates and owns. */
export const OAKDOC_AGREEMENT_SERVICE_ITEM_TAG_PREFIX = 'agreement.service.item:';

/** Block control replaced by a native reusable partial (C06). */
export const OAKDOC_PARTIAL_TAG_PREFIX = 'oakdoc.partial:';

export type OakDocTagKind =
  | 'field'
  | 'partial'
  | 'agreement-slot'
  | 'repeater-item'
  | 'repeater'
  | 'condition'
  | 'signature'
  | 'unknown';

export function classifyOakDocTag(tag: string): OakDocTagKind {
  if (OAKDOC_GENERIC_REPEATER_TAGS.has(tag)) return 'repeater';
  if (OAKDOC_GENERIC_REPEATER_ITEM_TAGS.has(tag)) return 'repeater-item';
  if (OAKDOC_SIGNATURE_TAGS.has(tag)) return 'signature';
  if (tag.startsWith(OAKDOC_CONDITION_TAG_PREFIX)) return 'condition';
  if (tag.startsWith(OAKDOC_PARTIAL_TAG_PREFIX)) return 'partial';
  if (
    OAKDOC_AGREEMENT_SLOT_ALIASES.has(tag)
    || tag.startsWith(OAKDOC_AGREEMENT_SERVICE_ITEM_TAG_PREFIX)
  ) {
    return 'agreement-slot';
  }
  if (OAKDOC_CONDITION_FIELD_TAGS.has(tag)) return 'field';
  return 'unknown';
}

export function oakDocFieldContext(tag: string): OakDocFieldContext | null {
  return OAKDOC_SCALAR_FIELDS.find((field) => field.tag === tag)?.context ?? null;
}

/**
 * Report tags in a document that OakDoc cannot resolve. Word's own content
 * controls without a tag are ignored; any other unknown tag would survive
 * generation unresolved, so it is reported as a blocking diagnostic.
 */
export function diagnoseOakDocTags(
  tags: readonly string[],
  stage: OakDocDiagnostic['stage'],
): OakDocDiagnostic[] {
  return Array.from(new Set(tags))
    .filter((tag) => tag && classifyOakDocTag(tag) === 'unknown')
    .sort()
    .map((tag) => ({
      code: 'OAKDOC_UNSUPPORTED_FIELD',
      severity: 'error' as const,
      stage,
      message: `The field "${tag}" is not a supported OakDoc field.`,
      controlTag: tag,
    }));
}
