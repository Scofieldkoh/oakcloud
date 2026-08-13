/**
 * Document generation batch contracts.
 *
 * These DTOs cross the API boundary between the server services and the
 * reducer-backed batch workspace. Server-owned fields (tenant ID, user ID,
 * fingerprints, claim IDs, diagnostics) are never accepted from clients.
 */

import type {
  ServiceAgreementDraftDto,
  ServiceAgreementItemInput,
} from '@/services/service-agreement/types';
import type { PlaceholderValueType } from '@/types/placeholders';

export type BatchItemStatus =
  | 'NOT_STARTED'
  | 'NEEDS_INPUT'
  | 'PREVIEWED'
  | 'READY'
  | 'GENERATING'
  | 'GENERATED'
  | 'FAILED'
  | 'BLOCKED';

export type BatchStatus = 'DRAFT' | 'PARTIAL' | 'COMPLETED';

/**
 * Resumable editor value for one Service Agreement item. The server persists
 * this verbatim inside item configuration; when complete it is additionally
 * synchronized into the relational Service Agreement draft.
 */
export interface ServiceAgreementWorkspaceState {
  authorizedContactId: string | null;
  entityIds: string[];
  agreementDate: string;
  effectiveDate: string | null;
  termMonths: number;
  items: ServiceAgreementItemInput[];
}

export interface BatchItemConfiguration {
  version: 1;
  title: string;
  contactIds: string[];
  selectedDirectorId: string | null;
  selectedShareholderId: string | null;
  selectedContactId: string | null;
  itemValues: Record<string, string>;
  masterOverrides: Record<string, string>;
  useLetterhead: boolean;
  serviceAgreement: ServiceAgreementWorkspaceState | null;
}

export interface MasterFieldDefinition {
  id: string;
  key: string;
  type: PlaceholderValueType;
  label: string;
  templateIds: string[];
  requiredTemplateIds: string[];
  defaultsByTemplateId: Record<string, string>;
}

export interface MasterFieldCatalogue {
  fields: MasterFieldDefinition[];
  conflicts: Array<{ key: string; types: PlaceholderValueType[] }>;
}

export interface BatchItemFieldError {
  field: string;
  message: string;
}

export interface BatchItemDiagnostics {
  itemId: string;
  status: BatchItemStatus;
  errors: string[];
  fieldErrors: BatchItemFieldError[];
}

export interface BatchItemFailure {
  itemId: string;
  code: string;
  message: string;
  occurredAt: string;
}

export interface DocumentGenerationBatchItemDto {
  id: string;
  templateId: string;
  templateName: string;
  templateKind: 'STANDARD' | 'SERVICE_AGREEMENT';
  templateVersion: number;
  displayOrder: number;
  status: BatchItemStatus;
  configuration: BatchItemConfiguration;
  previewContent: string | null;
  editedContent: string | null;
  editedContentJson: unknown | null;
  previewFingerprint: string | null;
  reviewedFingerprint: string | null;
  validationDiagnostics: BatchItemDiagnostics | null;
  lastError: BatchItemFailure | null;
  generatedDocumentId: string;
  generatedDocumentTitle: string | null;
  serviceAgreement: ServiceAgreementDraftDto | null;
}

export interface DocumentGenerationBatchDto {
  id: string;
  primaryCompanyId: string | null;
  company: { id: string; name: string; uen: string } | null;
  activeItemId: string | null;
  currentStage: number;
  revision: number;
  status: BatchStatus;
  masterFieldValues: Record<string, string>;
  masterFields: MasterFieldCatalogue;
  taskContext: unknown | null;
  createdAt: string;
  updatedAt: string;
  items: DocumentGenerationBatchItemDto[];
}

export interface DocumentGenerationBatchListItem {
  id: string;
  primaryCompanyId: string | null;
  companyName: string | null;
  itemCount: number;
  counts: Record<BatchItemStatus, number>;
  status: BatchStatus;
  currentStage: number;
  updatedAt: string;
}

export interface BatchGenerationResult {
  batchId: string;
  revision: number;
  batchStatus: BatchStatus;
  successes: Array<{ itemId: string; documentId: string; title: string }>;
  failures: BatchItemFailure[];
}

export interface CreateDocumentGenerationBatchInput {
  items: Array<{ templateId: string }>;
  legacyDraftId?: string;
  taskContext?: unknown;
}

export interface UpdateDocumentGenerationBatchInput {
  expectedRevision: number;
  currentStage?: number;
  primaryCompanyId?: string | null;
  activeItemId?: string | null;
  masterFieldValues?: Record<string, string>;
  items: Array<{
    id?: string;
    templateId: string;
    displayOrder?: number;
    configuration?: BatchItemConfiguration;
    editedContent?: string | null;
    editedContentJson?: unknown | null;
  }>;
  taskContext?: unknown;
}

export interface BatchItemMutationInput {
  expectedRevision: number;
  replaceEditedContent?: boolean;
}

export interface BatchExecutionInput {
  expectedRevision: number;
}
