'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  FileText,
  Building2,
  Users,
  Settings,
  Eye,
  Check,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Stepper, type Step } from '@/components/ui/stepper';
import { FormInput } from '@/components/ui/form-input';
import { TemplateSelector, type DocumentTemplate } from './template-selector';
import { type ValidationResult } from './validation-panel';
import { DocumentEditor, type DocumentEditorRef } from './document-editor';

// ============================================================================
// Types
// ============================================================================

export interface Company {
  id: string;
  name: string;
  uen: string;
  status: string;
  registeredAddress?: string | null;
  incorporationDate?: string | null;
}

export interface Contact {
  id: string;
  fullName: string;
  email?: string | null;
  phone?: string | null;
  designation?: string | null;
}

export interface GenerationWizardProps {
  templates: DocumentTemplate[];
  companies: Company[];
  onGenerate: (data: GenerateDocumentData) => Promise<GeneratedDocumentResult>;
  onPreviewTemplate?: (template: DocumentTemplate) => void;
  onValidate?: (templateId: string, companyId: string) => Promise<ValidationResult>;
  isLoading?: boolean;
  className?: string;
}

export interface GenerateDocumentData {
  templateId: string;
  companyId?: string;
  title: string;
  customData: Record<string, string>;
  useLetterhead: boolean;
  shareExpiryHours?: number;
}

export interface GeneratedDocumentResult {
  id: string;
  title: string;
  content: string;
  status: string;
  missingPlaceholders?: string[];
}

interface WizardState {
  selectedTemplate: DocumentTemplate | null;
  selectedCompany: Company | null;
  title: string;
  customData: Record<string, string>;
  useLetterhead: boolean;
  shareExpiryHours: string;
  validationResult: ValidationResult | null;
  generatedDocument: GeneratedDocumentResult | null;
  previewContent: string | null;
}

// ============================================================================
// Step Definitions
// ============================================================================

const WIZARD_STEPS: Step[] = [
  { id: 'template', label: 'Template' },
  { id: 'company', label: 'Company' },
  { id: 'customize', label: 'Customize' },
  { id: 'preview', label: 'Preview' },
  { id: 'complete', label: 'Complete' },
];

// ============================================================================
// Company Selector Component
// ============================================================================

interface CompanySelectorProps {
  companies: Company[];
  selected: Company | null;
  onSelect: (company: Company | null) => void;
  isLoading?: boolean;
}

