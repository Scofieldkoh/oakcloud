/**
 * Reducer-backed state for the four-stage batch workspace.
 *
 * The server DTO is kept separate from ephemeral UI state: `savedSnapshot`
 * stores a canonical serialization of user-editable fields so `dirty` is
 * deterministic, and server replacements never overwrite local edits before
 * an explicit save.
 */

import type {
  BatchItemConfiguration,
  BatchItemDiagnostics,
  BatchItemFailure,
  BatchItemStatus,
  BatchStatus,
  DocumentGenerationBatchDto,
  MasterFieldCatalogue,
} from '@/types/document-generation-batch';
import type { ServiceAgreementDraftDto } from '@/services/service-agreement/types';
import type {
  DocumentTemplateSummary,
} from '@/types/document-generation';
import { masterFieldId } from '@/lib/document-generation-master-fields';

export type BatchStage = 'documents' | 'shared-setup' | 'configure' | 'review-generate';

export interface EditableBatchItem {
  key: string;
  id?: string;
  templateId: string;
  templateName: string;
  templateKind: 'STANDARD' | 'SERVICE_AGREEMENT';
  templateVersion: number;
  status: BatchItemStatus;
  configuration: BatchItemConfiguration;
  previewContent: string | null;
  editedContent: string | null;
  editedContentJson: unknown | null;
  previewFingerprint: string | null;
  reviewedFingerprint: string | null;
  validationDiagnostics: BatchItemDiagnostics | null;
  lastError: BatchItemFailure | null;
  generatedDocumentId?: string;
  generatedDocumentTitle?: string | null;
  serviceAgreement?: ServiceAgreementDraftDto | null;
}

export interface EditableDocumentGenerationBatch {
  id?: string;
  legacyDraftId?: string;
  primaryCompanyId: string | null;
  company?: { id: string; name: string; uen: string } | null;
  activeItemId?: string | null;
  currentStage: number;
  revision?: number;
  status: BatchStatus;
  masterFieldValues: Record<string, string>;
  masterFields: MasterFieldCatalogue;
  taskContext?: unknown;
  createdAt?: string;
  updatedAt?: string;
  items: EditableBatchItem[];
}

export interface BatchWorkspaceCapabilities {
  canEditComposition: boolean;
  canEditSharedSetup: boolean;
  canEditItems: boolean;
}

export interface BatchWorkspaceState {
  batch: EditableDocumentGenerationBatch;
  stage: BatchStage;
  activeItemId: string | null;
  savedSnapshot: string;
  dirty: boolean;
  pending: null | 'save' | 'preview' | 'review' | 'preflight' | 'generate' | 'retry';
  conflict: { currentRevision: number } | null;
  capabilities: BatchWorkspaceCapabilities;
}

export type DocumentGenerationBatchAction =
  | { type: 'template/add'; template: DocumentTemplateSummary }
  | { type: 'template/remove'; itemId: string }
  | { type: 'template/reorder'; itemId: string; direction: -1 | 1 }
  | { type: 'template/move'; itemId: string; toIndex: number }
  | { type: 'shared/company'; companyId: string | null }
  | { type: 'shared/masterValue'; fieldId: string; value: string }
  | { type: 'item/patch'; itemId: string; patch: Partial<BatchItemConfiguration> }
  | { type: 'items/patch-many'; itemIds: string[]; patch: Partial<BatchItemConfiguration> }
  | { type: 'conflict/accept-revision' }
  | { type: 'item/edit-content'; itemId: string; editedContent: string | null; editedContentJson: unknown | null }
  | { type: 'item/activate'; itemId: string }
  | { type: 'stage/navigate'; stage: BatchStage }
  | { type: 'save/start' }
  | { type: 'save/conflict'; currentRevision: number }
  | { type: 'server/track-id'; id: string; revision: number; currentRevision: number }
  | { type: 'server/replace'; batch: EditableDocumentGenerationBatch }
  | { type: 'local/initialize'; batch: EditableDocumentGenerationBatch }
  | { type: 'request/start'; pending: NonNullable<BatchWorkspaceState['pending']> }
  | { type: 'request/end' };

export const BATCH_STAGES: BatchStage[] = [
  'documents',
  'shared-setup',
  'configure',
  'review-generate',
];

export const STAGE_LABELS: Record<BatchStage, string> = {
  documents: 'Documents',
  'shared-setup': 'Shared setup',
  configure: 'Configure',
  'review-generate': 'Review & generate',
};

