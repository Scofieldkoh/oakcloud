import {
  detectA4BreakFormatLevel,
  readA4BreakDocument,
  type A4BreakFormatLevel,
} from '@/components/documents/a4-pagination/semantic-break-projection';
import {
  assertA4EditorReaderFormatLevel,
  assertA4EditorWriterFormatLevel,
} from '@/lib/document-editor/a4-editor-capabilities';

function metadataFormatLevel(contentJson: unknown): A4BreakFormatLevel {
  if (!contentJson || typeof contentJson !== 'object' || Array.isArray(contentJson)) return 1;
  const a4Editor = (contentJson as Record<string, unknown>).a4Editor;
  if (!a4Editor || typeof a4Editor !== 'object' || Array.isArray(a4Editor)) return 1;
  const schemaVersion = (a4Editor as Record<string, unknown>).schemaVersion;
  return typeof schemaVersion === 'number' && schemaVersion >= 2 ? 2 : 1;
}

/**
 * W1 stored-format detector. S1 remains the only markup authority; W merely
 * combines that result with the frozen optional contentJson schema marker.
 */
export function detectA4StoredFormatLevel(
  content: string,
  contentJson?: unknown,
): A4BreakFormatLevel {
  return Math.max(
    detectA4BreakFormatLevel(content),
    metadataFormatLevel(contentJson),
  ) as A4BreakFormatLevel;
}

/**
 * Reads canonical break semantics through S1 and enforces current server reader
 * authority. It never introduces a second parser or position representation.
 */
export function readA4StoredDocument(content: string, contentJson?: unknown) {
  const reader = readA4BreakDocument(content);
  const requiredFormatLevel = detectA4StoredFormatLevel(content, contentJson);
  assertA4EditorReaderFormatLevel(requiredFormatLevel);
  return {
    ...reader,
    formatLevel: requiredFormatLevel,
  };
}

/**
 * Reader-before-writer protection for any canonical content/metadata write.
 * Level-2 reads are supported in W1, while level-2 writes remain disabled.
 */
export function assertA4WriterCanPreserve(
  content: string,
  contentJson?: unknown,
): A4BreakFormatLevel {
  const requiredFormatLevel = detectA4StoredFormatLevel(content, contentJson);
  assertA4EditorWriterFormatLevel(requiredFormatLevel);
  return requiredFormatLevel;
}
