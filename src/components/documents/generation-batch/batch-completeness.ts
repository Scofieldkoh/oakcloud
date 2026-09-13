/**
 * Completeness and gating selectors for the batch workspace.
 *
 * Item status on the DTO is *action*-derived: it only leaves `NOT_STARTED`
 * once a preview or review round-trip has happened. That makes it useless for
 * answering "what still needs my input?", which is the question the queue and
 * the stepper actually have to answer. These selectors derive completeness
 * from the configuration itself so the UI can report pending work before any
 * server round-trip, and so every disabled action can explain itself.
 */

import type {
  MasterFieldCatalogue,
  MasterFieldDefinition,
} from '@/types/document-generation-batch';
import type { CustomPlaceholderDefinition } from '@/types/placeholders';
import { normalizePlaceholderKey } from '@/lib/template-analysis';
import {
  canonicalPlaceholderType,
  masterFieldId,
} from '@/lib/document-generation-master-fields';
import {
  createWorkflowFieldInputDescriptors,
  fieldInputDescriptorDefaultValue,
  isWorkflowFieldValuePresent,
} from '@/lib/document-editor/template-field-workflow';
import type { BatchStage, EditableBatchItem } from './batch-workspace-state';

export interface MissingRequirement {
  /** Stable id, usable as a scroll/focus target hint. */
  id: string;
  label: string;
}

export interface ItemCompleteness {
  requiredTotal: number;
  requiredFilled: number;
  missing: MissingRequirement[];
  isComplete: boolean;
}

export type CompletenessMap = Record<string, ItemCompleteness>;

export const EMPTY_COMPLETENESS: ItemCompleteness = {
  requiredTotal: 0,
  requiredFilled: 0,
  missing: [],
  isComplete: true,
};

/**
 * Splits a template's placeholders into the ones promoted to the shared
 * (master) catalogue and the ones that stay document-specific.
 */
export function partitionTemplateFields(
  templateFields: CustomPlaceholderDefinition[],
  masterFields: MasterFieldCatalogue,
): { itemOnly: CustomPlaceholderDefinition[]; shared: CustomPlaceholderDefinition[] } {
  const masterIds = new Set(masterFields.fields.map((field) => field.id));
  const itemOnly: CustomPlaceholderDefinition[] = [];
  const shared: CustomPlaceholderDefinition[] = [];
  for (const field of templateFields) {
    const id = masterFieldId(
      normalizePlaceholderKey(field.key),
      canonicalPlaceholderType(field.type),
    );
    if (masterIds.has(id)) shared.push(field);
    else itemOnly.push(field);
  }
  return { itemOnly, shared };
}

function effectiveMasterValue(
  item: EditableBatchItem,
  field: MasterFieldDefinition,
  masterFieldValues: Record<string, string>,
): string {
  const override = item.configuration.masterOverrides[field.id];
  if (override !== undefined) return override;
  return masterFieldValues[field.id] ?? '';
}

export interface SelectItemCompletenessParams {
  item: EditableBatchItem;
  /** Placeholders declared by this item's template. */
  templateFields: CustomPlaceholderDefinition[];
  masterFields: MasterFieldCatalogue;
  masterFieldValues: Record<string, string>;
}

export function selectItemCompleteness({
  item,
  templateFields,
  masterFields,
  masterFieldValues,
}: SelectItemCompletenessParams): ItemCompleteness {
  const requirements: Array<{ id: string; label: string; filled: boolean }> = [];

  requirements.push({
    id: 'title',
    label: 'Document title',
    filled: item.configuration.title.trim().length > 0,
  });

  const { itemOnly } = partitionTemplateFields(templateFields, masterFields);
  const descriptors = createWorkflowFieldInputDescriptors(itemOnly, {
    kind: 'template',
    id: item.templateId,
  });
  itemOnly.forEach((field, index) => {
    const descriptor = descriptors[index];
    if (!(descriptor?.required ?? field.required)) return;
    const explicit = Object.prototype.hasOwnProperty.call(item.configuration.itemValues, field.key);
    const value = explicit
      ? item.configuration.itemValues[field.key]
      : descriptor ? fieldInputDescriptorDefaultValue(descriptor) : field.defaultValue;
    requirements.push({
      id: `field:${field.key}`,
      label: field.label,
      filled: isWorkflowFieldValuePresent(value),
    });
  });

  for (const field of masterFields.fields) {
    if (!field.requiredTemplateIds.includes(item.templateId)) continue;
    requirements.push({
      id: `shared:${field.id}`,
      label: `${field.label} (shared)`,
      filled: effectiveMasterValue(item, field, masterFieldValues).trim().length > 0,
    });
  }

  if (item.templateKind === 'SERVICE_AGREEMENT') {
    const agreement = item.configuration.serviceAgreement;
    requirements.push({
      id: 'sa:representative',
      label: 'Authorised representative',
      filled: (agreement?.authorizedContactIds.length ?? 0) > 0,
    });
    requirements.push({
      id: 'sa:signer',
      label: 'At least one signer',
      filled: (agreement?.signerContactIds.length ?? 0) > 0,
    });
    requirements.push({
      id: 'sa:entities',
      label: 'At least one entity',
      filled: (agreement?.entityIds.length ?? 0) > 0,
    });
    requirements.push({
      id: 'sa:services',
      label: 'At least one service',
      filled: (agreement?.items.length ?? 0) > 0,
    });
  }

  const missing = requirements
    .filter((requirement) => !requirement.filled)
    .map(({ id, label }) => ({ id, label }));

  return {
    requiredTotal: requirements.length,
    requiredFilled: requirements.length - missing.length,
    missing,
    isComplete: missing.length === 0,
  };
}

