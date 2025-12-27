/**
 * Document Generator Service
 *
 * Business logic for generating, managing, and sharing documents.
 * Handles document lifecycle: draft -> finalized -> archived.
 * Fully integrated with multi-tenancy support.
 */

import { prisma } from '@/lib/prisma';
import { createAuditLog, computeChanges } from '@/lib/audit';
import {
  resolvePlaceholders,
  prepareCompanyContext,
  extractPartialReferences,
  type PlaceholderContext,
} from '@/lib/placeholder-resolver';
import { getPartialsUsedInTemplate } from '@/services/template-partial.service';
import { getCompanyById } from '@/services/company.service';
import type {
  CreateDocumentFromTemplateInput,
  CreateBlankDocumentInput,
  UpdateGeneratedDocumentInput,
  SearchGeneratedDocumentsInput,
  CloneDocumentInput,
  CreateDocumentShareInput,
  CreateDocumentCommentInput,
  SaveDraftInput,
} from '@/lib/validations/generated-document';
import { Prisma } from '@/generated/prisma';
import type {
  GeneratedDocument,
  DocumentShare,
  DocumentComment,
  GeneratedDocumentStatus,
} from '@/generated/prisma';
import { randomBytes } from 'crypto';
import { hashPassword, verifyPassword } from '@/lib/encryption';
import type { TenantAwareParams } from '@/lib/types';

// ============================================================================
// Types
// ============================================================================

export interface GeneratedDocumentWithRelations extends GeneratedDocument {
  template?: {
    id: string;
    name: string;
    category: string;
  } | null;
  company?: {
    id: string;
    name: string;
    uen: string;
  } | null;
  createdBy?: {
    id: string;
    firstName: string;
    lastName: string;
  };
  finalizedBy?: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
  shares?: DocumentShareWithMeta[];
  comments?: DocumentCommentWithReplies[];
  _count?: {
    shares: number;
    comments: number;
    drafts: number;
  };
}

export interface DocumentShareWithMeta extends DocumentShare {
  createdBy?: {
    id: string;
    firstName: string;
    lastName: string;
  };
  _count?: {
    comments: number;
  };
}

export interface DocumentCommentWithReplies extends DocumentComment {
  user?: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
  replies?: DocumentCommentWithReplies[];
  parent?: DocumentComment | null;
}

// Re-export shared type for backwards compatibility
export type { TenantAwareParams } from '@/lib/types';

// Fields tracked for audit logging
const TRACKED_FIELDS: (keyof GeneratedDocument)[] = [
  'title',
  'content',
  'status',
  'useLetterhead',
  'shareExpiryHours',
];

// ============================================================================
// Create Document from Template
// ============================================================================

export async function createDocumentFromTemplate(
  data: CreateDocumentFromTemplateInput,
  params: TenantAwareParams
): Promise<GeneratedDocument> {
  const { tenantId, userId } = params;

  // Get template
  const template = await prisma.documentTemplate.findFirst({
    where: { id: data.templateId, tenantId, deletedAt: null },
  });

  if (!template) {
    throw new Error('Template not found');
  }

  if (!template.isActive) {
    throw new Error('Template is not active');
  }

  // Get company data if provided
  let context: PlaceholderContext = {
    custom: data.customData || {},
    system: { currentDate: new Date() },
  };

  if (data.companyId) {
    const company = await getCompanyById(data.companyId, tenantId);
    if (!company) {
      throw new Error('Company not found');
    }
    context = {
      ...prepareCompanyContext(company as unknown as Parameters<typeof prepareCompanyContext>[0]),
      custom: { ...context.custom, ...data.customData },
    };
  }

  // Fetch partials used in the template
  const partialRefs = extractPartialReferences(template.content);
  let partialsMap = new Map<string, string>();

  if (partialRefs.length > 0) {
    const partials = await getPartialsUsedInTemplate(template.content, tenantId);
    partialsMap = new Map(partials.map((p) => [p.name, p.content]));
  }

  // Resolve placeholders (with partials)
  const { resolved: resolvedContent, missing, missingPartials } = resolvePlaceholders(
    template.content,
    context,
    { missingPlaceholder: 'highlight', partialsMap }
  );

  // Create document
  const document = await prisma.generatedDocument.create({
    data: {
      tenantId,
      templateId: template.id,
      templateVersion: template.version,
      companyId: data.companyId,
      title: data.title,
      content: resolvedContent,
      contentJson: template.contentJson ?? undefined,
      status: 'FINALIZED',
      useLetterhead: data.useLetterhead,
      shareExpiryHours: data.shareExpiryHours ?? template.defaultShareExpiryHours,
      placeholderData: context as Prisma.InputJsonValue,
      metadata:
        missing.length > 0 || missingPartials.length > 0
          ? { missingPlaceholders: missing, missingPartials }
          : undefined,
      createdById: userId,
    },
  });

  await createAuditLog({
    tenantId,
    userId,
    companyId: data.companyId ?? undefined,
    action: 'DOCUMENT_GENERATED',
    entityType: 'GeneratedDocument',
    entityId: document.id,
    entityName: document.title,
    summary: `Generated document "${document.title}" from template "${template.name}"`,
    changeSource: 'MANUAL',
    metadata: {
      templateId: template.id,
      templateName: template.name,
      missingPlaceholders: missing,
      missingPartials,
    },
  });

  return document;
}

