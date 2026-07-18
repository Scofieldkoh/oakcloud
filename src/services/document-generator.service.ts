/**
 * Document Generator Service
 *
 * Business logic for generating and managing documents.
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
  type ContactData,
} from '@/lib/placeholder-resolver';
import { getPartialsUsedInTemplate } from '@/services/template-partial.service';
import { getCompanyById } from '@/services/company.service';
import {
  getDocumentPartyOptions,
  resolveDocumentPartySelections,
} from '@/services/document-party.service';
import { addSectionAnchors, extractSections } from '@/services/document-validation.service';
import {
  analyzeTemplateContent,
  getRequiredPartySelections,
  type TemplateDiagnostics,
} from '@/lib/template-analysis';
import type {
  CreateDocumentFromTemplateInput,
  CreateBlankDocumentInput,
  UpdateGeneratedDocumentInput,
  SearchGeneratedDocumentsInput,
  CloneDocumentInput,
  CreateDocumentCommentInput,
  SaveDraftInput,
} from '@/lib/validations/generated-document';
import { Prisma } from '@/generated/prisma';
import type {
  GeneratedDocument,
  DocumentComment,
  GeneratedDocumentStatus,
} from '@/generated/prisma';
import type { TenantAwareParams } from '@/lib/types';
import { NotFoundError } from '@/lib/errors';
import { readActiveGenerationSession } from '@/lib/document-generation-session';

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
  comments?: DocumentCommentWithReplies[];
  _count?: {
    comments: number;
    drafts: number;
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

export interface RenderTemplateForGenerationParams {
  templateId?: string;
  templateContent?: string;
  templateName?: string;
  templateCategory?: string;
  templateVersion?: number;
  tenantId: string;
  companyId?: string | null;
  contactIds?: string[];
  selectedDirectorId?: string;
  selectedShareholderId?: string;
  selectedContactId?: string;
  customData?: Record<string, unknown>;
  contextOverride?: PlaceholderContext;
  generatedBy?: string;
  mode?: 'preview' | 'test' | 'generate' | 'validate';
}

export interface RenderTemplateForGenerationResult {
  template: {
    id: string;
    name: string;
    category: string;
    version: number;
  };
  content: string;
  contentHtml: string;
  rawResolvedContent: string;
  sections: ReturnType<typeof extractSections>;
  missingPlaceholders: string[];
  missingPartials: string[];
  contextSummary: {
    hasCompany: boolean;
    hasContacts: boolean;
    hasCustomData: boolean;
  };
  blockingErrors: string[];
  context: PlaceholderContext;
  diagnostics: TemplateDiagnostics;
  dependencySnapshot: {
    templateId: string;
    templateName: string;
    templateVersion: number;
    partials: Array<{
      name: string;
      found: boolean;
      version?: number | null;
      updatedAt?: string | null;
    }>;
  };
}

// Re-export shared type for backwards compatibility
export type { TenantAwareParams } from '@/lib/types';

// Fields tracked for audit logging
const TRACKED_FIELDS: (keyof GeneratedDocument)[] = [
  'title',
  'content',
  'status',
  'useLetterhead',
];

async function buildContactsContext(
  contactIds: string[] | undefined,
  tenantId: string
): Promise<{ firstContact?: ContactData; contacts: ContactData[] }> {
  if (!contactIds || contactIds.length === 0) {
    return { contacts: [] };
  }

  const contacts = await prisma.contact.findMany({
    where: { id: { in: contactIds }, tenantId, deletedAt: null },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      fullName: true,
      contactType: true,
      fullAddress: true,
      nationality: true,
      identificationNumber: true,
      contactDetails: {
        where: { deletedAt: null, companyId: null },
        select: { detailType: true, value: true },
      },
    },
  });

  const orderedContacts = contactIds
    .map((id) => contacts.find((contact) => contact.id === id))
    .filter((contact): contact is NonNullable<typeof contact> => Boolean(contact));

  const mappedContacts = orderedContacts.map((contact) => {
    const email = contact.contactDetails?.find((detail) => detail.detailType === 'EMAIL');
    const phone = contact.contactDetails?.find((detail) => detail.detailType === 'PHONE');
    return {
      id: contact.id,
      fullName: contact.fullName || `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
      firstName: contact.firstName,
      lastName: contact.lastName,
      contactType: contact.contactType,
      email: email?.value || null,
      phone: phone?.value || null,
      fullAddress: contact.fullAddress,
      nationality: contact.nationality,
      identificationNumber: contact.identificationNumber,
    } satisfies ContactData;
  });

  return {
    firstContact: mappedContacts[0],
    contacts: mappedContacts,
  };
}

function metadataHasUnresolvedTemplateData(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return false;
  }

  const data = metadata as Record<string, unknown>;
  const missingPlaceholders = Array.isArray(data.missingPlaceholders)
    ? data.missingPlaceholders
    : [];
  const missingPartials = Array.isArray(data.missingPartials)
    ? data.missingPartials
    : [];
  const circularPartials = Array.isArray(data.circularPartials)
    ? data.circularPartials
    : [];
  const syntaxErrors = Array.isArray(data.syntaxErrors)
    ? data.syntaxErrors
    : [];
  const unknownPlaceholders = Array.isArray(data.unknownPlaceholders)
    ? data.unknownPlaceholders
    : [];

  return (
    missingPlaceholders.length > 0
    || missingPartials.length > 0
    || circularPartials.length > 0
    || syntaxErrors.length > 0
    || unknownPlaceholders.length > 0
  );
}

function buildBlockingErrors(
  missingPlaceholders: string[],
  missingPartials: string[],
  diagnostics?: Pick<TemplateDiagnostics, 'circularPartials' | 'syntaxErrors'>
): string[] {
  const errors: string[] = [];

  if (missingPlaceholders.length > 0) {
    errors.push(`Unresolved placeholders: ${missingPlaceholders.join(', ')}`);
  }

  if (missingPartials.length > 0) {
    errors.push(`Missing partials: ${missingPartials.join(', ')}`);
  }

  if (diagnostics?.circularPartials.length) {
    errors.push(`Circular partial references: ${diagnostics.circularPartials.join(', ')}`);
  }

  if (diagnostics?.syntaxErrors.length) {
    errors.push(`Template syntax errors: ${diagnostics.syntaxErrors.join('; ')}`);
  }

  return errors;
}

export async function renderTemplateForGeneration(
  params: RenderTemplateForGenerationParams
): Promise<RenderTemplateForGenerationResult> {
  const {
    templateId,
    tenantId,
    companyId,
    contactIds = [],
    selectedDirectorId,
    selectedShareholderId,
    selectedContactId,
    customData = {},
    contextOverride,
    generatedBy,
    mode = 'preview',
    templateContent,
    templateName = 'Unsaved template',
    templateCategory = 'OTHER',
    templateVersion = 1,
  } = params;

  if (!tenantId) {
    throw new Error('Tenant ID is required for template rendering');
  }

  const template = templateId
    ? await prisma.documentTemplate.findFirst({
        where: { id: templateId, tenantId, deletedAt: null },
      })
    : null;

  if (templateId && !template) {
    throw new NotFoundError('Template not found');
  }

  if (template && mode !== 'test' && !template.isActive) {
    throw new Error('Template is not active');
  }

  const renderContent = template?.content ?? templateContent;
  if (!renderContent) {
    throw new Error('Template content is required for rendering');
  }

  let context: PlaceholderContext = contextOverride
    ? {
        ...contextOverride,
        custom: {
          ...contextOverride.custom,
          ...customData,
        },
        system: {
          ...(contextOverride.system ?? {}),
          ...(generatedBy ? { preparerName: generatedBy, generatedBy } : {}),
          currentDate: contextOverride.system?.currentDate ?? new Date(),
        },
      }
    : {
        custom: customData,
        system: {
          currentDate: new Date(),
          ...(generatedBy ? { preparerName: generatedBy, generatedBy } : {}),
        },
      };

  if (companyId && !context.company) {
    const company = await getCompanyById(companyId, tenantId);
    if (!company) {
      throw new NotFoundError('Company not found');
    }
    const partyOptions = await getDocumentPartyOptions(companyId, tenantId);
    const directorFieldsById = new Map(
      partyOptions.directors.map((party) => [party.id, party]),
    );
    const shareholderFieldsById = new Map(
      partyOptions.shareholders.map((party) => [party.id, party]),
    );
    const companyWithPartyFields = {
      ...company,
      officers: (company.officers ?? []).map((officer) => {
        const party = directorFieldsById.get(officer.id);
        return party
          ? {
              ...officer,
              email: party.email,
              phone: party.phone,
              letterAddress: party.address.letter,
            }
          : officer;
      }),
      shareholders: (company.shareholders ?? []).map((shareholder) => {
        const party = shareholderFieldsById.get(shareholder.id);
        return party
          ? {
              ...shareholder,
              email: party.email,
              phone: party.phone,
              letterAddress: party.address.letter,
            }
          : shareholder;
      }),
    };
    const companyContext = prepareCompanyContext(
      companyWithPartyFields as unknown as Parameters<typeof prepareCompanyContext>[0]
    );
    context = {
      ...context,
      ...companyContext,
      system: {
        ...companyContext.system,
        ...context.system,
        currentDate: context.system?.currentDate ?? companyContext.system?.currentDate ?? new Date(),
      },
      custom: {
        ...companyContext.custom,
        ...context.custom,
      },
    };
  }

  if (selectedDirectorId || selectedShareholderId || selectedContactId) {
    if (!companyId) {
      throw new Error('Company selection is required for selected parties');
    }
    const selections = await resolveDocumentPartySelections({
      companyId,
      tenantId,
      selectedDirectorId,
      selectedShareholderId,
      selectedContactId,
    });
    context = {
      ...context,
      ...selections,
    };
  }

  const legacyContactContext = await buildContactsContext(contactIds, tenantId);
  const seenContactIds = new Set<string>();
  const contacts = [
    ...(context.contacts ?? []),
    ...legacyContactContext.contacts,
  ].filter((contact) => {
    if (seenContactIds.has(contact.id)) return false;
    seenContactIds.add(contact.id);
    return true;
  });
  if (contacts.length > 0) {
    context = {
      ...context,
      contact: contacts[0],
      contacts,
      custom: {
        ...context.custom,
        contacts,
      },
    };
  }

  const partialRefs = extractPartialReferences(renderContent);
  let partials: Awaited<ReturnType<typeof getPartialsUsedInTemplate>> = [];
  let partialsMap = new Map<string, string>();

  if (partialRefs.length > 0) {
    partials = await getPartialsUsedInTemplate(renderContent, tenantId);
    partialsMap = new Map(partials.map((partial) => [partial.name, partial.content]));
  }
  const diagnostics = analyzeTemplateContent({
    content: renderContent,
    placeholders: template?.placeholders,
    partials,
  });
  if (mode !== 'test') {
    const partyRequirements = getRequiredPartySelections(renderContent, partials);
    if (partyRequirements.director && !selectedDirectorId) {
      throw new Error('Select a director for this template.');
    }
    if (partyRequirements.shareholder && !selectedShareholderId) {
      throw new Error('Select a shareholder for this template.');
    }
    if (partyRequirements.contact && !selectedContactId) {
      throw new Error('Select a company contact for this template.');
    }
  }

  const {
    resolved,
    missing,
    missingPartials,
  } = resolvePlaceholders(renderContent, context, {
    missingPlaceholder: 'highlight',
    partialsMap,
  });

  const contentWithAnchors = addSectionAnchors(resolved);
  const sections = extractSections(contentWithAnchors);

  return {
    template: {
      id: template?.id ?? 'ad-hoc',
      name: template?.name ?? templateName,
      category: template?.category ?? templateCategory,
      version: template?.version ?? templateVersion,
    },
    content: contentWithAnchors,
    contentHtml: contentWithAnchors,
    rawResolvedContent: resolved,
    sections,
    missingPlaceholders: missing,
    missingPartials,
    contextSummary: {
      hasCompany: Boolean(companyId || context.company),
      hasContacts: contacts.length > 0,
      hasCustomData: Object.keys(customData).length > 0,
    },
    blockingErrors: buildBlockingErrors(missing, missingPartials, diagnostics),
    context,
    diagnostics,
    dependencySnapshot: {
      templateId: template?.id ?? 'ad-hoc',
      templateName: template?.name ?? templateName,
      templateVersion: template?.version ?? templateVersion,
      partials: diagnostics.dependencies.map((dependency) => ({
        name: dependency.name,
        found: dependency.found,
        version: dependency.version,
        updatedAt: dependency.updatedAt,
      })),
    },
  };
}

// ============================================================================
// Create Document from Template
// ============================================================================

export async function createDocumentFromTemplate(
  data: CreateDocumentFromTemplateInput,
  params: TenantAwareParams
): Promise<GeneratedDocument> {
  const { tenantId, userId } = params;
  const contactIds = data.contactIds ?? [];
  const useLetterhead = data.useLetterhead ?? true;
  const creator = await prisma.user.findFirst({
    where: { id: userId, tenantId },
    select: { firstName: true, lastName: true },
  });
  const generatedBy = creator
    ? [creator.firstName, creator.lastName].filter(Boolean).join(' ').trim()
    : undefined;

  const generationDraft = data.draftId
    ? await prisma.generatedDocument.findFirst({
      where: { id: data.draftId, tenantId, deletedAt: null },
    })
    : null;
  if (
    data.draftId
    && (
      !generationDraft
      || generationDraft.status !== 'DRAFT'
      || !readActiveGenerationSession(generationDraft.metadata)
    )
  ) {
    throw new NotFoundError('Document draft not found');
  }

  // Get template
  const template = await prisma.documentTemplate.findFirst({
    where: { id: data.templateId, tenantId, deletedAt: null },
  });

  if (!template) {
    throw new NotFoundError('Template not found');
  }

  if (!template.isActive) {
    throw new Error('Template is not active');
  }

  const rendered = await renderTemplateForGeneration({
    templateId: data.templateId,
    tenantId,
    companyId: data.companyId,
    contactIds,
    selectedDirectorId: data.selectedDirectorId,
    selectedShareholderId: data.selectedShareholderId,
    selectedContactId: data.selectedContactId,
    customData: data.customData,
    generatedBy,
    mode: 'generate',
  });

  const selectedParties = {
    ...(data.selectedDirectorId ? { directorId: data.selectedDirectorId } : {}),
    ...(data.selectedShareholderId ? { shareholderId: data.selectedShareholderId } : {}),
    ...(data.selectedContactId ? { contactId: data.selectedContactId } : {}),
  };

  const generatedMetadata = {
    missingPlaceholders: rendered.missingPlaceholders,
    missingPartials: rendered.missingPartials,
    circularPartials: rendered.diagnostics.circularPartials,
    syntaxErrors: rendered.diagnostics.syntaxErrors,
    unknownPlaceholders: rendered.diagnostics.unknownPlaceholders,
    dependencySnapshot: rendered.dependencySnapshot,
    selectedParties,
  };

  const document = data.draftId
    ? await prisma.generatedDocument.update({
      where: { id: data.draftId },
      data: {
        templateId: template.id,
        templateVersion: template.version,
        companyId: data.companyId ?? null,
        title: data.title,
        content: data.editedContent ?? rendered.content,
        contentJson: data.editedContentJson ?? template.contentJson ?? Prisma.JsonNull,
        status: 'DRAFT',
        useLetterhead,
        placeholderData: rendered.context as Prisma.InputJsonValue,
        metadata: generatedMetadata,
      },
    })
    : await prisma.generatedDocument.create({
      data: {
        tenantId,
        templateId: template.id,
        templateVersion: template.version,
        companyId: data.companyId,
        title: data.title,
        content: data.editedContent ?? rendered.content,
        contentJson: data.editedContentJson ?? template.contentJson ?? undefined,
        status: 'DRAFT',
        useLetterhead,
        placeholderData: rendered.context as Prisma.InputJsonValue,
        metadata: generatedMetadata,
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
      missingPlaceholders: rendered.missingPlaceholders,
      missingPartials: rendered.missingPartials,
      dependencySnapshot: rendered.dependencySnapshot,
      selectedParties,
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
      throw new NotFoundError('Company not found');
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
    throw new NotFoundError('Document not found');
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
    throw new NotFoundError('Document not found');
  }

  if (existing.status === 'FINALIZED') {
    throw new Error('Document is already finalized');
  }

  if (existing.status === 'ARCHIVED') {
    throw new Error('Cannot finalize an archived document');
  }

  if (metadataHasUnresolvedTemplateData(existing.metadata)) {
    throw new Error('Cannot finalize document with unresolved placeholders or partials');
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
    throw new NotFoundError('Document not found');
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
    throw new NotFoundError('Document not found');
  }

  if (existing.status === 'ARCHIVED') {
    throw new Error('Document is already archived');
  }

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
    throw new NotFoundError('Document not found');
  }

  if (existing.deletedAt) {
    throw new Error('Document is already deleted');
  }

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
    throw new NotFoundError('Document not found');
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
  includeComments?: boolean;
}

export async function getGeneratedDocumentById(
  id: string,
  tenantId: string,
  options: GetDocumentOptions = {}
): Promise<GeneratedDocumentWithRelations | null> {
  const { includeDeleted = false, includeComments = false } = options;

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

export async function searchGeneratedDocuments(
  params: SearchGeneratedDocumentsInput,
  tenantId: string
): Promise<{
  documents: GeneratedDocumentWithRelations[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}> {
  // SECURITY: Tenant ID is required to prevent cross-workspace data access.
  if (!tenantId) {
    throw new Error('Tenant ID is required for generated documents search');
  }

  const where: Prisma.GeneratedDocumentWhereInput = {
    deletedAt: null,
    tenantId,
  };

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
    throw new NotFoundError('Document not found');
  }

  // Validate parent comment if this is a reply
  if (data.parentId) {
    const parent = await prisma.documentComment.findFirst({
      where: { id: data.parentId, documentId: data.documentId, deletedAt: null },
    });
    if (!parent) {
      throw new NotFoundError('Parent comment not found');
    }
  }

  const comment = await prisma.documentComment.create({
    data: {
      documentId: data.documentId,
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
    throw new NotFoundError('Comment not found');
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
    throw new NotFoundError('Comment not found');
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
    throw new NotFoundError('Comment not found');
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
    throw new NotFoundError('Document not found');
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
  totalComments: number;
}> {
  const [total, byStatus, recentlyCreated, recentlyFinalized, totalComments] =
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
    totalComments,
  };
}
