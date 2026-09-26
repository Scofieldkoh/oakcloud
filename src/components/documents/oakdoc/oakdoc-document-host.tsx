'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { DocxEditor, type DocxEditorRef } from '@docx-editor.dev/react';
import { CheckCircle2, Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { OakDocSnapshotIdentity } from '@/types/oakdoc';
import { OakDocEditorSession } from './oakdoc-editor-session';
import { useOakDocSectionDeleteGuard } from './use-oakdoc-section-delete-guard';

export interface OakDocPersistResult {
  revision: number;
}

export interface OakDocDocumentHostProps {
  /** Identity of the loaded entity; changing it loads a new session. */
  entityKey: string;
  /** Persisted revision the loaded bytes belong to. */
  baseRevision: number;
  title: string;
  readOnly: boolean;
  disabled?: boolean;
  /** Short description shown in the header, e.g. "editable generated document". */
  description: string;
  loadingLabel: string;
  load: (signal: AbortSignal) => Promise<Uint8Array>;
  /**
   * Route-specific persistence adapter. `operationId` is reused when an
   * ambiguous failure is retried for the same local revision.
   */
  persist: (
    bytes: Uint8Array,
    snapshot: OakDocSnapshotIdentity,
    operationId: string,
  ) => Promise<OakDocPersistResult>;
  onDirtyChange?: (dirty: boolean) => void;
  onSaved?: (result: OakDocPersistResult) => void;
}

function newOperationId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * The single native editor host for generated drafts and batch review.
 *
 * Save acknowledges only the submitted snapshot: edits made while a save is
 * in flight stay visible and dirty, the editor is never reloaded with the
 * submitted bytes, and responses from a previous entity/session are ignored.
 */
export function OakDocDocumentHost({
  entityKey,
  baseRevision,
  title,
  readOnly,
  disabled = false,
  description,
  loadingLabel,
  load,
  persist,
  onDirtyChange,
  onSaved,
}: OakDocDocumentHostProps) {
  const editorRef = useRef<DocxEditorRef>(null);
  const readyRef = useRef(false);
  const sessionRef = useRef<OakDocEditorSession>(new OakDocEditorSession(baseRevision));
  const pendingOperationRef = useRef<{ operationId: string; localRevision: number; sessionKey: string } | null>(null);
  const baseRevisionRef = useRef(baseRevision);
  const loadRef = useRef(load);
  const onDirtyChangeRef = useRef(onDirtyChange);
  const [documentBytes, setDocumentBytes] = useState<Uint8Array | null>(null);
  const [version, setVersion] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(loadingLabel);
  const [error, setError] = useState<string | null>(null);

  loadRef.current = load;
  onDirtyChangeRef.current = onDirtyChange;
  baseRevisionRef.current = baseRevision;

  const publishDirty = useCallback(() => {
    const next = sessionRef.current.dirty;
    setDirty(next);
    onDirtyChangeRef.current?.(next);
  }, []);

  // Load only when the entity (or view mode) changes. A refetch of the same
  // entity at a newer revision never replaces local content.
  useEffect(() => {
    const controller = new AbortController();
    readyRef.current = false;
    sessionRef.current.reset(baseRevisionRef.current);
    pendingOperationRef.current = null;
    publishDirty();
    setLoading(true);
    setError(null);
    setStatus(loadingLabel);

    void loadRef.current(controller.signal)
      .then((bytes) => {
        if (controller.signal.aborted) return;
        setDocumentBytes(bytes);
        setVersion((current) => current + 1);
      })
      .catch((caught) => {
        if (controller.signal.aborted) return;
        const message = caught instanceof Error ? caught.message : 'Could not load the Word document.';
        setError(message);
        setStatus(message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [entityKey, loadingLabel, publishDirty, readOnly]);

  useEffect(() => {
    if (!dirty || readOnly) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [dirty, readOnly]);

  const markChanged = useCallback(() => {
    sessionRef.current.markChanged();
    publishDirty();
    setStatus('Document changed.');
  }, [publishDirty]);

  const replaceMountedDocument = useCallback((bytes: Uint8Array, message: string) => {
    readyRef.current = false;
    setDocumentBytes(bytes);
    setVersion((current) => current + 1);
    setStatus(message);
  }, []);

  const handleKeyDownCapture = useOakDocSectionDeleteGuard({
    editorRef,
    documentBytes,
    disabled: readOnly || disabled || busy,
    onRepaired: replaceMountedDocument,
    onChanged: markChanged,
    onBusyChange: setBusy,
    onError: (message) => {
      setError(message);
      setStatus(message);
    },
  });

  const save = useCallback(async () => {
    if (readOnly || disabled || saving) return;
    const editor = editorRef.current;
    if (!editor) {
      setError('OakDoc editor is not ready.');
      return;
    }

    const session = sessionRef.current;
    // Capture identity before serialization; any change during save()
    // increments localRevision beyond this snapshot and stays dirty.
    const snapshot = session.snapshot();
    const pending = pendingOperationRef.current;
    const operationId = pending
      && pending.sessionKey === snapshot.sessionKey
      && pending.localRevision === snapshot.localRevision
      ? pending.operationId
      : newOperationId();
    pendingOperationRef.current = {
      operationId,
      localRevision: snapshot.localRevision,
      sessionKey: snapshot.sessionKey,
    };

    setSaving(true);
    setError(null);
    setStatus('Saving Word document…');
    try {
      const buffer = await editor.save();
      if (!buffer) throw new Error('OakDoc did not return a DOCX file.');
      const result = await persist(new Uint8Array(buffer.slice(0)), snapshot, operationId);
      const outcome = session.acknowledge(snapshot, result.revision);
      if (outcome === 'stale') return;
      pendingOperationRef.current = null;
      publishDirty();
      setStatus(outcome === 'clean' ? 'Word document saved.' : 'Saved. Newer edits are not saved yet.');
      onSaved?.(result);
    } catch (caught) {
      if (!session.isCurrent(snapshot)) return;
      const message = caught instanceof Error ? caught.message : 'Could not save the Word document.';
      setError(message);
      setStatus(message);
    } finally {
      setSaving(false);
    }
  }, [disabled, onSaved, persist, publishDirty, readOnly, saving]);

  if (loading && !documentBytes) {
    return (
      <div className="flex h-full items-center justify-center gap-2 bg-background-secondary text-sm text-text-secondary">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        {loadingLabel}
      </div>
    );
  }

  if (error && !documentBytes) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <p role="alert" className="max-w-lg text-sm text-status-error">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background-secondary">
      <div className="flex min-h-10 items-center justify-between gap-3 border-b border-border-primary bg-background-primary px-3 py-1.5">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-text-primary">
            Word · OakDoc {description}
          </p>
          <p
            role="status"
            aria-live="polite"
            className={cn(
              'truncate text-[11px]',
              error ? 'text-status-error' : dirty ? 'text-status-warning' : 'text-text-muted',
            )}
          >
            {error ?? (dirty && !saving ? 'Unsaved Word edits' : status)}
          </p>
        </div>
        {!readOnly && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void save()}
            disabled={disabled || saving || busy || !dirty}
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

      <div
        className="relative min-h-0 flex-1 overflow-hidden bg-[#eef0f2]"
        onKeyDownCapture={handleKeyDownCapture}
      >
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
              if (!sessionRef.current.dirty) {
                setStatus(readOnly ? 'Final Word document loaded.' : 'Word document ready to edit.');
              }
            }}
            onChange={() => {
              if (!readOnly && readyRef.current) markChanged();
            }}
            className="h-full min-h-0"
          />
        )}
      </div>
    </div>
  );
}
