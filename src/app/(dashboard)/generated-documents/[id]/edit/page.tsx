'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  Save,
  Eye,
  EyeOff,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useActiveTenantId, useTenantSelection } from '@/components/ui/tenant-selector';
import { cn } from '@/lib/utils';
import { useSession } from '@/hooks/use-auth';
import { A4PageEditor, type A4PageEditorRef } from '@/components/documents/a4-page-editor';
import { DraftRecoveryPrompt } from '@/components/documents/draft-recovery-prompt';

// ============================================================================
// Types
// ============================================================================

interface GeneratedDocument {
  id: string;
  title: string;
  status: 'DRAFT' | 'FINALIZED' | 'ARCHIVED';
  content: string;
  contentJson?: Record<string, unknown> | null;
  useLetterhead: boolean;
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

interface Draft {
  id: string;
  content: string;
  createdAt: string;
}

// ============================================================================
// Main Page Component
// ============================================================================

export default function DocumentEditPage() {
  const router = useRouter();
  const params = useParams();
  const documentId = params.id as string;
  const { success, error: toastError } = useToast();
  const editorRef = useRef<A4PageEditorRef>(null);
  const { data: session } = useSession();

  // Tenant selection for SUPER_ADMIN
  const { selectedTenantId } = useTenantSelection();
  const activeTenantId = useActiveTenantId(
    session?.isSuperAdmin ?? false,
    session?.tenantId
  );

  // State
  const [document, setDocument] = useState<GeneratedDocument | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [includeLetterhead, setIncludeLetterhead] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentContent, setCurrentContent] = useState<string>('');

  // Draft recovery
  const [draft, setDraft] = useState<Draft | null>(null);
  const [showDraftPrompt, setShowDraftPrompt] = useState(false);

  // Fetch document and check for drafts
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Build URL with tenantId for SUPER_ADMIN
        const urlParams = new URLSearchParams();
        if (session?.isSuperAdmin && activeTenantId) {
          urlParams.set('tenantId', activeTenantId);
        }
        const queryString = urlParams.toString();
        const docUrl = `/api/generated-documents/${documentId}${queryString ? `?${queryString}` : ''}`;
        const draftUrl = `/api/generated-documents/${documentId}/draft${queryString ? `?${queryString}` : ''}`;

        // Fetch document and draft in parallel
        const [docResponse, draftResponse] = await Promise.all([
          fetch(docUrl),
          fetch(draftUrl),
        ]);

        if (!docResponse.ok) {
          if (docResponse.status === 404) {
            throw new Error('Document not found');
          }
          throw new Error('Failed to fetch document');
        }

        const docData = await docResponse.json();

        // Check if document is editable
        if (docData.status !== 'DRAFT') {
          router.replace(`/generated-documents/${documentId}`);
          return;
        }

        setDocument(docData);
        setCurrentContent(docData.content);
        setIncludeLetterhead(docData.useLetterhead);

