'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  FileText,
  Building2,
  Settings,
  Eye,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Sparkles,
  Search,
  Edit3,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Stepper, type Step } from '@/components/ui/stepper';
import { Pagination } from '@/components/companies/pagination';
import { TemplateSelector, type DocumentTemplate } from './template-selector';
import { type ValidationResult } from './validation-panel';
import { A4PageEditor, type A4PageEditorRef } from './a4-page-editor';

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

export interface TemplatePartial {
  id: string;
  name: string;
  displayName?: string | null;
  description?: string | null;
  content: string;
  placeholders?: unknown;
}

export interface GenerationWizardProps {
  templates: DocumentTemplate[];
  companies: Company[];
  partials?: TemplatePartial[];
  tenantId?: string;
  onGenerate: (data: GenerateDocumentData) => Promise<GeneratedDocumentResult>;
  onPreviewTemplate?: (template: DocumentTemplate) => void;
  onValidate?: (templateId: string, companyId: string | undefined, customData: Record<string, string>) => Promise<ValidationResult>;
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
  editedContent?: string;
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
  editedContent: string | null;
}

// ============================================================================
// Step Definitions
// ============================================================================

const WIZARD_STEPS: Step[] = [
  { id: 'template', label: 'Template' },
  { id: 'company', label: 'Company' },
  { id: 'customize', label: 'Custom Fields' },
  { id: 'edit', label: 'Edit & Preview' },
];

// ============================================================================
// Summary Card Component
// ============================================================================

interface SummaryCardProps {
  template: DocumentTemplate | null;
  company: Company | null;
  title: string;
  customFieldCount: number;
}

function SummaryCard({ template, company, title, customFieldCount }: SummaryCardProps) {
  return (
    <div className="p-4 bg-background-secondary border border-border-primary rounded-lg">
      <h4 className="text-sm font-medium text-text-primary mb-3">Summary</h4>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div>
          <span className="text-text-muted block">Template</span>
          <span className={cn(
            'font-medium truncate block',
            template ? 'text-text-primary' : 'text-text-muted italic'
          )}>
            {template?.name || 'Not selected'}
          </span>
        </div>
        <div>
          <span className="text-text-muted block">Company</span>
          <span className={cn(
            'font-medium truncate block',
            company ? 'text-text-primary' : 'text-text-muted italic'
          )}>
            {company?.name || 'Not selected'}
          </span>
        </div>
        <div>
          <span className="text-text-muted block">Document Title</span>
          <span className={cn(
            'font-medium truncate block',
            title ? 'text-text-primary' : 'text-text-muted italic'
          )}>
            {title || 'Not set'}
          </span>
        </div>
        <div>
          <span className="text-text-muted block">Custom Fields</span>
          <span className="text-text-primary font-medium">
            {customFieldCount} filled
          </span>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Company Selector Component (List View with Pagination)
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
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  const filteredCompanies = useMemo(() => {
    if (!searchQuery) return companies;
    const query = searchQuery.toLowerCase();
    return companies.filter(
      (c) =>
        c.name.toLowerCase().includes(query) ||
        c.uen.toLowerCase().includes(query)
    );
  }, [companies, searchQuery]);

  const paginatedCompanies = useMemo(() => {
    const startIndex = (page - 1) * limit;
    return filteredCompanies.slice(startIndex, startIndex + limit);
  }, [filteredCompanies, page, limit]);

  const totalPages = Math.ceil(filteredCompanies.length / limit);

  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    setPage(1);
  }, []);

  const handleLimitChange = useCallback((newLimit: number) => {
    setLimit(newLimit);
    setPage(1);
  }, []);

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
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search companies..."
          className="w-full pl-9 pr-4 py-2 text-sm border border-border-primary rounded-lg bg-background-elevated text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-primary focus:border-accent-primary"
        />
      </div>

      {/* Option to skip company - styled as a list item */}
      <div className="border border-border-primary rounded-lg overflow-hidden">
        <div
          className={cn(
            'flex items-center gap-4 p-3 border-b border-border-secondary cursor-pointer transition-all',
            'hover:bg-background-secondary',
            selected === null && 'bg-accent-primary/5'
          )}
          onClick={() => onSelect(null)}
          role="button"
          tabIndex={0}
        >
          {/* Selection indicator */}
          <div
            className={cn(
              'w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0',
              selected === null
                ? 'border-oak-primary bg-oak-primary'
                : 'border-gray-400 dark:border-gray-500'
            )}
          >
            {selected === null && <div className="w-2.5 h-2.5 rounded-full bg-white" />}
          </div>
          <div className="w-8 h-8 rounded bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
            <FileText className="w-4 h-4 text-gray-600" />
          </div>
          <div className="flex-1">
            <p className="font-medium text-text-primary">No company selected</p>
            <p className="text-sm text-text-muted">
              Generate document without company context
            </p>
          </div>
        </div>

        {/* Company list */}
        {paginatedCompanies.map((company) => (
          <div
            key={company.id}
            className={cn(
              'flex items-center gap-4 p-3 border-b border-border-secondary last:border-b-0 cursor-pointer transition-all',
              'hover:bg-background-secondary',
              selected?.id === company.id && 'bg-accent-primary/5'
            )}
            onClick={() => onSelect(company)}
            role="button"
            tabIndex={0}
          >
            {/* Selection indicator */}
            <div
              className={cn(
                'w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0',
                selected?.id === company.id
                  ? 'border-oak-primary bg-oak-primary'
                  : 'border-gray-400 dark:border-gray-500'
              )}
            >
              {selected?.id === company.id && <div className="w-2.5 h-2.5 rounded-full bg-white" />}
            </div>
            <div className="w-8 h-8 rounded bg-blue-50 dark:bg-blue-950 flex items-center justify-center">
              <Building2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-text-primary truncate">
                {company.name}
              </p>
              <p className="text-sm text-text-muted">{company.uen}</p>
            </div>
            <span
              className={cn(
                'px-2 py-0.5 rounded text-xs flex-shrink-0',
                company.status === 'ACTIVE'
                  ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400'
                  : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
              )}
            >
              {company.status}
            </span>
          </div>
        ))}
      </div>

      {filteredCompanies.length === 0 && searchQuery && (
        <div className="py-8 text-center text-text-muted">
          <Building2 className="w-10 h-10 mx-auto mb-2 opacity-50" />
          <p>No companies match your search</p>
        </div>
      )}

      {/* Pagination */}
      {filteredCompanies.length > 0 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          total={filteredCompanies.length}
          limit={limit}
          onPageChange={setPage}
          onLimitChange={handleLimitChange}
        />
      )}
    </div>
  );
}

