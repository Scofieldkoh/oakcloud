'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  FileText,
  Download,
  Share2,
  Edit,
  Lock,
  Unlock,
  Archive,
  Clock,
  CheckCircle,
  Building2,
  Calendar,
  User,
  MoreVertical,
  Copy,
  Printer,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/modal';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { SectionNavigator, type DocumentSection } from '@/components/documents/section-navigator';
import { PDFPreviewPanel } from '@/components/documents/pdf-preview-panel';
import { RenderContentWithPageBreaks } from '@/components/documents/page-break-indicator';

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
  shareExpiryHours?: number | null;
  createdAt: string;
  updatedAt: string;
  finalizedAt?: string | null;
  template?: {
    id: string;
    name: string;
    category: string;
  } | null;
  company?: {
    id: string;
    name: string;
    uen: string;
  } | null;
  createdBy: {
    id: string;
    firstName: string;
    lastName: string;
  };
  finalizedBy?: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
  _count?: {
    shares: number;
    comments: number;
  };
}

// ============================================================================
// Status Badge Component
// ============================================================================

function StatusBadge({ status }: { status: string }) {
  const config = {
    DRAFT: {
      icon: Clock,
      label: 'Draft',
      className: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
    },
    FINALIZED: {
      icon: CheckCircle,
      label: 'Finalized',
      className: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400',
    },
    ARCHIVED: {
      icon: Archive,
      label: 'Archived',
      className: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    },
  }[status] || {
    icon: FileText,
    label: status,
    className: 'bg-gray-100 text-gray-600',
  };

  const Icon = config.icon;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium',
        config.className
      )}
    >
      <Icon className="w-4 h-4" />
      {config.label}
    </span>
  );
}

// ============================================================================
// Main Page Component
// ============================================================================

