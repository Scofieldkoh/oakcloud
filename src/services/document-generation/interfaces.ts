/**
 * Document Generation Module Interfaces
 *
 * Clean interfaces for workflow integration.
 * These interfaces abstract the underlying service implementations.
 */

import type {
  GenerateDocumentParams,
  PreviewDocumentParams,
  PlaceholderContext,
  PreviewResult,
  ResolvedContent,
  ExportPDFParams,
  PDFResult,
  ExportHTMLParams,
  HTMLResult,
  DocumentStepResult,
  DocumentStepConfig,
  WorkflowContext,
  DocumentForSignature,
  Signatory,
} from './types';
import type { GeneratedDocument } from '@/generated/prisma';

// ============================================================================
// IDocumentGenerator Interface
// ============================================================================

/**
 * Document Generator Interface
 *
 * Provides methods for generating and managing documents from templates.
 * Designed for clean integration with workflow modules.
 */
export interface IDocumentGenerator {
  /**
   * Generate a document from a template.
   * Creates a new document in DRAFT status.
   *
   * @param params - Generation parameters
   * @returns The generated document
   */
  generate(params: GenerateDocumentParams): Promise<GeneratedDocument>;

  /**
   * Preview a document without saving.
   * Useful for template testing and real-time preview.
   *
   * @param params - Preview parameters
   * @returns Preview result with resolved HTML
   */
  preview(params: PreviewDocumentParams): Promise<PreviewResult>;

  /**
   * Resolve placeholders for a given context.
   * Low-level method for custom placeholder resolution.
   *
   * @param templateContent - Raw template content with placeholders
   * @param context - Context data for resolution
   * @returns Resolved content with placeholder mapping
   */
  resolvePlaceholders(
    templateContent: string,
    context: PlaceholderContext
  ): Promise<ResolvedContent>;

  /**
   * Finalize a document.
   * Changes status from DRAFT to FINALIZED, making it immutable.
   *
   * @param tenantId - Tenant ID
   * @param userId - User performing the action
   * @param documentId - Document to finalize
   * @returns The finalized document
   */
  finalize(
    tenantId: string,
    userId: string,
    documentId: string
  ): Promise<GeneratedDocument>;

  /**
   * Un-finalize a document for further editing.
   * Requires audit reason.
   *
   * @param tenantId - Tenant ID
   * @param userId - User performing the action
   * @param documentId - Document to un-finalize
   * @param reason - Reason for un-finalizing (audit logged)
   * @returns The un-finalized document
   */
  unfinalize(
    tenantId: string,
    userId: string,
    documentId: string,
    reason: string
  ): Promise<GeneratedDocument>;

  /**
   * Clone an existing document.
   *
   * @param tenantId - Tenant ID
   * @param userId - User performing the action
   * @param documentId - Document to clone
   * @param newTitle - Optional new title for the clone
   * @returns The cloned document
   */
  clone(
    tenantId: string,
    userId: string,
    documentId: string,
    newTitle?: string
  ): Promise<GeneratedDocument>;

  /**
   * Get a document by ID.
   *
   * @param tenantId - Tenant ID
   * @param documentId - Document ID
   * @returns The document or null if not found
   */
  get(tenantId: string, documentId: string): Promise<GeneratedDocument | null>;
}

// ============================================================================
// IDocumentExporter Interface
// ============================================================================

/**
 * Document Exporter Interface
 *
 * Provides methods for exporting documents to various formats.
 */
export interface IDocumentExporter {
  /**
   * Export document to PDF.
   *
   * @param params - Export parameters
   * @returns PDF buffer with metadata
   */
  toPDF(params: ExportPDFParams): Promise<PDFResult>;

  /**
   * Export document to clean HTML.
   *
   * @param params - Export parameters
   * @returns HTML content with styles
   */
  toHTML(params: ExportHTMLParams): Promise<HTMLResult>;

  /**
   * Apply letterhead to an existing PDF.
   *
   * @param tenantId - Tenant ID
   * @param pdfBuffer - Original PDF buffer
   * @returns PDF buffer with letterhead applied
   */
  applyLetterhead(tenantId: string, pdfBuffer: Buffer): Promise<Buffer>;
}

// ============================================================================
// IDocumentWorkflowStep Interface
// ============================================================================

/**
 * Document Workflow Step Interface
 *
 * High-level interface for workflow integration.
 * Combines generation and export in a single step.
 */
export interface IDocumentWorkflowStep {
  /**
   * Execute a document generation workflow step.
   *
   * @param context - Workflow context
   * @param config - Step configuration
   * @returns Step result with all outputs
   */
  execute(
    context: WorkflowContext,
    config: DocumentStepConfig
  ): Promise<DocumentStepResult>;

  /**
   * Prepare a document for e-signature.
   *
   * @param tenantId - Tenant ID
   * @param documentId - Document ID
   * @param signatories - Signatories for the document
   * @returns Document ready for e-signature
   */
  prepareForSignature(
    tenantId: string,
    documentId: string,
    signatories: Signatory[]
  ): Promise<DocumentForSignature>;
}
