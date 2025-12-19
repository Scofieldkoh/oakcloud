'use client';

import { useState, useEffect } from 'react';
import { AlertTriangle, Check, X, GitBranch, FileText, Calendar, Building2, Hash, DollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DocumentPageViewer } from './document-page-viewer';

// Local formatting utilities
function formatDate(dateValue: string | Date | null): string {
  if (!dateValue) return '-';
  const date = typeof dateValue === 'string' ? new Date(dateValue) : dateValue;
  return date.toLocaleDateString('en-SG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

interface DocumentData {
  id: string;
  fileName?: string;
  pipelineStatus: string;
  approvalStatus: string;
  createdAt: string | Date;
  pdfUrl?: string;
  revision?: {
    documentCategory: string | null;
    vendorName: string | null;
    documentNumber: string | null;
    documentDate: Date | string | null;
    totalAmount: { toString(): string } | null;
    currency: string;
  } | null;
  pages: Array<{
    pageNumber: number;
    imageUrl: string;
    width: number;
    height: number;
  }>;
}

interface FieldMatch {
  field: string;
  currentValue: string | null;
  duplicateValue: string | null;
  isMatch: boolean;
}

interface DuplicateComparisonModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentDocument: DocumentData;
  duplicateDocument: DocumentData;
  duplicateScore?: number;
  duplicateReason?: string;
  fieldComparison?: FieldMatch[];
  onDecision: (decision: 'REJECT_DUPLICATE' | 'CONFIRM_DUPLICATE' | 'MARK_AS_NEW_VERSION') => void;
  isSubmitting?: boolean;
}

/**
 * DuplicateComparisonModal - Full-screen side-by-side duplicate comparison UI
 *
 * Shows both documents with field comparison and action buttons
 */
export function DuplicateComparisonModal({
  isOpen,
  onClose,
  currentDocument,
  duplicateDocument,
  duplicateScore,
  duplicateReason,
  fieldComparison = [],
  onDecision,
  isSubmitting = false,
}: DuplicateComparisonModalProps) {
  const [selectedDecision, setSelectedDecision] = useState<string | null>(null);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  const handleDecision = (decision: 'REJECT_DUPLICATE' | 'CONFIRM_DUPLICATE' | 'MARK_AS_NEW_VERSION') => {
    setSelectedDecision(decision);
    onDecision(decision);
  };

  const scorePercentage = duplicateScore ? Math.round(duplicateScore * 100) : 0;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="flex flex-col h-full">
        {/* Header - compact single line */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-border-primary bg-yellow-50 dark:bg-yellow-900/20">
          <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-500 flex-shrink-0" />
          <h2 className="text-sm font-semibold text-text-primary">
            Potential Duplicate Detected
            {duplicateScore !== undefined && (
              <span className="ml-1.5 text-yellow-600 dark:text-yellow-500">
                ({scorePercentage}% match)
              </span>
            )}
            {duplicateReason && (
              <span className="ml-2 font-normal text-text-secondary">— {duplicateReason}</span>
            )}
          </h2>
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="btn-ghost btn-xs btn-icon flex-shrink-0"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Main content - side by side */}
        <div className="flex-1 flex overflow-hidden">
          {/* Current Document Panel */}
          <DocumentPanel
            title="This Document (New)"
            subtitle="Uploaded just now"
            document={currentDocument}
            fieldComparison={fieldComparison}
            isCurrentDoc={true}
          />

          {/* Divider */}
          <div className="w-px bg-border-secondary flex-shrink-0" />

          {/* Duplicate Document Panel */}
          <DocumentPanel
            title="Existing Document"
            subtitle={`Uploaded ${formatDate(duplicateDocument.createdAt)}`}
            document={duplicateDocument}
            fieldComparison={fieldComparison}
            isCurrentDoc={false}
          />
        </div>

        {/* Footer with actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border-primary bg-background-tertiary">
          <p className="text-sm text-text-secondary">
            Please review both documents and make a decision
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => handleDecision('REJECT_DUPLICATE')}
              disabled={isSubmitting}
              className={cn(
                'btn-secondary btn-sm',
                selectedDecision === 'REJECT_DUPLICATE' && 'ring-2 ring-status-success'
              )}
            >
              <X className="w-4 h-4" />
              Not a Duplicate
            </button>
            <button
              onClick={() => handleDecision('CONFIRM_DUPLICATE')}
              disabled={isSubmitting}
              className={cn(
                'btn-danger btn-sm',
                selectedDecision === 'CONFIRM_DUPLICATE' && 'ring-2 ring-status-error'
              )}
            >
              <Check className="w-4 h-4" />
              Is a Duplicate
            </button>
            <button
              onClick={() => handleDecision('MARK_AS_NEW_VERSION')}
              disabled={isSubmitting}
              className={cn(
                'btn-primary btn-sm',
                selectedDecision === 'MARK_AS_NEW_VERSION' && 'ring-2 ring-oak-light'
              )}
            >
              <GitBranch className="w-4 h-4" />
              Mark as New Version
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Document panel showing preview and extracted fields
 */
function DocumentPanel({
  title,
  subtitle,
  document,
  fieldComparison,
  isCurrentDoc,
}: {
  title: string;
  subtitle: string;
  document: DocumentData;
  fieldComparison: FieldMatch[];
  isCurrentDoc: boolean;
}) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background-secondary min-w-0">
      {/* Panel Header - compact single line */}
      <div className="px-3 py-1.5 bg-background-tertiary border-b border-border-primary flex-shrink-0 flex items-center gap-2">
        <h3 className="text-xs font-medium text-text-primary">{title}</h3>
        <span className="text-xs text-text-muted">·</span>
        <p className="text-xs text-text-secondary">{subtitle}</p>
      </div>

      {/* Document Preview - Takes up most space */}
      <div className="flex-1 min-h-0 border-b border-border-primary bg-background-primary">
        {document.pdfUrl ? (
          <DocumentPageViewer
            pdfUrl={document.pdfUrl}
            className="h-full"
          />
        ) : (
          <div className="flex items-center justify-center h-full text-text-muted">
            <div className="text-center">
              <FileText className="w-16 h-16 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No preview available</p>
            </div>
          </div>
        )}
      </div>

      {/* Extracted Fields - Scrollable */}
      <div className="flex-shrink-0 max-h-[200px] overflow-auto p-3">
        <div className="space-y-1">
          {fieldComparison.map((field) => (
            <FieldRow
              key={field.field}
              field={field.field}
              value={isCurrentDoc ? field.currentValue : field.duplicateValue}
              isMatch={field.isMatch}
              showMatchIndicator={true}
            />
          ))}
        </div>

        {/* File Info */}
        <div className="mt-4 pt-3 border-t border-border-primary">
          <div className="text-xs text-text-muted space-y-1">
            <div className="truncate">
              <span className="text-text-secondary">File:</span>{' '}
              {document.fileName || 'Unknown'}
            </div>
            <div>
              <span className="text-text-secondary">Status:</span>{' '}
              {formatStatus(document.approvalStatus)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Field row with match indicator
 */
function FieldRow({
  field,
  value,
  isMatch,
  showMatchIndicator,
}: {
  field: string;
  value: string | null;
  isMatch: boolean;
  showMatchIndicator: boolean;
}) {
  const getFieldIcon = () => {
    switch (field) {
      case 'vendorName':
        return <Building2 className="w-3.5 h-3.5" />;
      case 'documentNumber':
        return <Hash className="w-3.5 h-3.5" />;
      case 'documentDate':
        return <Calendar className="w-3.5 h-3.5" />;
      case 'totalAmount':
      case 'currency':
        return <DollarSign className="w-3.5 h-3.5" />;
      default:
        return <FileText className="w-3.5 h-3.5" />;
    }
  };

  const getFieldLabel = () => {
    switch (field) {
      case 'documentCategory':
        return 'Category';
      case 'vendorName':
        return 'Vendor';
      case 'documentNumber':
        return 'Doc #';
      case 'documentDate':
        return 'Date';
      case 'totalAmount':
        return 'Total';
      case 'currency':
        return 'Currency';
      default:
        return field;
    }
  };

  return (
    <div className="flex items-center gap-2 py-1">
      <span className="text-text-muted w-4 flex-shrink-0">{getFieldIcon()}</span>
      <span className="text-xs text-text-secondary w-16 flex-shrink-0">{getFieldLabel()}</span>
      <span
        className={cn(
          'flex-1 text-sm font-medium truncate min-w-0',
          value ? 'text-text-primary' : 'text-text-muted italic'
        )}
      >
        {value || 'Not extracted'}
      </span>
      {showMatchIndicator && (
        <span
          className={cn(
            'w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0',
            isMatch
              ? 'bg-status-success/10 text-status-success'
              : 'bg-background-tertiary text-text-muted'
          )}
        >
          {isMatch ? (
            <Check className="w-3 h-3" />
          ) : (
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
          )}
        </span>
      )}
    </div>
  );
}

/**
 * Format approval status for display
 */
function formatStatus(status: string): string {
  const statusMap: Record<string, string> = {
    DRAFT: 'Draft',
    PENDING_REVIEW: 'Pending Review',
    APPROVED: 'Approved',
    REJECTED: 'Rejected',
  };
  return statusMap[status] || status;
}
