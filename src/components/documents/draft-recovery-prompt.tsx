'use client';

import { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { AlertCircle, Clock, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';

export interface DraftData {
  content: string;
  contentJson?: Record<string, unknown> | null;
  savedAt: string;
  baseRevision?: number;
  sessionKey?: string | null;
  writerInstanceId?: string | null;
  localSnapshotRevision?: number | null;
}

export interface DraftRecoveryData {
  draft: DraftData | null;
  document?: {
    content: string;
    contentJson?: Record<string, unknown> | null;
    updatedAt: string;
    revision?: number;
    status?: 'DRAFT' | 'FINALIZED' | 'ARCHIVED';
  };
  revision?: number;
  hasDifferentContent: boolean;
  recoveryState?: 'same-server-revision' | 'server-revision-changed';
}

export interface DraftRecoveryPromptProps {
  documentId: string;
  onRecover: (content: string, contentJson?: Record<string, unknown> | null) => void;
  onDiscard: () => void;
  onInspectNewerVersion?: () => void;
  onError?: (error: string) => void;
  showBanner?: boolean;
  className?: string;
}

export function useDraftRecovery(documentId: string) {
  const [isLoading, setIsLoading] = useState(true);
  const [draftData, setDraftData] = useState<DraftRecoveryData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const checkForDraft = async () => {
      if (!documentId) {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/generated-documents/${documentId}/draft`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          if (response.status === 404) {
            setDraftData(null);
            return;
          }
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || 'Failed to check for drafts');
        }
        setDraftData(await response.json());
      } catch (caught) {
        if (controller.signal.aborted) return;
        setError(caught instanceof Error ? caught.message : 'An error occurred');
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    };
    void checkForDraft();
    return () => controller.abort();
  }, [documentId]);

  const discardDraft = async () => {
    try {
      const response = await fetch(`/api/generated-documents/${documentId}/draft`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to discard draft');
      }
      setDraftData(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'An error occurred');
      throw caught;
    }
  };

  return {
    isLoading,
    hasDraft: draftData?.hasDifferentContent ?? false,
    draftData,
    error,
    discardDraft,
  };
}

interface RecoveryActionsProps {
  draft: DraftData;
  recoveryState?: DraftRecoveryData['recoveryState'];
  documentStatus?: DraftRecoveryData['document'] extends infer _T
    ? 'DRAFT' | 'FINALIZED' | 'ARCHIVED' | undefined
    : never;
  onRecover: () => void;
  onDiscard: () => void;
  onInspectNewerVersion?: () => void;
  isDiscarding?: boolean;
}

function RecoveryMessage({
  draft,
  recoveryState,
  documentStatus,
}: Pick<RecoveryActionsProps, 'draft' | 'recoveryState' | 'documentStatus'>) {
  const savedAgo = formatDistanceToNow(new Date(draft.savedAt), { addSuffix: true });
  const locked = documentStatus === 'FINALIZED' || documentStatus === 'ARCHIVED';
  return (
    <div>
      <p className="text-sm font-medium text-text-primary">
        {locked
          ? 'An older unsaved draft was found'
          : recoveryState === 'server-revision-changed'
            ? 'Draft found, but the saved document is newer'
            : 'Unsaved changes found'}
      </p>
      <p className="mt-0.5 text-xs text-text-muted">
        <Clock className="mr-1 inline-block h-3 w-3" />
        Draft saved {savedAgo}
        {draft.baseRevision !== undefined ? ` from revision ${draft.baseRevision}` : ''}
      </p>
      {locked && (
        <p className="mt-1 text-xs text-status-warning">
          This document is {documentStatus?.toLowerCase()}; draft restoration is disabled.
        </p>
      )}
      {!locked && recoveryState === 'server-revision-changed' && (
        <p className="mt-1 text-xs text-status-warning">
          Restoring loads the draft into the editor only for explicit reconciliation. It does not silently overwrite the newer saved revision.
        </p>
      )}
    </div>
  );
}

function RecoveryButtons({
  recoveryState,
  documentStatus,
  onRecover,
  onDiscard,
  onInspectNewerVersion,
  isDiscarding,
}: Omit<RecoveryActionsProps, 'draft'>) {
  const locked = documentStatus === 'FINALIZED' || documentStatus === 'ARCHIVED';
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {onInspectNewerVersion && recoveryState === 'server-revision-changed' && (
        <Button variant="secondary" size="sm" onClick={onInspectNewerVersion}>
          Inspect saved version
        </Button>
      )}
      <Button variant="ghost" size="sm" onClick={onDiscard} disabled={isDiscarding}>
        {isDiscarding ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Discard draft'}
      </Button>
      {!locked && (
        <Button variant="primary" size="sm" onClick={onRecover}>
          {recoveryState === 'server-revision-changed'
            ? 'Recover for reconciliation'
            : 'Recover'}
        </Button>
      )}
    </div>
  );
}

function DraftRecoveryBanner(props: RecoveryActionsProps) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4 rounded-md border border-status-warning/20 bg-status-warning/10 p-3">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-status-warning" />
        <RecoveryMessage
          draft={props.draft}
          recoveryState={props.recoveryState}
          documentStatus={props.documentStatus}
        />
      </div>
      <RecoveryButtons {...props} />
    </div>
  );
}

interface DraftRecoveryModalProps extends RecoveryActionsProps {
  isOpen: boolean;
  onClose: () => void;
}

function DraftRecoveryModal({ isOpen, onClose, ...props }: DraftRecoveryModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Recover Unsaved Changes?">
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-md bg-background-secondary p-4">
          <FileText className="h-8 w-8 shrink-0 text-accent-primary" />
          <RecoveryMessage
            draft={props.draft}
            recoveryState={props.recoveryState}
            documentStatus={props.documentStatus}
          />
        </div>
        <div className="text-xs text-text-muted">
          Discard keeps the current saved document. Recovery restores the autosaved content into this editing session and still requires an explicit save.
        </div>
        <div className="border-t border-border-primary pt-3">
          <RecoveryButtons {...props} />
        </div>
      </div>
    </Modal>
  );
}

export function DraftRecoveryPrompt({
  documentId,
  onRecover,
  onDiscard,
  onInspectNewerVersion,
  onError,
  showBanner = false,
  className = '',
}: DraftRecoveryPromptProps) {
  const [isDiscarding, setIsDiscarding] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const { isLoading, hasDraft, draftData, error, discardDraft } = useDraftRecovery(documentId);

  useEffect(() => {
    if (error) onError?.(error);
  }, [error, onError]);

  if (isLoading || !hasDraft || dismissed || !draftData?.draft) return null;

  const handleRecover = () => {
    onRecover(draftData.draft!.content, draftData.draft!.contentJson);
    setDismissed(true);
  };

  const handleDiscard = async () => {
    setIsDiscarding(true);
    try {
      await discardDraft();
      onDiscard();
      setDismissed(true);
    } finally {
      setIsDiscarding(false);
    }
  };

  const shared: RecoveryActionsProps = {
    draft: draftData.draft,
    recoveryState: draftData.recoveryState,
    documentStatus: draftData.document?.status,
    onRecover: handleRecover,
    onDiscard: () => { void handleDiscard(); },
    onInspectNewerVersion,
    isDiscarding,
  };

  if (showBanner) {
    return (
      <div className={className}>
        <DraftRecoveryBanner {...shared} />
      </div>
    );
  }

  return (
    <DraftRecoveryModal
      {...shared}
      isOpen={!dismissed}
      onClose={() => setDismissed(true)}
    />
  );
}

export interface AutoSaveIndicatorProps {
  lastSaved?: Date | null;
  isSaving?: boolean;
  error?: string | null;
  className?: string;
}

export function AutoSaveIndicator({
  lastSaved,
  isSaving,
  error,
  className = '',
}: AutoSaveIndicatorProps) {
  if (error) {
    return (
      <div className={`flex items-center gap-1.5 text-status-error ${className}`}>
        <AlertCircle className="h-3.5 w-3.5" />
        <span className="text-xs">Failed to save</span>
      </div>
    );
  }
  if (isSaving) {
    return (
      <div className={`flex items-center gap-1.5 text-text-muted ${className}`}>
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span className="text-xs">Saving...</span>
      </div>
    );
  }
  if (lastSaved) {
    const savedAgo = formatDistanceToNow(lastSaved, { addSuffix: true });
    return (
      <div className={`flex items-center gap-1.5 text-text-muted ${className}`}>
        <Clock className="h-3.5 w-3.5" />
        <span className="text-xs">Saved {savedAgo}</span>
      </div>
    );
  }
  return null;
}

export default DraftRecoveryPrompt;