        // Check for unsaved draft
        if (draftResponse.ok) {
          const draftData = await draftResponse.json();
          if (draftData && draftData.content !== docData.content) {
            setDraft(draftData);
            setShowDraftPrompt(true);
          }
        }
      } catch (err) {
        console.error('Fetch error:', err);
        setError(err instanceof Error ? err.message : 'Failed to load document');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [documentId, router, session?.isSuperAdmin, activeTenantId]);

  // Handle content change
  const handleContentChange = useCallback((html: string) => {
    setHasUnsavedChanges(true);
    setCurrentContent(html);
  }, []);

  // Handle auto-save
  const handleAutoSave = useCallback(
    async (html: string) => {
      try {
        const body: Record<string, unknown> = { content: html };
        if (session?.isSuperAdmin && activeTenantId) {
          body.tenantId = activeTenantId;
        }
        await fetch(`/api/generated-documents/${documentId}/draft`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } catch (err) {
        console.error('Auto-save error:', err);
      }
    },
    [documentId, session?.isSuperAdmin, activeTenantId]
  );

  // Handle save
  const handleSave = useCallback(async () => {
    if (!editorRef.current) return;

    const html = editorRef.current.getContent();
    setIsSaving(true);

    try {
      const body: Record<string, unknown> = {
        content: html,
        useLetterhead: includeLetterhead,
      };
      if (session?.isSuperAdmin && activeTenantId) {
        body.tenantId = activeTenantId;
      }

      const response = await fetch(`/api/generated-documents/${documentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error('Failed to save document');
      }

      const updated = await response.json();
      setDocument(updated);
      setHasUnsavedChanges(false);
      setLastSaved(new Date());

      // Clean up drafts
      const deleteParams = new URLSearchParams();
      if (session?.isSuperAdmin && activeTenantId) {
        deleteParams.set('tenantId', activeTenantId);
      }
      await fetch(`/api/generated-documents/${documentId}/draft${deleteParams.toString() ? `?${deleteParams}` : ''}`, {
        method: 'DELETE',
      });

      success('Document saved');
    } catch (err) {
      console.error('Save error:', err);
      toastError('Failed to save document');
    } finally {
      setIsSaving(false);
    }
  }, [documentId, includeLetterhead, success, toastError, session?.isSuperAdmin, activeTenantId]);

  // Handle draft recovery
  const handleRecoverDraft = useCallback(() => {
    if (draft && editorRef.current) {
      editorRef.current.setContent(draft.content);
      setCurrentContent(draft.content);
      setHasUnsavedChanges(true);
    }
    setShowDraftPrompt(false);
  }, [draft]);

  const handleDiscardDraft = useCallback(async () => {
    try {
      const deleteParams = new URLSearchParams();
      if (session?.isSuperAdmin && activeTenantId) {
        deleteParams.set('tenantId', activeTenantId);
      }
      await fetch(`/api/generated-documents/${documentId}/draft${deleteParams.toString() ? `?${deleteParams}` : ''}`, {
        method: 'DELETE',
      });
    } catch (err) {
      console.error('Discard draft error:', err);
    }
    setShowDraftPrompt(false);
  }, [documentId, session?.isSuperAdmin, activeTenantId]);

  // Warn before leaving with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSave]);

  // Loading state
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

  // Error state
  if (error || !document) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md w-full p-6 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg text-center">
          <AlertCircle className="w-12 h-12 mx-auto text-red-500 mb-4" />
          <h3 className="text-lg font-medium text-red-700 dark:text-red-400 mb-2">
            {error || 'Document not found'}
          </h3>
          <Link href="/generated-documents">
            <Button variant="secondary">Back to Documents</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'h-screen flex flex-col bg-background-primary',
        isFullscreen && 'fixed inset-0 z-50'
      )}
    >
      {/* Header */}
      <div className="flex-shrink-0 border-b border-border-primary bg-background-secondary">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            {/* Left section */}
            <div className="flex items-center gap-4 min-w-0">
              <Link href={`/generated-documents/${document.id}`}>
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
              </Link>
              <div className="h-6 w-px bg-border-secondary" />
              <div className="min-w-0">
                <h1 className="text-lg font-semibold text-text-primary truncate">
                  {document.title}
                </h1>
                <div className="flex items-center gap-2 text-xs text-text-muted">
                  {document.template && (
                    <span>Template: {document.template.name}</span>
                  )}
                  {lastSaved && (
                    <>
                      <span>•</span>
                      <span>Last saved: {lastSaved.toLocaleTimeString()}</span>
                    </>
                  )}
                  {hasUnsavedChanges && (
                    <span className="text-amber-600">• Unsaved changes</span>
                  )}
                </div>
              </div>
            </div>

            {/* Right section */}
            <div className="flex items-center gap-2">
              {/* Letterhead toggle */}
              <button
                type="button"
                onClick={() => setIncludeLetterhead(!includeLetterhead)}
                className={cn(
                  'flex items-center gap-1.5 px-2 py-1 rounded text-sm transition-colors',
                  includeLetterhead
                    ? 'bg-accent-primary/10 text-accent-primary'
                    : 'bg-background-tertiary text-text-muted hover:text-text-primary'
                )}
                title={includeLetterhead ? 'Hide letterhead' : 'Show letterhead'}
              >
                {includeLetterhead ? (
                  <Eye className="w-3.5 h-3.5" />
                ) : (
                  <EyeOff className="w-3.5 h-3.5" />
                )}
                <span className="hidden sm:inline">Letterhead</span>
              </button>

              {/* Fullscreen toggle */}
              <button
                type="button"
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="p-1.5 rounded bg-background-tertiary text-text-muted hover:text-text-primary transition-colors"
                title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              >
                {isFullscreen ? (
                  <Minimize2 className="w-4 h-4" />
                ) : (
                  <Maximize2 className="w-4 h-4" />
                )}
              </button>

              <div className="w-px h-6 bg-border-secondary mx-1" />

              {/* Save button */}
              <Button
                variant="primary"
                size="sm"
                onClick={handleSave}
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

      {/* Main content - A4PageEditor */}
      <div className="flex-1 overflow-hidden">
        <A4PageEditor
          ref={editorRef}
          value={currentContent}
          onChange={handleContentChange}
        />
      </div>

      {/* Draft recovery prompt */}
      {showDraftPrompt && draft && (
        <DraftRecoveryPrompt
          documentId={documentId}
          onRecover={(content) => {
            if (editorRef.current) {
              editorRef.current.setContent(content);
              setCurrentContent(content);
              setHasUnsavedChanges(true);
            }
            setShowDraftPrompt(false);
          }}
          onDiscard={() => setShowDraftPrompt(false)}
          showBanner
        />
      )}
    </div>
  );
}