export function defaultItemConfiguration(
  template: Pick<DocumentTemplateSummary, 'name'>,
): BatchItemConfiguration {
  return {
    version: 1,
    title: `Untitled - ${template.name}`,
    contactIds: [],
    selectedDirectorId: null,
    selectedShareholderId: null,
    selectedContactId: null,
    itemValues: {},
    masterOverrides: {},
    useLetterhead: true,
    serviceAgreement: null,
  };
}

export function itemFromTemplate(template: DocumentTemplateSummary): EditableBatchItem {
  return {
    key: template.id,
    templateId: template.id,
    templateName: template.name,
    templateKind: template.compositionType,
    templateVersion: template.version,
    status: 'NOT_STARTED',
    configuration: defaultItemConfiguration(template),
    previewContent: null,
    editedContent: null,
    editedContentJson: null,
    previewFingerprint: null,
    reviewedFingerprint: null,
    validationDiagnostics: null,
    lastError: null,
  };
}

export function createInitialBatchWorkspaceState(
  batchOrItems: EditableDocumentGenerationBatch | DocumentTemplateSummary[],
): BatchWorkspaceState {
  const batch: EditableDocumentGenerationBatch = Array.isArray(batchOrItems)
    ? {
        primaryCompanyId: null,
        currentStage: 0,
        status: 'DRAFT',
        masterFieldValues: {},
        masterFields: { fields: [], conflicts: [] },
        items: batchOrItems.slice(0, 20).map(itemFromTemplate),
      }
    : batchOrItems;
  const capabilities = deriveCapabilities(batch);
  return {
    batch,
    stage: BATCH_STAGES[Math.min(batch.currentStage, BATCH_STAGES.length - 1)],
    activeItemId: batch.activeItemId ?? batch.items[0]?.key ?? null,
    savedSnapshot: canonicalEditableState(batch),
    dirty: false,
    pending: null,
    conflict: null,
    capabilities,
  };
}

export function editableBatchFromDto(
  dto: DocumentGenerationBatchDto,
): EditableDocumentGenerationBatch {
  return {
    ...dto,
    company: dto.company,
    items: dto.items.map((item) => ({
      key: item.id,
      id: item.id,
      templateId: item.templateId,
      templateName: item.templateName,
      templateKind: item.templateKind,
      templateVersion: item.templateVersion,
      status: item.status,
      configuration: item.configuration,
      previewContent: item.previewContent,
      editedContent: item.editedContent,
      editedContentJson: item.editedContentJson,
      previewFingerprint: item.previewFingerprint,
      reviewedFingerprint: item.reviewedFingerprint,
      validationDiagnostics: item.validationDiagnostics,
      lastError: item.lastError,
      generatedDocumentId: item.generatedDocumentId,
      generatedDocumentTitle: item.generatedDocumentTitle,
      serviceAgreement: item.serviceAgreement ?? null,
    })),
  };
}

export function deriveCapabilitiesForCommit(
  batch: EditableDocumentGenerationBatch,
): BatchWorkspaceCapabilities {
  return deriveCapabilities(batch);
}

function deriveCapabilities(
  batch: EditableDocumentGenerationBatch,
): BatchWorkspaceCapabilities {
  const hasGenerated = batch.items.some((item) => item.status === 'GENERATED');
  return {
    canEditComposition: !hasGenerated,
    canEditSharedSetup: !hasGenerated,
    canEditItems: true,
  };
}

function canonicalEditableState(batch: EditableDocumentGenerationBatch): string {
  return JSON.stringify({
    primaryCompanyId: batch.primaryCompanyId,
    currentStage: batch.currentStage,
    masterFieldValues: batch.masterFieldValues,
    items: batch.items.map((item) => ({
      templateId: item.templateId,
      configuration: item.configuration,
      editedContent: item.editedContent,
      editedContentJson: item.editedContentJson,
      status: item.status,
      previewFingerprint: item.previewFingerprint,
      reviewedFingerprint: item.reviewedFingerprint,
    })),
  });
}

function invalidateItem(item: EditableBatchItem): EditableBatchItem {
  if (item.status === 'GENERATED') return item;
  return {
    ...item,
    status: item.status === 'FAILED' || item.status === 'READY'
      ? 'NEEDS_INPUT'
      : item.status === 'GENERATING'
        ? item.status
        : 'NEEDS_INPUT',
    previewFingerprint: null,
    reviewedFingerprint: null,
    validationDiagnostics: null,
  };
}

