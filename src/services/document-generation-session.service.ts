import { Prisma } from '@/generated/prisma';
import { createAuditLog } from '@/lib/audit';
import {
  readActiveGenerationSession,
  type GenerationSessionEnvelope,
} from '@/lib/document-generation-session';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import type { SaveGenerationSessionInput } from '@/lib/validations/generated-document';
import type { TenantAwareParams } from '@/lib/types';
import type { TaskLaunchContext } from '@/services/tasks/types';
import {
  getServiceAgreementDraft,
  upsertServiceAgreementDraft,
  type ServiceAgreementDraftDto,
} from '@/services/service-agreement';
import type { GenerationSessionState } from '@/lib/validations/generated-document';

interface SessionReferences {
  templateName: string | null;
  compositionType: 'STANDARD' | 'SERVICE_AGREEMENT' | null;
  templateContentJson?: unknown;
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
  state: GenerationSessionState,
  agreement: ServiceAgreementDraftDto | null = null,
): GenerationSessionEnvelope {
  return {
    id: document.id,
    savedAt: document.updatedAt.toISOString(),
    state,
    agreement,
  };
}

function sessionState(input: SaveGenerationSessionInput): GenerationSessionState {
  const {
    serviceAgreement: _agreement,
    discardServiceAgreement: _discardServiceAgreement,
    ...state
  } = input;
  return state;
}

/**
 * Session drafts mirror the selected template's layout (font family/size,
 * line spacing, page margins) so previews and exports follow the template's
 * global settings even before final generation. An explicit editedContentJson
 * from the caller wins; otherwise the template's persisted layout is used.
 */
function sessionContentJson(
  input: SaveGenerationSessionInput,
  templateContentJson: unknown,
): Prisma.InputJsonValue {
  return (
    input.editedContentJson ?? templateContentJson ?? Prisma.JsonNull
  ) as Prisma.InputJsonValue;
}

