/**
 * Document Generation Module Implementations
 *
 * Factory functions and implementations for the document generation interfaces.
 * These wrap the existing service functions with clean interface contracts.
 */

import type {
  IDocumentGenerator,
  IDocumentExporter,
  IDocumentPublisher,
  IDocumentWorkflowStep,
} from './interfaces';
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
  PublishParams,
  ShareAccessResult,
  DocumentStepResult,
  DocumentStepConfig,
  WorkflowContext,
  DocumentForSignature,
  Signatory,
  SectionDefinition,
} from './types';
import type { GeneratedDocument, DocumentShare } from '@/generated/prisma';

// Import existing service functions
import {
  createDocumentFromTemplate,
  finalizeDocument,
  unfinalizeDocument,
  cloneDocument,
  getGeneratedDocumentById,
  createDocumentShare,
  revokeDocumentShare,
  getShareByToken,
  verifySharePassword,
} from '@/services/document-generator.service';

import {
  exportToPDF,
  exportToHTML,
} from '@/services/document-export.service';

import { getDocumentTemplateById } from '@/services/document-template.service';
import { extractSections } from '@/services/document-validation.service';
import {
  resolvePlaceholders as resolveTemplatePlaceholders,
  prepareCompanyContext,
  type PlaceholderContext as ResolverPlaceholderContext,
} from '@/lib/placeholder-resolver';
import { getPartialsUsedInTemplate } from '@/services/template-partial.service';
import { getCompanyById } from '@/services/company.service';
import { prisma } from '@/lib/prisma';

// ============================================================================
// Document Generator Implementation
// ============================================================================

class DocumentGeneratorImpl implements IDocumentGenerator {
  async generate(params: GenerateDocumentParams): Promise<GeneratedDocument> {
    return createDocumentFromTemplate(
      {
        templateId: params.templateId,
        title: params.title,
        companyId: params.companyId,
        customData: params.customData,
        useLetterhead: true,
      },
      {
        tenantId: params.tenantId,
        userId: params.userId,
      }
    );
  }

  async preview(params: PreviewDocumentParams): Promise<PreviewResult> {
    const { tenantId, templateId, companyId, customData } = params;

    // Get template
    const template = await getDocumentTemplateById(templateId, tenantId);
    if (!template) {
      throw new Error('Template not found');
    }

    // Build placeholder context
    let context: ResolverPlaceholderContext = {
      custom: customData || {},
      system: { currentDate: new Date() },
    };

    if (companyId) {
      const company = await getCompanyById(companyId, tenantId);
      if (company) {
        context = {
          ...prepareCompanyContext(company as Parameters<typeof prepareCompanyContext>[0]),
          custom: { ...context.custom, ...customData },
        };
      }
    }

    // Get partials for resolution
    const partials = await getPartialsUsedInTemplate(template.content, tenantId);
    const partialsMap = new Map(partials.map((p) => [p.name, p.content]));

    // Resolve placeholders
    const result = resolveTemplatePlaceholders(template.content, context, {
      missingPlaceholder: 'highlight',
      partialsMap,
    });

    // Extract sections from resolved content
    const sections = extractSections(result.resolved);

    return {
      html: result.resolved,
      sections: sections.map((s) => ({
        id: s.id,
        title: s.title,
        level: s.level,
        startIndex: 0,
        endIndex: 0,
      })),
      unresolvedPlaceholders: result.missing,
      missingPartials: result.missingPartials,
    };
  }

  async resolvePlaceholders(
    templateContent: string,
    context: PlaceholderContext
  ): Promise<ResolvedContent> {
    // Convert our PlaceholderContext to resolver's PlaceholderContext
    const resolverContext: ResolverPlaceholderContext = {
      company: context.company as ResolverPlaceholderContext['company'],
      custom: context.customData || {},
      system: { currentDate: context.currentDate },
    };

    // Get tenant ID from context if available
    const tenantId = context.company?.id
      ? (await prisma.company.findUnique({
          where: { id: context.company.id as string },
          select: { tenantId: true },
        }))?.tenantId
      : undefined;

    // Get partials if tenantId is available
    let partialsMap = new Map<string, string>();
    if (tenantId) {
      const partials = await getPartialsUsedInTemplate(templateContent, tenantId);
      partialsMap = new Map(partials.map((p) => [p.name, p.content]));
    }

    const result = resolveTemplatePlaceholders(templateContent, resolverContext, {
      missingPlaceholder: 'highlight',
      partialsMap,
    });

    return {
      html: result.resolved,
      resolvedPlaceholders: {},
      unresolvedPlaceholders: result.missing,
      missingPartials: result.missingPartials,
    };
  }

  async finalize(
    tenantId: string,
    userId: string,
    documentId: string
  ): Promise<GeneratedDocument> {
    return finalizeDocument(documentId, { tenantId, userId });
  }

  async unfinalize(
    tenantId: string,
    userId: string,
    documentId: string,
    reason: string
  ): Promise<GeneratedDocument> {
    return unfinalizeDocument(documentId, { tenantId, userId }, reason);
  }