function invalidateReviewOnly(item: EditableBatchItem): EditableBatchItem {
  if (item.status === 'GENERATED') return item;
  return {
    ...item,
    status: item.status === 'READY'
      ? 'PREVIEWED'
      : item.status === 'FAILED'
        ? 'NEEDS_INPUT'
        : item.status,
    reviewedFingerprint: null,
    validationDiagnostics: null,
  };
}

function replaceBatchItems(
  batch: EditableDocumentGenerationBatch,
  items: EditableBatchItem[],
): EditableDocumentGenerationBatch {
  return {
    ...batch,
    items,
  };
}

function itemConsumesMasterField(
  item: EditableBatchItem,
  fieldId: string,
): boolean {
  return item.status !== 'GENERATED'
    && Object.prototype.hasOwnProperty.call(item.configuration.masterOverrides, fieldId) === false;
}

function reduceBatchState(
  state: BatchWorkspaceState,
  action: DocumentGenerationBatchAction,
): BatchWorkspaceState {
  switch (action.type) {
    case 'template/add': {
      if (!state.capabilities.canEditComposition) return state;
      const exists = state.batch.items.some(
        (item) => item.templateId === action.template.id,
      );
      if (exists || state.batch.items.length >= 20) return state;
      const items = [...state.batch.items, itemFromTemplate(action.template)];
      const batch = replaceBatchItems(state.batch, items);
      return {
        ...state,
        batch,
        activeItemId: state.activeItemId ?? items[0].key,
        capabilities: deriveCapabilities(batch),
      };
    }
    case 'template/remove': {
      if (!state.capabilities.canEditComposition) return state;
      const items = state.batch.items.filter((item) => item.key !== action.itemId);
      if (items.length === state.batch.items.length) return state;
      const batch = replaceBatchItems(state.batch, items);
      const activeItemId = state.activeItemId === action.itemId
        ? items[0]?.key ?? null
        : state.activeItemId;
      return {
        ...state,
        batch,
        activeItemId,
        capabilities: deriveCapabilities(batch),
      };
    }
    case 'template/reorder': {
      if (!state.capabilities.canEditComposition) return state;
      const index = state.batch.items.findIndex((item) => item.key === action.itemId);
      const target = index + action.direction;
      if (index < 0 || target < 0 || target >= state.batch.items.length) return state;
      const items = [...state.batch.items];
      const [moved] = items.splice(index, 1);
      items.splice(target, 0, moved);
      const batch = replaceBatchItems(state.batch, items);
      return {
        ...state,
        batch,
        capabilities: deriveCapabilities(batch),
      };
    }
    case 'template/move': {
      if (!state.capabilities.canEditComposition) return state;
      const index = state.batch.items.findIndex((item) => item.key === action.itemId);
      if (index < 0) return state;
      const target = Math.max(0, Math.min(action.toIndex, state.batch.items.length - 1));
      if (target === index) return state;
      const items = [...state.batch.items];
      const [moved] = items.splice(index, 1);
      items.splice(target, 0, moved);
      const batch = replaceBatchItems(state.batch, items);
      return {
        ...state,
        batch,
        capabilities: deriveCapabilities(batch),
      };
    }
    case 'shared/company': {
      if (!state.capabilities.canEditSharedSetup) return state;
      const batch = { ...state.batch, primaryCompanyId: action.companyId };
      return {
        ...state,
        batch,
        capabilities: deriveCapabilities(batch),
      };
    }
    case 'shared/masterValue': {
      if (!state.capabilities.canEditSharedSetup) return state;
      const masterFieldValues = {
        ...state.batch.masterFieldValues,
        [action.fieldId]: action.value,
      };
      const batch = { ...state.batch, masterFieldValues };
      const items = batch.items.map((item) =>
        itemConsumesMasterField(item, action.fieldId) ? invalidateItem(item) : item,
      );
      return {
        ...state,
        batch: replaceBatchItems({ ...batch, items }, items),
        capabilities: deriveCapabilities(batch),
      };
    }
    case 'item/patch': {
      const items = state.batch.items.map((item) => {
        if (item.key !== action.itemId || item.status === 'GENERATED') return item;
        return invalidateItem({
          ...item,
          configuration: { ...item.configuration, ...action.patch },
        });
      });
      const batch = replaceBatchItems(state.batch, items);
      return {
        ...state,
        batch,
        capabilities: deriveCapabilities(batch),
      };
    }
    case 'items/patch-many': {
      const targets = new Set(action.itemIds);
      if (targets.size === 0) return state;
      const items = state.batch.items.map((item) => {
        if (!targets.has(item.key) || item.status === 'GENERATED') return item;
        return invalidateItem({
          ...item,
          configuration: { ...item.configuration, ...action.patch },
        });
      });
      const batch = replaceBatchItems(state.batch, items);
      return {
        ...state,
        batch,
        capabilities: deriveCapabilities(batch),
      };
    }
    case 'conflict/accept-revision': {
      if (!state.conflict) return state;
      return {
        ...state,
        batch: { ...state.batch, revision: state.conflict.currentRevision },
        conflict: null,
      };
    }
    case 'item/edit-content': {
      const items = state.batch.items.map((item) => {
        if (item.key !== action.itemId || item.status === 'GENERATED') return item;
        return invalidateReviewOnly({
          ...item,
          editedContent: action.editedContent,
          editedContentJson: action.editedContentJson,
        });
      });
      const batch = replaceBatchItems(state.batch, items);
      return {
        ...state,
        batch,
        capabilities: deriveCapabilities(batch),
      };
    }
    case 'item/activate':
      return { ...state, activeItemId: action.itemId };
    case 'stage/navigate':
      return { ...state, stage: action.stage };
    case 'save/start':
      return { ...state, pending: 'save', conflict: null };
    case 'save/conflict':
      return { ...state, pending: null, conflict: { currentRevision: action.currentRevision } };
    case 'server/track-id':
      return {
        ...state,
        batch: { ...state.batch, id: action.id, revision: action.revision },
        pending: null,
        conflict: { currentRevision: action.currentRevision },
        dirty: true,
      };
    case 'server/replace': {
      const nextBatch = {
        ...action.batch,
        items: action.batch.items.map((item) => ({
          ...item,
          key: item.id ?? item.key,
        })),
      };
      return {
        batch: nextBatch,
        stage: BATCH_STAGES[Math.min(nextBatch.currentStage, BATCH_STAGES.length - 1)],
        activeItemId: nextBatch.activeItemId ?? nextBatch.items[0]?.key ?? null,
        savedSnapshot: canonicalEditableState(nextBatch),
        dirty: false,
        pending: null,
        conflict: null,
        capabilities: deriveCapabilities(nextBatch),
      };
    }
    case 'local/initialize':
      return createInitialBatchWorkspaceState(action.batch);
    case 'request/start':
      return { ...state, pending: action.pending };
    case 'request/end':
      return { ...state, pending: null };
    default:
      return state;
  }
}