// ============================================================================
// Create Blank Document
// ============================================================================

export async function createBlankDocument(
  data: CreateBlankDocumentInput,
  params: TenantAwareParams
): Promise<GeneratedDocument> {
  const { tenantId, userId } = params;

  // Verify company if provided
  if (data.companyId) {
    const company = await prisma.company.findFirst({
      where: { id: data.companyId, tenantId, deletedAt: null },
    });
    if (!company) {
      throw new Error('Company not found');
    }
  }

  const document = await prisma.generatedDocument.create({
    data: {
      tenantId,
      companyId: data.companyId,
      title: data.title,
      content: data.content,
      contentJson: data.contentJson ?? undefined,
      status: 'DRAFT',
      useLetterhead: data.useLetterhead,
      shareExpiryHours: data.shareExpiryHours,
      createdById: userId,
    },
  });

  await createAuditLog({
    tenantId,
    userId,
    companyId: data.companyId ?? undefined,
    action: 'DOCUMENT_GENERATED',
    entityType: 'GeneratedDocument',
    entityId: document.id,
    entityName: document.title,
    summary: `Created blank document "${document.title}"`,
    changeSource: 'MANUAL',
  });

  return document;
}

// ============================================================================
// Update Document
// ============================================================================

export async function updateGeneratedDocument(
  data: UpdateGeneratedDocumentInput,
  params: TenantAwareParams,
  reason?: string
): Promise<GeneratedDocument> {
  const { tenantId, userId } = params;

  const existing = await prisma.generatedDocument.findFirst({
    where: { id: data.id, tenantId, deletedAt: null },
  });

  if (!existing) {
    throw new Error('Document not found');
  }

  if (existing.status === 'FINALIZED') {
    throw new Error('Cannot update a finalized document. Unfinalize it first.');
  }

  if (existing.status === 'ARCHIVED') {
    throw new Error('Cannot update an archived document');
  }

  const updateData: Prisma.GeneratedDocumentUpdateInput = {};

  if (data.title !== undefined) updateData.title = data.title;
  if (data.content !== undefined) updateData.content = data.content;
  if (data.contentJson !== undefined) {
    updateData.contentJson = data.contentJson ? (data.contentJson as Prisma.InputJsonValue) : Prisma.JsonNull;
  }
  if (data.useLetterhead !== undefined) updateData.useLetterhead = data.useLetterhead;
  if (data.shareExpiryHours !== undefined) updateData.shareExpiryHours = data.shareExpiryHours;
  if (data.metadata !== undefined) {
    updateData.metadata = data.metadata ? (data.metadata as Prisma.InputJsonValue) : Prisma.JsonNull;
  }

  const document = await prisma.generatedDocument.update({
    where: { id: data.id },
    data: updateData,
  });

  const changes = computeChanges(
    existing as Record<string, unknown>,
    data,
    TRACKED_FIELDS as string[]
  );

  if (changes) {
    const changedFields = Object.keys(changes).join(', ');
    await createAuditLog({
      tenantId,
      userId,
      companyId: document.companyId ?? undefined,
      action: 'UPDATE',
      entityType: 'GeneratedDocument',
      entityId: document.id,
      entityName: document.title,
      summary: `Updated document "${document.title}" (${changedFields})`,
      changeSource: 'MANUAL',
      changes,
      reason,
    });
  }

  return document;
}

