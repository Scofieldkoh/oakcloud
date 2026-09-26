'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { DocxEditor, type DocxEditorRef } from '@docx-editor.dev/react';
import { CheckCircle2, Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface SaveResult {
  revision: number;
  updatedAt: string;
}

export interface OakDocGeneratedDocumentEditorProps {
  documentId: string;
  title: string;
  revision: number;
  readOnly: boolean;
  disabled?: boolean;
  onSaved?: (result: SaveResult) => void;
}

function exactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  if (
    bytes.buffer instanceof ArrayBuffer
    && bytes.byteOffset === 0
    && bytes.byteLength === bytes.buffer.byteLength
  ) {
    return bytes.buffer;
  }
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function toUint8Array(buffer: ArrayBuffer): Uint8Array {
  return new Uint8Array(buffer.slice(0));
}

async function apiError(response: Response): Promise<Error> {
  const body = await response.json().catch(() => null);
  return new Error((body as { error?: string } | null)?.error ?? 'Request failed');
}

export function OakDocGeneratedDocumentEditor({
  documentId,
  title,
  revision,
  readOnly,
  disabled = false,
  onSaved,
}: OakDocGeneratedDocumentEditorProps) {
  const editorRef = useRef<DocxEditorRef>(null);
  const readyRef = useRef(false);
  const [documentBytes, setDocumentBytes] = useState<Uint8Array | null>(null);
  const [version, setVersion] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('Loading generated DOCX…');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    readyRef.current = false;
    setLoading(true);
    setDirty(false);
    setError(null);
    setStatus('Loading generated DOCX…');

    void fetch(
      `/api/generated-documents/${encodeURIComponent(documentId)}?format=docx`,
      { method: 'GET', signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok) throw await apiError(response);
        return new Uint8Array(await response.arrayBuffer());
      })
      .then((bytes) => {
        if (controller.signal.aborted) return;
        setDocumentBytes(bytes);
        setVersion((current) => current + 1);
        setStatus(readOnly ? 'Final DOCX loaded.' : 'Editable generated DOCX loaded.');
      })
      .catch((caught) => {
        if (controller.signal.aborted) return;
        const message = caught instanceof Error ? caught.message : 'Could not load generated DOCX.';
        setError(message);
        setStatus(message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [documentId, readOnly]);

  useEffect(() => {
    if (!dirty || readOnly) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [dirty, readOnly]);

  const save = useCallback(async () => {
    if (readOnly || disabled || saving) return;
    const editor = editorRef.current;
    if (!editor) {
      setError('OakDoc editor is not ready.');
      return;
    }

    setSaving(true);
    setError(null);
    setStatus('Saving generated DOCX…');
    try {
      const buffer = await editor.save();
      if (!buffer) throw new Error('OakDoc did not return a DOCX file.');
      const bytes = toUint8Array(buffer);
      const response = await fetch(
        `/api/generated-documents/${encodeURIComponent(documentId)}?format=docx&expectedRevision=${revision}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          },
          body: exactArrayBuffer(bytes),
        },
      );
      if (!response.ok) throw await apiError(response);
      const result = await response.json() as SaveResult;
      setDirty(false);
      setStatus('Generated DOCX saved.');
      onSaved?.(result);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Could not save generated DOCX.';
      setError(message);
      setStatus(message);
    } finally {
      setSaving(false);
    }
  }, [disabled, documentId, onSaved, readOnly, revision, saving]);

  if (loading && !documentBytes) {
    return (
      <div className="flex h-full items-center justify-center gap-2 bg-background-secondary text-sm text-text-secondary">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Loading generated DOCX…
      </div>
    );
  }

  if (error && !documentBytes) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <p className="max-w-lg text-sm text-status-error">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background-secondary">
      <div className="flex min-h-10 items-center justify-between gap-3 border-b border-border-primary bg-background-primary px-3 py-1.5">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-text-primary">
            Word · OakDoc {readOnly ? 'final document' : 'editable generated document'}
          </p>
          <p className={cn(
            'truncate text-[11px]',
            error ? 'text-status-error' : dirty ? 'text-status-warning' : 'text-text-muted',
          )}>
            {dirty ? 'Unsaved DOCX edits' : status}
          </p>
        </div>
        {!readOnly && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void save()}
            disabled={disabled || saving || !dirty}
            leftIcon={
              saving
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                : dirty
                  ? <Save className="h-3.5 w-3.5" aria-hidden="true" />
                  : <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            }
          >
            {saving ? 'Saving…' : dirty ? 'Save DOCX' : 'Saved'}
          </Button>
        )}
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden bg-[#eef0f2]">
        {documentBytes && (
          <DocxEditor
            key={version}
            ref={editorRef}
            document={documentBytes}
            title={title}
            mode={readOnly ? 'view' : 'edit'}
            zoomMode="auto"
            locale="en-SG"
            colorMode="light"
            menu={{ reportIssue: false }}
            onSave={() => void save()}
            onReady={() => {
              readyRef.current = true;
              if (!dirty) {
                setStatus(readOnly ? 'Final DOCX loaded.' : 'Editable generated DOCX loaded.');
              }
            }}
            onChange={() => {
              if (!readOnly && readyRef.current) {
                setDirty(true);
                setStatus('Document changed.');
              }
            }}
            className="h-full min-h-0"
          />
        )}
      </div>
    </div>
  );
}
