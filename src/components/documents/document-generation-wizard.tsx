'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  FileText,
  Building2,
  ClipboardList,
  Eye,
  ChevronLeft,
  ChevronRight,
  Check,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormInput } from '@/components/ui/form-input';
import { Alert } from '@/components/ui/alert';
import {
  TemplateSelectionWizard,
  type TemplateOption,
  type PlaceholderDefinition,
} from './template-selection-wizard';

// ============================================================================
// Types
// ============================================================================

export interface CompanyOption {
  id: string;
  name: string;
  uen?: string | null;
}

export interface WizardData {
  templateId: string;
  companyId?: string;
  placeholderValues: Record<string, string>;
  title: string;
  useLetterhead: boolean;
}

export interface DocumentGenerationWizardProps {
  templates: TemplateOption[];
  companies: CompanyOption[];
  isLoading?: boolean;
  onGenerate: (data: WizardData) => Promise<void>;
  onCancel?: () => void;
  initialData?: Partial<WizardData>;
  className?: string;
}

type WizardStep = 'template' | 'context' | 'data' | 'preview';

interface StepConfig {
  id: WizardStep;
  label: string;
  icon: React.ElementType;
}

const STEPS: StepConfig[] = [
  { id: 'template', label: 'Template', icon: FileText },
  { id: 'context', label: 'Company', icon: Building2 },
  { id: 'data', label: 'Details', icon: ClipboardList },
  { id: 'preview', label: 'Preview', icon: Eye },
];

// ============================================================================
// Main Component
// ============================================================================

