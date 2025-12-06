'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  X,
  Save,
  Eye,
  Sparkles,
  FileText,
  Braces,
  TestTube,
  ChevronDown,
  ChevronRight,
  Plus,
  RefreshCw,
  Loader2,
  AlertCircle,
  Check,
  Copy,
  Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormInput } from '@/components/ui/form-input';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { AISidebar, useAISidebar, type DocumentCategory } from './ai-sidebar';
import { PDFPreviewPanel } from './pdf-preview-panel';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

interface PlaceholderDefinition {
  key: string;
  label: string;
  category: 'company' | 'contact' | 'director' | 'shareholder' | 'custom' | 'system';
  type: 'text' | 'date' | 'number' | 'currency' | 'list';
  example?: string;
  format?: string;
}

interface TemplateFormData {
  name: string;
  description: string;
  category: string;
  content: string;
  isActive: boolean;
}

interface CompanyData {
  name: string;
  uen: string;
  registeredAddress: string;
  incorporationDate: Date;
  entityType: string;
  capital: number;
}

interface DirectorData {
  name: string;
  identificationNumber: string;
  nationality: string;
  role: string;
}

interface ShareholderData {
  name: string;
  shareClass: string;
  numberOfShares: number;
  percentageHeld: number;
}

interface ContactData {
  fullName: string;
  email: string;
  phone: string;
  identificationNumber: string;
}

interface CustomData {
  resolutionNumber: string;
  effectiveDate: Date;
  meetingDate: Date;
  amount: number;
}

interface SystemData {
  currentDate: Date;
  generatedBy: string;
}

interface MockDataValues {
  company: CompanyData;
  directors: DirectorData[];
  shareholders: ShareholderData[];
  contact: ContactData;
  custom: CustomData;
  system: SystemData;
}

export interface TemplateEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: TemplateFormData) => Promise<void>;
  initialData?: Partial<TemplateFormData>;
  title?: string;
  isLoading?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const CATEGORIES = [
  { value: 'RESOLUTION', label: 'Resolution' },
  { value: 'CONTRACT', label: 'Contract' },
  { value: 'LETTER', label: 'Letter' },
  { value: 'MINUTES', label: 'Minutes' },
  { value: 'NOTICE', label: 'Notice' },
  { value: 'CERTIFICATE', label: 'Certificate' },
  { value: 'OTHER', label: 'Other' },
];

const PLACEHOLDER_CATEGORIES = [
  {
    key: 'company',
    label: 'Company',
    placeholders: [
      { key: 'company.name', label: 'Company Name', example: 'Sample Company Pte Ltd' },
      { key: 'company.uen', label: 'UEN', example: '202312345A' },
      { key: 'company.registeredAddress', label: 'Registered Address', example: '123 Sample Street, Singapore 123456' },
      { key: 'company.incorporationDate', label: 'Incorporation Date', example: '15 January 2023', format: 'date' },
      { key: 'company.entityType', label: 'Entity Type', example: 'Private Limited Company' },
      { key: 'company.capital', label: 'Share Capital', example: '$100,000' },
    ],
  },
  {
    key: 'directors',
    label: 'Directors',
    placeholders: [
      { key: '{{#each directors}}...{{/each}}', label: 'Loop All Directors', example: 'Iterator block' },
      { key: 'directors[0].name', label: 'First Director Name', example: 'John Tan Wei Ming' },
      { key: 'directors[0].identificationNumber', label: 'First Director ID', example: 'S1234567A' },
      { key: 'directors[0].nationality', label: 'First Director Nationality', example: 'Singaporean' },
    ],
  },
  {
    key: 'shareholders',
    label: 'Shareholders',
    placeholders: [
      { key: '{{#each shareholders}}...{{/each}}', label: 'Loop All Shareholders', example: 'Iterator block' },
      { key: 'shareholders[0].name', label: 'First Shareholder Name', example: 'John Tan Wei Ming' },
      { key: 'shareholders[0].shareClass', label: 'Share Class', example: 'Ordinary' },
      { key: 'shareholders[0].numberOfShares', label: 'Number of Shares', example: '50,000' },
      { key: 'shareholders[0].percentageHeld', label: 'Percentage Held', example: '50%' },
    ],
  },
  {
    key: 'contact',
    label: 'Contact',
    placeholders: [
      { key: 'contact.fullName', label: 'Full Name', example: 'Jane Doe' },
      { key: 'contact.email', label: 'Email', example: 'jane@example.com' },
      { key: 'contact.phone', label: 'Phone', example: '+65 9123 4567' },
      { key: 'contact.identificationNumber', label: 'ID Number', example: 'S9876543B' },
    ],
  },
  {
    key: 'custom',
    label: 'Custom',
    placeholders: [
      { key: 'custom.resolutionNumber', label: 'Resolution Number', example: 'DR-2024-001' },
      { key: 'custom.effectiveDate', label: 'Effective Date', example: '1 January 2024', format: 'date' },
      { key: 'custom.meetingDate', label: 'Meeting Date', example: '15 December 2024', format: 'date' },
      { key: 'custom.amount', label: 'Amount', example: '$10,000.00' },
    ],
  },
  {
    key: 'system',
    label: 'System',
    placeholders: [
      { key: 'system.currentDate', label: 'Current Date', example: '6 December 2024', format: 'date' },
      { key: 'system.generatedBy', label: 'Generated By', example: 'John Doe' },
    ],
  },
];

