import { prisma } from '@/lib/prisma';
import { createAuditLog } from '@/lib/audit';
import {
  assertOakDocCanBecomePrimary,
  buildOakDocMigrationInventory,
  createOakDocMigrationMetadata,
  getOakDocMigrationReadiness,
  mergeOakDocMigrationMetadata,
  readOakDocMigrationMetadata,
  type OakDocMigrationInventoryItem,
  type OakDocMigrationPreference,
  type OakDocMigrationValidation,
} from '@/lib/document-editor/oakdoc-migration';
import {
  isOakDocTemplate,
} from '@/lib/document-editor/oakdoc-template';
import {
  getDocumentTemplateById,
  updateDocumentTemplate,
  type TenantAwareParams,
} from '@/services/document-template.service';
import type { DocumentTemplate } from '@/generated/prisma';

function cleanReason(value: string): string {
  const reason = value.trim();
  if (!reason) throw new Error('A reason is required for migration control changes');
  return reason.slice(0, 1000);
}

async function requireTemplate(id: string, tenantId: string): Promise<DocumentTemplate> {
  const template = await getDocumentTemplateById(id, tenantId);
  if (!template) throw new Error('Template not found');
  return template;
}

async function requireMigrationPair(
  oakDocTemplateId: string,
  tenantId: string,
): Promise<{
  oakDoc: DocumentTemplate;
  legacy: DocumentTemplate;
  metadata: NonNullable<ReturnType<typeof readOakDocMigrationMetadata>>;
}> {
  const oakDoc = await requireTemplate(oakDocTemplateId, tenantId);
  if (!isOakDocTemplate(oakDoc.contentJson)) {
    throw new Error('Migration controls can only be applied to an OakDoc template');
  }
  const metadata = readOakDocMigrationMetadata(oakDoc.contentJson);
  if (!metadata) throw new Error('OakDoc template is not linked to a legacy template');

  const legacy = await requireTemplate(metadata.legacyTemplateId, tenantId);
  if (isOakDocTemplate(legacy.contentJson)) {
    throw new Error('Migration metadata does not reference a legacy A4 template');
  }
  return { oakDoc, legacy, metadata };
}

export async function getOakDocMigrationInventory(
  tenantId: string,
): Promise<OakDocMigrationInventoryItem[]> {
  const templates = await prisma.documentTemplate.findMany({
    where: { tenantId, deletedAt: null },
    select: {
      id: true,
      name: true,
      version: true,
      contentJson: true,
      isActive: true,
      deletedAt: true,
    },
    orderBy: { name: 'asc' },
  });
  return buildOakDocMigrationInventory(templates);
}

export async function linkOakDocMigration(input: {
  oakDocTemplateId: string;
  legacyTemplateId: string;
  expectedRevision: number;
  reason: string;
}, params: TenantAwareParams): Promise<DocumentTemplate> {
  if (input.oakDocTemplateId === input.legacyTemplateId) {
    throw new Error('OakDoc and legacy templates must be different templates');
  }

  const [oakDoc, legacy] = await Promise.all([
    requireTemplate(input.oakDocTemplateId, params.tenantId),
    requireTemplate(input.legacyTemplateId, params.tenantId),
  ]);
  if (!isOakDocTemplate(oakDoc.contentJson)) {
    throw new Error('The target template is not an OakDoc template');
  }
  if (isOakDocTemplate(legacy.contentJson)) {
    throw new Error('The migration source must be a legacy A4 template');
  }

  const existing = readOakDocMigrationMetadata(oakDoc.contentJson);
  if (existing && existing.legacyTemplateId !== legacy.id) {
    throw new Error('OakDoc template is already linked to a different legacy template');
  }
  if (
    existing
    && existing.legacyTemplateId === legacy.id
    && existing.legacyTemplateVersion === legacy.version
  ) {
    return oakDoc;
  }

  const metadata = createOakDocMigrationMetadata({
    legacyTemplateId: legacy.id,
    legacyTemplateVersion: legacy.version,
  });

  return updateDocumentTemplate({
    id: oakDoc.id,
    expectedRevision: input.expectedRevision,
    contentJson: mergeOakDocMigrationMetadata(oakDoc.contentJson, metadata),
  }, params, cleanReason(input.reason));
}

