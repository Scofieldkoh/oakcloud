import { createHash, randomUUID } from 'node:crypto';
import { storage, StorageKeys } from '@/lib/storage';
import { inspectOakDocPackage } from '@/lib/document-editor/oakdoc-package-policy';
import {
  OAKDOC_MIME_TYPE,
  OAKDOC_SERVICE_AGREEMENT_CONTENT,
  OAKDOC_TEMPLATE_CONTENT,
  mergeOakDocTemplateMetadata,
  readOakDocTemplateMetadata,
  type OakDocTemplateMetadata,
} from '@/lib/document-editor/oakdoc-template';
import {
  createDocumentTemplate,
  getDocumentTemplateById,
  updateDocumentTemplate,
  type TenantAwareParams,
} from '@/services/document-template.service';
import type { DocumentTemplateCategory } from '@/generated/prisma';
import type {
  JsonValue,
  PlaceholderDefinition,
} from '@/lib/validations/document-template';

function normalizeFileName(value: string): string {
  const base = value.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim();
  const safe = base || 'template.docx';
  return safe.toLowerCase().endsWith('.docx') ? safe : `${safe}.docx`;
}

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

async function persistAsset(input: {
  tenantId: string;
  userId: string;
  fileName: string;
  buffer: Buffer;
  fieldTags: string[];
}): Promise<OakDocTemplateMetadata> {
  inspectOakDocPackage(input.buffer, 'master');
  const assetId = randomUUID();
  const storageKey = StorageKeys.oakDocTemplateAsset(input.tenantId, assetId);
  const fileName = normalizeFileName(input.fileName);
  const digest = sha256(input.buffer);

  await storage.upload(storageKey, input.buffer, {
    contentType: OAKDOC_MIME_TYPE,
    metadata: {
      originalFileName: fileName,
      uploadedBy: input.userId,
      tenantId: input.tenantId,
      sha256: digest,
    },
  });

  return {
    schemaVersion: 1,
    storageKey,
    fileName,
    fileSize: input.buffer.byteLength,
    sha256: digest,
    mimeType: OAKDOC_MIME_TYPE,
    fieldTags: Array.from(new Set(input.fieldTags)).sort(),
  };
}

export async function createOakDocTemplate(input: {
  name: string;
  description?: string | null;
  category: DocumentTemplateCategory;
  isActive: boolean;
  fileName: string;
  buffer: Buffer;
  fieldTags: string[];
  contentJson?: Record<string, JsonValue>;
  placeholders?: PlaceholderDefinition[];
  compositionType?: 'STANDARD' | 'SERVICE_AGREEMENT';
}, params: TenantAwareParams) {
  const asset = await persistAsset({
    tenantId: params.tenantId,
    userId: params.userId,
    fileName: input.fileName,
    buffer: input.buffer,
    fieldTags: input.fieldTags,
  });

  try {
    return await createDocumentTemplate({
      name: input.name,
      description: input.description,
      category: input.category,
      compositionType: input.compositionType ?? 'STANDARD',
      content: input.compositionType === 'SERVICE_AGREEMENT'
        ? OAKDOC_SERVICE_AGREEMENT_CONTENT
        : OAKDOC_TEMPLATE_CONTENT,
      contentJson: mergeOakDocTemplateMetadata(input.contentJson ?? null, asset),
      placeholders: input.placeholders ?? [],
      isActive: input.isActive,
      sharePointRelativeFolderPath: null,
    }, params, { writer: 'oakdoc-service' });
  } catch (error) {
    await storage.delete(asset.storageKey).catch(() => undefined);
    throw error;
  }
}

export async function updateOakDocTemplate(input: {
  id: string;
  expectedRevision: number;
  name?: string;
  description?: string | null;
  category?: DocumentTemplateCategory;
  isActive?: boolean;
  fileName: string;
  buffer: Buffer;
  fieldTags: string[];
  compositionType?: 'STANDARD' | 'SERVICE_AGREEMENT';
}, params: TenantAwareParams) {
  const existing = await getDocumentTemplateById(input.id, params.tenantId);
  if (!existing) throw new Error('Template not found');
  const existingMetadata = readOakDocTemplateMetadata(existing.contentJson);
  if (!existingMetadata) {
    throw new Error('This template is not an OakDoc template');
  }
  if (!existingMetadata.storageKey.startsWith(`${params.tenantId}/templates/oakdoc/assets/`)) {
    throw new Error('OakDoc template storage scope is invalid');
  }

  const asset = await persistAsset({
    tenantId: params.tenantId,
    userId: params.userId,
    fileName: input.fileName,
    buffer: input.buffer,
    fieldTags: input.fieldTags,
  });

  try {
    return await updateDocumentTemplate({
      id: input.id,
      expectedRevision: input.expectedRevision,
      name: input.name,
      description: input.description,
      category: input.category,
      compositionType: input.compositionType,
      content: input.compositionType === 'SERVICE_AGREEMENT'
        ? OAKDOC_SERVICE_AGREEMENT_CONTENT
        : input.compositionType === 'STANDARD'
          ? OAKDOC_TEMPLATE_CONTENT
          : existing.content,
      contentJson: mergeOakDocTemplateMetadata(existing.contentJson, asset),
      isActive: input.isActive,
    }, params, 'Saved from OakDoc', { writer: 'oakdoc-service' });
  } catch (error) {
    await storage.delete(asset.storageKey).catch(() => undefined);
    throw error;
  }
}

export async function downloadOakDocTemplate(
  templateId: string,
  tenantId: string,
): Promise<{ buffer: Buffer; metadata: OakDocTemplateMetadata }> {
  const template = await getDocumentTemplateById(templateId, tenantId);
  if (!template) throw new Error('Template not found');

  const metadata = readOakDocTemplateMetadata(template.contentJson);
  if (!metadata) throw new Error('This template is not an OakDoc template');
  if (!metadata.storageKey.startsWith(`${tenantId}/templates/oakdoc/assets/`)) {
    throw new Error('OakDoc template storage scope is invalid');
  }

  const buffer = await storage.download(metadata.storageKey);
  if (sha256(buffer) !== metadata.sha256) {
    throw new Error('OakDoc template asset integrity check failed');
  }

  return { buffer, metadata };
}
