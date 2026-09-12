'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  Eye,
  EyeOff,
  Loader2,
  Maximize2,
  Minimize2,
  Save,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import {
  A4PageEditor,
  type A4PageEditorRef,
} from '@/components/documents/a4-page-editor';
import type { A4EditorSnapshot } from '@/components/documents/a4-pagination/editor-session';
import { extractA4DocumentLayout } from '@/components/documents/a4-pagination/layout';
import { DraftRecoveryPrompt } from '@/components/documents/draft-recovery-prompt';
import { useUnsavedNavigationGuard } from '@/hooks/use-unsaved-navigation-guard';
import {
  readTaskLaunchContext,
  withTaskLaunchContext,
} from '@/lib/task-launch-context';

interface GeneratedDocument {
  id: string;
  title: string;
  status: 'DRAFT' | 'FINALIZED' | 'ARCHIVED';
  content: string;
  contentJson?: Record<string, unknown> | null;
  useLetterhead: boolean;
  revision: number;
  template?: {
    id: string;
    name: string;
    category: string;
    placeholders?: Array<{
      key: string;
      label: string;
      category: string;
    }>;
  } | null;
}

interface ApiErrorPayload {
  error?: string;
  code?: string;
  details?: {
    currentRevision?: number;
  };
}

function createWriterInstanceId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `writer-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function DocumentEditPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const documentId = params.id as string;
  const taskContext = useMemo(
    () => readTaskLaunchContext(searchParams),
    [searchParams],
  );
  const documentHref = withTaskLaunchContext(
    `/generated-documents/${documentId}`,
    taskContext,
  );
  const returnHref = taskContext?.returnTo ?? '/generated-documents';
  const { success, error: toastError } = useToast();
  const editorRef = useRef<A4PageEditorRef>(null);
  const editorSessionKey = useMemo(
    () => `generated-document:${documentId}`,
    [documentId],
  );
  const writerInstanceIdRef = useRef<string | null>(null);
  if (writerInstanceIdRef.current === null) {
    writerInstanceIdRef.current = createWriterInstanceId();
  }

  const [document, setDocument] = useState<GeneratedDocument | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [lastDraftSaved, setLastDraftSaved] = useState<Date | null>(null);
  const [draftSaveError, setDraftSaveError] = useState<string | null>(null);
  const [includeLetterhead, setIncludeLetterhead] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentContent, setCurrentContent] = useState('');
  const [currentContentJson, setCurrentContentJson] = useState<Record<string, unknown>>({});
  const [latestSnapshot, setLatestSnapshot] = useState<A4EditorSnapshot | null>(null);

  const latestSnapshotRef = useRef<A4EditorSnapshot | null>(null);
  const serverRevisionRef = useRef<number | null>(null);
  const acknowledgedSnapshotRef = useRef<{
    sessionKey: string;
    revision: number;
    useLetterhead: boolean;
  } | null>(null);
  const includeLetterheadRef = useRef(includeLetterhead);
  includeLetterheadRef.current = includeLetterhead;
  const saveInFlightRef = useRef<Promise<void> | null>(null);

  const navigationGuard = useUnsavedNavigationGuard(hasUnsavedChanges, {
    description: 'You have unsaved document changes. Leave without saving them?',
  });

  const recomputeDirty = useCallback((snapshot: A4EditorSnapshot | null) => {
    const acknowledged = acknowledgedSnapshotRef.current;
    if (!snapshot || !acknowledged) return;
    setHasUnsavedChanges(
      snapshot.sessionKey !== acknowledged.sessionKey
      || snapshot.revision !== acknowledged.revision
      || includeLetterheadRef.current !== acknowledged.useLetterhead,
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/generated-documents/${documentId}`);
        if (!response.ok) {
          if (response.status === 404) throw new Error('Document not found');
          const payload = await response.json().catch(() => ({})) as ApiErrorPayload;
          throw new Error(payload.error || 'Failed to fetch document');
        }
        const data = await response.json() as GeneratedDocument;
        if (cancelled) return;
        if (data.status !== 'DRAFT') {
          router.replace(documentHref);
          return;
        }
        setDocument(data);
        setCurrentContent(data.content);
        setCurrentContentJson(data.contentJson ?? {});
        setIncludeLetterhead(data.useLetterhead);
        includeLetterheadRef.current = data.useLetterhead;
        serverRevisionRef.current = data.revision;
        acknowledgedSnapshotRef.current = null;
        latestSnapshotRef.current = null;
        setLatestSnapshot(null);
        setHasUnsavedChanges(false);
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : 'Failed to load document');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void fetchData();
    return () => { cancelled = true; };
  }, [documentHref, documentId, router]);

  const handleSnapshotChange = useCallback((snapshot: A4EditorSnapshot) => {
    latestSnapshotRef.current = snapshot;
    setLatestSnapshot(snapshot);
    setCurrentContent(snapshot.content);
    setCurrentContentJson(snapshot.contentJson);

    if (!acknowledgedSnapshotRef.current) {
      acknowledgedSnapshotRef.current = {
        sessionKey: snapshot.sessionKey,
        revision: snapshot.revision,
        useLetterhead: includeLetterheadRef.current,
      };
      setHasUnsavedChanges(false);
      return;
    }
    recomputeDirty(snapshot);
  }, [recomputeDirty]);

  const saveDraftSnapshot = useCallback(async (snapshot: A4EditorSnapshot) => {
    const baseRevision = serverRevisionRef.current;
    if (baseRevision === null) return;
    try {
      const response = await fetch(`/api/generated-documents/${documentId}/draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: snapshot.content,
          contentJson: snapshot.contentJson,
          baseRevision,
          metadata: {
            editorSessionKey: snapshot.sessionKey,
            writerInstanceId: writerInstanceIdRef.current,
            localSnapshotRevision: snapshot.revision,
          },
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as ApiErrorPayload;
        throw new Error(payload.error || 'Draft save failed');
      }
      const payload = await response.json() as { ignoredAsStale?: boolean; savedAt?: string };
      if (!payload.ignoredAsStale) {
        setLastDraftSaved(payload.savedAt ? new Date(payload.savedAt) : new Date());
      }
      setDraftSaveError(null);
    } catch (caught) {
      setDraftSaveError(caught instanceof Error ? caught.message : 'Draft save failed');
    }
  }, [documentId]);

  useEffect(() => {
    if (!latestSnapshot || !acknowledgedSnapshotRef.current) return;
    if (latestSnapshot.revision === acknowledgedSnapshotRef.current.revision) return;
    const timer = window.setTimeout(() => {
      void saveDraftSnapshot(latestSnapshot);
    }, 850);
    return () => window.clearTimeout(timer);
  }, [latestSnapshot, saveDraftSnapshot, document?.revision]);

  const discardCoveredDraft = useCallback(async (snapshot: A4EditorSnapshot) => {
    const query = new URLSearchParams({
      sessionKey: snapshot.sessionKey,
      writerInstanceId: writerInstanceIdRef.current ?? '',
      throughLocalSnapshotRevision: String(snapshot.revision),
    });
    try {
      await fetch(`/api/generated-documents/${documentId}/draft?${query.toString()}`, {
        method: 'DELETE',
      });
    } catch {
      // A canonical save remains successful even when draft cleanup must retry.
    }
  }, [documentId]);

  const handleSave = useCallback(async () => {
    if (saveInFlightRef.current) return saveInFlightRef.current;

    const run = async () => {
      const snapshotResult = editorRef.current?.prepareSnapshot();
      if (!snapshotResult?.ok) {
        const message = snapshotResult?.message
          ?? 'The editor is still reconciling input. Finish the current edit and try again.';
        setError(message);
        toastError(message);
        return;
      }
      const snapshot = snapshotResult.snapshot;
      const expectedRevision = serverRevisionRef.current;
      if (expectedRevision === null) return;
      const savedLetterhead = includeLetterheadRef.current;
      setIsSaving(true);
      setError(null);

      try {
        const response = await fetch(`/api/generated-documents/${documentId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: snapshot.content,
            contentJson: snapshot.contentJson,
            useLetterhead: savedLetterhead,
            expectedRevision,
          }),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({})) as ApiErrorPayload;
          const currentRevision = payload.details?.currentRevision;
          const suffix = currentRevision === undefined
            ? ''
            : ` Current server revision is ${currentRevision}.`;
          throw new Error(`${payload.error || 'Failed to save document'}${suffix}`);
        }

        const updated = await response.json() as GeneratedDocument;
        serverRevisionRef.current = updated.revision;
        setDocument((previous) => previous ? {
          ...previous,
          ...updated,
          // Keep the controlled editor view on the local snapshot; a newer
          // local edit may already exist while this response is in flight.
          content: previous.content,
          contentJson: previous.contentJson,
        } : updated);
        acknowledgedSnapshotRef.current = {
          sessionKey: snapshot.sessionKey,
          revision: snapshot.revision,
          useLetterhead: savedLetterhead,
        };
        setLastSaved(new Date());
        const currentSnapshot = latestSnapshotRef.current;
        recomputeDirty(currentSnapshot);
        await discardCoveredDraft(snapshot);
        success('Document saved');

        if (
          currentSnapshot
          && currentSnapshot.sessionKey === snapshot.sessionKey
          && currentSnapshot.revision > snapshot.revision
        ) {
          void saveDraftSnapshot(currentSnapshot);
        }
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : 'Failed to save document';
        setError(message);
        toastError(message);
      } finally {
        setIsSaving(false);
      }
    };

    const promise = run();
    saveInFlightRef.current = promise;
    try {
      await promise;
    } finally {
      saveInFlightRef.current = null;
    }
  }, [discardCoveredDraft, documentId, recomputeDirty, saveDraftSnapshot, success, toastError]);

  const handleLetterheadToggle = useCallback(() => {
    setIncludeLetterhead((previous) => {
      const next = !previous;
      includeLetterheadRef.current = next;
      const acknowledged = acknowledgedSnapshotRef.current;
      const snapshot = latestSnapshotRef.current;
      setHasUnsavedChanges(Boolean(
        acknowledged
        && snapshot
        && (
          snapshot.revision !== acknowledged.revision
          || snapshot.sessionKey !== acknowledged.sessionKey
          || next !== acknowledged.useLetterhead
        )
      ));
      return next;
    });
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void handleSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSave]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center">
          <Loader2 className="w-10 h-10 animate-spin text-accent-primary mb-4" />
          <p className="text-text-muted">Loading document...</p>
        </div>
      </div>
    );
  }

  if (error && !document) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md w-full p-6 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg text-center">
          <AlertCircle className="w-12 h-12 mx-auto text-red-500 mb-4" />
          <h3 className="text-lg font-medium text-red-700 dark:text-red-400 mb-4">
            {error}
          </h3>
          <Button variant="secondary" onClick={() => navigationGuard.requestNavigation(returnHref)}>
            Back to Documents
          </Button>
        </div>
        {navigationGuard.dialog}
      </div>
    );
  }

  if (!document) return null;

  return (
    <div className={cn(
      'h-screen flex flex-col bg-background-primary',
      isFullscreen && 'fixed inset-0 z-50',
    )}>
      <div className="flex-shrink-0 border-b border-border-primary bg-background-secondary">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-lg font-semibold text-text-primary truncate">
                {document.title}
              </h1>
              <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
                {document.template && <span>Template: {document.template.name}</span>}
                {lastSaved && <span>• Document saved {lastSaved.toLocaleTimeString()}</span>}
                {lastDraftSaved && hasUnsavedChanges && (
                  <span>• Draft saved {lastDraftSaved.toLocaleTimeString()}</span>
                )}
                {draftSaveError && <span className="text-status-error">• Draft not saved</span>}
                {hasUnsavedChanges && <span className="text-amber-600">• Unsaved changes</span>}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleLetterheadToggle}
                className={cn(
                  'flex items-center gap-1.5 px-2 py-1 rounded text-sm transition-colors',
                  includeLetterhead
                    ? 'bg-accent-primary/10 text-accent-primary'
                    : 'bg-background-tertiary text-text-muted hover:text-text-primary',
                )}
                title={includeLetterhead ? 'Hide letterhead' : 'Show letterhead'}
              >
                {includeLetterhead
                  ? <Eye className="w-3.5 h-3.5" />
                  : <EyeOff className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">Letterhead</span>
              </button>
              <button
                type="button"
                onClick={() => setIsFullscreen((value) => !value)}
                className="p-1.5 rounded bg-background-tertiary text-text-muted hover:text-text-primary transition-colors"
                title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              >
                {isFullscreen
                  ? <Minimize2 className="w-4 h-4" />
                  : <Maximize2 className="w-4 h-4" />}
              </button>
              <div className="w-px h-6 bg-border-secondary mx-1" />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigationGuard.requestNavigation(documentHref)}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => void handleSave()}
                disabled={isSaving || !hasUnsavedChanges}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Save
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex-shrink-0 px-4 py-2 bg-status-error/10 border-b border-status-error/30 text-sm text-status-error">
          {error}
        </div>
      )}

      <DraftRecoveryPrompt
        documentId={documentId}
        onRecover={(content, contentJson) => {
          setCurrentContent(content);
          setCurrentContentJson(contentJson ?? {});
          setHasUnsavedChanges(true);
        }}
        onDiscard={() => undefined}
        onError={(message) => setDraftSaveError(message)}
        showBanner
        className="px-4 pt-3"
      />

      <div className="flex-1 overflow-hidden">
        <A4PageEditor
          ref={editorRef}
          key={editorSessionKey}
          sessionKey={editorSessionKey}
          value={currentContent}
          contentJson={currentContentJson}
          onChange={setCurrentContent}
          onSnapshotChange={handleSnapshotChange}
          layout={extractA4DocumentLayout(currentContentJson)}
        />
      </div>
      {navigationGuard.dialog}
    </div>
  );
}