// ============================================================================
// Finalize Document
// ============================================================================

export async function finalizeDocument(
  id: string,
  params: TenantAwareParams
): Promise<GeneratedDocument> {
  const { tenantId, userId } = params;

  const existing = await prisma.generatedDocument.findFirst({
    where: { id, tenantId, deletedAt: null },
  });

  if (!existing) {
    throw new Error('Document not found');
  }

  if (existing.status === 'FINALIZED') {
    throw new Error('Document is already finalized');
  }

  if (existing.status === 'ARCHIVED') {
    throw new Error('Cannot finalize an archived document');
  }

  const document = await prisma.generatedDocument.update({
    where: { id },
    data: {
      status: 'FINALIZED',
      finalizedAt: new Date(),
      finalizedById: userId,
    },
  });

  await createAuditLog({
    tenantId,
    userId,
    companyId: document.companyId ?? undefined,
    action: 'DOCUMENT_FINALIZED',
    entityType: 'GeneratedDocument',
    entityId: document.id,
    entityName: document.title,
    summary: `Finalized document "${document.title}"`,
    changeSource: 'MANUAL',
  });

  return document;
}

// ============================================================================
// Unfinalize Document
// ============================================================================

export async function unfinalizeDocument(
  id: string,
  params: TenantAwareParams,
  reason: string
): Promise<GeneratedDocument> {
  const { tenantId, userId } = params;

  const existing = await prisma.generatedDocument.findFirst({
    where: { id, tenantId, deletedAt: null },
  });

  if (!existing) {
    throw new Error('Document not found');
  }

  if (existing.status !== 'FINALIZED') {
    throw new Error('Document is not finalized');
  }

  const document = await prisma.generatedDocument.update({
    where: { id },
    data: {
      status: 'DRAFT',
      unfinalizedAt: new Date(),
    },
  });

  await createAuditLog({
    tenantId,
    userId,
    companyId: document.companyId ?? undefined,
    action: 'DOCUMENT_UNFINALIZED',
    entityType: 'GeneratedDocument',
    entityId: document.id,
    entityName: document.title,
    summary: `Un-finalized document "${document.title}"`,
    changeSource: 'MANUAL',
    reason,
  });

  return document;
}

// ============================================================================
// Archive Document
// ============================================================================

export async function archiveDocument(
  id: string,
  params: TenantAwareParams,
  reason: string
): Promise<GeneratedDocument> {
  const { tenantId, userId } = params;

  const existing = await prisma.generatedDocument.findFirst({
    where: { id, tenantId, deletedAt: null },
  });

  if (!existing) {
    throw new Error('Document not found');
  }

  if (existing.status === 'ARCHIVED') {
    throw new Error('Document is already archived');
  }

  // Revoke all active shares when archiving
  await prisma.documentShare.updateMany({
    where: { documentId: id, isActive: true },
    data: { isActive: false, revokedAt: new Date() },
  });

  const document = await prisma.generatedDocument.update({
    where: { id },
    data: {
      status: 'ARCHIVED',
    },
  });

  await createAuditLog({
    tenantId,
    userId,
    companyId: document.companyId ?? undefined,
    action: 'DOCUMENT_ARCHIVED',
    entityType: 'GeneratedDocument',
    entityId: document.id,
    entityName: document.title,
    summary: `Archived document "${document.title}"`,
    changeSource: 'MANUAL',
    reason,
  });

  return document;
}

