'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  FileText,
  Building2,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Sparkles,
  Search,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DocumentParty } from '@/lib/document-party';
import {
  getRequiredLegacyContactSelection,
  getRequiredPartySelections,
  type RequiredPartySelections,
} from '@/lib/template-analysis';
import { Button } from '@/components/ui/button';
import { Stepper, type Step } from '@/components/ui/stepper';
import { Pagination } from '@/components/ui/pagination';
import { TemplateSelector, type DocumentTemplate } from './template-selector';
import {
  DOCUMENT_GENERATION_STAGES,
  SERVICE_AGREEMENT_GENERATION_STAGES,
  normalizeDocumentGenerationStage,
  normalizeServiceAgreementGenerationStage,
} from './document-generation-stage';
import { DocumentPartyChoiceList } from './document-party-choice-list';
import {
  DocumentContactChoiceList,
  type DocumentContact,
} from './document-contact-choice-list';
import { type ValidationResult } from './validation-panel';
import { A4PageEditor, type A4PageEditorRef } from './a4-page-editor';
import {
  extractA4DocumentLayout,
  type A4DocumentLayout,
} from './a4-pagination/layout';
import type { GenerationSessionEnvelope } from '@/lib/document-generation-session';
import {
  GENERATION_SESSION_VERSION,
  type SaveGenerationSessionInput,
  type GenerationSessionState,
} from '@/lib/validations/generated-document';
import { useUnsavedNavigationGuard } from '@/hooks/use-unsaved-navigation-guard';
import type {
  ServiceAgreementDraftDto,
  ServiceAgreementItemDto,
  ServiceAgreementItemInput,
} from '@/services/service-agreement';
import { ServiceAgreementSetup } from './service-agreement/service-agreement-setup';
import { ServiceSelectionStep } from './service-agreement/service-selection-step';
import { ServiceAgreementWarning } from './service-agreement/service-agreement-warning';

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

export type { DocumentContact } from './document-contact-choice-list';

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
  contacts?: DocumentContact[];
  partials?: TemplatePartial[];
  onGenerate: (data: GenerateDocumentData) => Promise<GeneratedDocumentResult>;
  initialSession?: GenerationSessionEnvelope | null;
  initialTemplateId?: string;
  initialCompanyId?: string;
  onSaveDraft?: (
    draftId: string | null,
    state: SaveGenerationSessionInput,
  ) => Promise<GenerationSessionEnvelope>;
  onGenerationComplete?: (result: GeneratedDocumentResult) => void;
  onPreviewTemplate?: (template: DocumentTemplate) => void;
  onSearchTemplates?: (query: string) => void | Promise<void>;
  onSearchCompanies?: (query: string) => void | Promise<void>;
  onSearchContacts?: (query: string) => void | Promise<void>;
  onValidate?: (
    templateId: string,
    companyId: string | undefined,
    customData: Record<string, string>,
    contactIds?: string[],
    selectedDirectorId?: string,
    selectedShareholderId?: string,
    selectedContactId?: string,
  ) => Promise<ValidationResult>;
  isLoading?: boolean;
  className?: string;
}

export interface GenerateDocumentData {
  draftId?: string;
  templateId: string;
  companyId?: string;
  contactIds?: string[];
  selectedDirectorId?: string;
  selectedShareholderId?: string;
  selectedContactId?: string;
  title: string;
  customData: Record<string, string>;
  useLetterhead: boolean;
  editedContent?: string;
  serviceAgreementId?: string;
  discardServiceAgreement?: boolean;
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
  selectedContacts: DocumentContact[];
  selectedDirectorId: string;
  selectedShareholderId: string;
  selectedContactId: string;
  title: string;
  customData: Record<string, string>;
  useLetterhead: boolean;
  validationResult: ValidationResult | null;
  generatedDocument: GeneratedDocumentResult | null;
  previewContent: string | null;
  editedContent: string | null;
  missingPlaceholders: string[];
  missingPartials: string[];
  blockingErrors: string[];
  fieldErrors: string[];
}

interface ServiceAgreementWizardState {
  authorizedContactId: string;
  entityIds: string[];
  agreementDate: string;
  effectiveDate: string;
  termMonths: number;
  items: ServiceAgreementItemInput[];
}

function agreementRemovalImpact(
  items: ServiceAgreementItemInput[],
  retainedCompanyIds: Set<string>,
): { serviceAssignments: number; feeLines: number } {
  return items.reduce(
    (impact, item) => ({
      serviceAssignments: impact.serviceAssignments
        + item.entityIds.filter((id) => !retainedCompanyIds.has(id)).length,
      feeLines: impact.feeLines
        + item.feeLines.filter((fee) => !retainedCompanyIds.has(fee.companyId)).length,
    }),
    { serviceAssignments: 0, feeLines: 0 },
  );
}

function removalImpactLabel(impact: {
  serviceAssignments: number;
  feeLines: number;
}): string {
  return `${impact.serviceAssignments} service assignment${
    impact.serviceAssignments === 1 ? '' : 's'
  } and ${impact.feeLines} fee line${impact.feeLines === 1 ? '' : 's'}`;
}

function agreementDtoToInput(
  saved: ServiceAgreementDraftDto,
): NonNullable<SaveGenerationSessionInput['serviceAgreement']> {
  return {
    primaryCompanyId: saved.primaryCompanyId,
    authorizedContactId:
      saved.authorizedContactId ?? saved.authorizedRepresentativeSnapshot.id,
    entityIds: saved.entities.map((entity) => entity.companyId),
    agreementDate: saved.agreementDate,
    effectiveDate: saved.effectiveDate,
    termMonths: saved.termMonths,
    items: saved.items.map((item) => ({
      id: item.id,
      clientKey: item.id,
      variantId: item.serviceVariantId,
      entityIds: item.entityIds
        .map((entityId) =>
          saved.entities.find((entity) => entity.id === entityId)?.companyId)
        .filter((id): id is string => Boolean(id)),
      startDate: item.startDate,
      endDate: item.endDate,
      fieldValues: item.fieldValues,
      displayOrder: item.displayOrder,
      feeLines: item.feeLines.map((fee) => ({
        id: fee.id,
        clientKey: fee.id,
        companyId: fee.companyId,
        description: fee.description,
        amount: fee.amount,
        currency: fee.currency,
        billingFrequency: fee.billingFrequency,
        customFrequencyLabel: fee.customFrequencyLabel ?? null,
        billingStartDate: fee.billingStartDate,
        displayOrder: fee.displayOrder,
      })),
    })),
  };
}

function agreementDtoToWizardState(
  saved: ServiceAgreementDraftDto,
): ServiceAgreementWizardState {
  const input = agreementDtoToInput(saved);
  return {
    ...input,
    effectiveDate: input.effectiveDate ?? '',
  };
}

function envelopeSaveSnapshot(envelope: GenerationSessionEnvelope | null): string {
  if (!envelope) return JSON.stringify(EMPTY_GENERATION_SESSION_STATE);
  return JSON.stringify({
    ...envelope.state,
    ...(envelope.agreement
      ? { serviceAgreement: agreementDtoToInput(envelope.agreement) }
      : {}),
  });
}

