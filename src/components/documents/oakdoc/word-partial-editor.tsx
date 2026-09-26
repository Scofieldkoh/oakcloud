'use client';

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { OakDocDocumentHost } from '@/components/documents/oakdoc/oakdoc-document-host';
import { partialKeys, saveWordPartial } from '@/hooks/use-template-partials';
import { OAKDOC_MIME_TYPE } from '@/lib/document-editor/oakdoc-template';
import type { OakDocSnapshotIdentity } from '@/types/oakdoc';

export interface WordPartialEditorProps {
  partialId: string;
  /** Changes when a new version is uploaded, so the editor reloads it. */
  loadKey: number;
  title: string;
  fileName: string;
  version: number;
  readOnly: boolean;
  onDirtyChange?: (dirty: boolean) => void;
}

async function loadPartialDocx(partialId: string, signal: AbortSignal): Promise<Uint8Array> {
  const response = await fetch(`/api/template-partials/${encodeURIComponent(partialId)}/oakdoc`, { signal });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error((body as { error?: string } | null)?.error ?? 'Could not load the Word partial');
  }
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * In-app editor for a Word partial over the shared OakDoc host. Each save
 * uploads a new partial version; templates keep their pinned version until
 * they are updated.
 */
export function WordPartialEditor({
  partialId,
  loadKey,
  title,
  fileName,
  version,
  readOnly,
  onDirtyChange,
}: WordPartialEditorProps) {
  const queryClient = useQueryClient();
  const load = useCallback(
    (signal: AbortSignal) => loadPartialDocx(partialId, signal),
    [partialId],
  );

  const persist = useCallback(async (bytes: Uint8Array, snapshot: OakDocSnapshotIdentity) => {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const saved = await saveWordPartial({
      id: partialId,
      expectedRevision: snapshot.baseRevision,
      file: new File([copy.buffer], fileName, { type: OAKDOC_MIME_TYPE }),
    });
    await queryClient.invalidateQueries({ queryKey: partialKeys.all });
    return { revision: saved.version };
  }, [fileName, partialId, queryClient]);

  return (
    <OakDocDocumentHost
      entityKey={`partial:${partialId}:${loadKey}`}
      baseRevision={version}
      title={title}
      readOnly={readOnly}
      description={readOnly ? 'read-only Word partial' : 'Word partial'}
      loadingLabel="Loading Word partial…"
      load={load}
      persist={persist}
      onDirtyChange={onDirtyChange}
    />
  );
}