function CompanySelector({
  companies,
  selected,
  onSelect,
  isLoading,
}: CompanySelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredCompanies = useMemo(() => {
    if (!searchQuery) return companies;
    const query = searchQuery.toLowerCase();
    return companies.filter(
      (c) =>
        c.name.toLowerCase().includes(query) ||
        c.uen.toLowerCase().includes(query)
    );
  }, [companies, searchQuery]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative max-w-md">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search companies..."
          className="w-full pl-4 pr-4 py-2 text-sm border border-border-primary rounded-lg bg-background-elevated text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-primary focus:border-accent-primary"
        />
      </div>

      {/* Option to skip company */}
      <div
        className={cn(
          'p-4 border rounded-lg cursor-pointer transition-all',
          'hover:border-accent-primary',
          selected === null
            ? 'border-accent-primary bg-accent-primary/5 ring-1 ring-accent-primary'
            : 'border-border-primary'
        )}
        onClick={() => onSelect(null)}
        role="button"
        tabIndex={0}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
            <FileText className="w-5 h-5 text-gray-600" />
          </div>
          <div>
            <p className="font-medium text-text-primary">No company selected</p>
            <p className="text-sm text-text-muted">
              Generate document without company context
            </p>
          </div>
        </div>
      </div>

      {/* Company list */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[400px] overflow-y-auto">
        {filteredCompanies.map((company) => (
          <div
            key={company.id}
            className={cn(
              'p-4 border rounded-lg cursor-pointer transition-all',
              'hover:border-accent-primary hover:shadow-sm',
              selected?.id === company.id
                ? 'border-accent-primary bg-accent-primary/5 ring-1 ring-accent-primary'
                : 'border-border-primary bg-background-elevated'
            )}
            onClick={() => onSelect(company)}
            role="button"
            tabIndex={0}
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-950 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-text-primary truncate">
                  {company.name}
                </p>
                <p className="text-sm text-text-muted">{company.uen}</p>
                <span
                  className={cn(
                    'inline-flex px-2 py-0.5 rounded text-xs mt-1',
                    company.status === 'ACTIVE'
                      ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400'
                      : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                  )}
                >
                  {company.status}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredCompanies.length === 0 && searchQuery && (
        <div className="py-8 text-center text-text-muted">
          <Building2 className="w-10 h-10 mx-auto mb-2 opacity-50" />
          <p>No companies match your search</p>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Custom Data Form Component
// ============================================================================

interface CustomDataFormProps {
  template: DocumentTemplate;
  customData: Record<string, string>;
  title: string;
  useLetterhead: boolean;
  shareExpiryHours: string;
  onTitleChange: (title: string) => void;
  onCustomDataChange: (data: Record<string, string>) => void;
  onLetterheadChange: (value: boolean) => void;
  onExpiryChange: (value: string) => void;
}

function CustomDataForm({
  template,
  customData,
  title,
  useLetterhead,
  shareExpiryHours,
  onTitleChange,
  onCustomDataChange,
  onLetterheadChange,
  onExpiryChange,
}: CustomDataFormProps) {
  // Get custom placeholders (those that need user input)
  const customPlaceholders = useMemo(() => {
    return (template.placeholders || []).filter(
      (p) => p.category === 'custom' || p.category === 'Custom'
    );
  }, [template]);

  // Helper to strip 'custom.' prefix from keys for proper context resolution
  // The placeholder resolver expects context.custom.effectiveDate, not context.custom['custom.effectiveDate']
  const getStorageKey = (key: string) => key.replace(/^custom\./, '');

  const handleFieldChange = (key: string, value: string) => {
    const storageKey = getStorageKey(key);
    onCustomDataChange({
      ...customData,
      [storageKey]: value,
    });
  };

  return (
    <div className="space-y-6">
      {/* Document Title */}
      <div>
        <label className="block text-sm font-medium text-text-primary mb-1">
          Document Title <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Enter document title..."
          className="w-full px-4 py-2 border border-border-primary rounded-lg bg-background-elevated text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-primary focus:border-accent-primary"
        />
      </div>

      {/* Custom Placeholders */}
      {customPlaceholders.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-text-primary mb-3">
            Custom Fields
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {customPlaceholders.map((placeholder) => {
              const storageKey = getStorageKey(placeholder.key);
              return (
                <div key={placeholder.key}>
                  <label className={`block text-sm text-text-secondary mb-1 ${placeholder.type === 'boolean' ? 'flex items-center gap-2 cursor-pointer' : ''}`}>
                    {placeholder.type === 'boolean' ? (
                      <>
                        <input
                          type="checkbox"
                          checked={customData[storageKey] === 'true' || customData[storageKey] === '1'}
                          onChange={(e) =>
                            handleFieldChange(placeholder.key, e.target.checked ? 'true' : 'false')
                          }
                          className="w-4 h-4 rounded border-border-primary text-accent-primary focus:ring-accent-primary"
                        />
                        <span>{placeholder.label}</span>
                        {placeholder.required && (
                          <span className="text-red-500 ml-1">*</span>
                        )}
                      </>
                    ) : (
                      <>
                        {placeholder.label}
                        {placeholder.required && (
                          <span className="text-red-500 ml-1">*</span>
                        )}
                      </>
                    )}
                  </label>
                  {placeholder.type !== 'boolean' && (
                    <input
                      type={placeholder.type === 'date' ? 'date' : placeholder.type === 'number' || placeholder.type === 'currency' ? 'number' : 'text'}
                      value={customData[storageKey] || ''}
                      onChange={(e) =>
                        handleFieldChange(placeholder.key, e.target.value)
                      }
                      placeholder={`Enter ${placeholder.label.toLowerCase()}...`}
                      className="w-full px-3 py-2 text-sm border border-border-primary rounded-lg bg-background-elevated text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-primary focus:border-accent-primary"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Options */}
      <div className="border-t border-border-secondary pt-4">
        <h4 className="text-sm font-medium text-text-primary mb-3">Options</h4>
        <div className="space-y-3">
          {/* Letterhead toggle */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={useLetterhead}
              onChange={(e) => onLetterheadChange(e.target.checked)}
              className="w-4 h-4 rounded border-border-primary text-accent-primary focus:ring-accent-primary"
            />
            <div>
              <span className="text-sm text-text-primary">
                Include letterhead in PDF export
              </span>
              <p className="text-xs text-text-muted">
                Uses your tenant&apos;s configured letterhead
              </p>
            </div>
          </label>

          {/* Share expiry */}
          <div className="flex items-center gap-3">
            <label className="text-sm text-text-primary">
              Default share link expiry:
            </label>
            <select
              value={shareExpiryHours}
              onChange={(e) => onExpiryChange(e.target.value)}
              className="px-3 py-1.5 text-sm border border-border-primary rounded-lg bg-background-elevated text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
            >
              <option value="">Never</option>
              <option value="24">24 hours</option>
              <option value="72">3 days</option>
              <option value="168">7 days</option>
              <option value="720">30 days</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Preview Step Component
// ============================================================================

interface PreviewStepProps {
  content: string | null;
  validationResult: ValidationResult | null;
  isLoading: boolean;
  onRefresh: () => void;
}

function PreviewStep({
  content,
  validationResult,
  isLoading,
  onRefresh,
}: PreviewStepProps) {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-accent-primary mb-4" />
        <p className="text-text-muted">Generating preview...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Validation warnings */}
      {validationResult && !validationResult.isValid && (
        <div className="p-4 bg-status-warning/10 border border-status-warning/30 rounded-lg mb-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-status-warning flex-shrink-0 mt-0.5" />
            <div className="space-y-2">
              <p className="text-sm font-medium text-text-primary">
                Validation Issues Found
              </p>
              {validationResult.errors.length > 0 && (
                <ul className="text-sm text-status-error space-y-1">
                  {validationResult.errors.map((error, i) => (
                    <li key={i}>• {error.message}</li>
                  ))}
                </ul>
              )}
              {validationResult.warnings.length > 0 && (
                <ul className="text-sm text-status-warning space-y-1">
                  {validationResult.warnings.map((warning, i) => (
                    <li key={i}>• {warning.message}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Refresh button */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-text-primary">
          Document Preview
        </h4>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          className="text-text-muted"
        >
          <RefreshCw className="w-4 h-4 mr-1" />
          Refresh
        </Button>
      </div>

      {/* Preview content */}
      <div className="border border-border-primary rounded-lg overflow-hidden">
        <div
          className="p-6 bg-white dark:bg-gray-900 min-h-[400px] max-h-[600px] overflow-y-auto prose prose-sm max-w-none dark:prose-invert"
          dangerouslySetInnerHTML={{ __html: content || '' }}
        />
      </div>

      <p className="text-xs text-text-muted text-center">
        This is a preview. You can edit the document after generation.
      </p>
    </div>
  );
}

// ============================================================================
// Complete Step Component
// ============================================================================

interface CompleteStepProps {
  document: GeneratedDocumentResult | null;
  onEdit: () => void;
  onExportPDF: () => void;
  onCreateShare: () => void;
  onGenerateAnother: () => void;
}

function CompleteStep({
  document,
  onEdit,
  onExportPDF,
  onCreateShare,
  onGenerateAnother,
}: CompleteStepProps) {
  if (!document) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-12 h-12 mx-auto text-red-500 mb-4" />
        <p className="text-text-primary font-medium">Generation failed</p>
        <p className="text-text-muted mt-1">Please try again</p>
      </div>
    );
  }

  return (
    <div className="text-center py-8">
      <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-950 flex items-center justify-center mx-auto mb-4">
        <Check className="w-8 h-8 text-green-600 dark:text-green-400" />
      </div>

      <h3 className="text-xl font-semibold text-text-primary mb-2">
        Document Generated Successfully
      </h3>
      <p className="text-text-muted mb-6">
        &quot;{document.title}&quot; has been created and saved as a draft.
      </p>

      {/* Missing placeholders warning */}
      {document.missingPlaceholders && document.missingPlaceholders.length > 0 && (
        <div className="max-w-md mx-auto mb-6 p-4 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg text-left">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                Some placeholders could not be resolved:
              </p>
              <ul className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                {document.missingPlaceholders.slice(0, 5).map((p) => (
                  <li key={p}>{p}</li>
                ))}
                {document.missingPlaceholders.length > 5 && (
                  <li>...and {document.missingPlaceholders.length - 5} more</li>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button variant="primary" onClick={onEdit}>
          <FileText className="w-4 h-4 mr-2" />
          Edit Document
        </Button>
        <Button variant="secondary" onClick={onExportPDF}>
          Export PDF
        </Button>
        <Button variant="secondary" onClick={onCreateShare}>
          Create Share Link
        </Button>
        <Button variant="ghost" onClick={onGenerateAnother}>
          Generate Another
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// Main Wizard Component
// ============================================================================

export function DocumentGenerationWizard({
  templates,
  companies,
  onGenerate,
  onPreviewTemplate,
  onValidate,
  isLoading = false,
  className,
}: GenerationWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [state, setState] = useState<WizardState>({
    selectedTemplate: null,
    selectedCompany: null,
    title: '',
    customData: {},
    useLetterhead: true,
    shareExpiryHours: '',
    validationResult: null,
    generatedDocument: null,
    previewContent: null,
  });

  // Update title when template is selected
  useEffect(() => {
    if (state.selectedTemplate && !state.title) {
      setState((prev) => ({
        ...prev,
        title: `${state.selectedTemplate!.name} - ${new Date().toLocaleDateString()}`,
      }));
    }
  }, [state.selectedTemplate, state.title]);

  // Check if current step is valid
  const isStepValid = useCallback(
    (step: number): boolean => {
      switch (step) {
        case 0: // Template
          return state.selectedTemplate !== null;
        case 1: // Company
          return true; // Company is optional
        case 2: // Customize
          return state.title.trim().length > 0;
        case 3: // Preview
          return true;
        case 4: // Complete
          return true;
        default:
          return false;
      }
    },
    [state.selectedTemplate, state.title]
  );

  // Handle step navigation
  const goToNextStep = async () => {
    if (!isStepValid(currentStep)) return;

    // Validate before preview
    if (currentStep === 2 && onValidate && state.selectedTemplate && state.selectedCompany) {
      setIsValidating(true);
      try {
        const result = await onValidate(
          state.selectedTemplate.id,
          state.selectedCompany.id
        );
        setState((prev) => ({ ...prev, validationResult: result }));
      } catch (err) {
        console.error('Validation error:', err);
      }
      setIsValidating(false);
    }

    // Generate preview
    if (currentStep === 2) {
      await generatePreview();
    }

    // Generate document at preview step
    if (currentStep === 3) {
      await handleGenerate();
      return;
    }

    setCurrentStep((prev) => Math.min(prev + 1, WIZARD_STEPS.length - 1));
  };

  const goToPreviousStep = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
    setError(null);
  };

  // Generate preview content
  const generatePreview = async () => {
    if (!state.selectedTemplate) return;

    setIsValidating(true);
    try {
      // Call preview API
      const response = await fetch('/api/generated-documents/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: state.selectedTemplate.id,
          companyId: state.selectedCompany?.id,
          customData: state.customData,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate preview');
      }

      const data = await response.json();
      setState((prev) => ({ ...prev, previewContent: data.content }));
    } catch (err) {
      console.error('Preview error:', err);
      setError('Failed to generate preview');
    }
    setIsValidating(false);
  };

  // Handle document generation
  const handleGenerate = async () => {
    if (!state.selectedTemplate) return;

    setIsGenerating(true);
    setError(null);

    try {
      const result = await onGenerate({
        templateId: state.selectedTemplate.id,
        companyId: state.selectedCompany?.id,
        title: state.title,
        customData: state.customData,
        useLetterhead: state.useLetterhead,
        shareExpiryHours: state.shareExpiryHours
          ? parseInt(state.shareExpiryHours)
          : undefined,
      });

      setState((prev) => ({ ...prev, generatedDocument: result }));
      setCurrentStep(4);
    } catch (err) {
      console.error('Generation error:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate document');
    }

    setIsGenerating(false);
  };

  // Handle reset
  const handleReset = () => {
    setState({
      selectedTemplate: null,
      selectedCompany: null,
      title: '',
      customData: {},
      useLetterhead: true,
      shareExpiryHours: '',
      validationResult: null,
      generatedDocument: null,
      previewContent: null,
    });
    setCurrentStep(0);
    setError(null);
  };

  // Render step content
  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <TemplateSelector
            templates={templates}
            selectedTemplate={state.selectedTemplate}
            onSelect={(template) =>
              setState((prev) => ({ ...prev, selectedTemplate: template }))
            }
            onPreview={onPreviewTemplate}
            isLoading={isLoading}
          />
        );

      case 1:
        return (
          <CompanySelector
            companies={companies}
            selected={state.selectedCompany}
            onSelect={(company) =>
              setState((prev) => ({ ...prev, selectedCompany: company }))
            }
          />
        );

      case 2:
        return state.selectedTemplate ? (
          <CustomDataForm
            template={state.selectedTemplate}
            title={state.title}
            customData={state.customData}
            useLetterhead={state.useLetterhead}
            shareExpiryHours={state.shareExpiryHours}
            onTitleChange={(title) => setState((prev) => ({ ...prev, title }))}
            onCustomDataChange={(data) =>
              setState((prev) => ({ ...prev, customData: data }))
            }
            onLetterheadChange={(value) =>
              setState((prev) => ({ ...prev, useLetterhead: value }))
            }
            onExpiryChange={(value) =>
              setState((prev) => ({ ...prev, shareExpiryHours: value }))
            }
          />
        ) : null;

      case 3:
        return (
          <PreviewStep
            content={state.previewContent}
            validationResult={state.validationResult}
            isLoading={isValidating}
            onRefresh={generatePreview}
          />
        );

      case 4:
        return (
          <CompleteStep
            document={state.generatedDocument}
            onEdit={() => {
              if (state.generatedDocument) {
                window.location.href = `/generated-documents/${state.generatedDocument.id}/edit`;
              }
            }}
            onExportPDF={() => {
              if (state.generatedDocument) {
                window.open(
                  `/api/generated-documents/${state.generatedDocument.id}/export/pdf`,
                  '_blank'
                );
              }
            }}
            onCreateShare={() => {
              if (state.generatedDocument) {
                window.location.href = `/generated-documents/${state.generatedDocument.id}/share`;
              }
            }}
            onGenerateAnother={handleReset}
          />
        );

      default:
        return null;
    }
  };

  return (
    <div className={cn('flex flex-col', className)}>
      {/* Stepper */}
      <div className="mb-8">
        <Stepper
          steps={WIZARD_STEPS}
          currentStep={currentStep}
          onStepClick={(step) => {
            if (step < currentStep) {
              setCurrentStep(step);
            }
          }}
        />
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
            <AlertCircle className="w-5 h-5" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        </div>
      )}

      {/* Step content */}
      <div className="flex-1 min-h-[400px]">{renderStepContent()}</div>

      {/* Navigation buttons */}
      {currentStep < 4 && (
        <div className="flex items-center justify-between mt-8 pt-4 border-t border-border-secondary">
          <Button
            variant="ghost"
            onClick={goToPreviousStep}
            disabled={currentStep === 0}
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back
          </Button>

          <div className="flex items-center gap-3">
            {currentStep === 3 && (
              <Button
                variant="secondary"
                onClick={() => setCurrentStep(2)}
                disabled={isGenerating}
              >
                Edit Settings
              </Button>
            )}

            <Button
              variant="primary"
              onClick={goToNextStep}
              disabled={!isStepValid(currentStep) || isGenerating || isValidating}
            >
              {isGenerating || isValidating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {isValidating ? 'Validating...' : 'Generating...'}
                </>
              ) : currentStep === 3 ? (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Generate Document
                </>
              ) : (
                <>
                  Next
                  <ChevronRight className="w-4 h-4 ml-1" />
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default DocumentGenerationWizard;