const DEFAULT_MOCK_DATA: MockDataValues = {
  company: {
    name: 'Sample Company Pte Ltd',
    uen: '202312345A',
    registeredAddress: '123 Sample Street, #01-01, Singapore 123456',
    incorporationDate: new Date('2023-01-15'),
    entityType: 'Private Limited Company',
    capital: 100000,
  },
  directors: [
    { name: 'John Tan Wei Ming', identificationNumber: 'S1234567A', nationality: 'Singaporean', role: 'Director' },
    { name: 'Mary Lee Mei Ling', identificationNumber: 'S7654321B', nationality: 'Singaporean', role: 'Director' },
  ],
  shareholders: [
    { name: 'John Tan Wei Ming', shareClass: 'Ordinary', numberOfShares: 50000, percentageHeld: 50 },
    { name: 'Mary Lee Mei Ling', shareClass: 'Ordinary', numberOfShares: 50000, percentageHeld: 50 },
  ],
  contact: {
    fullName: 'Jane Doe',
    email: 'jane@example.com',
    phone: '+65 9123 4567',
    identificationNumber: 'S9876543B',
  },
  custom: {
    resolutionNumber: 'DR-2024-001',
    effectiveDate: new Date(),
    meetingDate: new Date(),
    amount: 10000,
  },
  system: {
    currentDate: new Date(),
    generatedBy: 'System User',
  },
};

// ============================================================================
// Placeholder Palette Component
// ============================================================================

interface PlaceholderPaletteProps {
  onInsert: (placeholder: string) => void;
  className?: string;
}