export function buildCompletenessMap(params: {
  items: EditableBatchItem[];
  masterFields: MasterFieldCatalogue;
  masterFieldValues: Record<string, string>;
  templateFieldsByTemplateId: Record<string, CustomPlaceholderDefinition[]>;
}): CompletenessMap {
  const map: CompletenessMap = {};
  for (const item of params.items) {
    map[item.key] = selectItemCompleteness({
      item,
      templateFields: params.templateFieldsByTemplateId[item.templateId] ?? [],
      masterFields: params.masterFields,
      masterFieldValues: params.masterFieldValues,
    });
  }
  return map;
}

export function completenessFor(
  map: CompletenessMap,
  itemKey: string | null | undefined,
): ItemCompleteness {
  if (!itemKey) return EMPTY_COMPLETENESS;
  return map[itemKey] ?? EMPTY_COMPLETENESS;
}

/* ------------------------------------------------------------------------- */
/* Stage gating                                                              */
/* ------------------------------------------------------------------------- */

export interface StageGate {
  /** True when the stage has everything it needs to be considered done. */
  satisfied: boolean;
  /** Why the next stage is unavailable. Null when satisfied. */
  reason: string | null;
}

export type StageGates = Record<BatchStage, StageGate>;

export function selectStageGates(params: {
  items: EditableBatchItem[];
  primaryCompanyId: string | null;
  completeness: CompletenessMap;
  canGenerate: boolean;
}): StageGates {
  const { items, primaryCompanyId, completeness, canGenerate } = params;
  const incomplete = items.filter(
    (item) => !completenessFor(completeness, item.key).isComplete,
  );

  return {
    documents: {
      satisfied: items.length > 0,
      reason: items.length > 0 ? null : 'Select at least one document first.',
    },
    'shared-setup': {
      satisfied: items.length > 0 && Boolean(primaryCompanyId),
      reason: items.length === 0
        ? 'Select at least one document first.'
        : primaryCompanyId
          ? null
          : 'Choose the primary company for this batch.',
    },
    configure: {
      satisfied: items.length > 0 && incomplete.length === 0,
      reason: items.length === 0
        ? 'Select at least one document first.'
        : incomplete.length === 0
          ? null
          : `${incomplete.length} document${incomplete.length === 1 ? '' : 's'} still ${incomplete.length === 1 ? 'needs' : 'need'} required values.`,
    },
    'review-generate': {
      satisfied: canGenerate,
      reason: canGenerate ? null : 'Every document must be previewed and approved.',
    },
  };
}

/**
 * Index of the furthest stage the user may jump to. A stage only becomes
 * reachable once every earlier gate is satisfied, which stops the stepper
 * from dropping the user onto a screen that cannot function yet.
 */
export function selectHighestReachableStageIndex(
  gates: StageGates,
  stages: BatchStage[],
): number {
  let reachable = 0;
  for (let index = 0; index < stages.length - 1; index += 1) {
    if (!gates[stages[index]].satisfied) break;
    reachable = index + 1;
  }
  return reachable;
}

export interface GenerationBlocker {
  itemKey: string;
  title: string;
  reason: string;
}

/**
 * Names the documents preventing generation. Kept consistent with
 * `selectCanRequestPreflight` by only inspecting items that are not already
 * `READY`/`GENERATED`, so an empty blocker list always means "can generate".
 */
export function selectGenerationBlockers(params: {
  items: EditableBatchItem[];
  completeness: CompletenessMap;
}): GenerationBlocker[] {
  return params.items.flatMap((item) => {
    if (item.status === 'READY' || item.status === 'GENERATED') return [];
    const itemCompleteness = completenessFor(params.completeness, item.key);
    if (!itemCompleteness.isComplete) {
      return [{
        itemKey: item.key,
        title: item.configuration.title || item.templateName,
        reason: `${itemCompleteness.missing.length} required value${itemCompleteness.missing.length === 1 ? '' : 's'} missing`,
      }];
    }
    return [{
      itemKey: item.key,
      title: item.configuration.title || item.templateName,
      reason: item.status === 'FAILED'
        ? item.lastError?.message || 'Generation failed; preview again before retrying.'
        : item.status === 'BLOCKED'
          ? item.lastError?.message || 'Resolve the blocking issue before generation.'
          : 'Preview and approve this document.',
    }];
  });
}
