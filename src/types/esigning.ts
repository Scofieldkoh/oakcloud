import type {
  EsigningEnvelopeEventAction,
  EsigningEnvelopeStatus,
  EsigningFieldType,
  EsigningPdfGenerationStatus,
  EsigningRecipientAccessMode,
  EsigningRecipientStatus,
  EsigningRecipientType,
  EsigningSigningOrder,
} from '@/generated/prisma';

export interface EsigningEnvelopeListItem {
  id: string;
  title: string;
  status: EsigningEnvelopeStatus;
  signingOrder: EsigningSigningOrder;
  certificateId: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  expiresAt: string | null;
  companyId: string | null;
  companyName: string | null;
  createdById: string;
  createdByName: string;
  recipientCount: number;
  signerCount: number;
  documentCount: number;
  recipients: Array<{
    id: string;
    name: string;
    email: string;
    type: EsigningRecipientType;
    status: EsigningRecipientStatus;
    signingOrder: number | null;
  }>;
}

export type EsigningEnvelopeStatusCounts = Record<EsigningEnvelopeStatus, number>;

export interface EsigningEnvelopeDocumentDto {
  id: string;
  fileName: string;
  pageCount: number;
  sortOrder: number;
  fileSize: number;
  originalHash: string;
  signedHash: string | null;
  pdfUrl: string;
  signedPdfUrl: string | null;
}

export interface EsigningEnvelopeRecipientDto {
  id: string;
  name: string;
  email: string;
  type: EsigningRecipientType;
  status: EsigningRecipientStatus;
  signingOrder: number | null;
  accessMode: EsigningRecipientAccessMode;
  hasAccessCode: boolean;
  colorTag: string;
  consentedAt: string | null;
  viewedAt: string | null;
  signedAt: string | null;
  declinedAt: string | null;
  declineReason: string | null;
  fieldsAssigned: number;
  requiredFieldsAssigned: number;
  signatureFieldsAssigned: number;
}

export interface EsigningFieldDefinitionDto {
  id: string;
  documentId: string;
  recipientId: string;
  type: EsigningFieldType;
  pageNumber: number;
  xPercent: number;
  yPercent: number;
  widthPercent: number;
  heightPercent: number;
  required: boolean;
  label: string | null;
  placeholder: string | null;
  sortOrder: number;
}

export interface EsigningFieldValueDto {
  id: string;
  fieldDefinitionId: string;
  recipientId: string;
  value: string | null;
  signatureStoragePath: string | null;
  signaturePreviewUrl?: string | null;
  filledAt: string | null;
  finalizedAt: string | null;
  revision: number;
}

export interface EsigningEnvelopeEventDto {
  id: string;
  recipientId: string | null;
  recipientName: string | null;
  action: EsigningEnvelopeEventAction;
  createdAt: string;
  metadata: Record<string, unknown> | null;
}

export interface EsigningEnvelopeDetailDto {
  id: string;
  tenantId: string;
  title: string;
  message: string | null;
  status: EsigningEnvelopeStatus;
  signingOrder: EsigningSigningOrder;
  expiresAt: string | null;
  reminderFrequencyDays: number | null;
  reminderStartDays: number | null;
  expiryWarningDays: number | null;
  companyId: string | null;
  companyName: string | null;
  certificateId: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  voidedAt: string | null;
  voidReason: string | null;
  pdfGenerationStatus: EsigningPdfGenerationStatus | null;
  pdfGenerationError: string | null;
  createdById: string;
  createdByName: string;
  canEdit: boolean;
  canDelete: boolean;
  canSend: boolean;
  canVoid: boolean;
  documentCount: number;
  signerCount: number;
  recipientCount: number;
  completedSignerCount: number;
  documents: EsigningEnvelopeDocumentDto[];
  recipients: EsigningEnvelopeRecipientDto[];
  fields: EsigningFieldDefinitionDto[];
  fieldValues: EsigningFieldValueDto[];
  events: EsigningEnvelopeEventDto[];
}

export interface EsigningManualLinkDto {
  recipientId: string;
  recipientName: string;
  recipientEmail: string;
  signingUrl: string;
}

export interface EsigningSigningSessionDto {
  envelope: {
    id: string;
    title: string;
    message: string | null;
    status: EsigningEnvelopeStatus;
    certificateId: string;
    companyName: string | null;
    tenantName: string;
    senderName: string;
    completedAt: string | null;
    expiresAt: string | null;
  };
  recipient: {
    id: string;
    name: string;
    email: string;
    type: EsigningRecipientType;
    status: EsigningRecipientStatus;
    accessMode: EsigningRecipientAccessMode;
    consentedAt: string | null;
    viewedAt: string | null;
    signedAt: string | null;
    colorTag: string;
  };
  documents: EsigningEnvelopeDocumentDto[];
  recipients: Array<{
    id: string;
    name: string;
    type: EsigningRecipientType;
    status: EsigningRecipientStatus;
    signingOrder: number | null;
    colorTag: string;
  }>;
  fields: EsigningFieldDefinitionDto[];
  fieldValues: EsigningFieldValueDto[];
  downloadToken: string | null;
}