export default function DocumentViewPage() {
  const router = useRouter();
  const params = useParams();
  const documentId = params.id as string;
  const { success, error: toastError } = useToast();

  // State
  const [document, setDocument] = useState<GeneratedDocument | null>(null);
  const [sections, setSections] = useState<DocumentSection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<string | undefined>();
  const [showPreview, setShowPreview] = useState(false);
  const [includeLetterhead, setIncludeLetterhead] = useState(true);

  // Dialogs
  const [finalizeDialogOpen, setFinalizeDialogOpen] = useState(false);
  const [unfinalizeDialogOpen, setUnfinalizeDialogOpen] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Fetch document
  useEffect(() => {
    const fetchDocument = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/generated-documents/${documentId}`);
        if (!response.ok) {
          if (response.status === 404) {
            throw new Error('Document not found');
          }
          throw new Error('Failed to fetch document');
        }

        const data = await response.json();
        setDocument(data);
        setIncludeLetterhead(data.useLetterhead);

        // Extract sections from content
        const extractedSections = extractSectionsFromContent(data.content);
        setSections(extractedSections);
      } catch (err) {
        console.error('Fetch error:', err);
        setError(err instanceof Error ? err.message : 'Failed to load document');
      } finally {
        setIsLoading(false);
      }
    };

    fetchDocument();
  }, [documentId]);

  // Extract sections from HTML content
  const extractSectionsFromContent = (content: string): DocumentSection[] => {
    const sections: DocumentSection[] = [];
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, 'text/html');

    // Find all headings
    const headings = doc.querySelectorAll('h1, h2, h3, h4, h5, h6');
    headings.forEach((heading, index) => {
      const level = parseInt(heading.tagName.charAt(1));
      const text = heading.textContent?.trim() || `Section ${index + 1}`;
      const anchor =
        heading.id ||
        `section-${text.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

      // Check for page break before this heading
      const prevSibling = heading.previousElementSibling;
      const hasPageBreakBefore = prevSibling?.classList.contains('page-break');

      sections.push({
        id: `section-${index}`,
        title: text,
        anchor,
        level,
        order: index,
        pageBreakBefore: hasPageBreakBefore || false,
      });
    });

    return sections;
  };

  // Handle finalize
  const handleFinalize = async () => {
    setIsProcessing(true);
    try {
      const response = await fetch(
        `/api/generated-documents/${documentId}/finalize`,
        { method: 'POST' }
      );

      if (!response.ok) {
        throw new Error('Failed to finalize document');
      }

      const updated = await response.json();
      setDocument(updated);
      success('Document finalized successfully');
    } catch (err) {
      console.error('Finalize error:', err);
      toastError('Failed to finalize document');
    } finally {
      setIsProcessing(false);
      setFinalizeDialogOpen(false);
    }
  };

  // Handle unfinalize
  const handleUnfinalize = async () => {
    setIsProcessing(true);
    try {
      const response = await fetch(
        `/api/generated-documents/${documentId}/finalize`,
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: 'User requested to edit document' }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to unfinalize document');
      }

      const updated = await response.json();
      setDocument(updated);
      success('Document unlocked for editing');
    } catch (err) {
      console.error('Unfinalize error:', err);
      toastError('Failed to unlock document');
    } finally {
      setIsProcessing(false);
      setUnfinalizeDialogOpen(false);
    }
  };

  // Handle archive
  const handleArchive = async () => {
    setIsProcessing(true);
    try {
      const response = await fetch(`/api/generated-documents/${documentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ARCHIVED' }),
      });

      if (!response.ok) {
        throw new Error('Failed to archive document');
      }

      const updated = await response.json();
      setDocument(updated);
      success('Document archived');
    } catch (err) {
      console.error('Archive error:', err);
      toastError('Failed to archive document');
    } finally {
      setIsProcessing(false);
      setArchiveDialogOpen(false);
    }
  };

  // Handle export
  const handleExport = async () => {
    try {
      const response = await fetch(
        `/api/generated-documents/${documentId}/export/pdf?letterhead=${includeLetterhead}`
      );

      if (!response.ok) {
        throw new Error('Failed to export document');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${document?.title || 'document'}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export error:', err);
      toastError('Failed to export document');
    }
  };

  // Handle print
  const handlePrint = () => {
    window.print();
  };

  // Handle clone
  const handleClone = async () => {
    try {
      const response = await fetch(
        `/api/generated-documents/${documentId}/clone`,
        { method: 'POST' }
      );

      if (!response.ok) {
        throw new Error('Failed to clone document');
      }

      const cloned = await response.json();
      success('Document cloned successfully');
      router.push(`/generated-documents/${cloned.id}/edit`);
    } catch (err) {
      console.error('Clone error:', err);
      toastError('Failed to clone document');
    }
  };

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
    <div className="min-h-screen bg-background-primary">
      {/* Header */}
      <div className="border-b border-border-primary bg-background-secondary sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 min-w-0">
              <Link href="/generated-documents">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
              </Link>
              <div className="h-6 w-px bg-border-secondary" />
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <h1 className="text-xl font-semibold text-text-primary truncate">
                    {document.title}
                  </h1>
                  <StatusBadge status={document.status} />
                </div>
                {document.template && (
                  <p className="text-sm text-text-muted">
                    From: {document.template.name}
                  </p>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              {/* Letterhead toggle */}
              <button
                type="button"
                onClick={() => setIncludeLetterhead(!includeLetterhead)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors',
                  includeLetterhead
                    ? 'bg-accent-primary/10 text-accent-primary'
                    : 'bg-background-tertiary text-text-muted hover:text-text-primary'
                )}
                title={includeLetterhead ? 'Hide letterhead' : 'Show letterhead'}
              >
                {includeLetterhead ? (
                  <Eye className="w-4 h-4" />
                ) : (
                  <EyeOff className="w-4 h-4" />
                )}
                Letterhead
              </button>

              <div className="w-px h-6 bg-border-secondary" />

              {/* Edit (only for drafts) */}
              {document.status === 'DRAFT' && (
                <Link href={`/generated-documents/${document.id}/edit`}>
                  <Button variant="secondary" size="sm">
                    <Edit className="w-4 h-4 mr-2" />
                    Edit
                  </Button>
                </Link>
              )}

              {/* Finalize/Unfinalize */}
              {document.status === 'DRAFT' && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setFinalizeDialogOpen(true)}
                >
                  <Lock className="w-4 h-4 mr-2" />
                  Finalize
                </Button>
              )}
              {document.status === 'FINALIZED' && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setUnfinalizeDialogOpen(true)}
                >
                  <Unlock className="w-4 h-4 mr-2" />
                  Unlock
                </Button>
              )}

              {/* Export */}
              <Button variant="secondary" size="sm" onClick={handleExport}>
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>

              {/* Share */}
              <Link href={`/generated-documents/${document.id}/share`}>
                <Button variant="secondary" size="sm">
                  <Share2 className="w-4 h-4 mr-2" />
                  Share
                </Button>
              </Link>

              {/* More actions */}
              <div className="relative group">
                <Button variant="ghost" size="sm">
                  <MoreVertical className="w-4 h-4" />
                </Button>
                <div className="absolute right-0 top-full mt-1 w-40 py-1 bg-background-elevated border border-border-primary rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20">
                  <button
                    type="button"
                    onClick={handlePrint}
                    className="w-full px-3 py-1.5 text-left text-sm hover:bg-background-secondary flex items-center gap-2"
                  >
                    <Printer className="w-4 h-4" />
                    Print
                  </button>
                  <button
                    type="button"
                    onClick={handleClone}
                    className="w-full px-3 py-1.5 text-left text-sm hover:bg-background-secondary flex items-center gap-2"
                  >
                    <Copy className="w-4 h-4" />
                    Clone
                  </button>
                  {document.status !== 'ARCHIVED' && (
                    <>
                      <div className="h-px bg-border-secondary my-1" />
                      <button
                        type="button"
                        onClick={() => setArchiveDialogOpen(true)}
                        className="w-full px-3 py-1.5 text-left text-sm hover:bg-background-secondary text-amber-600 flex items-center gap-2"
                      >
                        <Archive className="w-4 h-4" />
                        Archive
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main content with sidebar */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex gap-6">
          {/* Section Navigator Sidebar */}
          {sections.length > 0 && (
            <div className="w-64 flex-shrink-0">
              <SectionNavigator
                sections={sections}
                activeSection={activeSection}
                onSectionClick={(section) => setActiveSection(section.anchor)}
                onScrollToSection={(anchor) => setActiveSection(anchor)}
                sticky
                stickyTop={100}
              />

              {/* Document metadata */}
              <div className="mt-6 p-4 bg-background-secondary border border-border-primary rounded-lg space-y-3">
                <h4 className="text-sm font-medium text-text-primary">
                  Details
                </h4>

                {document.company && (
                  <div className="flex items-center gap-2 text-sm">
                    <Building2 className="w-4 h-4 text-text-muted" />
                    <div>
                      <p className="text-text-primary">{document.company.name}</p>
                      <p className="text-xs text-text-muted">
                        {document.company.uen}
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2 text-sm">
                  <User className="w-4 h-4 text-text-muted" />
                  <span className="text-text-secondary">
                    {document.createdBy.firstName} {document.createdBy.lastName}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="w-4 h-4 text-text-muted" />
                  <span className="text-text-secondary">
                    {new Date(document.createdAt).toLocaleDateString()}
                  </span>
                </div>

                {document.finalizedAt && document.finalizedBy && (
                  <div className="pt-2 border-t border-border-secondary">
                    <p className="text-xs text-text-muted">
                      Finalized by {document.finalizedBy.firstName}{' '}
                      {document.finalizedBy.lastName}
                    </p>
                    <p className="text-xs text-text-muted">
                      {new Date(document.finalizedAt).toLocaleString()}
                    </p>
                  </div>
                )}

                {document._count && (
                  <div className="pt-2 border-t border-border-secondary flex items-center gap-4 text-xs text-text-muted">
                    <span>{document._count.shares} shares</span>
                    <span>{document._count.comments} comments</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Document content */}
          <div className="flex-1 min-w-0">
            <div className="bg-white dark:bg-gray-900 border border-border-primary rounded-lg shadow-sm overflow-hidden">
              {/* Letterhead placeholder (if enabled) */}
              {includeLetterhead && (
                <div className="h-20 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-400">
                  [Letterhead Header]
                </div>
              )}

              {/* Content */}
              <div className="p-8">
                <RenderContentWithPageBreaks
                  html={document.content}
                  isEditable={false}
                  className="prose prose-sm max-w-none dark:prose-invert"
                />
              </div>

              {/* Footer placeholder (if enabled) */}
              {includeLetterhead && (
                <div className="h-16 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-400 text-sm">
                  [Letterhead Footer]
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Finalize dialog */}
      <ConfirmDialog
        isOpen={finalizeDialogOpen}
        onClose={() => setFinalizeDialogOpen(false)}
        onConfirm={handleFinalize}
        title="Finalize Document"
        message="Finalizing this document will lock it for editing. You can unlock it later if needed. Do you want to continue?"
        confirmText={isProcessing ? 'Finalizing...' : 'Finalize'}
        variant="default"
      />

      {/* Unfinalize dialog */}
      <ConfirmDialog
        isOpen={unfinalizeDialogOpen}
        onClose={() => setUnfinalizeDialogOpen(false)}
        onConfirm={handleUnfinalize}
        title="Unlock Document"
        message="Unlocking this document will allow editing. This action will be logged. Do you want to continue?"
        confirmText={isProcessing ? 'Unlocking...' : 'Unlock'}
        variant="default"
      />

      {/* Archive dialog */}
      <ConfirmDialog
        isOpen={archiveDialogOpen}
        onClose={() => setArchiveDialogOpen(false)}
        onConfirm={handleArchive}
        title="Archive Document"
        message="Archiving this document will hide it from the main list. It can still be accessed from archived documents. Do you want to continue?"
        confirmText={isProcessing ? 'Archiving...' : 'Archive'}
        variant="warning"
      />

      {/* Print styles */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .print-content,
          .print-content * {
            visibility: visible;
          }
          .print-content {
            position: absolute;
            left: 0;
            top: 0;
          }
        }
      `}</style>
    </div>
  );
}