export async function recordOakDocMigrationValidation(input: {
  oakDocTemplateId: string;
  expectedRevision: number;
  passed: boolean;
  issueCodes?: readonly string[];
  summary?: string;
  checkedAt?: string;
}, params: TenantAwareParams): Promise<DocumentTemplate> {
  const { oakDoc, legacy, metadata } = await requireMigrationPair(
    input.oakDocTemplateId,
    params.tenantId,
  );

  const issueCodes = Array.from(new Set(
    (input.issueCodes ?? [])
      .map((value) => value.trim())
      .filter(Boolean),
  )).sort();
  if (input.passed && issueCodes.length > 0) {
    throw new Error('A passing migration validation cannot contain blocking issue codes');
  }

  const checkedAt = input.checkedAt ? new Date(input.checkedAt) : new Date();
  if (Number.isNaN(checkedAt.getTime())) throw new Error('Validation timestamp is invalid');

  // updateDocumentTemplate increments the record revision. The validation being
  // persisted by this same atomic update therefore applies to the resulting
  // OakDoc revision, not the pre-update revision.
  const validation: OakDocMigrationValidation = {
    checkedAt: checkedAt.toISOString(),
    passed: input.passed,
    legacyTemplateVersion: legacy.version,
    oakDocTemplateVersion: oakDoc.version + 1,
    issueCodes,
    ...(input.summary?.trim()
      ? { summary: input.summary.trim().slice(0, 1000) }
      : {}),
  };

  const nextMetadata = {
    ...metadata,
    legacyTemplateVersion: legacy.version,
    validation,
    preference: input.passed ? metadata.preference : 'LEGACY' as const,
  };

  const updated = await updateDocumentTemplate({
    id: oakDoc.id,
    expectedRevision: input.expectedRevision,
    contentJson: mergeOakDocMigrationMetadata(oakDoc.contentJson, nextMetadata),
  }, params, 'Recorded OakDoc migration parity validation');

  await createAuditLog({
    tenantId: params.tenantId,
    userId: params.userId,
    action: 'UPDATE',
    entityType: 'OakDocMigrationValidation',
    entityId: updated.id,
    entityName: updated.name,
    summary: `Recorded ${input.passed ? 'passing' : 'failed'} OakDoc parity validation for "${updated.name}"`,
    changeSource: 'MANUAL',
    metadata: {
      oakDocTemplateId: updated.id,
      legacyTemplateId: legacy.id,
      legacyTemplateVersion: legacy.version,
      oakDocTemplateVersion: updated.version,
      passed: input.passed,
      issueCodes,
    },
  });

  return updated;
}

export async function setOakDocMigrationPreference(input: {
  oakDocTemplateId: string;
  expectedRevision: number;
  preference: OakDocMigrationPreference;
  reason: string;
}, params: TenantAwareParams): Promise<DocumentTemplate> {
  const { oakDoc, legacy, metadata } = await requireMigrationPair(
    input.oakDocTemplateId,
    params.tenantId,
  );
  const reason = cleanReason(input.reason);

  if (input.preference === 'OAKDOC') {
    assertOakDocCanBecomePrimary({
      metadata,
      legacyTemplateVersion: legacy.version,
      oakDocTemplateVersion: oakDoc.version,
    });
  }

  const currentValidation = metadata.validation;
  const carriedValidation = currentValidation
    ? {
        ...currentValidation,
        // Preference changes are metadata-only revisions. Carry the already
        // verified document parity to the resulting revision.
        oakDocTemplateVersion: oakDoc.version + 1,
      }
    : undefined;

  const nextMetadata = {
    ...metadata,
    preference: input.preference,
    ...(carriedValidation ? { validation: carriedValidation } : {}),
    preferenceChangedAt: new Date().toISOString(),
    preferenceChangedBy: params.userId,
    preferenceReason: reason,
  };

  const updated = await updateDocumentTemplate({
    id: oakDoc.id,
    expectedRevision: input.expectedRevision,
    contentJson: mergeOakDocMigrationMetadata(oakDoc.contentJson, nextMetadata),
  }, params, reason);

  await createAuditLog({
    tenantId: params.tenantId,
    userId: params.userId,
    action: 'UPDATE',
    entityType: 'OakDocMigrationPreference',
    entityId: updated.id,
    entityName: updated.name,
    summary: input.preference === 'OAKDOC'
      ? `Marked OakDoc template "${updated.name}" as preferred after parity validation`
      : `Restored legacy A4 preference for "${updated.name}"`,
    changeSource: 'MANUAL',
    reason,
    metadata: {
      oakDocTemplateId: updated.id,
      legacyTemplateId: legacy.id,
      preference: input.preference,
      reversible: true,
      legacyRetained: true,
    },
  });

  return updated;
}

/**
 * Resolve a legacy template to its validated preferred OakDoc pair. This does
 * not mutate either template and never disables the legacy source.
 */
export async function resolvePreferredMigratedTemplate(
  legacyTemplateId: string,
  tenantId: string,
): Promise<DocumentTemplate> {
  const legacy = await requireTemplate(legacyTemplateId, tenantId);
  if (isOakDocTemplate(legacy.contentJson)) {
    throw new Error('Preferred migration resolution expects a legacy A4 template ID');
  }

  const oakDocs = await prisma.documentTemplate.findMany({
    where: {
      tenantId,
      deletedAt: null,
      contentJson: {
        path: ['oakDoc', 'schemaVersion'],
        equals: 1,
      },
    },
  });

  for (const oakDoc of oakDocs) {
    const metadata = readOakDocMigrationMetadata(oakDoc.contentJson);
    if (!metadata || metadata.legacyTemplateId !== legacy.id) continue;
    const readiness = getOakDocMigrationReadiness({
      metadata,
      legacyTemplateVersion: legacy.version,
      oakDocTemplateVersion: oakDoc.version,
    });
    if (readiness === 'OAKDOC_PRIMARY') return oakDoc;
  }

  return legacy;
}
