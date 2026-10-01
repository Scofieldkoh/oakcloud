import type { DocxEditorRef, EditorCommand } from '@docx-editor.dev/react';
import { OAKDOC_FIELD_TAGS } from '@/lib/document-editor/oakdoc-field-registry';
import {
  normalizeOakDocFields,
  type OakDocFieldDefinition,
} from '@/lib/document-editor/oakdoc-fields';

export interface OakDocFieldInsertion {
  /** Bytes to remount when the field was seeded or deleted fields were pruned; null when the editor already shows the result. */
  bytes: Uint8Array | null;
  /** The editor's bytes after the insert, for refreshing field summaries. */
  afterBytes: Uint8Array;
  message: string;
}

async function editorBytes(handle: DocxEditorRef): Promise<Uint8Array> {
  const buffer = await handle.save();
  if (!buffer) throw new Error('OakDoc did not return a DOCX file.');
  return new Uint8Array(buffer);
}

/**
 * Wrap the selection in (or insert at the caret) a Word content control for
 * an Oakcloud field. Shared by the template editor and the Word partial
 * editor so both create identical fields.
 */
export async function insertOakDocField(
  handle: DocxEditorRef | null,
  field: OakDocFieldDefinition,
): Promise<OakDocFieldInsertion> {
  const editor = handle?.getEditor();
  if (!handle || !editor) throw new Error('OakDoc is not ready.');

  const beforeBytes = await editorBytes(handle);
  const command = {
    type: 'insertContentControl',
    subtype: 'plainText',
    tag: field.tag,
    title: field.label,
  } as EditorCommand;

  const allowed = editor.can(command);
  if (!allowed.ok) {
    throw new Error(allowed.reason || 'The current selection cannot be made into a field.');
  }
  const result = handle.exec(command);
  if (!result.ok) {
    throw new Error(result.reason || 'OakDoc could not create the Word content control.');
  }

  const afterBytes = await editorBytes(handle);
  const normalized = normalizeOakDocFields({
    beforeBytes,
    afterBytes,
    insertedField: field,
    knownTags: OAKDOC_FIELD_TAGS,
  });
  const cleanupMessage = normalized.removed > 0
    ? ` Removed ${normalized.removed} deleted field${normalized.removed === 1 ? '' : 's'}.`
    : '';
  if (normalized.seeded > 0 || normalized.removed > 0) {
    return {
      bytes: normalized.bytes,
      afterBytes: normalized.bytes,
      message: `Created ${field.label} field. Empty fields display {{${field.tag}}} until resolved.${cleanupMessage}`,
    };
  }
  return {
    bytes: null,
    afterBytes,
    message: `Created ${field.label} field around the selected text.`,
  };
}