  async clone(
    tenantId: string,
    userId: string,
    documentId: string,
    newTitle?: string
  ): Promise<GeneratedDocument> {
    return cloneDocument({ id: documentId, title: newTitle }, { tenantId, userId });
  }

  async get(tenantId: string, documentId: string): Promise<GeneratedDocument | null> {
    return getGeneratedDocumentById(documentId, tenantId);
  }
}

// ============================================================================
// Document Exporter Implementation
// ============================================================================

class DocumentExporterImpl implements IDocumentExporter {
  async toPDF(params: ExportPDFParams): Promise<PDFResult> {
    return exportToPDF({
      documentId: params.documentId,
      tenantId: params.tenantId,
      userId: params.userId,
      includeLetterhead: params.includeLetterhead,
      format: params.format,
      orientation: params.orientation,
      filename: params.filename,
    });
  }

  async toHTML(params: ExportHTMLParams): Promise<HTMLResult> {
    return exportToHTML({
      documentId: params.documentId,
      tenantId: params.tenantId,
      includeStyles: params.includeStyles,
      includeSections: params.includeSections,
    });
  }

  async applyLetterhead(tenantId: string, pdfBuffer: Buffer): Promise<Buffer> {
    // Currently letterhead is applied during PDF generation
    // This method is a placeholder for future separate letterhead application
    return pdfBuffer;
  }
}

// ============================================================================
// Document Publisher Implementation
// ============================================================================

class DocumentPublisherImpl implements IDocumentPublisher {
  async publish(params: PublishParams): Promise<DocumentShare> {
    // Convert expiresIn (hours) to expiresAt (datetime)
    let expiresAt: string | null = null;
    if (params.expiresIn !== null && params.expiresIn !== undefined) {
      const expiryDate = new Date();
      expiryDate.setHours(expiryDate.getHours() + params.expiresIn);
      expiresAt = expiryDate.toISOString();
    }

    return createDocumentShare(
      {
        documentId: params.documentId,
        expiresAt,
        password: params.password,
        allowedActions: params.allowedActions ?? ['view', 'download'],
        allowComments: params.allowComments ?? false,
        commentRateLimit: params.commentRateLimit ?? 20,
        notifyOnComment: params.notifyOnComment ?? false,
        notifyOnView: params.notifyOnView ?? false,
      },
      {
        tenantId: params.tenantId,
        userId: params.userId,
      }
    );
  }

  getShareUrl(shareToken: string): string {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    return `${baseUrl}/share/${shareToken}`;
  }

  async access(token: string, password?: string): Promise<ShareAccessResult | null> {
    const shareData = await getShareByToken(token);
    if (!shareData) return null;

    // Verify password if required
    if (shareData.passwordHash && password) {
      const valid = await verifySharePassword(shareData.id, password);
      if (!valid) return null;
    } else if (shareData.passwordHash && !password) {
      return null;
    }

    // Extract sections from document content
    const sections = extractSections(shareData.document.content);

    return {
      document: shareData.document,
      sections: sections.map((s) => ({
        id: s.id,
        title: s.title,
        level: s.level,
        startIndex: 0,
        endIndex: 0,
      })),
      allowedActions: shareData.allowedActions as string[],
      allowComments: shareData.allowComments,
    };
  }

  async revoke(tenantId: string, userId: string, shareId: string): Promise<void> {
    await revokeDocumentShare(shareId, { tenantId, userId });
  }

