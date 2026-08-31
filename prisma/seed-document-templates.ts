import type { Prisma } from '@/generated/prisma';
import { isDeepStrictEqual } from 'node:util';
import canonicalTemplates from './seed-data/client-onboarding-document-templates.json';

export type SeedDocumentTemplate = {
  name: string;
  description: string;
  category: 'CONTRACT' | 'RESOLUTION';
  compositionType: 'STANDARD' | 'SERVICE_AGREEMENT';
  content: string;
  contentJson: Prisma.InputJsonValue;
  placeholders: Prisma.InputJsonValue;
};

export const CLIENT_ONBOARDING_DOCUMENT_TEMPLATES = (
  canonicalTemplates as unknown as SeedDocumentTemplate[]
);

function canonicalTemplateData(definition: SeedDocumentTemplate) {
  return {
    name: definition.name,
    description: definition.description,
    category: definition.category,
    compositionType: definition.compositionType,
    content: definition.content,
    contentJson: definition.contentJson,
    placeholders: definition.placeholders,
    isActive: true,
    deletedAt: null,
  };
}

function matchesCanonicalTemplate(
  existing: Record<string, unknown>,
  definition: SeedDocumentTemplate,
) {
  const canonical = canonicalTemplateData(definition);
  return Object.entries(canonical).every(([key, value]) => (
    isDeepStrictEqual(existing[key], value)
  ));
}

export async function ensureSeededDocumentTemplate(
  tx: Prisma.TransactionClient,
  tenantId: string,
  createdById: string,
  definition: SeedDocumentTemplate,
) {
  const existingTemplate = await tx.documentTemplate.findFirst({
    where: { tenantId, name: definition.name, deletedAt: null },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  const templateData = canonicalTemplateData(definition);

  if (!existingTemplate) {
    return tx.documentTemplate.create({
      data: {
        tenantId,
        createdById,
        ...templateData,
      },
    });
  }

  if (matchesCanonicalTemplate(existingTemplate, definition)) {
    return existingTemplate;
  }

  return tx.documentTemplate.update({
    where: { id: existingTemplate.id },
    data: {
      ...templateData,
      version: { increment: 1 },
    },
  });
}