// ============================================================================
// Step Definitions
// ============================================================================

const WIZARD_DRAFT_STORAGE_KEY = 'oakcloud:document-generation-wizard-draft';

const EMPTY_GENERATION_SESSION_STATE: GenerationSessionState = {
  version: GENERATION_SESSION_VERSION,
  currentStep: 0,
  templateId: null,
  companyId: null,
  contactIds: [],
  selectedDirectorId: null,
  selectedShareholderId: null,
  selectedContactId: null,
  title: '',
  customData: {},
  useLetterhead: true,
  previewContent: null,
  editedContent: null,
  editedContentJson: null,
  serviceAgreementId: null,
};

interface DocumentPartyOptions {
  directors: DocumentParty[];
  shareholders: DocumentParty[];
  contacts: DocumentParty[];
}

const EMPTY_PARTY_OPTIONS: DocumentPartyOptions = {
  directors: [],
  shareholders: [],
  contacts: [],
};

// ============================================================================
// Summary Card Component
// ============================================================================

interface SummaryCardProps {
  template: DocumentTemplate | null;
  company: Company | null;
  contactCount: number;
  title: string;
  customFieldCount: number;
}

function SummaryCard({ template, company, contactCount, title, customFieldCount }: SummaryCardProps) {
  return (
    <div className="p-4 bg-background-secondary border border-border-primary rounded-lg">
      <h4 className="text-sm font-medium text-text-primary mb-3">Summary</h4>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
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
          <span className="text-text-muted block">Contacts</span>
          <span className="text-text-primary font-medium">{contactCount}</span>
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
  onSearch?: (query: string) => void | Promise<void>;
  isLoading?: boolean;
}

function CompanySelector({
  companies,
  selected,
  onSelect,
  onSearch,
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
    void onSearch?.(value);
  }, [onSearch]);

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
  layout?: A4DocumentLayout;
  validationResult: ValidationResult | null;
  missingPlaceholders: string[];
  missingPartials: string[];
  blockingErrors: string[];
  isLoading: boolean;
  onChange: (content: string) => void;
  onRefresh: () => void;
}

