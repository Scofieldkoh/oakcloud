'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

// ============================================================================
// Types
// ============================================================================

export interface ValidationError {
  field: string;
  message: string;
  category: 'company' | 'directors' | 'shareholders' | 'contacts' | 'officers' | 'custom';
  fixUrl?: string;
}

export interface ValidationWarning {
  field: string;
  message: string;
  suggestion?: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  summary?: {
    errorCount: number;
    warningCount: number;
    requiredPlaceholders: number;
    availablePlaceholders: number;
    missingPlaceholders: number;
  };
}

export interface ValidationPanelProps {
  templateId: string;
  companyId?: string;
  contactIds?: string[];
  customData?: Record<string, unknown>;
  onValidationComplete?: (result: ValidationResult) => void;
  onProceed?: () => void;
  onCancel?: () => void;
  onSaveAsDraft?: () => void;
  showActions?: boolean;
  autoValidate?: boolean;
  className?: string;
}

// ============================================================================
// Helper Components
// ============================================================================

interface CategorySectionProps {
  title: string;
  items: (ValidationError | ValidationWarning)[];
  type: 'error' | 'warning';
  defaultExpanded?: boolean;
}

function CategorySection({ title, items, type, defaultExpanded = true }: CategorySectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  if (items.length === 0) return null;

  const Icon = type === 'error' ? AlertCircle : AlertTriangle;
  const colorClass = type === 'error' ? 'text-status-error' : 'text-status-warning';
  const bgClass = type === 'error' ? 'bg-status-error/10' : 'bg-status-warning/10';

  return (
    <div className="border border-border-primary rounded-md overflow-hidden">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className={`w-full flex items-center justify-between px-3 py-2 ${bgClass} hover:bg-opacity-80 transition-colors`}
      >
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${colorClass}`} />
          <span className={`text-sm font-medium ${colorClass}`}>
            {title} ({items.length})
          </span>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-text-muted" />
        ) : (
          <ChevronDown className="w-4 h-4 text-text-muted" />
        )}
      </button>

      {isExpanded && (
        <div className="divide-y divide-border-primary">
          {items.map((item, index) => (
            <div key={index} className="px-3 py-2 bg-background-elevated">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <p className="text-sm text-text-primary">{item.message}</p>
                  <p className="text-xs text-text-muted mt-0.5">{item.field}</p>
                  {'suggestion' in item && item.suggestion && (
                    <p className="text-xs text-text-secondary mt-1 italic">
                      {item.suggestion}
                    </p>
                  )}
                </div>
                {'fixUrl' in item && item.fixUrl && (
                  <a
                    href={item.fixUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-accent-primary hover:underline shrink-0"
                  >
                    Fix
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function ValidationPanel({
  templateId,
  companyId,
  contactIds,
  customData,
  onValidationComplete,
  onProceed,
  onCancel,
  onSaveAsDraft,
  showActions = true,
  autoValidate = true,
  className = '',
}: ValidationPanelProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runValidation = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/generated-documents/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId,
          companyId,
          contactIds,
          customData,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Validation failed');
      }

      const data = await response.json();
      const validationResult: ValidationResult = {
        isValid: data.isValid,
        errors: data.errors,
        warnings: data.warnings,
        summary: data.summary,
      };

      setResult(validationResult);
      onValidationComplete?.(validationResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [templateId, companyId, contactIds, customData, onValidationComplete]);

  // Auto-validate on mount or when dependencies change
  useEffect(() => {
    if (autoValidate && templateId) {
      runValidation();
    }
  }, [autoValidate, templateId, runValidation]);

  // Group errors by category
  const errorsByCategory = result?.errors.reduce(
    (acc, error) => {
      const category = error.category;
      if (!acc[category]) acc[category] = [];
      acc[category].push(error);
      return acc;
    },
    {} as Record<string, ValidationError[]>
  ) || {};

  const categoryLabels: Record<string, string> = {
    company: 'Company Information',
    directors: 'Directors',
    shareholders: 'Shareholders',
    contacts: 'Contacts',
    officers: 'Officers',
    custom: 'Custom Fields',
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-text-primary">Pre-Generation Validation</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={runValidation}
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          <span className="ml-1">Re-check</span>
        </Button>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-accent-primary" />
          <span className="ml-2 text-sm text-text-muted">Validating...</span>
        </div>
      )}

      {/* Error State */}
      {error && !isLoading && (
        <div className="p-4 bg-status-error/10 border border-status-error/20 rounded-md">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-status-error shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-status-error">Validation Error</p>
              <p className="text-sm text-text-secondary mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {result && !isLoading && (
        <>
          {/* Status Banner */}
          {result.isValid ? (
            <div className="p-3 bg-status-success/10 border border-status-success/20 rounded-md">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-status-success" />
                <span className="text-sm font-medium text-status-success">
                  All validation checks passed
                </span>
              </div>
              {result.warnings.length > 0 && (
                <p className="text-xs text-text-muted mt-1 ml-7">
                  {result.warnings.length} warning{result.warnings.length !== 1 ? 's' : ''} to review
                </p>
              )}
            </div>
          ) : (
            <div className="p-3 bg-status-error/10 border border-status-error/20 rounded-md">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-status-error" />
                <span className="text-sm font-medium text-status-error">
                  {result.errors.length} issue{result.errors.length !== 1 ? 's' : ''} need attention
                </span>
              </div>
              <p className="text-xs text-text-muted mt-1 ml-7">
                Please resolve the errors below before generating the document.
              </p>
            </div>
          )}

          {/* Summary Stats */}
          {result.summary && (
            <div className="grid grid-cols-3 gap-2">
              <div className="px-3 py-2 bg-background-secondary rounded-md text-center">
                <p className="text-lg font-semibold text-text-primary">
                  {result.summary.availablePlaceholders}
                </p>
                <p className="text-2xs text-text-muted">Available</p>
              </div>
              <div className="px-3 py-2 bg-background-secondary rounded-md text-center">
                <p className="text-lg font-semibold text-text-primary">
                  {result.summary.requiredPlaceholders}
                </p>
                <p className="text-2xs text-text-muted">Required</p>
              </div>
              <div className="px-3 py-2 bg-background-secondary rounded-md text-center">
                <p className={`text-lg font-semibold ${result.summary.missingPlaceholders > 0 ? 'text-status-error' : 'text-status-success'}`}>
                  {result.summary.missingPlaceholders}
                </p>
                <p className="text-2xs text-text-muted">Missing</p>
              </div>
            </div>
          )}

          {/* Errors by Category */}
          {Object.entries(errorsByCategory).map(([category, errors]) => (
            <CategorySection
              key={category}
              title={categoryLabels[category] || category}
              items={errors}
              type="error"
            />
          ))}

          {/* Warnings */}
          {result.warnings.length > 0 && (
            <CategorySection
              title="Warnings"
              items={result.warnings}
              type="warning"
              defaultExpanded={result.errors.length === 0}
            />
          )}

          {/* Actions */}
          {showActions && (
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border-primary">
              {onCancel && (
                <Button variant="ghost" size="sm" onClick={onCancel}>
                  Cancel
                </Button>
              )}
              {onSaveAsDraft && !result.isValid && (
                <Button variant="secondary" size="sm" onClick={onSaveAsDraft}>
                  Save as Draft
                </Button>
              )}
              {onProceed && (
                <Button
                  variant={result.isValid ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={onProceed}
                >
                  {result.isValid ? 'Generate Document' : 'Continue Anyway'}
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default ValidationPanel;