function PlaceholderPalette({ onInsert, className }: PlaceholderPaletteProps) {
  const [expandedCategories, setExpandedCategories] = useState<string[]>(['company']);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const toggleCategory = (key: string) => {
    setExpandedCategories((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleInsert = (key: string) => {
    // Format as placeholder syntax
    const placeholder = key.startsWith('{{') ? key : `{{${key}}}`;
    onInsert(placeholder);
  };

  const handleCopy = async (key: string) => {
    const placeholder = key.startsWith('{{') ? key : `{{${key}}}`;
    await navigator.clipboard.writeText(placeholder);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className={cn('flex flex-col h-full', className)}>
      <div className="px-4 py-3 border-b border-border-primary">
        <div className="flex items-center gap-2">
          <Braces className="w-4 h-4 text-accent-primary" />
          <span className="font-medium text-text-primary text-sm">Placeholders</span>
        </div>
        <p className="text-xs text-text-muted mt-1">
          Click to insert, or drag into editor
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {PLACEHOLDER_CATEGORIES.map((category) => (
          <div key={category.key} className="border-b border-border-secondary">
            <button
              type="button"
              onClick={() => toggleCategory(category.key)}
              className="w-full flex items-center justify-between px-4 py-2 hover:bg-background-tertiary text-left transition-colors"
            >
              <span className="text-sm font-medium text-text-primary">{category.label}</span>
              {expandedCategories.includes(category.key) ? (
                <ChevronDown className="w-4 h-4 text-text-muted" />
              ) : (
                <ChevronRight className="w-4 h-4 text-text-muted" />
              )}
            </button>

            {expandedCategories.includes(category.key) && (
              <div className="pb-2">
                {category.placeholders.map((placeholder) => (
                  <div
                    key={placeholder.key}
                    className="group flex items-center gap-2 px-4 py-1.5 hover:bg-background-tertiary"
                  >
                    <button
                      type="button"
                      onClick={() => handleInsert(placeholder.key)}
                      className="flex-1 text-left"
                    >
                      <div className="text-xs font-mono text-accent-primary truncate">
                        {placeholder.key.startsWith('{{') ? placeholder.key : `{{${placeholder.key}}}`}
                      </div>
                      <div className="text-xs text-text-muted truncate">{placeholder.label}</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopy(placeholder.key)}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-background-elevated transition-all"
                      title="Copy"
                    >
                      {copiedKey === placeholder.key ? (
                        <Check className="w-3 h-3 text-green-500" />
                      ) : (
                        <Copy className="w-3 h-3 text-text-muted" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Mock Data Panel Component
// ============================================================================

interface MockDataPanelProps {
  mockData: MockDataValues;
  onMockDataChange: (data: MockDataValues) => void;
  onPreview: () => void;
  isPreviewLoading?: boolean;
  className?: string;
}

function MockDataPanel({
  mockData,
  onMockDataChange,
  onPreview,
  isPreviewLoading,
  className,
}: MockDataPanelProps) {
  const [expandedSections, setExpandedSections] = useState<string[]>(['company']);

  const toggleSection = (key: string) => {
    setExpandedSections((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleReset = () => {
    onMockDataChange(DEFAULT_MOCK_DATA);
  };

  const updateValue = (path: string, value: string) => {
    const parts = path.split('.');
    const newData = JSON.parse(JSON.stringify(mockData)) as MockDataValues;

    if (parts.length === 2) {
      const [section, field] = parts;
      if (section === 'company') {
        const companyData = newData.company as unknown as Record<string, string>;
        if (field in companyData) companyData[field] = value;
      } else if (section === 'contact') {
        const contactData = newData.contact as unknown as Record<string, string>;
        if (field in contactData) contactData[field] = value;
      } else if (section === 'custom') {
        const customData = newData.custom as unknown as Record<string, string>;
        if (field in customData) customData[field] = value;
      }
    }

    onMockDataChange(newData);
  };

  return (
    <div className={cn('flex flex-col h-full', className)}>
      <div className="px-4 py-3 border-b border-border-primary">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TestTube className="w-4 h-4 text-accent-primary" />
            <span className="font-medium text-text-primary text-sm">Test Data</span>
          </div>
          <button
            type="button"
            onClick={handleReset}
            className="text-xs text-text-muted hover:text-text-primary transition-colors"
          >
            Reset
          </button>
        </div>
        <p className="text-xs text-text-muted mt-1">
          Edit sample values to test your template
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Company Section */}
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => toggleSection('company')}
            className="flex items-center gap-2 text-sm font-medium text-text-primary"
          >
            {expandedSections.includes('company') ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
            Company
          </button>

          {expandedSections.includes('company') && (
            <div className="space-y-2 pl-5">
              <div>
                <label className="text-xs text-text-muted">Name</label>
                <input
                  type="text"
                  value={mockData.company.name || ''}
                  onChange={(e) => updateValue('company.name', e.target.value)}
                  className="w-full px-2 py-1 text-xs border border-border-primary rounded bg-background-primary text-text-primary"
                />
              </div>
              <div>
                <label className="text-xs text-text-muted">UEN</label>
                <input
                  type="text"
                  value={mockData.company.uen || ''}
                  onChange={(e) => updateValue('company.uen', e.target.value)}
                  className="w-full px-2 py-1 text-xs border border-border-primary rounded bg-background-primary text-text-primary"
                />
              </div>
              <div>
                <label className="text-xs text-text-muted">Address</label>
                <input
                  type="text"
                  value={mockData.company.registeredAddress || ''}
                  onChange={(e) => updateValue('company.registeredAddress', e.target.value)}
                  className="w-full px-2 py-1 text-xs border border-border-primary rounded bg-background-primary text-text-primary"
                />
              </div>
            </div>
          )}
        </div>

        {/* Directors Section */}
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => toggleSection('directors')}
            className="flex items-center gap-2 text-sm font-medium text-text-primary"
          >
            {expandedSections.includes('directors') ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
            Directors ({mockData.directors.length || 0})
          </button>

          {expandedSections.includes('directors') && (
            <div className="space-y-3 pl-5">
              {mockData.directors.map((director, index) => (
                <div key={index} className="p-2 bg-background-tertiary rounded space-y-1">
                  <div className="text-xs font-medium text-text-secondary">Director {index + 1}</div>
                  <input
                    type="text"
                    value={director.name || ''}
                    placeholder="Name"
                    className="w-full px-2 py-1 text-xs border border-border-primary rounded bg-background-primary text-text-primary"
                    readOnly
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Custom Section */}
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => toggleSection('custom')}
            className="flex items-center gap-2 text-sm font-medium text-text-primary"
          >
            {expandedSections.includes('custom') ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
            Custom Fields
          </button>

          {expandedSections.includes('custom') && (
            <div className="space-y-2 pl-5">
              <div>
                <label className="text-xs text-text-muted">Resolution Number</label>
                <input
                  type="text"
                  value={mockData.custom.resolutionNumber || ''}
                  onChange={(e) => updateValue('custom.resolutionNumber', e.target.value)}
                  className="w-full px-2 py-1 text-xs border border-border-primary rounded bg-background-primary text-text-primary"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="p-4 border-t border-border-primary">
        <Button
          variant="secondary"
          size="sm"
          className="w-full"
          onClick={onPreview}
          isLoading={isPreviewLoading}
          leftIcon={<Eye className="w-4 h-4" />}
        >
          Preview with Test Data
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// Right Panel Tabs
// ============================================================================

type RightPanelTab = 'preview' | 'ai';

interface RightPanelProps {
  activeTab: RightPanelTab;
  onTabChange: (tab: RightPanelTab) => void;
  previewContent: string;
  isPreviewLoading: boolean;
  aiSidebar: ReturnType<typeof useAISidebar>;
  onAIInsert: (content: string) => void;
  onAIReplace: (content: string) => void;
  className?: string;
}

function RightPanel({
  activeTab,
  onTabChange,
  previewContent,
  isPreviewLoading,
  aiSidebar,
  onAIInsert,
  onAIReplace,
  className,
}: RightPanelProps) {
  return (
    <div className={cn('flex flex-col h-full border-l border-border-primary', className)}>
      {/* Tab buttons */}
      <div className="flex border-b border-border-primary">
        <button
          type="button"
          onClick={() => onTabChange('preview')}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors',
            activeTab === 'preview'
              ? 'text-accent-primary border-b-2 border-accent-primary bg-background-secondary'
              : 'text-text-muted hover:text-text-primary hover:bg-background-tertiary'
          )}
        >
          <Eye className="w-4 h-4" />
          Preview
        </button>
        <button
          type="button"
          onClick={() => onTabChange('ai')}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors',
            activeTab === 'ai'
              ? 'text-accent-primary border-b-2 border-accent-primary bg-background-secondary'
              : 'text-text-muted hover:text-text-primary hover:bg-background-tertiary'
          )}
        >
          <Sparkles className="w-4 h-4" />
          AI Assistant
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'preview' && (
          <div className="h-full">
            {previewContent ? (
              <PDFPreviewPanel
                content={previewContent}
                isLoading={isPreviewLoading}
                showToolbar={true}
                className="h-full rounded-none border-0"
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center p-8">
                <FileText className="w-12 h-12 text-text-muted opacity-50 mb-4" />
                <p className="text-sm text-text-muted mb-2">No preview available</p>
                <p className="text-xs text-text-muted">
                  Click &quot;Preview with Test Data&quot; in the left panel to see your template
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'ai' && (
          <AISidebar
            isOpen={true}
            onClose={() => onTabChange('preview')}
            context={aiSidebar.context}
            onInsert={onAIInsert}
            onReplace={onAIReplace}
            className="w-full border-0"
          />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Main Template Editor Modal
// ============================================================================

export function TemplateEditorModal({
  isOpen,
  onClose,
  onSave,
  initialData,
  title = 'Create Template',
  isLoading = false,
}: TemplateEditorModalProps) {
  // Form state
  const [formData, setFormData] = useState<TemplateFormData>({
    name: initialData?.name || '',
    description: initialData?.description || '',
    category: initialData?.category || 'OTHER',
    content: initialData?.content || '',
    isActive: initialData?.isActive ?? true,
  });
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Panel states
  const [leftPanelTab, setLeftPanelTab] = useState<'placeholders' | 'testdata'>('placeholders');
  const [rightPanelTab, setRightPanelTab] = useState<RightPanelTab>('preview');
  const [mockData, setMockData] = useState<MockDataValues>(DEFAULT_MOCK_DATA);
  const [previewContent, setPreviewContent] = useState('');
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  // Editor ref for content insertion
  const editorRef = useRef<{ insertContent: (content: string) => void } | null>(null);

  // AI sidebar
  const aiSidebar = useAISidebar({
    mode: 'template_editor',
    templateCategory: formData.category as DocumentCategory,
    templateName: formData.name,
  });

  // Reset form when modal opens with new data
  useEffect(() => {
    if (isOpen) {
      setFormData({
        name: initialData?.name || '',
        description: initialData?.description || '',
        category: initialData?.category || 'OTHER',
        content: initialData?.content || '',
        isActive: initialData?.isActive ?? true,
      });
      setFormError('');
      setPreviewContent('');
    }
  }, [isOpen, initialData]);

  // Handle placeholder insertion
  const handleInsertPlaceholder = useCallback((placeholder: string) => {
    // For now, append to content - in production, this would insert at cursor
    setFormData((prev) => ({
      ...prev,
      content: prev.content + placeholder,
    }));
  }, []);

  // Handle AI content insertion
  const handleAIInsert = useCallback((content: string) => {
    setFormData((prev) => ({
      ...prev,
      content: prev.content + content,
    }));
  }, []);

  // Handle preview generation
  const handlePreview = useCallback(async () => {
    if (!formData.content.trim()) {
      setPreviewContent('<p>No content to preview</p>');
      return;
    }

    setIsPreviewLoading(true);
    try {
      // For now, do a simple placeholder replacement preview
      // In production, this would call an API endpoint
      let preview = formData.content;

      // Simple placeholder replacement for preview
      const { company, directors, custom } = mockData;

      preview = preview.replace(/\{\{company\.name\}\}/g, company.name || '');
      preview = preview.replace(/\{\{company\.uen\}\}/g, company.uen || '');
      preview = preview.replace(/\{\{company\.registeredAddress\}\}/g, company.registeredAddress || '');
      preview = preview.replace(/\{\{custom\.resolutionNumber\}\}/g, custom.resolutionNumber || '');

      // Handle director loops (simplified)
      if (preview.includes('{{#each directors}}')) {
        const loopMatch = preview.match(/\{\{#each directors\}\}([\s\S]*?)\{\{\/each\}\}/);
        if (loopMatch) {
          const template = loopMatch[1];
          let replacement = '';
          directors.forEach((director, index) => {
            let item = template;
            item = item.replace(/\{\{name\}\}/g, director.name || '');
            item = item.replace(/\{\{identificationNumber\}\}/g, director.identificationNumber || '');
            item = item.replace(/\{\{@index\}\}/g, String(index));
            item = item.replace(/\{\{@number\}\}/g, String(index + 1));
            replacement += item;
          });
          preview = preview.replace(loopMatch[0], replacement);
        }
      }

      setPreviewContent(preview);
      setRightPanelTab('preview');
    } catch (error) {
      console.error('Preview error:', error);
      setPreviewContent('<p class="text-red-500">Error generating preview</p>');
    } finally {
      setIsPreviewLoading(false);
    }
  }, [formData.content, mockData]);

  // Handle save
  const handleSave = useCallback(async () => {
    setFormError('');

    if (!formData.name.trim()) {
      setFormError('Template name is required');
      return;
    }
    if (!formData.content.trim()) {
      setFormError('Template content is required');
      return;
    }

    setIsSaving(true);
    try {
      await onSave(formData);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Failed to save template');
    } finally {
      setIsSaving(false);
    }
  }, [formData, onSave]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      // Escape to close
      if (e.key === 'Escape') {
        onClose();
      }
      // Ctrl/Cmd + S to save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, handleSave]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="relative bg-background-primary rounded-lg shadow-2xl flex flex-col overflow-hidden"
        style={{ width: '90vw', height: '90vh' }}
      >
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-border-primary bg-background-secondary">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-accent-primary" />
              <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
            </div>

            {/* Template name input */}
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Template name..."
              className="w-64 h-9 px-3 text-sm border border-border-primary rounded-md bg-background-primary text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-primary/50"
            />

            {/* Category select */}
            <select
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              className="h-9 px-3 text-sm border border-border-primary rounded-md bg-background-primary text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/50"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            {/* Active toggle */}
            <label className="flex items-center gap-2 text-sm text-text-secondary">
              <input
                type="checkbox"
                checked={formData.isActive}
                onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                className="w-4 h-4 rounded border-border-primary text-accent-primary focus:ring-accent-primary"
              />
              Active
            </label>

            <div className="w-px h-6 bg-border-primary mx-2" />

            <Button
              variant="secondary"
              size="sm"
              onClick={onClose}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              isLoading={isSaving}
              leftIcon={<Save className="w-4 h-4" />}
            >
              Save Template
            </Button>

            <button
              type="button"
              onClick={onClose}
              className="ml-2 p-1.5 rounded hover:bg-background-tertiary text-text-muted hover:text-text-primary transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Error message */}
        {formError && (
          <div className="flex-shrink-0 px-6 py-3 bg-status-error/10 border-b border-status-error/30">
            <div className="flex items-center gap-2 text-status-error text-sm">
              <AlertCircle className="w-4 h-4" />
              {formError}
            </div>
          </div>
        )}

        {/* Main content area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Panel - Placeholders & Test Data */}
          <div className="w-72 flex-shrink-0 border-r border-border-primary flex flex-col bg-background-secondary">
            {/* Left panel tabs */}
            <div className="flex border-b border-border-primary">
              <button
                type="button"
                onClick={() => setLeftPanelTab('placeholders')}
                className={cn(
                  'flex-1 px-3 py-2 text-xs font-medium transition-colors',
                  leftPanelTab === 'placeholders'
                    ? 'text-accent-primary border-b-2 border-accent-primary'
                    : 'text-text-muted hover:text-text-primary'
                )}
              >
                Placeholders
              </button>
              <button
                type="button"
                onClick={() => setLeftPanelTab('testdata')}
                className={cn(
                  'flex-1 px-3 py-2 text-xs font-medium transition-colors',
                  leftPanelTab === 'testdata'
                    ? 'text-accent-primary border-b-2 border-accent-primary'
                    : 'text-text-muted hover:text-text-primary'
                )}
              >
                Test Data
              </button>
            </div>

            {/* Left panel content */}
            <div className="flex-1 overflow-hidden">
              {leftPanelTab === 'placeholders' ? (
                <PlaceholderPalette onInsert={handleInsertPlaceholder} />
              ) : (
                <MockDataPanel
                  mockData={mockData}
                  onMockDataChange={setMockData}
                  onPreview={handlePreview}
                  isPreviewLoading={isPreviewLoading}
                />
              )}
            </div>
          </div>

          {/* Center - Editor */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {/* Description input */}
            <div className="flex-shrink-0 px-4 py-3 border-b border-border-primary bg-background-secondary">
              <input
                type="text"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Template description (optional)..."
                className="w-full h-8 px-3 text-sm border border-border-primary rounded-md bg-background-primary text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-primary/50"
              />
            </div>

            {/* Placeholder insertion tip */}
            <div className="flex-shrink-0 px-4 py-2 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800">
              <div className="flex items-center gap-2 text-xs text-blue-700 dark:text-blue-300">
                <Info className="w-3.5 h-3.5" />
                <span>
                  Use <code className="px-1 bg-blue-100 dark:bg-blue-800 rounded">{'{{placeholder}}'}</code> syntax for dynamic content and{' '}
                  <code className="px-1 bg-blue-100 dark:bg-blue-800 rounded">{'{{>partial-name}}'}</code> for partials
                </span>
              </div>
            </div>

            {/* Rich text editor */}
            <div className="flex-1 overflow-hidden">
              <RichTextEditor
                value={formData.content}
                onChange={(html) => setFormData({ ...formData, content: html })}
                placeholder="Start typing your template content..."
                minHeight={400}
                className="h-full"
              />
            </div>
          </div>

          {/* Right Panel - Preview & AI */}
          <RightPanel
            activeTab={rightPanelTab}
            onTabChange={setRightPanelTab}
            previewContent={previewContent}
            isPreviewLoading={isPreviewLoading}
            aiSidebar={aiSidebar}
            onAIInsert={handleAIInsert}
            onAIReplace={handleAIInsert}
            className="w-96 flex-shrink-0"
          />
        </div>
      </div>
    </div>
  );
}

export default TemplateEditorModal;
