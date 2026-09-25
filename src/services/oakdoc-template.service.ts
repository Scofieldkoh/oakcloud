import { createHash, randomUUID } from 'node:crypto';
import { unzipSync } from 'fflate';
import { storage, StorageKeys } from '@/lib/storage';
import {
  OAKDOC_MIME_TYPE,
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

const MAX_OAKDOC_FILE_SIZE = 10 * 1024 * 1024;
const MAX_REQUIRED_XML_SIZE = 20 * 1024 * 1024;

function normalizeFileName(value: string): string {
  const base = value.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim();
  const safe = base || 'template.docx';
  return safe.toLowerCase().endsWith('.docx') ? safe : `${safe}.docx`;
}

function validateDocx(buffer: Buffer): void {
  if (buffer.byteLength === 0) throw new Error('The DOCX file is empty');
  if (buffer.byteLength > MAX_OAKDOC_FILE_SIZE) {
    throw new Error('DOCX file size exceeds the 10MB template limit');
  }
  if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    throw new Error('The uploaded file is not a valid DOCX package');
  }

  let totalSelectedSize = 0;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(buffer, {
      filter: (entry) => {
        const selected =
          entry.name === '[Content_Types].xml'
          || entry.name === 'word/document.xml';
        if (!selected) return false;
        totalSelectedSize += entry.originalSize;
        if (totalSelectedSize > MAX_REQUIRED_XML_SIZE) {
          throw new Error('DOCX document XML exceeds the safe processing limit');
        }
        return true;
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('safe processing limit')) throw error;
    throw new Error('The uploaded file is not a readable DOCX package');
  }

  if (!files['[Content_Types].xml'] || !files['word/document.xml']) {
    throw new Error('The uploaded file does not contain a Word document');
  }

  const contentTypes = Buffer.from(files['[Content_Types].xml']).toString('utf8');
  if (!contentTypes.includes('wordprocessingml.document.main+xml')) {
    throw new Error('The uploaded file is not a standard Word DOCX document');
  }
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
  validateDocx(input.buffer);
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
      compositionType: 'STANDARD',
      content: OAKDOC_TEMPLATE_CONTENT,
      contentJson: mergeOakDocTemplateMetadata(input.contentJson ?? null, asset),
      placeholders: input.placeholders ?? [],
      isActive: input.isActive,
      sharePointRelativeFolderPath: null,
    }, params);
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
      content: OAKDOC_TEMPLATE_CONTENT,
      contentJson: mergeOakDocTemplateMetadata(existing.contentJson, asset),
      isActive: input.isActive,
    }, params, 'Saved from OakDoc');
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
