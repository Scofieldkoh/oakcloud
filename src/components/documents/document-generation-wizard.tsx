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
import { Button } from '@/components/ui/button';
import { Stepper, type Step } from '@/components/ui/stepper';
import { Pagination } from '@/components/ui/pagination';
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

export type DocumentContact = Contact;

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
  onPreviewTemplate?: (template: DocumentTemplate) => void;
  onSearchTemplates?: (query: string) => void | Promise<void>;
  onSearchCompanies?: (query: string) => void | Promise<void>;
  onSearchContacts?: (query: string) => void | Promise<void>;
  onValidate?: (
    templateId: string,
    companyId: string | undefined,
    customData: Record<string, string>,
    contactIds?: string[]
  ) => Promise<ValidationResult>;
  isLoading?: boolean;
  className?: string;
}

export interface GenerateDocumentData {
  templateId: string;
  companyId?: string;
  contactIds?: string[];
  title: string;
  customData: Record<string, string>;
  useLetterhead: boolean;
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
  selectedContacts: DocumentContact[];
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

// ============================================================================
// Step Definitions
// ============================================================================

const WIZARD_STEPS: Step[] = [
  { id: 'template', label: 'Template' },
  { id: 'company', label: 'Company' },
  { id: 'contacts', label: 'Contacts' },
  { id: 'customize', label: 'Custom Fields' },
  { id: 'edit', label: 'Edit & Preview' },
];

const WIZARD_DRAFT_STORAGE_KEY = 'oakcloud:document-generation-wizard-draft';

interface WizardDraftState {
  templateId: string | null;
  companyId: string | null;
  contactIds: string[];
  title: string;
  customData: Record<string, string>;
  useLetterhead: boolean;
  previewContent: string | null;
  editedContent: string | null;
  currentStep: number;
  savedAt: string;
}

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

interface ContactSelectorProps {
  contacts: DocumentContact[];
  selected: DocumentContact[];
  onChange: (contacts: DocumentContact[]) => void;
  onSearch?: (query: string) => void | Promise<void>;
  isLoading?: boolean;
}

function ContactSelector({
  contacts,
  selected,
  onChange,
  onSearch,
  isLoading,
}: ContactSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  const selectedIds = useMemo(() => new Set(selected.map((contact) => contact.id)), [selected]);

  const filteredContacts = useMemo(() => {
    if (!searchQuery) return contacts;
    const query = searchQuery.toLowerCase();
    return contacts.filter(
      (contact) =>
        contact.fullName.toLowerCase().includes(query) ||
        contact.email?.toLowerCase().includes(query) ||
        contact.phone?.toLowerCase().includes(query)
    );
  }, [contacts, searchQuery]);

  const paginatedContacts = useMemo(() => {
    const startIndex = (page - 1) * limit;
    return filteredContacts.slice(startIndex, startIndex + limit);
  }, [filteredContacts, page, limit]);

  const totalPages = Math.ceil(filteredContacts.length / limit);

  const toggleContact = (contact: DocumentContact) => {
    if (selectedIds.has(contact.id)) {
      onChange(selected.filter((item) => item.id !== contact.id));
    } else {
      onChange([...selected, contact]);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => {
            const nextQuery = e.target.value;
            setSearchQuery(nextQuery);
            setPage(1);
            void onSearch?.(nextQuery);
          }}
          placeholder="Search contacts..."
          className="w-full pl-9 pr-4 py-2 text-sm border border-border-primary rounded-lg bg-background-elevated text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-primary focus:border-accent-primary"
        />
      </div>

      <div className="border border-border-primary rounded-lg overflow-hidden">
        <div
          className={cn(
            'flex items-center gap-4 p-3 border-b border-border-secondary cursor-pointer transition-all',
            'hover:bg-background-secondary',
            selected.length === 0 && 'bg-accent-primary/5'
          )}
          onClick={() => onChange([])}
          role="button"
          tabIndex={0}
        >
          <div
            className={cn(
              'w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0',
              selected.length === 0
                ? 'border-oak-primary bg-oak-primary'
                : 'border-gray-400 dark:border-gray-500'
            )}
          >
            {selected.length === 0 && <div className="w-2.5 h-2.5 rounded-sm bg-white" />}
          </div>
          <div className="flex-1">
            <p className="font-medium text-text-primary">No contacts selected</p>
            <p className="text-sm text-text-muted">
              Generate without contact-specific placeholders
            </p>
          </div>
        </div>

        {paginatedContacts.map((contact) => {
          const isSelected = selectedIds.has(contact.id);
          return (
            <div
              key={contact.id}
              className={cn(
                'flex items-center gap-4 p-3 border-b border-border-secondary last:border-b-0 cursor-pointer transition-all',
                'hover:bg-background-secondary',
                isSelected && 'bg-accent-primary/5'
              )}
              onClick={() => toggleContact(contact)}
              role="button"
              tabIndex={0}
            >
              <div
                className={cn(
                  'w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0',
                  isSelected
                    ? 'border-oak-primary bg-oak-primary'
                    : 'border-gray-400 dark:border-gray-500'
                )}
              >
                {isSelected && <div className="w-2.5 h-2.5 rounded-sm bg-white" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-text-primary truncate">{contact.fullName}</p>
                {(contact.email || contact.phone) && (
                  <p className="text-sm text-text-muted truncate">
                    {[contact.email, contact.phone].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {filteredContacts.length === 0 && searchQuery && (
        <div className="py-8 text-center text-text-muted">
          <p>No contacts match your search</p>
        </div>
      )}

      {filteredContacts.length > 0 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          total={filteredContacts.length}
          limit={limit}
          onPageChange={setPage}
          onLimitChange={(newLimit) => {
            setLimit(newLimit);
            setPage(1);
          }}
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
  missingPlaceholders: string[];
  missingPartials: string[];
  blockingErrors: string[];
  isLoading: boolean;
  onChange: (content: string) => void;
  onRefresh: () => void;
}

function EditStep({
  content,
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
  const [error, setError] = useState<string | null>(null);
  const [draftRestored, setDraftRestored] = useState(false);
  const hasLoadedDraftRef = useRef(false);

  const [state, setState] = useState<WizardState>({
    selectedTemplate: null,
    selectedCompany: null,
    selectedContacts: [],
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
    if (hasLoadedDraftRef.current || templates.length === 0) return;
    hasLoadedDraftRef.current = true;

    try {
      const rawDraft = window.localStorage.getItem(WIZARD_DRAFT_STORAGE_KEY);
      if (!rawDraft) return;

      const draft = JSON.parse(rawDraft) as Partial<WizardDraftState>;
      const selectedTemplate = templates.find((template) => template.id === draft.templateId) || null;
      if (!selectedTemplate) return;

      const selectedCompany = companies.find((company) => company.id === draft.companyId) || null;
      const selectedContactIds = new Set(draft.contactIds || []);
      const selectedContacts = contacts.filter((contact) => selectedContactIds.has(contact.id));
      const restoredStep = Math.max(0, Math.min(Number(draft.currentStep) || 0, WIZARD_STEPS.length - 1));

      setState((prev) => ({
        ...prev,
        selectedTemplate,
        selectedCompany,
        selectedContacts,
        title: typeof draft.title === 'string' ? draft.title : '',
        customData: draft.customData && typeof draft.customData === 'object' ? draft.customData : {},
        useLetterhead: typeof draft.useLetterhead === 'boolean' ? draft.useLetterhead : true,
        previewContent: typeof draft.previewContent === 'string' ? draft.previewContent : null,
        editedContent: typeof draft.editedContent === 'string' ? draft.editedContent : null,
      }));
      setCurrentStep(restoredStep);
      setDraftRestored(true);
    } catch (err) {
      console.error('Failed to restore document generation draft:', err);
    }
  }, [companies, contacts, templates]);

  useEffect(() => {
    if (!hasLoadedDraftRef.current) return;

    try {
      if (!state.selectedTemplate && !state.title && Object.keys(state.customData).length === 0) {
        window.localStorage.removeItem(WIZARD_DRAFT_STORAGE_KEY);
        return;
      }

      const draft: WizardDraftState = {
        templateId: state.selectedTemplate?.id || null,
        companyId: state.selectedCompany?.id || null,
        contactIds: state.selectedContacts.map((contact) => contact.id),
        title: state.title,
        customData: state.customData,
        useLetterhead: state.useLetterhead,
        previewContent: state.previewContent,
        editedContent: state.editedContent,
        currentStep,
        savedAt: new Date().toISOString(),
      };
      window.localStorage.setItem(WIZARD_DRAFT_STORAGE_KEY, JSON.stringify(draft));
    } catch (err) {
      console.error('Failed to save document generation draft:', err);
    }
  }, [currentStep, state]);

  const clearWizardDraft = useCallback(() => {
    try {
      window.localStorage.removeItem(WIZARD_DRAFT_STORAGE_KEY);
    } catch (err) {
      console.error('Failed to clear document generation draft:', err);
    }
    setDraftRestored(false);
  }, []);

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
        case 2: // Contacts
          return true;
        case 3: // Customize
          return state.title.trim().length > 0;
        case 4: // Edit & Preview
          return true;
        default:
          return false;
      }
    },
    [state.selectedTemplate, state.title]
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
    if (!isStepValid(currentStep)) return;
    const currentStepId = WIZARD_STEPS[currentStep]?.id;

    // Generate preview and move to edit step
    if (currentStepId === 'customize') {
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
            state.selectedContacts.map((contact) => contact.id)
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
    if (currentStepId === 'edit') {
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
        contactIds: state.selectedContacts.map((contact) => contact.id),
        customData: state.customData,
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
      setState((prev) => ({
        ...prev,
        previewContent: data.preview?.content || data.content,
        missingPlaceholders: data.preview?.unresolvedPlaceholders || [],
        missingPartials: data.preview?.missingPartials || [],
        blockingErrors: data.preview?.blockingErrors || [],
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
        contactIds: state.selectedContacts.map((contact) => contact.id),
        title: state.title,
        customData: state.customData,
        useLetterhead: state.useLetterhead,
        editedContent: state.editedContent || state.previewContent || undefined,
      });

      // onGenerate will redirect to the view page
      setState((prev) => ({ ...prev, generatedDocument: result }));
      clearWizardDraft();
    } catch (err) {
      console.error('Generation error:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate document');
    }

    setIsGenerating(false);
  };

  // Handle reset
  const _handleReset = () => {
    setState({
      selectedTemplate: null,
      selectedCompany: null,
      selectedContacts: [],
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
    setCurrentStep(0);
    setError(null);
    clearWizardDraft();
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
            onSearch={onSearchTemplates}
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
            onSearch={onSearchCompanies}
          />
        );

      case 2:
        return (
          <ContactSelector
            contacts={contacts}
            selected={state.selectedContacts}
            onChange={(selectedContacts) =>
              setState((prev) => ({ ...prev, selectedContacts }))
            }
            onSearch={onSearchContacts}
          />
        );

      case 3:
        return state.selectedTemplate ? (
          <div className="space-y-4">
            {state.fieldErrors.length > 0 && (
              <div className="p-4 bg-status-error/10 border border-status-error/30 rounded-lg">
                <div className="flex items-start gap-3 text-status-error">
                  <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <ul className="text-sm space-y-1">
                    {state.fieldErrors.map((message) => (
                      <li key={message}>{message}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            <CustomDataForm
              template={state.selectedTemplate}
              title={state.title}
              customData={state.customData}
              useLetterhead={state.useLetterhead}
              partials={partials}
              onTitleChange={(title) => setState((prev) => ({ ...prev, title }))}
              onCustomDataChange={(data) =>
                setState((prev) => ({ ...prev, customData: data, fieldErrors: [] }))
              }
              onLetterheadChange={(value) =>
                setState((prev) => ({ ...prev, useLetterhead: value }))
              }
            />
          </div>
        ) : null;

      case 4:
        return (
          <EditStep
            content={state.previewContent || ''}
            validationResult={state.validationResult}
            missingPlaceholders={state.missingPlaceholders}
            missingPartials={state.missingPartials}
            blockingErrors={state.blockingErrors}
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
      {currentStep < WIZARD_STEPS.length && (
        <SummaryCard
          template={state.selectedTemplate}
          company={state.selectedCompany}
          contactCount={state.selectedContacts.length}
          title={state.title}
          customFieldCount={filledCustomFieldCount}
        />
      )}

      {draftRestored && (
        <div className="mt-4 p-3 bg-accent-primary/5 border border-accent-primary/20 rounded-lg">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2 text-sm text-text-secondary">
              <AlertTriangle className="w-4 h-4 mt-0.5 text-accent-primary flex-shrink-0" />
              <span>Recovered your last unsaved document draft.</span>
            </div>
            <Button variant="ghost" size="sm" onClick={clearWizardDraft}>
              Dismiss
            </Button>
          </div>
        </div>
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
      {currentStep < WIZARD_STEPS.length && (
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
              ) : WIZARD_STEPS[currentStep]?.id === 'edit' ? (
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
