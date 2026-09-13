import {
  createFieldAuthoringInputDescriptor,
  formatTypedFieldValueSummary,
  type AtomicFieldReference,
} from '@/components/documents/template-editor/field-authoring';
import type {
  LosslessStoredFieldDefinition,
  TypedFieldValue,
} from '@/lib/template-field-contract';

/**
 * Presentation-only F3 descriptor for CORE's atomic inline field rendering.
 * Nothing in this shape is a persistence format or a trust/identity capability.
 */
export interface AtomicFieldPresentationDescriptor {
  identity: string;
  occurrenceId: string;
  label: string;
  sourceLabel: string;
  typeLabel: string;
  description?: string;
  valueSummary?: string;
  defaultSummary: string;
  /** Advanced-details display only. Never derive identity from this label. */
  technicalKey: string;
  sourceText: string;
  unavailableReason?: string;
}

const TYPE_LABELS: Readonly<Record<string, string>> = {
  text: 'Text',
  textarea: 'Long text',
  date: 'Date',
  number: 'Number',
  currency: 'Currency',
  boolean: 'Yes / No',
};

export function createAtomicFieldPresentationDescriptor(input: {
  reference: AtomicFieldReference;
  definition: LosslessStoredFieldDefinition;
  description?: string;
  sourceLabel?: string;
  value?: TypedFieldValue;
}): AtomicFieldPresentationDescriptor {
  if (input.reference.identity !== input.definition.identity) {
    throw new TypeError('Atomic field presentation requires the canonical scoped field identity.');
  }
  const authoring = createFieldAuthoringInputDescriptor(input.definition, {
    ...(input.description ? { description: input.description } : {}),
    ...(input.sourceLabel ? { sourceLabel: input.sourceLabel } : {}),
  });
  return {
    identity: input.definition.identity,
    occurrenceId: input.reference.occurrenceId,
    label: input.definition.label,
    sourceLabel: authoring.sourceLabel ?? input.definition.source ?? input.definition.category ?? 'Template',
    typeLabel: TYPE_LABELS[input.definition.supportedType ?? ''] ?? input.definition.storedType,
    ...(authoring.description ? { description: authoring.description } : {}),
    ...(input.value ? { valueSummary: formatTypedFieldValueSummary(input.value) } : {}),
    defaultSummary: formatTypedFieldValueSummary(authoring.defaultValue),
    technicalKey: input.definition.key,
    sourceText: input.reference.sourceText,
    ...(authoring.disabledReason ? { unavailableReason: authoring.disabledReason } : {}),
  };
}
