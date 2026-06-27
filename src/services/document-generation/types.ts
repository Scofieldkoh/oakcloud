/**
 * Document Generation Module Types
 *
 * Core types and interfaces for the document generation module.
 * These types are designed for clean integration with workflow modules.
 */

// ============================================================================
// Document Generator Types
// ============================================================================

/**
 * Parameters for generating a document from a template
 */
export interface GenerateDocumentParams {
  tenantId: string;
  userId: string;
  templateId: string;
  companyId?: string;
  title: string;
  /** Custom placeholder overrides */
  customData?: Record<string, unknown>;
  /** Additional contacts to include */
  contactIds?: string[];
  /** Metadata (e.g., resolution number, date) */
  metadata?: Record<string, unknown>;
}

/**
 * Parameters for previewing a document without saving
 */
export interface PreviewDocumentParams {
  tenantId: string;
  templateId: string;
  companyId?: string;
  customData?: Record<string, unknown>;
  contactIds?: string[];
}

/**
 * Context for placeholder resolution
 */
export interface PlaceholderContext {
  company?: {
    id: string;
    name: string;
    uen: string;
    [key: string]: unknown;
  };
  contacts?: Array<{
    id: string;
    name: string;
    email?: string;
    [key: string]: unknown;
  }>;
  officers?: Array<{
    name: string;
    designation: string;
    identificationNumber?: string;
    [key: string]: unknown;
  }>;
  shareholders?: Array<{
    name: string;
    sharesHeld: number;
    [key: string]: unknown;
  }>;
  customData?: Record<string, unknown>;
  /** System data */
  currentDate: Date;
  generatedBy?: {
    id: string;
    firstName: string;
    lastName: string;
  };
}

/**
 * Section definition for document structure
 */
export interface SectionDefinition {
  id: string;
  title: string;
  level: number;
  content?: string;
  startIndex: number;
  endIndex: number;
}

/**
 * Preview result without saving
 */
export interface PreviewResult {
  html: string;
  sections: SectionDefinition[];
  unresolvedPlaceholders: string[];
  missingPartials: string[];
}

/**
 * Result of placeholder resolution
 */
export interface ResolvedContent {
  html: string;
  resolvedPlaceholders: Record<string, string>;
  unresolvedPlaceholders: string[];
  missingPartials: string[];
}

// ============================================================================
// Document Exporter Types
// ============================================================================

/**
 * Parameters for PDF export
 */
export interface ExportPDFParams {
  tenantId: string;
  userId: string;
  documentId: string;
  includeLetterhead?: boolean;
  format?: 'A4' | 'Letter';
  orientation?: 'portrait' | 'landscape';
  filename?: string;
}

/**
 * Result of PDF export
 */
export interface PDFResult {
  buffer: Buffer;
  filename: string;
  pageCount: number;
  mimeType: string;
}

/**
 * Parameters for HTML export
 */
export interface ExportHTMLParams {
  tenantId: string;
  documentId: string;
  includeStyles?: boolean;
  includeSections?: boolean;
}

/**
 * Result of HTML export
 */
export interface HTMLResult {
  html: string;
  styles: string;
  sections: SectionDefinition[];
}

// ============================================================================
// Workflow Integration Types
// ============================================================================

/**
 * Result returned by document generation workflow step.
 * Used by workflow designer to pass data to subsequent steps.
 */
export interface DocumentStepResult {
  /** Operation status */
  success: boolean;
  error?: string;

  /** Document info */
  documentId: string;
  documentTitle: string;
  status: 'DRAFT' | 'FINALIZED' | 'ARCHIVED';

  /** For next steps (e.g., e-signature) */
  pdfUrl?: string;
  pdfBuffer?: Buffer;

  /** Context for downstream steps */
  companyId?: string;
  companyName?: string;
  companyUen?: string;

  /**
   * Signatories extracted from document (for e-sign step)
   */
  signatories?: Array<{
    name: string;
    email?: string;
    role: string;
    identificationNumber?: string;
  }>;

  /** Validation info (if draft due to missing data) */
  validationErrors?: string[];

  /** Metadata for logging/tracking */
  templateId?: string;
  templateName?: string;
  generatedAt: Date;
  generatedBy: string;
}

/**
 * Configuration for document generation step in workflow
 */
export interface DocumentStepConfig {
  templateId: string;
  title: string;
  /** Auto-finalize after generation */
  autoFinalize?: boolean;
  /** Export to PDF after generation */
  exportPDF?: boolean;
  /** Include letterhead in PDF */
  includeLetterhead?: boolean;
  /** Custom placeholder data */
  customData?: Record<string, unknown>;
}

/**
 * Workflow context passed to document step
 */
export interface WorkflowContext {
  tenantId: string;
  triggeredById: string;
  companyId?: string;
  /** Variables from previous workflow steps */
  variables: Record<string, unknown>;
}

// ============================================================================
// E-Signature Integration Types
// ============================================================================

/**
 * Document ready for signature
 */
export interface DocumentForSignature {
  documentId: string;
  pdfBuffer: Buffer;
  title: string;
  signatories: Signatory[];
}

/**
 * Signatory information for e-signature
 */
export interface Signatory {
  name: string;
  email: string;
  role: string;
  identificationNumber?: string;
  signatureOrder?: number;
}

/**
 * Comment notification
 */
export interface CommentNotification {
  type: 'document_comment';
  recipientEmail: string;
  documentTitle: string;
  documentUrl: string;
  commentContent: string;
  commenterName: string;
}
