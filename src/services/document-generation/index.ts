/**
 * Document Generation Module
 *
 * Clean exports for the document generation module.
 * This barrel file provides a single import point for all document generation
 * interfaces, types, and factory functions.
 *
 * @example
 * ```typescript
 * // Future workflow module can import and use:
 * import {
 *   IDocumentGenerator,
 *   IDocumentExporter,
 *   IDocumentPublisher,
 *   getDocumentGenerator,
 *   getDocumentExporter,
 *   getDocumentPublisher,
 *   DocumentStepResult,
 * } from '@/services/document-generation';
 *
 * // Example workflow step
 * async function executeDocumentStep(
 *   workflowContext: WorkflowContext,
 *   stepConfig: DocumentStepConfig
 * ): Promise<DocumentStepResult> {
 *   const generator = getDocumentGenerator();
 *   const document = await generator.generate({
 *     tenantId: workflowContext.tenantId,
 *     userId: workflowContext.triggeredById,
 *     templateId: stepConfig.templateId,
 *     companyId: workflowContext.companyId,
 *     title: stepConfig.title,
 *     customData: workflowContext.variables,
 *   });
 *
 *   // Export to PDF if needed
 *   if (stepConfig.exportPDF) {
 *     const exporter = getDocumentExporter();
 *     const pdf = await exporter.toPDF({
 *       tenantId: workflowContext.tenantId,
 *       userId: workflowContext.triggeredById,
 *       documentId: document.id,
 *       includeLetterhead: true,
 *     });
 *   }
 *
 *   return { documentId: document.id, success: true, ... };
 * }
 * ```
 */

// ============================================================================
// Types
// ============================================================================

export type {
  // Document Generator Types
  GenerateDocumentParams,
  PreviewDocumentParams,
  PlaceholderContext,
  SectionDefinition,
  PreviewResult,
  ResolvedContent,

  // Document Exporter Types
  ExportPDFParams,
  PDFResult,
  ExportHTMLParams,
  HTMLResult,

  // Document Publisher Types
  PublishParams,
  ShareAccessResult,

  // Workflow Integration Types
  DocumentStepResult,
  DocumentStepConfig,
  WorkflowContext,

  // E-Signature Integration Types
  DocumentForSignature,
  Signatory,

  // URL Shortener Integration Types
  ShortenedUrl,

  // Notification Integration Types
  ShareNotification,
  CommentNotification,
} from './types';

// ============================================================================
// Interfaces
// ============================================================================

export type {
  IDocumentGenerator,
  IDocumentExporter,
  IDocumentPublisher,
  IDocumentWorkflowStep,
} from './interfaces';

// ============================================================================
// Factory Functions
// ============================================================================

export {
  getDocumentGenerator,
  getDocumentExporter,
  getDocumentPublisher,
  getDocumentWorkflowStep,
  resetInstances,
} from './implementations';