export function EditStep({
  content,
  layout,
  validationResult,
  missingPlaceholders,
  missingPartials,
  blockingErrors,
  isLoading,
  onChange,
  onRefresh,
}: EditStepProps) {
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

      {(missingPlaceholders.length > 0 || missingPartials.length > 0 || blockingErrors.length > 0) && (
        <div className="p-4 bg-status-warning/10 border border-status-warning/30 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-status-warning flex-shrink-0 mt-0.5" />
            <div className="space-y-2">
              <p className="text-sm font-medium text-text-primary">
                Template Data Needs Attention
              </p>
              <ul className="text-sm text-status-warning space-y-1">
                {blockingErrors.map((message) => (
                  <li key={message}>{message}</li>
                ))}
                {blockingErrors.length === 0 && missingPlaceholders.length > 0 && (
                  <li>Unresolved placeholders: {missingPlaceholders.join(', ')}</li>
                )}
                {blockingErrors.length === 0 && missingPartials.length > 0 && (
                  <li>Missing partials: {missingPartials.join(', ')}</li>
                )}
              </ul>
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
          layout={layout}
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
  contacts = [],
  partials = [],
  onGenerate,
  initialSession = null,
  initialTemplateId,
  initialCompanyId,
  onSaveDraft,
  onGenerationComplete,
  onPreviewTemplate,
  onSearchTemplates,
  onSearchCompanies,
  onSearchContacts,
  onValidate,
  isLoading = false,
  className,
}: GenerationWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showResumeNotice, setShowResumeNotice] = useState(Boolean(initialSession));
  const [resumeWarning, setResumeWarning] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<string | null>(initialSession?.id ?? null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(initialSession?.savedAt ?? null);
  const [savedSnapshot, setSavedSnapshot] = useState(() =>
    envelopeSaveSnapshot(initialSession));
  const [sessionHydrated, setSessionHydrated] = useState(!initialSession);
  const [partyOptions, setPartyOptions] = useState<DocumentPartyOptions>(EMPTY_PARTY_OPTIONS);
  const [isLoadingParties, setIsLoadingParties] = useState(false);
  const [partyLoadError, setPartyLoadError] = useState<string | null>(null);
  const [isPartyEligibilityResolved, setIsPartyEligibilityResolved] = useState(true);
  const [partyReloadVersion, setPartyReloadVersion] = useState(0);
  const hasHydratedSessionRef = useRef(false);
  const pendingDraftPartyIdsRef = useRef<{
    director: string;
    shareholder: string;
    contact: string;
    requirements: RequiredPartySelections;
    restoredStep: number;
  } | null>(null);

  const [state, setState] = useState<WizardState>({
    selectedTemplate: null,
    selectedCompany: null,
    selectedContacts: [],
    selectedDirectorId: '',
    selectedShareholderId: '',
    selectedContactId: '',
    title: '',
    customData: {},
    useLetterhead: true,
    validationResult: null,
    generatedDocument: null,
    previewContent: null,
    editedContent: null,
    missingPlaceholders: [],
    missingPartials: [],
    blockingErrors: [],
    fieldErrors: [],
  });
  const [serviceAgreementId, setServiceAgreementId] = useState<string | null>(
    initialSession?.agreement?.id ?? initialSession?.state.serviceAgreementId ?? null,
  );
  const [shouldDiscardServiceAgreement, setShouldDiscardServiceAgreement] = useState(false);
  const [pinnedAgreementItems, setPinnedAgreementItems] = useState<
    ServiceAgreementItemDto[]
  >(initialSession?.agreement?.items ?? []);
  const [serviceAgreementItemErrors, setServiceAgreementItemErrors] = useState<string[]>([]);
  const [serviceAgreement, setServiceAgreement] = useState<ServiceAgreementWizardState>(() => {
    const saved = initialSession?.agreement;
    const today = new Date().toISOString().slice(0, 10);
    return {
      authorizedContactId:
        saved?.authorizedContactId ?? saved?.authorizedRepresentativeSnapshot.id ?? '',
      entityIds: saved?.entities.map((entity) => entity.companyId) ?? [],
      agreementDate: saved?.agreementDate ?? today,
      effectiveDate: saved?.effectiveDate ?? today,
      termMonths: saved?.termMonths ?? 12,
      items: saved ? agreementDtoToInput(saved).items : [],
    };
  });
  const isServiceAgreement =
    state.selectedTemplate?.compositionType === 'SERVICE_AGREEMENT';
  const hasPinnedRepresentative = Boolean(
    isServiceAgreement && serviceAgreementId && serviceAgreement.authorizedContactId,
  );
  const wizardSteps = useMemo<Step[]>(
    () =>
      (isServiceAgreement
        ? SERVICE_AGREEMENT_GENERATION_STAGES
        : DOCUMENT_GENERATION_STAGES
      ).map((stage) => ({ ...stage })),
    [isServiceAgreement],
  );
  useEffect(() => {
    if (!isServiceAgreement || !state.selectedCompany) return;
    setServiceAgreement((previous) => ({
      ...previous,
      entityIds: [
        state.selectedCompany!.id,
        ...previous.entityIds.filter((id) => id !== state.selectedCompany!.id),
      ],
    }));
  }, [isServiceAgreement, state.selectedCompany]);

  const partyRequirements = useMemo(() => {
    if (!state.selectedTemplate) return { director: false, shareholder: false, contact: false };
    return getRequiredPartySelections(state.selectedTemplate.content || '', partials);
  }, [partials, state.selectedTemplate]);
  const requiresSingularPartySelection = (
    partyRequirements.director
    || partyRequirements.shareholder
    || partyRequirements.contact
  );

  // Update title when template is selected
  useEffect(() => {
    if (state.selectedTemplate && !state.title) {
      setState((prev) => ({
        ...prev,
        title: `${state.selectedTemplate!.name} - ${new Date().toLocaleDateString()}`,
      }));
    }
  }, [state.selectedTemplate, state.title]);

  useEffect(() => {
    window.localStorage.removeItem(WIZARD_DRAFT_STORAGE_KEY);
  }, []);

  useEffect(() => {
    if (initialSession || !initialTemplateId || state.selectedTemplate) return;
    const selectedTemplate = templates.find((template) => template.id === initialTemplateId);
    if (selectedTemplate) {
      setState((previous) => ({ ...previous, selectedTemplate }));
    }
  }, [initialSession, initialTemplateId, state.selectedTemplate, templates]);

  useEffect(() => {
    if (initialSession || !initialCompanyId || state.selectedCompany) return;
    const selectedCompany = companies.find((company) => company.id === initialCompanyId);
    if (selectedCompany) {
      setState((previous) => ({ ...previous, selectedCompany }));
    }
  }, [companies, initialCompanyId, initialSession, state.selectedCompany]);

  useEffect(() => {
    if (hasHydratedSessionRef.current || !initialSession || templates.length === 0) return;
    hasHydratedSessionRef.current = true;

    const draft = initialSession.state;
    const selectedTemplate = templates.find((template) => template.id === draft.templateId) || null;
    if (!selectedTemplate) {
      setResumeWarning('The saved template is no longer available. Select a template to continue.');
      setState((previous) => ({ ...previous, title: draft.title }));
      setCurrentStep(0);
      setSessionHydrated(true);
      return;
    }

    const selectedCompany = companies.find((company) => company.id === draft.companyId) || null;
    const selectedContactIds = new Set(draft.contactIds);
    const selectedContacts = contacts.filter((contact) => selectedContactIds.has(contact.id));
    const normalizedRestoredStep = selectedTemplate.compositionType === 'SERVICE_AGREEMENT'
      ? normalizeServiceAgreementGenerationStage(draft.currentStep)
      : normalizeDocumentGenerationStage(draft.currentStep);
    const restoredStep = selectedTemplate.compositionType === 'SERVICE_AGREEMENT'
      && normalizedRestoredStep === 3
      && !draft.previewContent
      && !draft.editedContent
        ? 2
        : normalizedRestoredStep;
    const requirements = getRequiredPartySelections(selectedTemplate.content || '', partials);
    // A resumed Service Agreement has its representative pinned in the
    // relational draft, so a missing current contact cannot invalidate it.
    const resumeRequirements = selectedTemplate.compositionType === 'SERVICE_AGREEMENT'
      && initialSession.agreement
      ? { ...requirements, contact: false }
      : requirements;
    const requiresSingularSelections = (
      resumeRequirements.director
      || resumeRequirements.shareholder
      || resumeRequirements.contact
    );
    const savedCompanyIsUnavailable = Boolean(draft.companyId && !selectedCompany);
    const failedSavedCompanyEligibility = savedCompanyIsUnavailable && requiresSingularSelections;
    const requiresEligibility = Boolean(selectedCompany && requiresSingularSelections);
    const warnings: string[] = [];
    if (savedCompanyIsUnavailable) warnings.push('The saved company is no longer available.');
    if (selectedContacts.length !== selectedContactIds.size) {
      warnings.push('One or more saved contacts are no longer available.');
    }

    pendingDraftPartyIdsRef.current = requiresEligibility ? {
      director: draft.selectedDirectorId || '',
      shareholder: draft.selectedShareholderId || '',
      contact: draft.selectedContactId || '',
      requirements: resumeRequirements,
      restoredStep,
    } : null;

    setState((previous) => ({
      ...previous,
      selectedTemplate,
      selectedCompany,
      selectedContacts,
      selectedDirectorId: requiresEligibility ? '' : draft.selectedDirectorId || '',
      selectedShareholderId: requiresEligibility ? '' : draft.selectedShareholderId || '',
      selectedContactId: requiresEligibility ? '' : draft.selectedContactId || '',
      title: draft.title,
      customData: draft.customData,
      useLetterhead: draft.useLetterhead,
      previewContent: failedSavedCompanyEligibility ? null : draft.previewContent,
      editedContent: failedSavedCompanyEligibility ? null : draft.editedContent,
      ...(failedSavedCompanyEligibility ? {
        missingPlaceholders: [],
        missingPartials: [],
        blockingErrors: [],
        validationResult: null,
      } : {}),
    }));
    setCurrentStep(failedSavedCompanyEligibility
      ? 0
      : requiresEligibility ? Math.min(restoredStep, 1) : restoredStep);
    setIsPartyEligibilityResolved(!requiresEligibility);
    setResumeWarning(warnings.length > 0 ? warnings.join(' ') : null);
    setSessionHydrated(true);
  }, [companies, contacts, initialSession, partials, templates]);

  useEffect(() => {
    const companyId = state.selectedCompany?.id;
    if (!companyId || !requiresSingularPartySelection) {
      setPartyOptions(EMPTY_PARTY_OPTIONS);
      setPartyLoadError(null);
      setIsLoadingParties(false);
      setIsPartyEligibilityResolved(true);
      return;
    }

    const controller = new AbortController();
    setIsLoadingParties(true);
    setPartyLoadError(null);

    void fetch(`/api/companies/${companyId}/document-parties`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Failed to load company party options.');
        return response.json() as Promise<DocumentPartyOptions>;
      })
      .then((options) => {
        if (controller.signal.aborted) return;
        setPartyOptions(options);
        const pending = pendingDraftPartyIdsRef.current;
        if (pending) {
          const selectedDirectorId = options.directors.some((option) => option.id === pending.director) ? pending.director : '';
          const selectedShareholderId = options.shareholders.some((option) => option.id === pending.shareholder) ? pending.shareholder : '';
          const selectedContactId = hasPinnedRepresentative
            ? pending.contact
            : options.contacts.some((option) => option.id === pending.contact)
              ? pending.contact
              : '';
          const hasInvalidRequiredSelection = (
            (pending.requirements.director && !selectedDirectorId)
            || (pending.requirements.shareholder && !selectedShareholderId)
            || (pending.requirements.contact && !selectedContactId)
          );
          if (hasInvalidRequiredSelection) {
            setResumeWarning('A saved party selection is no longer available. Select it again to continue.');
          }
          setState((previous) => ({
            ...previous,
            selectedDirectorId,
            selectedShareholderId,
            selectedContactId,
            ...(hasInvalidRequiredSelection ? {
              previewContent: null,
              editedContent: null,
              missingPlaceholders: [],
              missingPartials: [],
              blockingErrors: [],
              validationResult: null,
            } : {}),
          }));
          setCurrentStep(hasInvalidRequiredSelection ? 1 : pending.restoredStep);
          pendingDraftPartyIdsRef.current = null;
        } else {
          setState((previous) => ({
            ...previous,
            selectedDirectorId: options.directors.some((option) => option.id === previous.selectedDirectorId) ? previous.selectedDirectorId : '',
            selectedShareholderId: options.shareholders.some((option) => option.id === previous.selectedShareholderId) ? previous.selectedShareholderId : '',
            selectedContactId: hasPinnedRepresentative
              ? previous.selectedContactId
              : options.contacts.some((option) => option.id === previous.selectedContactId)
                ? previous.selectedContactId
                : '',
          }));
        }
        setIsPartyEligibilityResolved(true);
      })
      .catch((fetchError: unknown) => {
        if (controller.signal.aborted) return;
        console.error('Failed to load document party options:', fetchError);
        setPartyOptions(EMPTY_PARTY_OPTIONS);
        setPartyLoadError('Failed to load company party options.');
        const pending = pendingDraftPartyIdsRef.current;
        if (pending) {
          pendingDraftPartyIdsRef.current = null;
          setCurrentStep(1);
          setState((previous) => ({
            ...previous,
            selectedDirectorId: '',
            selectedShareholderId: '',
            selectedContactId: hasPinnedRepresentative
              ? previous.selectedContactId
              : '',
            previewContent: null,
            editedContent: null,
            missingPlaceholders: [],
            missingPartials: [],
            blockingErrors: [],
            validationResult: null,
          }));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingParties(false);
      });

    return () => controller.abort();
  }, [hasPinnedRepresentative, partyReloadVersion, requiresSingularPartySelection, state.selectedCompany?.id]);

  const retryPartyOptions = useCallback(() => {
    if (!state.selectedCompany || !requiresSingularPartySelection) return;
    setPartyOptions(EMPTY_PARTY_OPTIONS);
    setPartyLoadError(null);
    setIsLoadingParties(true);
    setIsPartyEligibilityResolved(false);
    setPartyReloadVersion((version) => version + 1);
  }, [requiresSingularPartySelection, state.selectedCompany]);

  const currentSessionState = useMemo<GenerationSessionState>(() => ({
    version: GENERATION_SESSION_VERSION,
    currentStep,
    templateId: state.selectedTemplate?.id ?? null,
    companyId: state.selectedCompany?.id ?? null,
    contactIds: state.selectedContacts.map((contact) => contact.id),
    selectedDirectorId: state.selectedDirectorId || pendingDraftPartyIdsRef.current?.director || null,
    selectedShareholderId: state.selectedShareholderId || pendingDraftPartyIdsRef.current?.shareholder || null,
    selectedContactId: state.selectedContactId || pendingDraftPartyIdsRef.current?.contact || null,
    title: state.title,
    customData: state.customData,
    useLetterhead: state.useLetterhead,
    previewContent: state.previewContent,
    editedContent: state.editedContent,
    editedContentJson: null,
    serviceAgreementId,
  }), [currentStep, serviceAgreementId, state]);
  const serviceAgreementInput = useMemo<
    NonNullable<SaveGenerationSessionInput['serviceAgreement']> | null
  >(() => {
    if (
      !isServiceAgreement ||
      !state.selectedCompany ||
      !serviceAgreement.authorizedContactId ||
      serviceAgreement.items.length === 0
    ) {
      return null;
    }
    return {
      primaryCompanyId: state.selectedCompany.id,
      authorizedContactId: serviceAgreement.authorizedContactId,
      entityIds: serviceAgreement.entityIds,
      agreementDate: serviceAgreement.agreementDate,
      effectiveDate: serviceAgreement.effectiveDate || null,
      termMonths: serviceAgreement.termMonths,
      items: serviceAgreement.items.map((item) => ({
        ...item,
        feeLines: item.feeLines.map((fee) => ({
          ...fee,
          customFrequencyLabel: fee.customFrequencyLabel ?? null,
        })),
      })),
    };
  }, [isServiceAgreement, serviceAgreement, state.selectedCompany]);
  const currentSaveInput = useMemo<SaveGenerationSessionInput>(
    () => ({
      ...currentSessionState,
      ...(serviceAgreementInput ? { serviceAgreement: serviceAgreementInput } : {}),
      ...(shouldDiscardServiceAgreement ? { discardServiceAgreement: true } : {}),
    }),
    [currentSessionState, serviceAgreementInput, shouldDiscardServiceAgreement],
  );
  const isDirty = sessionHydrated && JSON.stringify(currentSaveInput) !== savedSnapshot;
  const navigationGuard = useUnsavedNavigationGuard(
    isDirty,
    {
      description: 'You have changes that have not been saved as a draft. Leave without saving them?',
    },
  );

  const applySavedEnvelope = useCallback((saved: GenerationSessionEnvelope) => {
    setDraftId(saved.id);
    setServiceAgreementId(saved.agreement?.id ?? saved.state.serviceAgreementId);
    setPinnedAgreementItems(saved.agreement?.items ?? []);
    if (saved.agreement) {
      setServiceAgreement(agreementDtoToWizardState(saved.agreement));
    } else if (!saved.state.serviceAgreementId) {
      setServiceAgreement((previous) => ({
        ...previous,
        authorizedContactId: '',
        entityIds: [],
        items: [],
      }));
    }
    setShouldDiscardServiceAgreement(false);
    setLastSavedAt(saved.savedAt);
    setSavedSnapshot(envelopeSaveSnapshot(saved));
  }, []);

  const handleSaveDraft = useCallback(async () => {
    if (!onSaveDraft || isSavingDraft || isGenerating) return;
    setIsSavingDraft(true);
    setError(null);
    try {
      const saved = await onSaveDraft(draftId, currentSaveInput);
      applySavedEnvelope(saved);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save draft');
    } finally {
      setIsSavingDraft(false);
    }
  }, [applySavedEnvelope, currentSaveInput, draftId, isGenerating, isSavingDraft, onSaveDraft]);

  // Count filled custom fields for summary
  const filledCustomFieldCount = useMemo(() => {
    return Object.values(state.customData).filter((v) => v && v.trim() !== '').length;
  }, [state.customData]);

  const requiresLegacyContacts = useMemo(() => {
    if (!state.selectedTemplate) return false;
    return getRequiredLegacyContactSelection(state.selectedTemplate.content || '', partials);
  }, [partials, state.selectedTemplate]);

  const getRequiredPartyErrors = useCallback((): string[] => {
    const errors: string[] = [];
    if (partyRequirements.director && !state.selectedDirectorId) errors.push('Select a director for this template.');
    if (partyRequirements.shareholder && !state.selectedShareholderId) errors.push('Select a shareholder for this template.');
    if (
      partyRequirements.contact
      && !state.selectedContactId
      && !hasPinnedRepresentative
    ) {
      errors.push('Select a company contact for this template.');
    }
    return errors;
  }, [hasPinnedRepresentative, partyRequirements, state.selectedContactId, state.selectedDirectorId, state.selectedShareholderId]);

  // Check if the current stage is valid.
  const isStepValid = useCallback(
    (step: number): boolean => {
      if (isServiceAgreement) {
        if (step === 0) {
          return Boolean(
            state.selectedTemplate &&
            state.selectedCompany &&
            serviceAgreement.authorizedContactId,
          );
        }
        if (step === 1) {
          return serviceAgreement.items.length > 0
            && serviceAgreementItemErrors.length === 0;
        }
        if (step === 2) return state.title.trim().length > 0;
        return step === 3;
      }
      switch (step) {
        case 0: // Setup
          return state.selectedTemplate !== null
            && (!requiresSingularPartySelection || state.selectedCompany !== null);
        case 1: // Details
          return isPartyEligibilityResolved
            && getRequiredPartyErrors().length === 0
            && state.title.trim().length > 0;
        case 2: // Review & Generate
          return true;
        default:
          return false;
      }
    },
    [getRequiredPartyErrors, isPartyEligibilityResolved, isServiceAgreement, requiresSingularPartySelection, serviceAgreement.authorizedContactId, serviceAgreement.items.length, serviceAgreementItemErrors.length, state.selectedCompany, state.selectedTemplate, state.title]
  );

  const getRequiredCustomFieldErrors = useCallback((): string[] => {
    if (!state.selectedTemplate) return [];

    const requiredPlaceholders = (state.selectedTemplate.placeholders || []).filter(
      (placeholder) =>
        (placeholder.category === 'custom' || placeholder.category === 'Custom') &&
        placeholder.required
    );

    return requiredPlaceholders
      .filter((placeholder) => {
        const key = placeholder.key.replace(/^custom\./, '');
        const value = state.customData[key];
        return value === undefined || value === null || value.trim() === '';
      })
      .map((placeholder) => `${placeholder.label} is required`);
  }, [state.customData, state.selectedTemplate]);

  // Handle step navigation
  const goToNextStep = async () => {
    if (isServiceAgreement) {
      if (!isStepValid(currentStep)) {
        setError(
          currentStep === 0
            ? 'Select a primary company and authorised representative.'
            : currentStep === 1
              ? serviceAgreementItemErrors[0] ?? 'Add at least one service.'
              : 'Complete the agreement details.',
        );
        return;
      }
      if (currentStep === 2) {
        if (!onSaveDraft || !serviceAgreementInput) return;
        setIsSavingDraft(true);
        try {
          const saved = await onSaveDraft(draftId, {
            ...currentSaveInput,
            currentStep: 2,
            serviceAgreement: serviceAgreementInput,
          });
          applySavedEnvelope(saved);
          const previewContent = await generatePreview(
            saved.id,
            saved.agreement?.id ?? saved.state.serviceAgreementId,
          );
          if (!previewContent) return;
          const previewSaved = await onSaveDraft(saved.id, {
            ...saved.state,
            currentStep: 3,
            previewContent,
            editedContent: null,
            serviceAgreement: saved.agreement
              ? agreementDtoToInput(saved.agreement)
              : serviceAgreementInput,
          });
          applySavedEnvelope(previewSaved);
          setCurrentStep(3);
        } catch (saveError) {
          setError(
            saveError instanceof Error
              ? saveError.message
              : 'Failed to prepare the agreement preview',
          );
        } finally {
          setIsSavingDraft(false);
        }
        return;
      }
      if (currentStep === 3) {
        await handleGenerate();
        return;
      }
      setCurrentStep((previous) => previous + 1);
      return;
    }
    if (currentStep === 0 && requiresSingularPartySelection && !state.selectedCompany) {
      setState((previous) => ({
        ...previous,
        fieldErrors: ['Select a company for this template.'],
      }));
      return;
    }
    if (currentStep === 1) {
      const partyErrors = getRequiredPartyErrors();
      if (partyErrors.length > 0) {
        setState((previous) => ({ ...previous, fieldErrors: partyErrors }));
        const firstMissingId = partyRequirements.director && !state.selectedDirectorId
          ? 'party-director'
          : partyRequirements.shareholder && !state.selectedShareholderId
            ? 'party-shareholder'
            : 'party-contact';
        window.requestAnimationFrame(() => document.getElementById(firstMissingId)?.focus());
        return;
      }
      setState((previous) => ({ ...previous, fieldErrors: [] }));
      const fieldErrors = getRequiredCustomFieldErrors();
      if (fieldErrors.length > 0) {
        setState((prev) => ({ ...prev, fieldErrors }));
        return;
      }

      setState((prev) => ({ ...prev, fieldErrors: [] }));
      setIsValidating(true);

      // Optionally validate
      if (onValidate && state.selectedTemplate) {
        try {
          const result = await onValidate(
            state.selectedTemplate.id,
            state.selectedCompany?.id,
            state.customData,
            state.selectedContacts.map((contact) => contact.id),
            state.selectedDirectorId || undefined,
            state.selectedShareholderId || undefined,
            state.selectedContactId || undefined,
          );
          setState((prev) => ({ ...prev, validationResult: result }));
        } catch (err) {
          console.error('Validation error:', err);
        }
      }

      // Generate preview content
      const previewSucceeded = await generatePreview();
      setIsValidating(false);
      if (!previewSucceeded) return;
    }

    if (!isStepValid(currentStep)) return;

    if (currentStep === 2) {
      await handleGenerate();
      return;
    }

    setCurrentStep((prev) => Math.min(prev + 1, wizardSteps.length - 1));
  };

  const goToPreviousStep = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
    setError(null);
  };

  // Generate preview content
  const generatePreview = async (
    previewDraftId = draftId,
    previewAgreementId = serviceAgreementId,
  ) => {
    if (!state.selectedTemplate) return false;

    setIsValidating(true);
    setError(null);
    try {
      // Build request body
      const requestBody: Record<string, unknown> = {
        templateId: state.selectedTemplate.id,
        companyId: state.selectedCompany?.id,
        contactIds: state.selectedContacts.map((contact) => contact.id),
        selectedDirectorId: state.selectedDirectorId || undefined,
        selectedShareholderId: state.selectedShareholderId || undefined,
        selectedContactId: state.selectedContactId || undefined,
        customData: state.customData,
        ...(isServiceAgreement
          ? {
              draftId: previewDraftId,
              serviceAgreementId: previewAgreementId,
            }
          : {}),
      };

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
      const blockingErrors = data.preview?.blockingErrors || [];
      const previewContent = data.preview?.content || data.content;
      setState((prev) => ({
        ...prev,
        previewContent,
        missingPlaceholders: data.preview?.unresolvedPlaceholders || [],
        missingPartials: data.preview?.missingPartials || [],
        blockingErrors,
      }));
      if (blockingErrors.length > 0) {
        setError(blockingErrors.join(' '));
        return false;
      }
      return previewContent || null;
    } catch (err) {
      console.error('Preview error:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate preview');
      return null;
    } finally {
      setIsValidating(false);
    }
  };

  // Handle document generation
  const handleGenerate = async () => {
    if (!state.selectedTemplate || !isPartyEligibilityResolved || getRequiredPartyErrors().length > 0) return;
    if (state.blockingErrors.length > 0) {
      setError(state.blockingErrors.join(' '));
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const result = await onGenerate({
        draftId: draftId || undefined,
        templateId: state.selectedTemplate.id,
        companyId: state.selectedCompany?.id,
        contactIds: state.selectedContacts.map((contact) => contact.id),
        selectedDirectorId: state.selectedDirectorId || undefined,
        selectedShareholderId: state.selectedShareholderId || undefined,
        selectedContactId: state.selectedContactId || undefined,
        title: state.title,
        customData: state.customData,
        useLetterhead: state.useLetterhead,
        editedContent: state.editedContent || state.previewContent || undefined,
        serviceAgreementId: isServiceAgreement
          ? serviceAgreementId ?? undefined
          : undefined,
        discardServiceAgreement: shouldDiscardServiceAgreement || undefined,
      });

      if (shouldDiscardServiceAgreement) {
        setServiceAgreementId(null);
        setPinnedAgreementItems([]);
        setServiceAgreement((previous) => ({
          ...previous,
          authorizedContactId: '',
          entityIds: [],
          items: [],
        }));
        setShouldDiscardServiceAgreement(false);
      }
      setState((prev) => ({ ...prev, generatedDocument: result }));
      setSavedSnapshot(JSON.stringify(currentSessionState));
      navigationGuard.disarm();
      onGenerationComplete?.(result);
    } catch (err) {
      console.error('Generation error:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate document');
    }

    setIsGenerating(false);
  };

  // Render step content
  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <div className="space-y-6">
            {state.fieldErrors.includes('Select a company for this template.') ? (
              <div className="p-3 bg-status-error/10 border border-status-error/30 rounded-lg" role="alert">
                <div className="flex items-start gap-2 text-status-error">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <p className="text-sm">Select a company for this template.</p>
                </div>
              </div>
            ) : null}
            <div className="grid gap-6 xl:grid-cols-2">
              <section className="min-w-0 rounded-2xl border border-border-primary bg-background-primary p-4 sm:p-5">
                <div className="mb-4">
                  <h2 className="text-lg font-semibold text-text-primary">Choose a template</h2>
                  <p className="mt-1 text-sm text-text-muted">Start with the document structure you need.</p>
                  <div
                    role="status"
                    aria-label="Selected template"
                    className="mt-4 flex min-w-0 items-center gap-3 rounded-xl border border-border-primary bg-background-secondary/70 px-3 py-3"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-oak-primary/10 text-oak-primary">
                      <FileText className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-2xs font-medium uppercase tracking-wide text-text-muted">
                        Selected template
                      </p>
                      <p className="truncate text-sm font-medium text-text-primary">
                        {state.selectedTemplate?.name || 'No template selected'}
                      </p>
                      <p className="truncate text-xs text-text-muted">
                        {state.selectedTemplate?.category || 'Choose a template below'}
                      </p>
                    </div>
                  </div>
                </div>
                <TemplateSelector
                  templates={templates}
                  selectedTemplate={state.selectedTemplate}
                  onSelect={(template) => {
                    const isSwitchingAwayFromAgreement = Boolean(
                      isServiceAgreement
                        && template.compositionType !== 'SERVICE_AGREEMENT'
                        && (serviceAgreementId || serviceAgreement.items.length),
                    );
                    if (
                      isSwitchingAwayFromAgreement
                      && !window.confirm(
                        'Discard the saved Service Agreement selections and switch templates?',
                      )
                    ) {
                      return;
                    }
                    if (isSwitchingAwayFromAgreement) {
                      setShouldDiscardServiceAgreement(true);
                    } else if (template.compositionType === 'SERVICE_AGREEMENT') {
                      setShouldDiscardServiceAgreement(false);
                    }
                    setState((prev) => ({
                      ...prev,
                      selectedTemplate: template,
                      selectedContactId: prev.selectedContactId,
                      previewContent: null,
                      editedContent: null,
                      fieldErrors: [],
                    }));
                  }}
                  onPreview={onPreviewTemplate}
                  onSearch={onSearchTemplates}
                  isLoading={isLoading}
                />
              </section>

              <section className="min-w-0 rounded-2xl border border-border-primary bg-background-primary p-4 sm:p-5">
                <div className="mb-4">
                  <h2 className="text-lg font-semibold text-text-primary">Choose a company</h2>
                  <p className="mt-1 text-sm text-text-muted">
                    Add company context when the template needs it.
                  </p>
                  <div
                    role="status"
                    aria-label="Selected company"
                    className="mt-4 flex min-w-0 items-center gap-3 rounded-xl border border-border-primary bg-background-secondary/70 px-3 py-3"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
                      <Building2 className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-2xs font-medium uppercase tracking-wide text-text-muted">
                        Selected company
                      </p>
                      <p className="truncate text-sm font-medium text-text-primary">
                        {state.selectedCompany?.name || 'No company selected'}
                      </p>
                      <p className="truncate text-xs text-text-muted">
                        {state.selectedCompany?.uen || 'Generate without company context'}
                      </p>
                    </div>
                  </div>
                </div>
                <CompanySelector
                  companies={companies}
                  selected={state.selectedCompany}
                  onSelect={(company) => {
                    if (company?.id === state.selectedCompany?.id) {
                      if (partyLoadError && requiresSingularPartySelection) retryPartyOptions();
                      return;
                    }
                    if (isServiceAgreement) {
                      const impact = agreementRemovalImpact(
                        serviceAgreement.items,
                        new Set(company ? [company.id] : []),
                      );
                      if (
                        (impact.serviceAssignments > 0 || impact.feeLines > 0)
                        && !window.confirm(
                          `Changing the primary company will remove ${
                            removalImpactLabel(impact)
                          }. Continue?`,
                        )
                      ) {
                        return;
                      }
                    }
                    pendingDraftPartyIdsRef.current = null;
                    setPartyOptions(EMPTY_PARTY_OPTIONS);
                    setPartyLoadError(null);
                    setIsLoadingParties(Boolean(company && requiresSingularPartySelection));
                    setIsPartyEligibilityResolved(!company || !requiresSingularPartySelection);
                    setState((prev) => ({
                      ...prev,
                      selectedCompany: company,
                      selectedDirectorId: '',
                      selectedShareholderId: '',
                      selectedContactId: '',
                      previewContent: null,
                      editedContent: null,
                      fieldErrors: [],
                    }));
                    setServiceAgreement((previous) => ({
                      ...previous,
                      authorizedContactId: '',
                      entityIds: company ? [company.id] : [],
                      items: previous.items.map((item) => ({
                        ...item,
                        entityIds: company && item.entityIds.includes(company.id)
                          ? [company.id]
                          : [],
                        feeLines: company
                          ? item.feeLines.filter((fee) => fee.companyId === company.id)
                          : [],
                      })),
                    }));
                  }}
                  onSearch={onSearchCompanies}
                />
              </section>
            </div>
            {isServiceAgreement ? (
              <ServiceAgreementSetup
                primaryCompany={state.selectedCompany}
                companies={companies}
                contacts={partyOptions.contacts.map((contact) => ({
                  id: contact.id,
                  fullName: contact.name,
                  designation: contact.detail,
                  email: contact.email,
                  phone: contact.phone,
                }))}
                entityIds={serviceAgreement.entityIds}
                authorizedContactId={serviceAgreement.authorizedContactId}
                onBeforeEntityRemove={(company) => {
                  const impact = agreementRemovalImpact(
                    serviceAgreement.items,
                    new Set(serviceAgreement.entityIds.filter((id) => id !== company.id)),
                  );
                  if (impact.serviceAssignments === 0 && impact.feeLines === 0) return true;
                  return window.confirm(
                    `Remove ${removalImpactLabel(impact)} for ${company.name}?`,
                  );
                }}
                onEntityIdsChange={(entityIds) =>
                  setServiceAgreement((previous) => {
                    const primaryId = state.selectedCompany?.id;
                    const orderedIds = primaryId
                      ? [primaryId, ...entityIds.filter((id) => id !== primaryId)]
                      : entityIds;
                    const allowed = new Set(orderedIds);
                    return {
                      ...previous,
                      entityIds: orderedIds,
                      items: previous.items.map((item) => ({
                        ...item,
                        entityIds: item.entityIds.filter((id) => allowed.has(id)),
                        feeLines: item.feeLines.filter((fee) => allowed.has(fee.companyId)),
                      })),
                    };
                  })
                }
                onAuthorizedContactIdChange={(authorizedContactId) => {
                  setServiceAgreement((previous) => ({
                    ...previous,
                    authorizedContactId,
                  }));
                  setState((previous) => ({
                    ...previous,
                    selectedContactId: authorizedContactId,
                  }));
                }}
                onSearchCompanies={onSearchCompanies}
              />
            ) : null}
          </div>
        );

      case 1:
        if (isServiceAgreement) {
          return (
            <ServiceSelectionStep
              entities={companies.filter((company) =>
                serviceAgreement.entityIds.includes(company.id))}
              items={serviceAgreement.items}
              pinnedItems={pinnedAgreementItems}
              agreementId={serviceAgreementId}
              onPinnedItemChange={(changed) =>
                setPinnedAgreementItems((current) =>
                  current.map((item) => item.id === changed.id ? changed : item))
              }
              onValidationErrorsChange={setServiceAgreementItemErrors}
              onChange={(items) =>
                setServiceAgreement((previous) => ({ ...previous, items }))
              }
            />
          );
        }
        return (
          <div className="space-y-6">
            {state.fieldErrors.length > 0 ? (
              <div className="p-4 bg-status-error/10 border border-status-error/30 rounded-lg" role="alert">
                <div className="flex items-start gap-3 text-status-error">
                  <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <ul className="text-sm space-y-1">
                    {state.fieldErrors.map((message) => <li key={message}>{message}</li>)}
                  </ul>
                </div>
              </div>
            ) : null}
            {partyRequirements.director ? (
              <DocumentPartyChoiceList
                key={`${state.selectedCompany?.id || 'none'}-director`}
                id="party-director"
                label="Director"
                options={partyOptions.directors}
                value={state.selectedDirectorId}
                onChange={(selectedDirectorId) => setState((previous) => ({ ...previous, selectedDirectorId, fieldErrors: [] }))}
                isLoading={isLoadingParties}
                error={partyLoadError}
                onRetry={retryPartyOptions}
                required
              />
            ) : null}
            {partyRequirements.shareholder ? (
              <DocumentPartyChoiceList
                key={`${state.selectedCompany?.id || 'none'}-shareholder`}
                id="party-shareholder"
                label="Shareholder"
                options={partyOptions.shareholders}
                value={state.selectedShareholderId}
                onChange={(selectedShareholderId) => setState((previous) => ({ ...previous, selectedShareholderId, fieldErrors: [] }))}
                isLoading={isLoadingParties}
                error={partyLoadError}
                onRetry={retryPartyOptions}
                required
              />
            ) : null}
            {partyRequirements.contact ? (
              <DocumentPartyChoiceList
                key={`${state.selectedCompany?.id || 'none'}-contact`}
                id="party-contact"
                label="Company Contact"
                options={partyOptions.contacts}
                value={state.selectedContactId}
                onChange={(selectedContactId) => setState((previous) => ({ ...previous, selectedContactId, fieldErrors: [] }))}
                isLoading={isLoadingParties}
                error={partyLoadError}
                onRetry={retryPartyOptions}
                required
              />
            ) : null}
            {requiresLegacyContacts ? (
              <div className="space-y-2">
                {(partyRequirements.director || partyRequirements.shareholder || partyRequirements.contact) ? (
                  <h3 className="text-sm font-medium text-text-primary">Additional contacts</h3>
                ) : null}
                <DocumentContactChoiceList
                  contacts={contacts}
                  selected={state.selectedContacts}
                  onChange={(selectedContacts) => setState((prev) => ({ ...prev, selectedContacts }))}
                  onSearch={onSearchContacts}
                />
              </div>
            ) : null}
            {!partyRequirements.director && !partyRequirements.shareholder && !partyRequirements.contact && !requiresLegacyContacts ? (
              <p className="py-8 text-center text-sm text-text-muted">This template does not require any people selections.</p>
            ) : null}
            {state.selectedTemplate ? (
              <section className="rounded-2xl border border-border-primary bg-background-primary p-4 sm:p-5">
                <div className="mb-4">
                  <h2 className="text-lg font-semibold text-text-primary">Document details</h2>
                  <p className="mt-1 text-sm text-text-muted">
                    Complete the title, template fields, and output options.
                  </p>
                </div>
                <CustomDataForm
                  template={state.selectedTemplate}
                  title={state.title}
                  customData={state.customData}
                  useLetterhead={state.useLetterhead}
                  partials={partials}
                  onTitleChange={(title) => setState((prev) => ({ ...prev, title, fieldErrors: [] }))}
                  onCustomDataChange={(data) =>
                    setState((prev) => ({ ...prev, customData: data, fieldErrors: [] }))
                  }
                  onLetterheadChange={(value) =>
                    setState((prev) => ({ ...prev, useLetterhead: value }))
                  }
                />
              </section>
            ) : null}
          </div>
        );

      case 2:
        if (isServiceAgreement) {
          return (
            <section className="rounded-xl border border-border-primary bg-background-primary p-4">
              <h2 className="text-lg font-semibold text-text-primary">Agreement details</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <label className="text-xs text-text-secondary">
                  Agreement date
                  <input type="date" value={serviceAgreement.agreementDate} onChange={(event) => setServiceAgreement((previous) => ({ ...previous, agreementDate: event.target.value }))} className="mt-1 h-11 w-full rounded border border-border-primary bg-background-primary px-2 sm:h-9" />
                </label>
                <label className="text-xs text-text-secondary">
                  Effective date
                  <input type="date" value={serviceAgreement.effectiveDate} onChange={(event) => setServiceAgreement((previous) => ({ ...previous, effectiveDate: event.target.value }))} className="mt-1 h-11 w-full rounded border border-border-primary bg-background-primary px-2 sm:h-9" />
                </label>
                <label className="text-xs text-text-secondary">
                  Term (months)
                  <input type="number" min="1" value={String(serviceAgreement.termMonths)} onChange={(event) => setServiceAgreement((previous) => ({ ...previous, termMonths: Number(event.target.value) || 1 }))} className="mt-1 h-11 w-full rounded border border-border-primary bg-background-primary px-2 sm:h-9" />
                </label>
              </div>
              {state.selectedTemplate ? (
                <div className="mt-4">
                  <CustomDataForm template={state.selectedTemplate} title={state.title} customData={state.customData} useLetterhead={state.useLetterhead} partials={partials} onTitleChange={(title) => setState((previous) => ({ ...previous, title }))} onCustomDataChange={(customData) => setState((previous) => ({ ...previous, customData }))} onLetterheadChange={(useLetterhead) => setState((previous) => ({ ...previous, useLetterhead }))} />
                </div>
              ) : null}
            </section>
          );
        }
        return (
          <div className="grid min-w-0 gap-6 2xl:grid-cols-[minmax(0,1fr)_minmax(320px,384px)]">
            <div className="min-w-0">
              <EditStep
                content={state.previewContent || ''}
                layout={extractA4DocumentLayout(state.selectedTemplate?.contentJson)}
                validationResult={state.validationResult}
                missingPlaceholders={state.missingPlaceholders}
                missingPartials={state.missingPartials}
                blockingErrors={state.blockingErrors}
                isLoading={isValidating}
                onChange={(content) =>
                  setState((prev) => ({ ...prev, previewContent: content, editedContent: content }))
                }
                onRefresh={generatePreview}
              />
            </div>
            <aside className="space-y-4 2xl:sticky 2xl:top-4 2xl:self-start">
              <SummaryCard
                template={state.selectedTemplate}
                company={state.selectedCompany}
                contactCount={state.selectedContacts.length}
                title={state.title}
                customFieldCount={filledCustomFieldCount}
              />
              <div className="rounded-xl border border-border-primary bg-background-primary p-4">
                <h3 className="text-sm font-semibold text-text-primary">Need to make a change?</h3>
                <p className="mt-1 text-xs text-text-muted">
                  Revisit an earlier stage without discarding your document draft.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setCurrentStep(0)}>
                    Change setup
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setCurrentStep(1)}>
                    Change details
                  </Button>
                </div>
              </div>
            </aside>
          </div>
        );

      case 3:
        if (!isServiceAgreement) return null;
        return (
          <div className="min-w-0">
            <ServiceAgreementWarning onBackToServices={() => setCurrentStep(1)} />
            <EditStep
              content={state.previewContent || ''}
              layout={extractA4DocumentLayout(state.selectedTemplate?.contentJson)}
              validationResult={state.validationResult}
              missingPlaceholders={state.missingPlaceholders}
              missingPartials={state.missingPartials}
              blockingErrors={state.blockingErrors}
              isLoading={isValidating}
              onChange={(content) =>
                setState((previous) => ({
                  ...previous,
                  previewContent: content,
                  editedContent: content,
                }))
              }
              onRefresh={() => generatePreview()}
            />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className={cn('flex flex-col', className)}>
      {showResumeNotice && (
        <div className="p-3 bg-accent-primary/5 border border-accent-primary/20 rounded-lg">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2 text-sm text-text-secondary">
              <AlertTriangle className="w-4 h-4 mt-0.5 text-accent-primary flex-shrink-0" />
              <span>Saved draft resumed</span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setShowResumeNotice(false)}>
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {resumeWarning && (
        <div className="mt-4 p-3 bg-status-warning/10 border border-status-warning/20 rounded-lg">
          <div className="flex items-start gap-2 text-sm text-text-secondary">
            <AlertTriangle className="w-4 h-4 mt-0.5 text-status-warning flex-shrink-0" />
            <span>{resumeWarning}</span>
          </div>
        </div>
      )}

      {/* Stepper */}
      <div className="mb-5 rounded-xl border border-border-primary bg-background-secondary/70 px-3 py-3 sm:px-5">
        <Stepper
          steps={wizardSteps}
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
      {currentStep < wizardSteps.length && (
        <div className="sticky bottom-0 z-20 -mx-4 mt-8 flex items-center justify-between border-t border-border-primary bg-background-primary/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
          <Button
            variant="ghost"
            onClick={goToPreviousStep}
            disabled={currentStep === 0}
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back
          </Button>

          <div className="flex items-center gap-3">
            <span className={cn(
              'hidden text-xs sm:inline',
              isDirty ? 'text-status-warning' : 'text-text-muted',
            )}>
              {isSavingDraft
                ? 'Saving...'
                : isDirty
                  ? 'Unsaved changes'
                  : lastSavedAt
                    ? `Saved ${new Date(lastSavedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                    : 'Not saved yet'}
            </span>
            <Button
              variant="secondary"
              onClick={handleSaveDraft}
              disabled={isSavingDraft || isGenerating || !onSaveDraft}
            >
              {isSavingDraft ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : 'Save Draft'}
            </Button>
            <Button
              variant="primary"
              onClick={goToNextStep}
              disabled={(currentStep === 0 && !state.selectedTemplate) || isGenerating || isValidating}
            >
              {isGenerating || isValidating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {isValidating ? 'Processing...' : 'Generating...'}
                </>
              ) : currentStep === wizardSteps.length - 1 ? (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Generate Document
                </>
              ) : (
                <>
                  {isServiceAgreement
                    ? currentStep === 0
                      ? 'Continue to Services'
                      : currentStep === 1
                        ? 'Continue to Agreement details'
                        : 'Continue to Review'
                    : currentStep === 0
                      ? 'Continue to Details'
                      : 'Continue to Review'}
                  <ChevronRight className="w-4 h-4 ml-1" />
                </>
              )}
            </Button>
          </div>
        </div>
      )}
      {navigationGuard.dialog}
    </div>
  );
}

export default DocumentGenerationWizard;