// ============================================================================
// Delete Document (Soft Delete)
// ============================================================================

export async function deleteGeneratedDocument(
  id: string,
  params: TenantAwareParams,
  reason: string
): Promise<GeneratedDocument> {
  const { tenantId, userId } = params;

  const existing = await prisma.generatedDocument.findFirst({
    where: { id, tenantId },
  });

  if (!existing) {
    throw new Error('Document not found');
  }

  if (existing.deletedAt) {
    throw new Error('Document is already deleted');
  }

  // Revoke all active shares
  await prisma.documentShare.updateMany({
    where: { documentId: id, isActive: true },
    data: { isActive: false, revokedAt: new Date() },
  });

  const document = await prisma.generatedDocument.update({
    where: { id },
    data: {
      deletedAt: new Date(),
    },
  });

  await createAuditLog({
    tenantId,
    userId,
    companyId: document.companyId ?? undefined,
    action: 'DELETE',
    entityType: 'GeneratedDocument',
    entityId: document.id,
    entityName: document.title,
    summary: `Deleted document "${document.title}"`,
    changeSource: 'MANUAL',
    reason,
  });

  return document;
}

// ============================================================================
// Clone Document
// ============================================================================

export async function cloneDocument(
  data: CloneDocumentInput,
  params: TenantAwareParams
): Promise<GeneratedDocument> {
  const { tenantId, userId } = params;

  const source = await prisma.generatedDocument.findFirst({
    where: { id: data.id, tenantId, deletedAt: null },
  });

  if (!source) {
    throw new Error('Document not found');
  }

  // Generate unique title
  let newTitle = data.title || `Copy of ${source.title}`;
  let counter = 1;
  while (true) {
    const existing = await prisma.generatedDocument.findFirst({
      where: { tenantId, title: newTitle, deletedAt: null },
    });
    if (!existing) break;
    counter++;
    newTitle = data.title ? `${data.title} (${counter})` : `Copy of ${source.title} (${counter})`;
    if (counter > 100) throw new Error('Unable to generate unique title');
  }

  const document = await prisma.generatedDocument.create({
    data: {
      tenantId,
      templateId: source.templateId,
      templateVersion: source.templateVersion,
      companyId: source.companyId,
      title: newTitle,
      content: source.content,
      contentJson: source.contentJson ?? undefined,
      status: 'DRAFT',
      useLetterhead: source.useLetterhead,
      shareExpiryHours: source.shareExpiryHours,
      placeholderData: source.placeholderData ?? undefined,
      metadata: source.metadata ?? undefined,
      createdById: userId,
    },
  });

  await createAuditLog({
    tenantId,
    userId,
    companyId: document.companyId ?? undefined,
    action: 'DOCUMENT_CLONED',
    entityType: 'GeneratedDocument',
    entityId: document.id,
    entityName: document.title,
    summary: `Cloned document "${source.title}" as "${document.title}"`,
    changeSource: 'MANUAL',
    metadata: { sourceDocumentId: source.id, sourceTitle: source.title },
  });

  return document;
}

// ============================================================================
// Get Document by ID
// ============================================================================

export interface GetDocumentOptions {
  includeDeleted?: boolean;
  includeShares?: boolean;
  includeComments?: boolean;
}

export async function getGeneratedDocumentById(
  id: string,
  tenantId: string,
  options: GetDocumentOptions = {}
): Promise<GeneratedDocumentWithRelations | null> {
  const { includeDeleted = false, includeShares = false, includeComments = false } = options;

  const where: Prisma.GeneratedDocumentWhereInput = { id, tenantId };
  if (!includeDeleted) {
    where.deletedAt = null;
  }

  return prisma.generatedDocument.findFirst({
    where,
    include: {
      template: {
        select: {
          id: true,
          name: true,
          category: true,
        },
      },
      company: {
        select: {
          id: true,
          name: true,
          uen: true,
        },
      },
      createdBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
      finalizedBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
      ...(includeShares
        ? {
            shares: {
              orderBy: { createdAt: 'desc' as const },
              include: {
                createdBy: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                  },
                },
                _count: {
                  select: { comments: true },
                },
              },
            },
          }
        : {}),
      ...(includeComments
        ? {
            comments: {
              where: { parentId: null, deletedAt: null, hiddenAt: null },
              orderBy: { createdAt: 'desc' as const },
              include: {
                user: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                  },
                },
                replies: {
                  where: { deletedAt: null, hiddenAt: null },
                  orderBy: { createdAt: 'asc' as const },
                  include: {
                    user: {
                      select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                      },
                    },
                  },
                },
              },
            },
          }
        : {}),
      _count: {
        select: {
          shares: true,
          comments: true,
          drafts: true,
        },
      },
    },
  });
}