  async listShares(tenantId: string, documentId: string): Promise<DocumentShare[]> {
    return prisma.documentShare.findMany({
      where: {
        documentId,
        document: { tenantId },
        revokedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}

// ============================================================================
// Document Workflow Step Implementation
// ============================================================================

class DocumentWorkflowStepImpl implements IDocumentWorkflowStep {
  private generator: IDocumentGenerator;
  private exporter: IDocumentExporter;
  private publisher: IDocumentPublisher;

  constructor() {
    this.generator = new DocumentGeneratorImpl();
    this.exporter = new DocumentExporterImpl();
    this.publisher = new DocumentPublisherImpl();
  }

  async execute(
    context: WorkflowContext,
    config: DocumentStepConfig
  ): Promise<DocumentStepResult> {
    const { tenantId, triggeredById, companyId, variables } = context;
    const generatedAt = new Date();

    try {
      // Generate document
      const document = await this.generator.generate({
        tenantId,
        userId: triggeredById,
        templateId: config.templateId,
        companyId,
        title: config.title,
        customData: { ...variables, ...config.customData },
      });

      // Get template info for result
      const template = await getDocumentTemplateById(config.templateId, tenantId);

      // Get company info if available
      let companyInfo: { name: string; uen: string } | null = null;
      if (companyId) {
        companyInfo = await prisma.company.findUnique({
          where: { id: companyId },
          select: { name: true, uen: true },
        });
      }

      // Auto-finalize if configured
      let finalDocument = document;
      if (config.autoFinalize) {
        finalDocument = await this.generator.finalize(tenantId, triggeredById, document.id);
      }

      // Export to PDF if configured
      let pdfBuffer: Buffer | undefined;
      let pdfUrl: string | undefined;
      if (config.exportPDF) {
        const pdf = await this.exporter.toPDF({
          tenantId,
          userId: triggeredById,
          documentId: document.id,
          includeLetterhead: config.includeLetterhead,
        });
        pdfBuffer = pdf.buffer;
      }

      // Create share link if configured
      let shareUrl: string | undefined;
      let shareToken: string | undefined;
      if (config.createShareLink) {
        const share = await this.publisher.publish({
          tenantId,
          userId: triggeredById,
          documentId: document.id,
          expiresIn: config.shareLinkExpiry ?? undefined,
        });
        shareToken = share.shareToken;
        shareUrl = this.publisher.getShareUrl(share.shareToken);
      }

      // Extract signatories from document content (basic extraction)
      const signatories = this.extractSignatories(finalDocument.content);

      return {
        success: true,
        documentId: document.id,
        documentTitle: document.title,
        status: finalDocument.status as 'DRAFT' | 'FINALIZED' | 'ARCHIVED',
        shareUrl,
        shareToken,
        pdfBuffer,
        pdfUrl,
        companyId: companyId ?? undefined,
        companyName: companyInfo?.name,
        companyUen: companyInfo?.uen,
        signatories: signatories.length > 0 ? signatories : undefined,
        templateId: config.templateId,
        templateName: template?.name,
        generatedAt,
        generatedBy: triggeredById,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        documentId: '',
        documentTitle: config.title,
        status: 'DRAFT',
        generatedAt,
        generatedBy: triggeredById,
      };
    }
  }

  async prepareForSignature(
    tenantId: string,
    documentId: string,
    signatories: Signatory[]
  ): Promise<DocumentForSignature> {
    // Get document
    const document = await this.generator.get(tenantId, documentId);
    if (!document) {
      throw new Error('Document not found');
    }

    // Export to PDF
    const pdf = await this.exporter.toPDF({
      tenantId,
      userId: '', // System operation
      documentId,
      includeLetterhead: true,
    });

    return {
      documentId,
      pdfBuffer: pdf.buffer,
      title: document.title,
      signatories,
    };
  }

  /**
   * Extract potential signatories from document content.
   * Looks for signature blocks in the HTML.
   */
  private extractSignatories(
    content: string
  ): Array<{ name: string; email?: string; role: string; identificationNumber?: string }> {
    const signatories: Array<{
      name: string;
      email?: string;
      role: string;
      identificationNumber?: string;
    }> = [];

    // Basic regex to find signature blocks
    // This is a simplified implementation - production should be more robust
    const signatureBlockRegex =
      /class="signature-block"[^>]*>[\s\S]*?<strong>([^<]+)<\/strong>[\s\S]*?<span[^>]*>([^<]+)<\/span>/gi;

    let match;
    while ((match = signatureBlockRegex.exec(content)) !== null) {
      signatories.push({
        name: match[1].trim(),
        role: match[2].trim(),
      });
    }

    return signatories;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/** Singleton instances */
let generatorInstance: IDocumentGenerator | null = null;
let exporterInstance: IDocumentExporter | null = null;
let publisherInstance: IDocumentPublisher | null = null;
let workflowStepInstance: IDocumentWorkflowStep | null = null;

/**
 * Get the Document Generator instance.
 * Returns a singleton implementation of IDocumentGenerator.
 */
export function getDocumentGenerator(): IDocumentGenerator {
  if (!generatorInstance) {
    generatorInstance = new DocumentGeneratorImpl();
  }
  return generatorInstance;
}

/**
 * Get the Document Exporter instance.
 * Returns a singleton implementation of IDocumentExporter.
 */
export function getDocumentExporter(): IDocumentExporter {
  if (!exporterInstance) {
    exporterInstance = new DocumentExporterImpl();
  }
  return exporterInstance;
}

/**
 * Get the Document Publisher instance.
 * Returns a singleton implementation of IDocumentPublisher.
 */
export function getDocumentPublisher(): IDocumentPublisher {
  if (!publisherInstance) {
    publisherInstance = new DocumentPublisherImpl();
  }
  return publisherInstance;
}

/**
 * Get the Document Workflow Step instance.
 * Returns a singleton implementation of IDocumentWorkflowStep.
 */
export function getDocumentWorkflowStep(): IDocumentWorkflowStep {
  if (!workflowStepInstance) {
    workflowStepInstance = new DocumentWorkflowStepImpl();
  }
  return workflowStepInstance;
}

/**
 * Reset all singleton instances.
 * Useful for testing.
 */
export function resetInstances(): void {
  generatorInstance = null;
  exporterInstance = null;
  publisherInstance = null;
  workflowStepInstance = null;
}