// ============================================================================
// Custom Data Form Component (with max-width for UX)
// ============================================================================

interface CustomDataFormProps {
  template: DocumentTemplate;
  customData: Record<string, string>;
  title: string;
  useLetterhead: boolean;
  partials?: TemplatePartial[];
  onTitleChange: (title: string) => void;
  onCustomDataChange: (data: Record<string, string>) => void;
  onLetterheadChange: (value: boolean) => void;
}

function CustomDataForm({
  template,
  customData,
  title,
  useLetterhead,
  partials = [],
  onTitleChange,
  onCustomDataChange,
  onLetterheadChange,
}: CustomDataFormProps) {
  // Helper to extract partial references from content
  const extractPartialReferences = useCallback((content: string): string[] => {
    if (!content) return [];
    const partialRefPattern = /\{\{(?:>|&gt;|&#62;|&#x3[eE];)\s*([a-zA-Z][a-zA-Z0-9_-]*)\s*\}\}/g;
    const matches = content.matchAll(partialRefPattern);
    const partialNames = new Set<string>();
    for (const match of matches) {
      if (match[1]) partialNames.add(match[1]);
    }
    return Array.from(partialNames);
  }, []);

  // Get custom placeholders (those that need user input) - merged from template and partials
  // Now includes linkedTo field for conditional visibility
  const customPlaceholders = useMemo(() => {
    const templatePlaceholders = (template.placeholders || []).filter(
      (p) => p.category === 'custom' || p.category === 'Custom'
    );

    // Template placeholders may already include partial placeholders with linkedTo
    // These were saved with the template's placeholders array
    // We only need to add placeholders from partials that aren't already in the template
    const seenKeys = new Set(templatePlaceholders.map((p) => p.key.replace('custom.', '')));

    // Extract partial references from template content
    const referencedPartialNames = extractPartialReferences(template.content || '');

    // Get placeholders from referenced partials (only those not already in template)
    const additionalPartialPlaceholders: typeof templatePlaceholders = [];

    referencedPartialNames.forEach((partialName) => {
      const partial = partials.find((p) => p.name === partialName);
      if (!partial?.placeholders) return;

      // Parse placeholders if string
      let placeholdersArray = partial.placeholders;
      if (typeof placeholdersArray === 'string') {
        try {
          placeholdersArray = JSON.parse(placeholdersArray);
        } catch {
          placeholdersArray = [];
        }
      }

      // Add placeholders from this partial (only if not already in template)
      (placeholdersArray as Array<{ key: string; label: string; type?: string; category?: string; required?: boolean; defaultValue?: string; linkedTo?: string; sourcePartial?: string }>)
        .filter((p) => p.category === 'custom' || p.category === 'Custom' || p.key?.startsWith('custom.'))
        .forEach((p) => {
          const key = p.key.replace('custom.', '');
          if (!seenKeys.has(key)) {
            additionalPartialPlaceholders.push({
              ...p,
              key: p.key,
              label: p.label || key,
              type: p.type || 'text',
              category: 'custom',
              required: p.required ?? false,
            });
            seenKeys.add(key);
          }
        });
    });

    return [...templatePlaceholders, ...additionalPartialPlaceholders];
  }, [template, partials, extractPartialReferences]);

  // Helper to check if a placeholder should be visible based on linkedTo boolean
  const isPlaceholderVisible = useCallback((placeholder: { key: string; linkedTo?: string }) => {
    // Type cast to access linkedTo which may exist on template placeholders
    const linkedTo = (placeholder as { linkedTo?: string }).linkedTo;
    if (!linkedTo) return true; // No linkedTo, always visible

    // Get the value of the linked boolean placeholder
    const booleanValue = customData[linkedTo];
    // Show only if the linked boolean is true
    return booleanValue === 'true' || booleanValue === '1';
  }, [customData]);

  // Filter visible placeholders - cast to allow linkedTo access
  const visiblePlaceholders = useMemo(() => {
    return customPlaceholders.filter((p) => isPlaceholderVisible(p as { key: string; linkedTo?: string }));
  }, [customPlaceholders, isPlaceholderVisible]);

  // Helper to strip 'custom.' prefix from keys for proper context resolution
  const getStorageKey = (key: string) => key.replace(/^custom\./, '');

  const handleFieldChange = (key: string, value: string) => {
    const storageKey = getStorageKey(key);
    onCustomDataChange({
      ...customData,
      [storageKey]: value,
    });
  };

  return (
    <div className="max-w-2xl space-y-6">
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
      {visiblePlaceholders.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-text-primary mb-3">
            Custom Fields
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {visiblePlaceholders.map((placeholder) => {
              const storageKey = getStorageKey(placeholder.key);
              // Hidden placeholders are not required (they are filtered out above)
              const isRequired = placeholder.required;
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
                        {isRequired && (
                          <span className="text-red-500 ml-1">*</span>
                        )}
                      </>
                    ) : (
                      <>
                        {placeholder.label}
                        {isRequired && (
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

      {visiblePlaceholders.length === 0 && (
        <div className="text-sm text-text-muted italic py-4">
          No custom fields required for this template.
        </div>
      )}

      {/* Options */}
      <div className="border-t border-border-secondary pt-4">
        <h4 className="text-sm font-medium text-text-primary mb-3">Options</h4>
        <div className="space-y-3">
          {/* Letterhead toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg border border-border-primary bg-background-secondary">
            <div className="flex flex-col">
              <span className="text-sm font-medium text-text-primary">Include Letterhead</span>
              <span className="text-xs text-text-tertiary">
                {useLetterhead ? 'Letterhead will be added to PDF export' : 'PDF will be exported without letterhead'}
              </span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={useLetterhead}
              onClick={() => onLetterheadChange(!useLetterhead)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2 ${
                useLetterhead ? 'bg-status-success' : 'bg-background-tertiary'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  useLetterhead ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


// ============================================================================
// Edit Step Component (using A4PageEditor)
// ============================================================================

interface EditStepProps {
  content: string;
  validationResult: ValidationResult | null;
  isLoading: boolean;
  onChange: (content: string) => void;
  onRefresh: () => void;
}

function EditStep({ content, validationResult, isLoading, onChange, onRefresh }: EditStepProps) {
  const editorRef = useRef<A4PageEditorRef>(null);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-accent-primary mb-4" />
        <p className="text-text-muted">Generating document...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Validation warnings */}
      {validationResult && !validationResult.isValid && (
        <div className="p-4 bg-status-warning/10 border border-status-warning/30 rounded-lg">
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

      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-text-primary">
          Edit & Preview Document
        </h4>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          className="text-text-muted"
        >
          <RefreshCw className="w-4 h-4 mr-1" />
          Regenerate
        </Button>
      </div>

      <div className="border border-border-primary rounded-lg overflow-hidden bg-background-secondary min-h-[500px]">
        <A4PageEditor
          ref={editorRef}
          value={content}
          onChange={onChange}
          placeholder="Document content..."
        />
      </div>

      <p className="text-xs text-text-muted text-center">
        Edit the document above, then click &quot;Generate Document&quot; to save.
      </p>
    </div>
  );
}

// ============================================================================
// Main Wizard Component
// ============================================================================

export function DocumentGenerationWizard({
  templates,
  companies,
  partials = [],
  tenantId,
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
    editedContent: null,
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

  // Count filled custom fields for summary
  const filledCustomFieldCount = useMemo(() => {
    return Object.values(state.customData).filter((v) => v && v.trim() !== '').length;
  }, [state.customData]);

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
        case 3: // Edit & Preview
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

    // Generate preview and move to edit step
    if (currentStep === 2) {
      setIsValidating(true);

      // Optionally validate
      if (onValidate && state.selectedTemplate) {
        try {
          const result = await onValidate(
            state.selectedTemplate.id,
            state.selectedCompany?.id,
            state.customData
          );
          setState((prev) => ({ ...prev, validationResult: result }));
        } catch (err) {
          console.error('Validation error:', err);
        }
      }

      // Generate preview content
      await generatePreview();
      setIsValidating(false);
    }

    // Generate document at edit step
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
    setError(null);
    try {
      // Build request body
      const requestBody: Record<string, unknown> = {
        templateId: state.selectedTemplate.id,
        companyId: state.selectedCompany?.id,
        customData: state.customData,
      };

      // Add tenantId if provided (for SUPER_ADMIN)
      if (tenantId) {
        requestBody.tenantId = tenantId;
      }

      // Call preview API
      const response = await fetch('/api/generated-documents/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to generate preview');
      }

      const data = await response.json();
      setState((prev) => ({
        ...prev,
        previewContent: data.preview?.content || data.content,
      }));
    } catch (err) {
      console.error('Preview error:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate preview');
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
        editedContent: state.editedContent || state.previewContent || undefined,
      });

      // onGenerate will redirect to the view page
      setState((prev) => ({ ...prev, generatedDocument: result }));
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
      editedContent: null,
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
            partials={partials}
            onTitleChange={(title) => setState((prev) => ({ ...prev, title }))}
            onCustomDataChange={(data) =>
              setState((prev) => ({ ...prev, customData: data }))
            }
            onLetterheadChange={(value) =>
              setState((prev) => ({ ...prev, useLetterhead: value }))
            }
          />
        ) : null;

      case 3:
        return (
          <EditStep
            content={state.previewContent || ''}
            validationResult={state.validationResult}
            isLoading={isValidating}
            onChange={(content) =>
              setState((prev) => ({ ...prev, previewContent: content }))
            }
            onRefresh={generatePreview}
          />
        );

      default:
        return null;
    }
  };

  return (
    <div className={cn('flex flex-col', className)}>
      {/* Summary Card (always visible except on complete step) */}
      {currentStep < 4 && (
        <SummaryCard
          template={state.selectedTemplate}
          company={state.selectedCompany}
          title={state.title}
          customFieldCount={filledCustomFieldCount}
        />
      )}

      {/* Stepper */}
      <div className="mt-6 mb-4">
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
        <div className="mt-4 p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
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
            <Button
              variant="primary"
              onClick={goToNextStep}
              disabled={!isStepValid(currentStep) || isGenerating || isValidating}
            >
              {isGenerating || isValidating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {isValidating ? 'Processing...' : 'Generating...'}
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