// ============================================================================
// Search Documents
// ============================================================================

export interface SearchGeneratedDocumentsOptions {
  /**
   * Skip tenant filter - ONLY for SUPER_ADMIN operations that require
   * cross-tenant access. Regular operations MUST always provide tenantId.
   */
  skipTenantFilter?: boolean;
}

export async function searchGeneratedDocuments(
  params: SearchGeneratedDocumentsInput,
  tenantId: string | null,
  options: SearchGeneratedDocumentsOptions = {}
): Promise<{
  documents: GeneratedDocumentWithRelations[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}> {
  const { skipTenantFilter = false } = options;

  // SECURITY: Tenant ID is required to prevent cross-tenant data access unless explicitly skipped for SUPER_ADMIN
  if (!tenantId && !skipTenantFilter) {
    throw new Error('Tenant ID is required for generated documents search');
  }

  const where: Prisma.GeneratedDocumentWhereInput = {
    deletedAt: null,
  };

  // Tenant scope (skip for SUPER_ADMIN cross-tenant operations)
  if (tenantId && !skipTenantFilter) {
    where.tenantId = tenantId;
  }

  // Text search
  if (params.query) {
    const searchTerm = params.query.trim();
    where.OR = [
      { title: { contains: searchTerm, mode: 'insensitive' } },
      { company: { name: { contains: searchTerm, mode: 'insensitive' } } },
      { template: { name: { contains: searchTerm, mode: 'insensitive' } } },
    ];
  }

  // Filters
  if (params.companyId) {
    where.companyId = params.companyId;
  }

  // Company name filter (free text search)
  if (params.companyName) {
    where.company = {
      name: { contains: params.companyName, mode: 'insensitive' },
    };
  }

  if (params.templateId) {
    where.templateId = params.templateId;
  }

  if (params.status) {
    where.status = params.status;
  }

  // Sorting
  const orderBy: Prisma.GeneratedDocumentOrderByWithRelationInput = {};
  orderBy[params.sortBy] = params.sortOrder;

  // Pagination
  const skip = (params.page - 1) * params.limit;

  const [documents, total] = await Promise.all([
    prisma.generatedDocument.findMany({
      where,
      include: {
        template: {
          select: {
            id: true,
            name: true,
            category: true,
          },
        },
        company: {
          select: {
            id: true,
            name: true,
            uen: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        _count: {
          select: {
            shares: true,
            comments: true,
            drafts: true,
          },
        },
      },
      orderBy,
      skip,
      take: params.limit,
    }),
    prisma.generatedDocument.count({ where }),
  ]);

  return {
    documents,
    total,
    page: params.page,
    limit: params.limit,
    totalPages: Math.ceil(total / params.limit),
  };
}

// ============================================================================
// Document Sharing
// ============================================================================

/**
 * Generate a secure share token
 */
function generateShareToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Create a share link for a document
 */
export async function createDocumentShare(
  data: CreateDocumentShareInput,
  params: TenantAwareParams
): Promise<DocumentShare> {
  const { tenantId, userId } = params;

  const document = await prisma.generatedDocument.findFirst({
    where: { id: data.documentId, tenantId, deletedAt: null },
  });

  if (!document) {
    throw new Error('Document not found');
  }

  // Hash password if provided (using Argon2id)
  let sharePasswordHash: string | null = null;
  if (data.password) {
    sharePasswordHash = hashPassword(data.password);
  }

  const share = await prisma.documentShare.create({
    data: {
      documentId: data.documentId,
      shareToken: generateShareToken(),
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
      passwordHash: sharePasswordHash,
      allowedActions: data.allowedActions,
      allowComments: data.allowComments,
      commentRateLimit: data.commentRateLimit,
      notifyOnComment: data.notifyOnComment,
      notifyOnView: data.notifyOnView,
      createdById: userId,
    },
  });

  await createAuditLog({
    tenantId,
    userId,
    companyId: document.companyId ?? undefined,
    action: 'SHARE_LINK_CREATED',
    entityType: 'DocumentShare',
    entityId: share.id,
    entityName: document.title,
    summary: `Created share link for document "${document.title}"`,
    changeSource: 'MANUAL',
    metadata: {
      documentId: document.id,
      expiresAt: share.expiresAt,
      allowComments: share.allowComments,
    },
  });

  return share;
}

/**
 * Revoke a share link
 */
export async function revokeDocumentShare(
  shareId: string,
  params: TenantAwareParams
): Promise<DocumentShare> {
  const { tenantId, userId } = params;

  const share = await prisma.documentShare.findFirst({
    where: { id: shareId },
    include: { document: { select: { tenantId: true, title: true, companyId: true } } },
  });

  if (!share || share.document.tenantId !== tenantId) {
    throw new Error('Share not found');
  }

  if (!share.isActive) {
    throw new Error('Share is already revoked');
  }

  const updated = await prisma.documentShare.update({
    where: { id: shareId },
    data: {
      isActive: false,
      revokedAt: new Date(),
    },
  });

  await createAuditLog({
    tenantId,
    userId,
    companyId: share.document.companyId ?? undefined,
    action: 'SHARE_LINK_REVOKED',
    entityType: 'DocumentShare',
    entityId: share.id,
    entityName: share.document.title,
    summary: `Revoked share link for document "${share.document.title}"`,
    changeSource: 'MANUAL',
    metadata: { documentId: share.documentId },
  });

  return updated;
}

/**
 * Get share by token (for public access)
 */
export async function getShareByToken(
  token: string
): Promise<DocumentShare & { document: GeneratedDocument } | null> {
  const share = await prisma.documentShare.findUnique({
    where: { shareToken: token },
    include: { document: true },
  });

  if (!share) return null;

  // Check if expired or revoked
  if (!share.isActive) return null;
  if (share.expiresAt && share.expiresAt < new Date()) return null;

  return share;
}

/**
 * Verify share password (supports both Argon2id and legacy bcrypt)
 */
export async function verifySharePassword(shareId: string, password: string): Promise<boolean> {
  const share = await prisma.documentShare.findUnique({
    where: { id: shareId },
    select: { passwordHash: true },
  });

  if (!share?.passwordHash) return true; // No password required

  const verification = await verifyPassword(password, share.passwordHash);
  return verification.isValid;
}

/**
 * Record share view
 */
export async function recordShareView(shareId: string): Promise<void> {
  await prisma.documentShare.update({
    where: { id: shareId },
    data: {
      viewCount: { increment: 1 },
      lastViewedAt: new Date(),
    },
  });
}

// ============================================================================
// Comments
// ============================================================================

/**
 * Check rate limit for comments (20 per hour per IP)
 */
export async function checkCommentRateLimit(
  ipAddress: string,
  shareId: string
): Promise<{ allowed: boolean; remaining: number }> {
  const share = await prisma.documentShare.findUnique({
    where: { id: shareId },
    select: { commentRateLimit: true },
  });

  const limit = share?.commentRateLimit ?? 20;
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const recentCount = await prisma.documentComment.count({
    where: {
      shareId,
      ipAddress,
      createdAt: { gte: oneHourAgo },
    },
  });

  return {
    allowed: recentCount < limit,
    remaining: Math.max(0, limit - recentCount),
  };
}

/**
 * Create a comment on a document
 */
export async function createDocumentComment(
  data: CreateDocumentCommentInput,
  ipAddress: string | null,
  params?: TenantAwareParams
): Promise<DocumentComment> {
  const document = await prisma.generatedDocument.findFirst({
    where: { id: data.documentId, deletedAt: null },
    select: { tenantId: true, companyId: true, title: true },
  });

  if (!document) {
    throw new Error('Document not found');
  }

  // For external comments, verify share allows comments
  if (data.shareId) {
    const share = await prisma.documentShare.findFirst({
      where: { id: data.shareId, documentId: data.documentId, isActive: true },
    });

    if (!share) {
      throw new Error('Invalid share link');
    }

    if (!share.allowComments) {
      throw new Error('Comments are not allowed on this share');
    }

    // Check rate limit
    if (ipAddress) {
      const { allowed, remaining } = await checkCommentRateLimit(ipAddress, data.shareId);
      if (!allowed) {
        throw new Error(`Rate limit exceeded. Try again later. (Remaining: ${remaining})`);
      }
    }
  }

  // Validate parent comment if this is a reply
  if (data.parentId) {
    const parent = await prisma.documentComment.findFirst({
      where: { id: data.parentId, documentId: data.documentId, deletedAt: null },
    });
    if (!parent) {
      throw new Error('Parent comment not found');
    }
  }

  const comment = await prisma.documentComment.create({
    data: {
      documentId: data.documentId,
      shareId: data.shareId,
      userId: params?.userId,
      guestName: data.guestName,
      guestEmail: data.guestEmail,
      content: data.content,
      selectionStart: data.selectionStart,
      selectionEnd: data.selectionEnd,
      selectedText: data.selectedText,
      parentId: data.parentId,
      ipAddress,
    },
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
    },
  });

  if (params) {
    await createAuditLog({
      tenantId: document.tenantId,
      userId: params.userId,
      companyId: document.companyId ?? undefined,
      action: 'COMMENT_CREATED',
      entityType: 'DocumentComment',
      entityId: comment.id,
      entityName: document.title,
      summary: `Added comment on document "${document.title}"`,
      changeSource: 'MANUAL',
      metadata: {
        documentId: data.documentId,
        isReply: !!data.parentId,
        hasSelection: !!data.selectedText,
      },
    });
  }

  return comment;
}

/**
 * Resolve a comment
 */
export async function resolveComment(
  commentId: string,
  params: TenantAwareParams
): Promise<DocumentComment> {
  const { tenantId, userId } = params;

  const comment = await prisma.documentComment.findFirst({
    where: { id: commentId },
    include: { document: { select: { tenantId: true, title: true, companyId: true } } },
  });

  if (!comment || comment.document.tenantId !== tenantId) {
    throw new Error('Comment not found');
  }

  if (comment.status === 'RESOLVED') {
    throw new Error('Comment is already resolved');
  }

  const updated = await prisma.documentComment.update({
    where: { id: commentId },
    data: {
      status: 'RESOLVED',
      resolvedById: userId,
      resolvedAt: new Date(),
    },
  });

  await createAuditLog({
    tenantId,
    userId,
    companyId: comment.document.companyId ?? undefined,
    action: 'COMMENT_RESOLVED',
    entityType: 'DocumentComment',
    entityId: comment.id,
    entityName: comment.document.title,
    summary: `Resolved comment on document "${comment.document.title}"`,
    changeSource: 'MANUAL',
  });

  return updated;
}

/**
 * Hide a comment (moderation)
 */
export async function hideComment(
  commentId: string,
  reason: string,
  params: TenantAwareParams
): Promise<DocumentComment> {
  const { tenantId, userId } = params;

  const comment = await prisma.documentComment.findFirst({
    where: { id: commentId },
    include: { document: { select: { tenantId: true, title: true, companyId: true } } },
  });

  if (!comment || comment.document.tenantId !== tenantId) {
    throw new Error('Comment not found');
  }

  const updated = await prisma.documentComment.update({
    where: { id: commentId },
    data: {
      hiddenAt: new Date(),
      hiddenById: userId,
      hiddenReason: reason,
    },
  });

  await createAuditLog({
    tenantId,
    userId,
    companyId: comment.document.companyId ?? undefined,
    action: 'COMMENT_HIDDEN',
    entityType: 'DocumentComment',
    entityId: comment.id,
    entityName: comment.document.title,
    summary: `Hidden comment on document "${comment.document.title}"`,
    changeSource: 'MANUAL',
    reason,
  });

  return updated;
}

/**
 * Unhide a comment
 */
export async function unhideComment(
  commentId: string,
  params: TenantAwareParams
): Promise<DocumentComment> {
  const { tenantId } = params;

  const comment = await prisma.documentComment.findFirst({
    where: { id: commentId },
    include: { document: { select: { tenantId: true, title: true, companyId: true } } },
  });

  if (!comment || comment.document.tenantId !== tenantId) {
    throw new Error('Comment not found');
  }

  const updated = await prisma.documentComment.update({
    where: { id: commentId },
    data: {
      hiddenAt: null,
      hiddenById: null,
      hiddenReason: null,
    },
  });

  return updated;
}

// ============================================================================
// Auto-save Drafts
// ============================================================================

/**
 * Save a draft (auto-save)
 */
export async function saveDraft(
  data: SaveDraftInput,
  params: TenantAwareParams
): Promise<void> {
  const { tenantId, userId } = params;

  const document = await prisma.generatedDocument.findFirst({
    where: { id: data.documentId, tenantId, deletedAt: null },
  });

  if (!document) {
    throw new Error('Document not found');
  }

  // Delete old drafts for this user (keep only latest)
  await prisma.documentDraft.deleteMany({
    where: { documentId: data.documentId, userId },
  });

  await prisma.documentDraft.create({
    data: {
      documentId: data.documentId,
      userId,
      content: data.content,
      contentJson: data.contentJson ? (data.contentJson as Prisma.InputJsonValue) : undefined,
      metadata: data.metadata ? (data.metadata as Prisma.InputJsonValue) : undefined,
    },
  });
}

/**
 * Get latest draft for a document
 */
export async function getLatestDraft(
  documentId: string,
  userId: string
): Promise<{ content: string; contentJson: unknown | null; createdAt: Date } | null> {
  const draft = await prisma.documentDraft.findFirst({
    where: { documentId, userId },
    orderBy: { createdAt: 'desc' },
    select: {
      content: true,
      contentJson: true,
      createdAt: true,
    },
  });

  return draft;
}

// ============================================================================
// Statistics
// ============================================================================

export async function getDocumentStats(tenantId: string): Promise<{
  total: number;
  byStatus: Record<GeneratedDocumentStatus, number>;
  recentlyCreated: number;
  recentlyFinalized: number;
  activeShares: number;
  totalComments: number;
}> {
  const [total, byStatus, recentlyCreated, recentlyFinalized, activeShares, totalComments] =
    await Promise.all([
      prisma.generatedDocument.count({
        where: { tenantId, deletedAt: null },
      }),
      prisma.generatedDocument.groupBy({
        by: ['status'],
        where: { tenantId, deletedAt: null },
        _count: true,
      }),
      prisma.generatedDocument.count({
        where: {
          tenantId,
          deletedAt: null,
          createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
      }),
      prisma.generatedDocument.count({
        where: {
          tenantId,
          deletedAt: null,
          finalizedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
      }),
      prisma.documentShare.count({
        where: {
          document: { tenantId, deletedAt: null },
          isActive: true,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      }),
      prisma.documentComment.count({
        where: {
          document: { tenantId, deletedAt: null },
          deletedAt: null,
        },
      }),
    ]);

  const statusCounts: Record<GeneratedDocumentStatus, number> = {
    DRAFT: 0,
    FINALIZED: 0,
    ARCHIVED: 0,
  };

  for (const s of byStatus) {
    statusCounts[s.status] = s._count;
  }

  return {
    total,
    byStatus: statusCounts,
    recentlyCreated,
    recentlyFinalized,
    activeShares,
    totalComments,
  };
}
