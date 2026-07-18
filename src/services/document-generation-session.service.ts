import { Prisma } from '@/generated/prisma';
import { createAuditLog } from '@/lib/audit';
import {
  readActiveGenerationSession,
  type GenerationSessionEnvelope,
} from '@/lib/document-generation-session';
import { NotFoundError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import type { SaveGenerationSessionInput } from '@/lib/validations/generated-document';
import type { TenantAwareParams } from '@/lib/types';

interface SessionReferences {
  templateName: string | null;
}

function metadataRecord(metadata: unknown): Record<string, unknown> {
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? { ...(metadata as Record<string, unknown>) }
    : {};
}

function sessionTitle(input: SaveGenerationSessionInput, templateName: string | null): string {
  const title = input.title.trim();
  if (title) return title;
  return templateName ? `Untitled - ${templateName}` : 'Untitled Document';
}

function toEnvelope(
  document: { id: string; updatedAt: Date },
  state: SaveGenerationSessionInput,
): GenerationSessionEnvelope {
  return {
    id: document.id,
    savedAt: document.updatedAt.toISOString(),
    state,
  };
}

async function validateSessionReferences(
  input: SaveGenerationSessionInput,
  tenantId: string,
): Promise<SessionReferences> {
  let templateName: string | null = null;

  if (input.templateId) {
    const template = await prisma.documentTemplate.findFirst({
      where: { id: input.templateId, tenantId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!template) throw new NotFoundError('Template not found');
    templateName = template.name;
  }

  if (input.companyId) {
    const company = await prisma.company.findFirst({
      where: { id: input.companyId, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!company) throw new NotFoundError('Company not found');
  }

  const uniqueContactIds = [...new Set(input.contactIds)];
  if (uniqueContactIds.length > 0) {
    const contacts = await prisma.contact.findMany({
      where: { id: { in: uniqueContactIds }, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (contacts.length !== uniqueContactIds.length) {
      throw new NotFoundError('Contact not found');
    }
  }

  return { templateName };
}

function generationSessionMetadata(
  input: SaveGenerationSessionInput,
  existingMetadata?: unknown,
): Prisma.InputJsonValue {
  return {
    ...metadataRecord(existingMetadata),
    generationSession: input,
  } as Prisma.InputJsonValue;
}

export async function createGenerationSession(
  input: SaveGenerationSessionInput,
  params: TenantAwareParams,
): Promise<GenerationSessionEnvelope> {
  const references = await validateSessionReferences(input, params.tenantId);
  const title = sessionTitle(input, references.templateName);
  const document = await prisma.generatedDocument.create({
    data: {
      tenantId: params.tenantId,
      templateId: input.templateId,
      companyId: input.companyId,
      title,
      content: input.editedContent ?? input.previewContent ?? '',
      status: 'DRAFT',
      useLetterhead: input.useLetterhead,
      metadata: generationSessionMetadata(input),
      createdById: params.userId,
    },
  });

  await createAuditLog({
    tenantId: params.tenantId,
    userId: params.userId,
    companyId: input.companyId ?? undefined,
    action: 'DOCUMENT_DRAFT_SAVED',
    entityType: 'GeneratedDocument',
    entityId: document.id,
    entityName: title,
    summary: `Saved document generation draft "${title}"`,
    changeSource: 'MANUAL',
  });

  return toEnvelope(document, input);
}

export async function getGenerationSession(
  id: string,
  params: TenantAwareParams,
): Promise<GenerationSessionEnvelope> {
  const document = await prisma.generatedDocument.findFirst({
    where: { id, tenantId: params.tenantId, deletedAt: null },
  });
  const state = document?.status === 'DRAFT'
    ? readActiveGenerationSession(document.metadata)
    : null;

  if (!document || !state) {
    throw new NotFoundError('Document draft not found');
  }

  return toEnvelope(document, state);
}

export async function updateGenerationSession(
  id: string,
  input: SaveGenerationSessionInput,
  params: TenantAwareParams,
): Promise<GenerationSessionEnvelope> {
  const existing = await prisma.generatedDocument.findFirst({
    where: { id, tenantId: params.tenantId, deletedAt: null },
  });
  if (
    !existing
    || existing.status !== 'DRAFT'
    || !readActiveGenerationSession(existing.metadata)
  ) {
    throw new NotFoundError('Document draft not found');
  }

  const references = await validateSessionReferences(input, params.tenantId);
  const document = await prisma.generatedDocument.update({
    where: { id },
    data: {
      templateId: input.templateId,
      companyId: input.companyId,
      title: sessionTitle(input, references.templateName),
      content: input.editedContent ?? input.previewContent ?? '',
      useLetterhead: input.useLetterhead,
      metadata: generationSessionMetadata(input, existing.metadata),
    },
  });

  return toEnvelope(document, input);
}