export function DocumentGenerationWizard({
  templates,
  companies,
  isLoading = false,
  onGenerate,
  onCancel,
  initialData,
  className = '',
}: DocumentGenerationWizardProps) {
  // Current step
  const [currentStep, setCurrentStep] = useState<WizardStep>('template');

  // Form state
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateOption | null>(
    initialData?.templateId
      ? templates.find((t) => t.id === initialData.templateId) || null
      : null
  );
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | undefined>(
    initialData?.companyId
  );
  const [placeholderValues, setPlaceholderValues] = useState<Record<string, string>>(
    initialData?.placeholderValues || {}
  );
  const [title, setTitle] = useState(initialData?.title || '');
  const [useLetterhead, setUseLetterhead] = useState(initialData?.useLetterhead ?? true);

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get selected company
  const selectedCompany = useMemo(
    () => companies.find((c) => c.id === selectedCompanyId),
    [companies, selectedCompanyId]
  );

  // Group placeholders by category
  const groupedPlaceholders = useMemo(() => {
    if (!selectedTemplate) return {};

    return selectedTemplate.placeholders.reduce(
      (acc, placeholder) => {
        if (!acc[placeholder.category]) {
          acc[placeholder.category] = [];
        }
        acc[placeholder.category].push(placeholder);
        return acc;
      },
      {} as Record<string, PlaceholderDefinition[]>
    );
  }, [selectedTemplate]);

  // Custom placeholders that need manual entry
  const customPlaceholders = useMemo(
    () => groupedPlaceholders['custom'] || [],
    [groupedPlaceholders]
  );

  // Validation
  const getStepValidation = useCallback(
    (step: WizardStep): { isValid: boolean; errors: string[] } => {
      const errors: string[] = [];

      switch (step) {
        case 'template':
          if (!selectedTemplate) {
            errors.push('Please select a template');
          }
          break;

        case 'context':
          // Company is optional but recommended
          break;

        case 'data':
          // Check required custom placeholders
          customPlaceholders
            .filter((p) => p.required)
            .forEach((p) => {
              if (!placeholderValues[p.key]?.trim()) {
                errors.push(`${p.label} is required`);
              }
            });
          // Title is required
          if (!title.trim()) {
            errors.push('Document title is required');
          }
          break;

        case 'preview':
          // All previous steps must be valid
          break;
      }

      return { isValid: errors.length === 0, errors };
    },
    [selectedTemplate, customPlaceholders, placeholderValues, title]
  );

  // Navigation
  const currentStepIndex = STEPS.findIndex((s) => s.id === currentStep);
  const canGoBack = currentStepIndex > 0;
  const canGoNext = currentStepIndex < STEPS.length - 1;
  const isLastStep = currentStepIndex === STEPS.length - 1;

  const goBack = () => {
    if (canGoBack) {
      setCurrentStep(STEPS[currentStepIndex - 1].id);
    }
  };

  const goNext = () => {
    const validation = getStepValidation(currentStep);
    if (!validation.isValid) {
      setError(validation.errors[0]);
      return;
    }
    setError(null);

    if (canGoNext) {
      setCurrentStep(STEPS[currentStepIndex + 1].id);
    }
  };

  const goToStep = (step: WizardStep) => {
    const targetIndex = STEPS.findIndex((s) => s.id === step);
    if (targetIndex <= currentStepIndex) {
      setCurrentStep(step);
    }
  };

  // Handle template selection
  const handleTemplateSelect = (template: TemplateOption) => {
    setSelectedTemplate(template);
    // Auto-set title based on template name
    if (!title) {
      setTitle(template.name);
    }
  };

  // Handle placeholder value change
  const handlePlaceholderChange = (key: string, value: string) => {
    setPlaceholderValues((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  // Handle generation
  const handleGenerate = async () => {
    if (!selectedTemplate) return;

    setIsGenerating(true);
    setError(null);

    try {
      await onGenerate({
        templateId: selectedTemplate.id,
        companyId: selectedCompanyId,
        placeholderValues,
        title,
        useLetterhead,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate document');
    } finally {
      setIsGenerating(false);
    }
  };

  // Render step content
  const renderStepContent = () => {
    switch (currentStep) {
      case 'template':
        return (
          <TemplateSelectionWizard
            templates={templates}
            isLoading={isLoading}
            onSelect={handleTemplateSelect}
            selectedId={selectedTemplate?.id}
            className="h-full"
          />
        );

      case 'context':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-medium text-text-primary mb-3">Select Company</h3>
              <p className="text-xs text-text-muted mb-4">
                Choose the company for which this document is being generated. Company data will
                be used to fill in relevant placeholders.
              </p>

              {companies.length === 0 ? (
                <Alert variant="info">
                  No companies available. You can still generate the document with manual data
                  entry.
                </Alert>
              ) : (
                <div className="grid gap-2 max-h-80 overflow-y-auto">
                  {/* No company option */}
                  <button
                    onClick={() => setSelectedCompanyId(undefined)}
                    className={`
                      w-full text-left p-3 rounded-lg border transition-all
                      ${
                        !selectedCompanyId
                          ? 'border-accent-primary bg-accent-primary/5 ring-1 ring-accent-primary'
                          : 'border-border-primary bg-background-elevated hover:border-border-secondary'
                      }
                    `}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-background-secondary flex items-center justify-center">
                        <FileText className="w-5 h-5 text-text-muted" />
                      </div>
                      <div>
                        <p className="font-medium text-text-primary">No specific company</p>
                        <p className="text-xs text-text-muted">Manual data entry only</p>
                      </div>
                      {!selectedCompanyId && (
                        <Check className="w-4 h-4 text-accent-primary ml-auto" />
                      )}
                    </div>
                  </button>

                  {companies.map((company) => (
                    <button
                      key={company.id}
                      onClick={() => setSelectedCompanyId(company.id)}
                      className={`
                        w-full text-left p-3 rounded-lg border transition-all
                        ${
                          selectedCompanyId === company.id
                            ? 'border-accent-primary bg-accent-primary/5 ring-1 ring-accent-primary'
                            : 'border-border-primary bg-background-elevated hover:border-border-secondary'
                        }
                      `}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-accent-primary/10 flex items-center justify-center">
                          <Building2 className="w-5 h-5 text-accent-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-text-primary truncate">{company.name}</p>
                          {company.uen && (
                            <p className="text-xs text-text-muted">UEN: {company.uen}</p>
                          )}
                        </div>
                        {selectedCompanyId === company.id && (
                          <Check className="w-4 h-4 text-accent-primary shrink-0" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        );

      case 'data':
        return (
          <div className="space-y-6">
            {/* Document Title */}
            <div>
              <FormInput
                label="Document Title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter document title..."
                required
              />
            </div>

            {/* Custom Placeholders */}
            {customPlaceholders.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-text-primary mb-3">Custom Fields</h3>
                <div className="space-y-4">
                  {customPlaceholders.map((placeholder) => (
                    <FormInput
                      key={placeholder.key}
                      label={placeholder.label}
                      value={placeholderValues[placeholder.key] || ''}
                      onChange={(e) => handlePlaceholderChange(placeholder.key, e.target.value)}
                      placeholder={`Enter ${placeholder.label.toLowerCase()}...`}
                      required={placeholder.required}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Data Sources Info */}
            <div className="bg-background-secondary rounded-lg p-4">
              <h4 className="text-sm font-medium text-text-primary mb-2 flex items-center gap-2">
                <Info className="w-4 h-4 text-accent-primary" />
                Auto-filled Data
              </h4>
              <div className="space-y-2 text-xs text-text-muted">
                {selectedCompany && (
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-status-success" />
                    <span>Company data from {selectedCompany.name}</span>
                  </div>
                )}
                {groupedPlaceholders['company']?.length > 0 && (
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-status-success" />
                    <span>{groupedPlaceholders['company'].length} company fields</span>
                  </div>
                )}
                {groupedPlaceholders['directors']?.length > 0 && (
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-status-success" />
                    <span>{groupedPlaceholders['directors'].length} director fields</span>
                  </div>
                )}
                {groupedPlaceholders['shareholders']?.length > 0 && (
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-status-success" />
                    <span>{groupedPlaceholders['shareholders'].length} shareholder fields</span>
                  </div>
                )}
              </div>
            </div>

            {/* Letterhead Option */}
            <div className="flex items-center justify-between p-3 bg-background-secondary rounded-lg">
              <div>
                <p className="text-sm font-medium text-text-primary">Include Letterhead</p>
                <p className="text-xs text-text-muted">Add your company letterhead to the PDF</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={useLetterhead}
                  onChange={(e) => setUseLetterhead(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-background-tertiary peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-accent-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-accent-primary"></div>
              </label>
            </div>
          </div>
        );

      case 'preview':
        return (
          <div className="space-y-6">
            <div className="bg-background-secondary rounded-lg p-4">
              <h3 className="text-sm font-medium text-text-primary mb-4">Review Your Document</h3>

              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-text-muted">Template:</span>
                  <span className="text-text-primary font-medium">{selectedTemplate?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Company:</span>
                  <span className="text-text-primary">
                    {selectedCompany?.name || 'None selected'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Document Title:</span>
                  <span className="text-text-primary font-medium">{title}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Letterhead:</span>
                  <span className="text-text-primary">
                    {useLetterhead ? 'Included' : 'Not included'}
                  </span>
                </div>

                {customPlaceholders.length > 0 && (
                  <>
                    <div className="border-t border-border-primary my-3" />
                    <p className="text-text-muted text-xs uppercase tracking-wide">
                      Custom Fields
                    </p>
                    {customPlaceholders.map((p) => (
                      <div key={p.key} className="flex justify-between">
                        <span className="text-text-muted">{p.label}:</span>
                        <span className="text-text-primary">
                          {placeholderValues[p.key] || <span className="italic">Not set</span>}
                        </span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>

            <Alert variant="info">
              Click "Generate Document" to create your document. You can edit it after generation.
            </Alert>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Step Indicator */}
      <div className="flex items-center justify-between mb-6 pb-6 border-b border-border-primary">
        {STEPS.map((step, index) => {
          const isActive = step.id === currentStep;
          const isCompleted = index < currentStepIndex;
          const isClickable = index <= currentStepIndex;
          const Icon = step.icon;

          return (
            <button
              key={step.id}
              onClick={() => isClickable && goToStep(step.id)}
              disabled={!isClickable}
              className={`
                flex items-center gap-2 transition-colors
                ${isClickable ? 'cursor-pointer' : 'cursor-not-allowed'}
                ${isActive ? 'text-accent-primary' : isCompleted ? 'text-status-success' : 'text-text-muted'}
              `}
            >
              <div
                className={`
                  w-8 h-8 rounded-full flex items-center justify-center transition-colors
                  ${isActive ? 'bg-accent-primary text-white' : isCompleted ? 'bg-status-success/10 text-status-success' : 'bg-background-secondary text-text-muted'}
                `}
              >
                {isCompleted ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
              </div>
              <span className="text-sm font-medium hidden sm:inline">{step.label}</span>

              {/* Connector line */}
              {index < STEPS.length - 1 && (
                <div
                  className={`
                    w-8 sm:w-16 h-0.5 mx-2
                    ${isCompleted ? 'bg-status-success' : 'bg-border-primary'}
                  `}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Error Display */}
      {error && (
        <Alert variant="error" className="mb-4">
          {error}
        </Alert>
      )}

      {/* Step Content */}
      <div className="flex-1 overflow-y-auto min-h-0">{renderStepContent()}</div>

      {/* Navigation Footer */}
      <div className="flex items-center justify-between pt-6 mt-6 border-t border-border-primary">
        <div>
          {canGoBack && (
            <Button variant="ghost" onClick={goBack} disabled={isGenerating}>
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
          )}
          {!canGoBack && onCancel && (
            <Button variant="ghost" onClick={onCancel} disabled={isGenerating}>
              Cancel
            </Button>
          )}
        </div>

        <div>
          {isLastStep ? (
            <Button
              variant="primary"
              onClick={handleGenerate}
              isLoading={isGenerating}
              disabled={!getStepValidation(currentStep).isValid}
            >
              <FileText className="w-4 h-4 mr-1.5" />
              Generate Document
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={goNext}
              disabled={!getStepValidation(currentStep).isValid}
            >
              Next
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default DocumentGenerationWizard;