export function documentGenerationBatchReducer(
  state: BatchWorkspaceState,
  action: DocumentGenerationBatchAction,
): BatchWorkspaceState {
  const next = reduceBatchState(state, action);
  if (next.dirty) return next;
  const currentSnapshot = canonicalEditableState(next.batch);
  if (next.savedSnapshot === currentSnapshot) {
    return next;
  }
  return {
    ...next,
    dirty: next.pending === 'save' ? false : true,
  };
}

export function selectCanEnterConfigure(state: BatchWorkspaceState): boolean {
  return state.batch.items.length > 0 && Boolean(state.batch.primaryCompanyId);
}

export function selectCanRequestPreflight(state: BatchWorkspaceState): boolean {
  return state.batch.items.length > 0
    && state.batch.items.every(
      (item) => item.status === 'GENERATED' || item.status === 'READY',
    );
}

export function selectReadyCount(state: BatchWorkspaceState): {
  ready: number;
  total: number;
} {
  return {
    ready: state.batch.items.filter(
      (item) => item.status === 'READY' || item.status === 'GENERATED',
    ).length,
    total: state.batch.items.length,
  };
}

export function selectAffectedItemKeys(
  state: BatchWorkspaceState,
  fieldId: string,
): string[] {
  return state.batch.items
    .filter((item) => itemConsumesMasterField(item, fieldId))
    .map((item) => item.key);
}

export function masterFieldIdFor(key: string, type: string): string {
  return masterFieldId(key, type as never);
}