async function validateSessionReferences(
  input: SaveGenerationSessionInput,
  tenantId: string,
): Promise<SessionReferences> {
  let templateName: string | null = null;
  let compositionType: SessionReferences['compositionType'] = null;
  let templateContentJson: unknown = undefined;

  if (input.templateId) {
    const template = await prisma.documentTemplate.findFirst({
      where: { id: input.templateId, tenantId, deletedAt: null },
      select: { id: true, name: true, compositionType: true, contentJson: true },
    });
    if (!template) throw new NotFoundError('Template not found');
    templateName = template.name;
    compositionType = template.compositionType;
    templateContentJson = template.contentJson;
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

  const hasAgreement = Boolean(input.serviceAgreement);
  if (
    compositionType === 'STANDARD'
    && (hasAgreement || (input.serviceAgreementId && !input.discardServiceAgreement))
  ) {
    throw new ValidationError('Standard templates cannot retain Service Agreement data');
  }
  if (
    compositionType === 'SERVICE_AGREEMENT' &&
    input.currentStep > 0 &&
    !hasAgreement
  ) {
    throw new ValidationError('Service Agreement details are required after Setup');
  }

  return { templateName, compositionType, templateContentJson };
}

function generationSessionMetadata(
  input: GenerationSessionState,
  existingMetadata?: unknown,
  taskIntegrationContext?: TaskLaunchContext,
): Prisma.InputJsonValue {
  return {
    ...metadataRecord(existingMetadata),
    generationSession: input,
    ...(taskIntegrationContext ? {
      taskIntegrationContext: {
        taskId: taskIntegrationContext.taskId,
        taskStageId: taskIntegrationContext.taskStageId,
        ...(taskIntegrationContext.returnTo
          ? { returnTo: taskIntegrationContext.returnTo }
          : {}),
      },
    } : {}),
  } as Prisma.InputJsonValue;
}

export async function createGenerationSession(
  input: SaveGenerationSessionInput,
  params: TenantAwareParams,
  taskIntegrationContext?: TaskLaunchContext,
): Promise<GenerationSessionEnvelope> {
  const references = await validateSessionReferences(input, params.tenantId);
  const title = sessionTitle(input, references.templateName);
  if (input.serviceAgreement) {
    const agreementInput = input.serviceAgreement;
    return prisma.$transaction(async (tx) => {
      const initialState = sessionState(input);
      const created = await tx.generatedDocument.create({
        data: {
          tenantId: params.tenantId,
          templateId: input.templateId,
          companyId: input.companyId,
          title,
          content: input.editedContent ?? input.previewContent ?? '',
          contentJson: sessionContentJson(input, references.templateContentJson),
          status: 'DRAFT',
          useLetterhead: input.useLetterhead,
          metadata: generationSessionMetadata(
            initialState,
            undefined,
            taskIntegrationContext,
          ),
          createdById: params.userId,
        },
      });
      const agreement = await upsertServiceAgreementDraft(
        created.id,
        agreementInput,
        params,
        { tx, skipDocumentCheck: true },
      );
      const state = { ...initialState, serviceAgreementId: agreement.id };
      const document = await tx.generatedDocument.update({
        where: { id: created.id },
        data: { metadata: generationSessionMetadata(state, created.metadata) },
      });
      return toEnvelope(document, state, agreement);
    });
  }
  const state = sessionState(input);
  const document = await prisma.generatedDocument.create({
    data: {
      tenantId: params.tenantId,
      templateId: input.templateId,
      companyId: input.companyId,
      title,
      content: input.editedContent ?? input.previewContent ?? '',
      contentJson: sessionContentJson(input, references.templateContentJson),
      status: 'DRAFT',
      useLetterhead: input.useLetterhead,
      metadata: generationSessionMetadata(state, undefined, taskIntegrationContext),
      createdById: params.userId,
    },
  });

  await createAuditLog({
    tenantId: params.tenantId,
    userId: params.userId,
    companyId: input.companyId ?? undefined,
    action: 'CREATE',
    entityType: 'GeneratedDocument',
    entityId: document.id,
    entityName: title,
    summary: `Saved document generation draft "${title}"`,
    changeSource: 'MANUAL',
  });

  return toEnvelope(document, state);
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

  const agreement = state.serviceAgreementId
    ? await getServiceAgreementDraft(id, params)
    : null;
  return toEnvelope(document, state, agreement);
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
  const attachedAgreement = await prisma.serviceAgreement.findUnique({
    where: { generatedDocumentId: id },
    select: { id: true, status: true },
  });
  if (
    references.compositionType === 'STANDARD'
    && attachedAgreement
    && !input.discardServiceAgreement
  ) {
    throw new ValidationError(
      'Discard the attached Service Agreement before switching templates',
    );
  }
  if (
    references.compositionType === 'STANDARD'
    && attachedAgreement
    && attachedAgreement.status !== 'DRAFT'
  ) {
    throw new ValidationError('Only draft Service Agreements can be discarded');
  }
  if (
    references.compositionType === 'SERVICE_AGREEMENT'
    && attachedAgreement
    && !input.serviceAgreement
    && input.serviceAgreementId !== attachedAgreement.id
  ) {
    throw new ValidationError(
      'Service Agreement session does not match the attached draft',
    );
  }
  if (input.serviceAgreement) {
    const agreementInput = input.serviceAgreement;
    return prisma.$transaction(async (tx) => {
      const agreement = await upsertServiceAgreementDraft(
        id,
        agreementInput,
        params,
        { tx, skipDocumentCheck: true },
      );
      const state = { ...sessionState(input), serviceAgreementId: agreement.id };
      const document = await tx.generatedDocument.update({
        where: { id },
        data: {
          templateId: input.templateId,
          companyId: input.companyId,
          title: sessionTitle(input, references.templateName),
          content: input.editedContent ?? input.previewContent ?? '',
          contentJson: sessionContentJson(input, references.templateContentJson),
          useLetterhead: input.useLetterhead,
          metadata: generationSessionMetadata(state, existing.metadata),
        },
      });
      return toEnvelope(document, state, agreement);
    });
  }
  const state = references.compositionType === 'STANDARD'
    ? { ...sessionState(input), serviceAgreementId: null }
    : sessionState(input);
  if (references.compositionType === 'STANDARD' && attachedAgreement) {
    return prisma.$transaction(async (tx) => {
      await tx.serviceAgreement.delete({ where: { id: attachedAgreement.id } });
      const document = await tx.generatedDocument.update({
        where: { id },
        data: {
          templateId: input.templateId,
          companyId: input.companyId,
          title: sessionTitle(input, references.templateName),
          content: input.editedContent ?? input.previewContent ?? '',
          contentJson: sessionContentJson(input, references.templateContentJson),
          useLetterhead: input.useLetterhead,
          metadata: generationSessionMetadata(state, existing.metadata),
        },
      });
      return toEnvelope(document, state);
    });
  }
  const document = await prisma.generatedDocument.update({
    where: { id },
    data: {
      templateId: input.templateId,
      companyId: input.companyId,
      title: sessionTitle(input, references.templateName),
      content: input.editedContent ?? input.previewContent ?? '',
      contentJson: sessionContentJson(input, references.templateContentJson),
      useLetterhead: input.useLetterhead,
      metadata: generationSessionMetadata(state, existing.metadata),
    },
  });

  return toEnvelope(document, state);
}
