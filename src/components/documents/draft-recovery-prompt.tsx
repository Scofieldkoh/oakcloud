'use client';

import { useState, useEffect } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { AlertCircle, Clock, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';

// ============================================================================
// Types
// ============================================================================

export interface DraftData {
  content: string;
  contentJson?: Record<string, unknown> | null;
  savedAt: string;
}

export interface DraftRecoveryData {
  draft: DraftData | null;
  document: {
    content: string;
    contentJson?: Record<string, unknown> | null;
    updatedAt: string;
  };
  hasDifferentContent: boolean;
}

export interface DraftRecoveryPromptProps {
  documentId: string;
  onRecover: (content: string, contentJson?: Record<string, unknown> | null) => void;
  onDiscard: () => void;
  onError?: (error: string) => void;
  showBanner?: boolean; // Show as banner instead of modal
  className?: string;
}

// ============================================================================
// Hook for Draft Recovery
// ============================================================================

export function useDraftRecovery(documentId: string) {
  const [isLoading, setIsLoading] = useState(true);
  const [draftData, setDraftData] = useState<DraftRecoveryData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkForDraft = async () => {
      if (!documentId) {
        setIsLoading(false);
        return;
      }

      try {
        const response = await fetch(`/api/generated-documents/${documentId}/draft`);

        if (!response.ok) {
          if (response.status === 404) {
            setDraftData(null);
            return;
          }
          const data = await response.json();
          throw new Error(data.error || 'Failed to check for drafts');
        }

        const data = await response.json();
        setDraftData(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setIsLoading(false);
      }
    };

    checkForDraft();
  }, [documentId]);

  const discardDraft = async () => {
    try {
      const response = await fetch(`/api/generated-documents/${documentId}/draft`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to discard draft');
      }

      setDraftData(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
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

// ============================================================================
// Banner Component
// ============================================================================

interface DraftRecoveryBannerProps {
  draft: DraftData;
  onRecover: () => void;
  onDiscard: () => void;
  isDiscarding?: boolean;
}

function DraftRecoveryBanner({
  draft,
  onRecover,
  onDiscard,
  isDiscarding,
}: DraftRecoveryBannerProps) {
  const savedAgo = formatDistanceToNow(new Date(draft.savedAt), { addSuffix: true });

  return (
    <div className="flex items-center justify-between p-3 bg-status-warning/10 border border-status-warning/20 rounded-md mb-4">
      <div className="flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-status-warning shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-text-primary">Unsaved changes found</p>
          <p className="text-xs text-text-muted mt-0.5">
            <Clock className="w-3 h-3 inline-block mr-1" />
            Draft saved {savedAgo}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onDiscard}
          disabled={isDiscarding}
        >
          {isDiscarding ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Discard'}
        </Button>
        <Button variant="primary" size="sm" onClick={onRecover}>
          Recover
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// Modal Component
// ============================================================================

interface DraftRecoveryModalProps {
  isOpen: boolean;
  draft: DraftData;
  onRecover: () => void;
  onDiscard: () => void;
  onClose: () => void;
  isDiscarding?: boolean;
}

function DraftRecoveryModal({
  isOpen,
  draft,
  onRecover,
  onDiscard,
  onClose,
  isDiscarding,
}: DraftRecoveryModalProps) {
  const savedAgo = formatDistanceToNow(new Date(draft.savedAt), { addSuffix: true });

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Recover Unsaved Changes?">
      <div className="space-y-4">
        <div className="flex items-start gap-3 p-4 bg-background-secondary rounded-md">
          <FileText className="w-8 h-8 text-accent-primary shrink-0" />
          <div>
            <p className="text-sm text-text-primary">
              We found an auto-saved draft from your previous editing session.
            </p>
            <p className="text-xs text-text-muted mt-1">
              <Clock className="w-3 h-3 inline-block mr-1" />
              Last saved {savedAgo}
            </p>
          </div>
        </div>

        <div className="text-sm text-text-secondary">
          <p className="font-medium mb-2">What would you like to do?</p>
          <ul className="space-y-1 text-xs text-text-muted">
            <li>
              <strong className="text-text-primary">Recover:</strong> Restore your unsaved changes
            </li>
            <li>
              <strong className="text-text-primary">Discard:</strong> Start fresh with the last saved version
            </li>
          </ul>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border-primary">
          <Button
            variant="ghost"
            size="sm"
            onClick={onDiscard}
            disabled={isDiscarding}
          >
            {isDiscarding ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
            Discard Draft
          </Button>
          <Button variant="primary" size="sm" onClick={onRecover}>
            Recover Changes
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function DraftRecoveryPrompt({
  documentId,
  onRecover,
  onDiscard,
  onError,
  showBanner = false,
  className = '',
}: DraftRecoveryPromptProps) {
  const [isDiscarding, setIsDiscarding] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const { isLoading, hasDraft, draftData, error, discardDraft } = useDraftRecovery(documentId);

  useEffect(() => {
    if (error) {
      onError?.(error);
    }
  }, [error, onError]);

  if (isLoading || !hasDraft || dismissed || !draftData?.draft) {
    return null;
  }

  const handleRecover = () => {
    if (draftData.draft) {
      onRecover(draftData.draft.content, draftData.draft.contentJson);
      setDismissed(true);
    }
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

  if (showBanner) {
    return (
      <div className={className}>
        <DraftRecoveryBanner
          draft={draftData.draft}
          onRecover={handleRecover}
          onDiscard={handleDiscard}
          isDiscarding={isDiscarding}
        />
      </div>
    );
  }

  return (
    <DraftRecoveryModal
      isOpen={!dismissed}
      draft={draftData.draft}
      onRecover={handleRecover}
      onDiscard={handleDiscard}
      onClose={() => setDismissed(true)}
      isDiscarding={isDiscarding}
    />
  );
}

// ============================================================================
// Auto-Save Indicator Component
// ============================================================================

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
        <AlertCircle className="w-3.5 h-3.5" />
        <span className="text-xs">Failed to save</span>
      </div>
    );
  }

  if (isSaving) {
    return (
      <div className={`flex items-center gap-1.5 text-text-muted ${className}`}>
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        <span className="text-xs">Saving...</span>
      </div>
    );
  }

  if (lastSaved) {
    const savedAgo = formatDistanceToNow(lastSaved, { addSuffix: true });
    return (
      <div className={`flex items-center gap-1.5 text-text-muted ${className}`}>
        <Clock className="w-3.5 h-3.5" />
        <span className="text-xs">Saved {savedAgo}</span>
      </div>
    );
  }

  return null;
}

export default DraftRecoveryPrompt;
