'use client';

import { useState, useCallback, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from '@/hooks/use-auth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { FormInput } from '@/components/ui/form-input';
import { useToast } from '@/components/ui/toast';
import { TenantSelector, useActiveTenantId } from '@/components/ui/tenant-selector';
import { AISidebar, useAISidebar, type DocumentCategory } from '@/components/documents/ai-sidebar';
import { A4PageEditor, type A4PageEditorRef } from '@/components/documents/a4-page-editor';
import { cn } from '@/lib/utils';
import {
  Save,
  Sparkles,
  FileText,
  Braces,
  TestTube,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Loader2,
  AlertCircle,
  Check,
  Copy,
  Info,
  Settings,
  Building2,
  Code,
  Plus,
  Trash2,
  Edit3,
} from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface TemplateFormData {
  name: string;
  description: string;
  category: string;
  content: string;
  isActive: boolean;
  customPlaceholders: CustomPlaceholderDefinition[];
}

interface CustomPlaceholderDefinition {
  id: string;
  key: string;
  label: string;
  type: 'text' | 'date' | 'number' | 'currency' | 'textarea';
  required: boolean;
  defaultValue?: string;
  description?: string;
}

interface AddressData {
  block: string;
  street: string;
  level: string;
  unit: string;
  building: string;
  postalCode: string;
}

interface CompanyData {
  name: string;
  uen: string;
  registeredAddress: string;
  address: AddressData;
  incorporationDate: Date;
  entityType: string;
  capital: number;
}

interface DirectorData {
  name: string;
  identificationNumber: string;
  nationality: string;
  role: string;
  address: string;
}

interface ShareholderData {
  name: string;
  shareClass: string;
  numberOfShares: number;
  percentageHeld: number;
  identificationNumber: string;
  nationality: string;
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

interface TemplatePartial {
  id: string;
  name: string;
  description?: string;
}

interface Company {
  id: string;
  name: string;
  uen: string;
  registeredAddress?: string;
  entityType?: string;
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
      { key: 'company.registeredAddress', label: 'Full Address', example: '123 Sample Street, #01-01, Singapore 123456' },
      { key: 'company.address.block', label: 'Block', example: '123' },
      { key: 'company.address.street', label: 'Street Name', example: 'Sample Street' },
      { key: 'company.address.level', label: 'Level', example: '01' },
      { key: 'company.address.unit', label: 'Unit', example: '01' },
      { key: 'company.address.building', label: 'Building Name', example: 'Sample Building' },
      { key: 'company.address.postalCode', label: 'Postal Code', example: '123456' },
      { key: 'company.incorporationDate', label: 'Incorporation Date', example: '15 January 2023', format: 'date' },
      { key: 'company.entityType', label: 'Entity Type', example: 'Private Limited Company' },
      { key: 'company.capital', label: 'Share Capital', example: '$100,000' },
    ],
  },
  {
    key: 'directors',
    label: 'Directors',
    placeholders: [
      { key: '{{#each directors}}...{{/each}}', label: 'Loop All Directors', example: 'Iterator block', isBlock: true },
      { key: 'this.name', label: '↳ Director Name (in loop)', example: 'John Tan Wei Ming', inLoop: true },
      { key: 'this.identificationNumber', label: '↳ Director ID (in loop)', example: 'S1234567A', inLoop: true },
      { key: 'this.nationality', label: '↳ Director Nationality (in loop)', example: 'Singaporean', inLoop: true },
      { key: 'this.address', label: '↳ Director Address (in loop)', example: '123 Sample St', inLoop: true },
      { key: '@index', label: '↳ Loop Index (0-based)', example: '0, 1, 2...', inLoop: true },
      { key: '@number', label: '↳ Loop Number (1-based)', example: '1, 2, 3...', inLoop: true },
      { key: 'directors[0].name', label: 'First Director Name', example: 'John Tan Wei Ming' },
      { key: 'directors[0].identificationNumber', label: 'First Director ID', example: 'S1234567A' },
      { key: 'directors[0].nationality', label: 'First Director Nationality', example: 'Singaporean' },
    ],
  },
  {
    key: 'shareholders',
    label: 'Shareholders',
    placeholders: [
      { key: '{{#each shareholders}}...{{/each}}', label: 'Loop All Shareholders', example: 'Iterator block', isBlock: true },
      { key: 'this.name', label: '↳ Shareholder Name (in loop)', example: 'John Tan Wei Ming', inLoop: true },
      { key: 'this.identificationNumber', label: '↳ ID Number (in loop)', example: 'S8901234A', inLoop: true },
      { key: 'this.nationality', label: '↳ Nationality (in loop)', example: 'Singaporean', inLoop: true },
      { key: 'this.shareClass', label: '↳ Share Class (in loop)', example: 'Ordinary', inLoop: true },
      { key: 'this.numberOfShares', label: '↳ Number of Shares (in loop)', example: '50,000', inLoop: true },
      { key: 'this.percentageHeld', label: '↳ Percentage Held (in loop)', example: '50%', inLoop: true },
      { key: '@index', label: '↳ Loop Index (0-based)', example: '0, 1, 2...', inLoop: true },
      { key: '@number', label: '↳ Loop Number (1-based)', example: '1, 2, 3...', inLoop: true },
      { key: 'shareholders[0].name', label: 'First Shareholder Name', example: 'John Tan Wei Ming' },
      { key: 'shareholders[0].identificationNumber', label: 'ID Number', example: 'S8901234A' },
      { key: 'shareholders[0].nationality', label: 'Nationality', example: 'Singaporean' },
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
  {
    key: 'conditional',
    label: 'Conditional',
    placeholders: [
      { key: '{{#if field}}...{{/if}}', label: 'IF condition', example: 'Show if field exists', isBlock: true },
      { key: '{{#if field}}...{{else}}...{{/if}}', label: 'IF-ELSE condition', example: 'Show one or the other', isBlock: true },
      { key: '{{#unless field}}...{{/unless}}', label: 'UNLESS (if not)', example: 'Show if field is empty', isBlock: true },
      { key: '{{#if company.address.building}}', label: '↳ If building exists', example: 'Check building name', inLoop: true },
      { key: '{{#if directors.length}}', label: '↳ If has directors', example: 'Check array has items', inLoop: true },
    ],
  },
];

const DEFAULT_MOCK_DATA: MockDataValues = {
  company: {
    name: 'Sample Company Pte Ltd',
    uen: '202312345A',
    registeredAddress: '123 Sample Street, #01-01, Sample Building, Singapore 123456',
    address: {
      block: '123',
      street: 'Sample Street',
      level: '01',
      unit: '01',
      building: 'Sample Building',
      postalCode: '123456',
    },
    incorporationDate: new Date('2023-01-15'),
    entityType: 'Private Limited Company',
    capital: 100000,
  },
  directors: [
    { name: 'John Tan Wei Ming', identificationNumber: 'S1234567A', nationality: 'Singaporean', role: 'Director', address: '456 Director Road, Singapore 456789' },
    { name: 'Mary Lee Mei Ling', identificationNumber: 'S7654321B', nationality: 'Singaporean', role: 'Director', address: '789 Officer Lane, Singapore 789012' },
  ],
  shareholders: [
    { name: 'John Tan Wei Ming', shareClass: 'Ordinary', numberOfShares: 50000, percentageHeld: 50, identificationNumber: 'S8901234A', nationality: 'SINGAPOREAN' },
    { name: 'Mary Lee Mei Ling', shareClass: 'Ordinary', numberOfShares: 50000, percentageHeld: 50, identificationNumber: 'S8502468B', nationality: 'SINGAPOREAN' },
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

const MIN_PANEL_WIDTH = 320;
const MAX_PANEL_WIDTH = 600;
const DEFAULT_PANEL_WIDTH = 380;

// ============================================================================
// Resizable Panel Hook
// ============================================================================

function useResizablePanel(defaultWidth: number, minWidth: number, maxWidth: number) {
  const [width, setWidth] = useState(defaultWidth);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const startResize = useCallback((e: React.MouseEvent, direction: 'left' | 'right') => {
    e.preventDefault();
    setIsResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = width;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = direction === 'right'
        ? e.clientX - startXRef.current
        : startXRef.current - e.clientX;
      const newWidth = Math.min(maxWidth, Math.max(minWidth, startWidthRef.current + delta));
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [width, minWidth, maxWidth]);

  const toggle = useCallback(() => {
    setIsCollapsed((prev) => !prev);
  }, []);

  return {
    width: isCollapsed ? 0 : width,
    isCollapsed,
    isResizing,
    startResize,
    toggle,
  };
}

// ============================================================================
// Details Tab Component
// ============================================================================

interface DetailsTabProps {
  formData: TemplateFormData;
  onChange: (data: Partial<TemplateFormData>) => void;
  isSuperAdmin?: boolean;
  selectedTenantId: string;
  onTenantChange: (tenantId: string) => void;
}

function DetailsTab({ formData, onChange, isSuperAdmin, selectedTenantId, onTenantChange }: DetailsTabProps) {
  return (
    <div className="p-4 space-y-4">
      {/* Tenant Selector for SUPER_ADMIN */}
      {isSuperAdmin && (
        <div>
          <label className="text-xs font-medium text-text-secondary block mb-1.5">Tenant</label>
          <TenantSelector
            value={selectedTenantId}
            onChange={onTenantChange}
            variant="compact"
            className="w-full"
          />
        </div>
      )}

      <FormInput
        label="Template Name"
        value={formData.name}
        onChange={(e) => onChange({ name: e.target.value })}
        placeholder="e.g., Board Resolution - Director Appointment"
        inputSize="xs"
        required
      />

      <div>
        <label className="text-xs font-medium text-text-secondary block mb-1.5">Category</label>
        <select
          value={formData.category}
          onChange={(e) => onChange({ category: e.target.value })}
          className="w-full h-7 px-3 text-xs border border-border-primary rounded-md bg-background-primary text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/50"
        >
          {CATEGORIES.map((cat) => (
            <option key={cat.value} value={cat.value}>
              {cat.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-xs font-medium text-text-secondary block mb-1.5">Description</label>
        <textarea
          value={formData.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="Brief description of what this template is used for"
          rows={3}
          className="w-full px-3 py-2 text-xs border border-border-primary rounded-md bg-background-primary text-text-primary placeholder:text-text-muted placeholder:text-xs focus:outline-none focus:ring-2 focus:ring-accent-primary/50 resize-none"
        />
      </div>

      <div className="flex items-center gap-2 pt-2">
        <input
          type="checkbox"
          id="isActive"
          checked={formData.isActive}
          onChange={(e) => onChange({ isActive: e.target.checked })}
          className="w-4 h-4 rounded border-border-primary text-accent-primary focus:ring-accent-primary"
        />
        <label htmlFor="isActive" className="text-sm text-text-primary">
          Active (available for document generation)
        </label>
      </div>
    </div>
  );
}

// ============================================================================
// Placeholders Tab Component
// ============================================================================

interface PlaceholdersTabProps {
  onInsert: (placeholder: string) => void;
  partials: TemplatePartial[];
  isLoadingPartials: boolean;
  customPlaceholders: CustomPlaceholderDefinition[];
  onCustomPlaceholdersChange: (placeholders: CustomPlaceholderDefinition[]) => void;
}

function PlaceholdersTab({ onInsert, partials, isLoadingPartials, customPlaceholders, onCustomPlaceholdersChange }: PlaceholdersTabProps) {
  const [expandedCategories, setExpandedCategories] = useState<string[]>(['company']);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);

  // Custom placeholder editing state
  const [isAddingCustom, setIsAddingCustom] = useState(false);
  const [editingCustomId, setEditingCustomId] = useState<string | null>(null);
  const [customFormData, setCustomFormData] = useState({
    key: '',
    label: '',
    type: 'text' as CustomPlaceholderDefinition['type'],
    required: true,
    defaultValue: '',
  });

  const resetCustomForm = () => {
    setCustomFormData({
      key: '',
      label: '',
      type: 'text',
      required: true,
      defaultValue: '',
    });
  };

  const handleAddCustom = () => {
    if (!customFormData.key.trim() || !customFormData.label.trim()) return;

    const sanitizedKey = customFormData.key
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '');

    if (customPlaceholders.some((p) => p.key === sanitizedKey)) return;

    const newPlaceholder: CustomPlaceholderDefinition = {
      id: crypto.randomUUID(),
      key: sanitizedKey,
      label: customFormData.label.trim(),
      type: customFormData.type,
      required: customFormData.required,
      defaultValue: customFormData.defaultValue.trim() || undefined,
    };

    onCustomPlaceholdersChange([...customPlaceholders, newPlaceholder]);
    resetCustomForm();
    setIsAddingCustom(false);
  };

  const handleUpdateCustom = () => {
    if (!editingCustomId || !customFormData.key.trim() || !customFormData.label.trim()) return;

    const sanitizedKey = customFormData.key
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '');

    if (customPlaceholders.some((p) => p.key === sanitizedKey && p.id !== editingCustomId)) return;

    const updated = customPlaceholders.map((p) =>
      p.id === editingCustomId
        ? {
            ...p,
            key: sanitizedKey,
            label: customFormData.label.trim(),
            type: customFormData.type,
            required: customFormData.required,
            defaultValue: customFormData.defaultValue.trim() || undefined,
          }
        : p
    );

    onCustomPlaceholdersChange(updated);
    resetCustomForm();
    setEditingCustomId(null);
  };

  const handleEditCustom = (placeholder: CustomPlaceholderDefinition) => {
    setCustomFormData({
      key: placeholder.key,
      label: placeholder.label,
      type: placeholder.type,
      required: placeholder.required,
      defaultValue: placeholder.defaultValue || '',
    });
    setEditingCustomId(placeholder.id);
    setIsAddingCustom(false);
  };

  const handleDeleteCustom = (id: string) => {
    onCustomPlaceholdersChange(customPlaceholders.filter((p) => p.id !== id));
  };

  const handleCancelCustom = () => {
    resetCustomForm();
    setIsAddingCustom(false);
    setEditingCustomId(null);
  };

  const toggleCategory = (key: string) => {
    setExpandedCategories((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleInsert = (key: string) => {
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
    <div className="flex flex-col h-full">
      {/* Header with info tooltip */}
      <div className="px-4 py-3 border-b border-border-primary">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Braces className="w-4 h-4 text-accent-primary" />
            <span className="font-medium text-text-primary text-sm">Placeholders</span>
          </div>
          <div className="relative">
            <button
              type="button"
              onMouseEnter={() => setShowTooltip(true)}
              onMouseLeave={() => setShowTooltip(false)}
              className="p-1 rounded hover:bg-background-tertiary text-text-muted hover:text-text-primary transition-colors"
            >
              <Info className="w-4 h-4" />
            </button>
            {showTooltip && (
              <div className="absolute right-0 top-full mt-1 z-50 w-64 p-3 bg-background-elevated border border-border-primary rounded-lg shadow-lg text-xs text-text-secondary">
                <p className="mb-2">
                  <strong>Syntax:</strong>
                </p>
                <ul className="space-y-1">
                  <li><code className="px-1 bg-background-tertiary rounded">{'{{placeholder}}'}</code> - Simple value</li>
                  <li><code className="px-1 bg-background-tertiary rounded">{'{{>partial-name}}'}</code> - Include partial</li>
                  <li><code className="px-1 bg-background-tertiary rounded">{'{{#each items}}...{{/each}}'}</code> - Loop</li>
                  <li><code className="px-1 bg-background-tertiary rounded">{'{{#if condition}}...{{/if}}'}</code> - Conditional</li>
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Standard placeholders */}
        {PLACEHOLDER_CATEGORIES.map((category) => (
          <div key={category.key} className="border-b border-border-secondary">
            <button
              type="button"
              onClick={() => toggleCategory(category.key)}
              className="w-full flex items-center justify-between px-4 py-2 hover:bg-background-tertiary text-left transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-text-primary">{category.label}</span>
                {category.key === 'custom' && customPlaceholders.length > 0 && (
                  <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-accent-primary/20 text-accent-primary">
                    +{customPlaceholders.length}
                  </span>
                )}
              </div>
              {expandedCategories.includes(category.key) ? (
                <ChevronDown className="w-4 h-4 text-text-muted" />
              ) : (
                <ChevronRight className="w-4 h-4 text-text-muted" />
              )}
            </button>

            {expandedCategories.includes(category.key) && (
              <div className="pb-2">
                {/* Standard placeholders for this category */}
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

                {/* User-defined custom placeholders (only in 'custom' category) */}
                {category.key === 'custom' && (
                  <>
                    {/* Divider if there are user-defined placeholders */}
                    {customPlaceholders.length > 0 && (
                      <div className="mx-4 my-2 border-t border-border-secondary">
                        <span className="relative -top-2 left-2 px-2 bg-background-secondary text-[10px] text-text-muted">
                          User Defined
                        </span>
                      </div>
                    )}

                    {/* User-defined placeholders */}
                    {customPlaceholders.map((placeholder) => (
                      <div
                        key={placeholder.id}
                        className="group flex items-center gap-2 px-4 py-1.5 hover:bg-background-tertiary"
                      >
                        <button
                          type="button"
                          onClick={() => handleInsert(`custom.${placeholder.key}`)}
                          className="flex-1 text-left"
                        >
                          <div className="text-xs font-mono text-accent-primary truncate">
                            {`{{custom.${placeholder.key}}}`}
                          </div>
                          <div className="text-xs text-text-muted truncate flex items-center gap-1">
                            {placeholder.label}
                            {placeholder.required && <span className="text-red-500 text-[10px]">*</span>}
                            <span className="text-text-muted/50 text-[10px]">({placeholder.type})</span>
                          </div>
                        </button>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={() => handleEditCustom(placeholder)}
                            className="p-1 rounded hover:bg-background-elevated text-text-muted hover:text-text-primary"
                            title="Edit"
                          >
                            <Edit3 className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteCustom(placeholder.id)}
                            className="p-1 rounded hover:bg-background-elevated text-text-muted hover:text-red-500"
                            title="Delete"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCopy(`custom.${placeholder.key}`)}
                            className="p-1 rounded hover:bg-background-elevated transition-all"
                            title="Copy"
                          >
                            {copiedKey === `custom.${placeholder.key}` ? (
                              <Check className="w-3 h-3 text-green-500" />
                            ) : (
                              <Copy className="w-3 h-3 text-text-muted" />
                            )}
                          </button>
                        </div>
                      </div>
                    ))}

                    {/* Add/Edit Form */}
                    {(isAddingCustom || editingCustomId) && (
                      <div className="mx-4 my-2 p-3 bg-background-tertiary rounded-lg space-y-2">
                        <div className="text-xs font-medium text-text-primary mb-2">
                          {editingCustomId ? 'Edit Placeholder' : 'Add Custom Placeholder'}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] text-text-muted block mb-0.5">Label *</label>
                            <input
                              type="text"
                              value={customFormData.label}
                              onChange={(e) => {
                                const label = e.target.value;
                                // Auto-generate key from label
                                const key = label
                                  .toLowerCase()
                                  .replace(/\s+/g, '_')
                                  .replace(/[^a-z0-9_]/g, '');
                                setCustomFormData({ ...customFormData, label, key });
                              }}
                              placeholder="e.g., New Address"
                              className="w-full px-2 py-1 text-xs border border-border-primary rounded bg-background-primary text-text-primary"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-text-muted block mb-0.5">Key *</label>
                            <input
                              type="text"
                              value={customFormData.key}
                              onChange={(e) => setCustomFormData({ ...customFormData, key: e.target.value })}
                              placeholder="auto-generated from label"
                              className="w-full px-2 py-1 text-xs border border-border-primary rounded bg-background-primary text-text-primary font-mono"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] text-text-muted block mb-0.5">Type</label>
                            <select
                              value={customFormData.type}
                              onChange={(e) => setCustomFormData({ ...customFormData, type: e.target.value as CustomPlaceholderDefinition['type'] })}
                              className="w-full px-2 py-1 text-xs border border-border-primary rounded bg-background-primary text-text-primary"
                            >
                              <option value="text">Text</option>
                              <option value="textarea">Long Text</option>
                              <option value="date">Date</option>
                              <option value="number">Number</option>
                              <option value="currency">Currency</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px] text-text-muted block mb-0.5">Required</label>
                            <select
                              value={customFormData.required ? 'yes' : 'no'}
                              onChange={(e) => setCustomFormData({ ...customFormData, required: e.target.value === 'yes' })}
                              className="w-full px-2 py-1 text-xs border border-border-primary rounded bg-background-primary text-text-primary"
                            >
                              <option value="yes">Yes</option>
                              <option value="no">No</option>
                            </select>
                          </div>
                        </div>
                        <div className="flex gap-2 pt-1">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={handleCancelCustom}
                            className="flex-1 h-6 text-xs"
                          >
                            Cancel
                          </Button>
                          <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            onClick={editingCustomId ? handleUpdateCustom : handleAddCustom}
                            disabled={!customFormData.key.trim() || !customFormData.label.trim()}
                            className="flex-1 h-6 text-xs"
                          >
                            {editingCustomId ? 'Update' : 'Add'}
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Add button at the end */}
                    {!isAddingCustom && !editingCustomId && (
                      <button
                        type="button"
                        onClick={() => setIsAddingCustom(true)}
                        className="w-full flex items-center gap-2 px-4 py-2 text-xs text-accent-primary hover:bg-background-tertiary transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                        Add custom placeholder
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        ))}

        {/* Partials section */}
        <div className="border-b border-border-secondary">
          <button
            type="button"
            onClick={() => toggleCategory('partials')}
            className="w-full flex items-center justify-between px-4 py-2 hover:bg-background-tertiary text-left transition-colors"
          >
            <div className="flex items-center gap-2">
              <Code className="w-4 h-4 text-text-muted" />
              <span className="text-sm font-medium text-text-primary">Partials</span>
            </div>
            {expandedCategories.includes('partials') ? (
              <ChevronDown className="w-4 h-4 text-text-muted" />
            ) : (
              <ChevronRight className="w-4 h-4 text-text-muted" />
            )}
          </button>

          {expandedCategories.includes('partials') && (
            <div className="pb-2">
              {isLoadingPartials ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-4 h-4 animate-spin text-text-muted" />
                </div>
              ) : partials.length === 0 ? (
                <div className="px-4 py-3 text-xs text-text-muted text-center">
                  No partials available
                </div>
              ) : (
                partials.map((partial) => (
                  <div
                    key={partial.id}
                    className="group flex items-center gap-2 px-4 py-1.5 hover:bg-background-tertiary"
                  >
                    <button
                      type="button"
                      onClick={() => handleInsert(`{{>${partial.name}}}`)}
                      className="flex-1 text-left"
                    >
                      <div className="text-xs font-mono text-accent-primary truncate">
                        {`{{>${partial.name}}}`}
                      </div>
                      {partial.description && (
                        <div className="text-xs text-text-muted truncate">{partial.description}</div>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopy(`{{>${partial.name}}}`)}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-background-elevated transition-all"
                      title="Copy"
                    >
                      {copiedKey === `{{>${partial.name}}}` ? (
                        <Check className="w-3 h-3 text-green-500" />
                      ) : (
                        <Copy className="w-3 h-3 text-text-muted" />
                      )}
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Test Data Tab Component
// ============================================================================

interface TestDataTabProps {
  mockData: MockDataValues;
  onMockDataChange: (data: MockDataValues) => void;
  companies: Company[];
  isLoadingCompanies: boolean;
  onSelectCompany: (companyId: string) => void;
  customPlaceholders: CustomPlaceholderDefinition[];
}

function TestDataTab({
  mockData,
  onMockDataChange,
  companies,
  isLoadingCompanies,
  onSelectCompany,
  customPlaceholders,
}: TestDataTabProps) {
  const [expandedSections, setExpandedSections] = useState<string[]>(['source']);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');

  const toggleSection = (key: string) => {
    setExpandedSections((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleReset = () => {
    setSelectedCompanyId('');
    onMockDataChange(DEFAULT_MOCK_DATA);
  };

  const handleCompanySelect = (companyId: string) => {
    setSelectedCompanyId(companyId);
    if (companyId) {
      onSelectCompany(companyId);
    } else {
      onMockDataChange(DEFAULT_MOCK_DATA);
    }
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
        // Allow dynamic custom fields
        const customData = newData.custom as unknown as Record<string, string>;
        customData[field] = value;
      }
    }

    onMockDataChange(newData);
  };

  return (
    <div className="flex flex-col h-full">
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
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Data Source Section */}
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => toggleSection('source')}
            className="flex items-center gap-2 text-sm font-medium text-text-primary"
          >
            {expandedSections.includes('source') ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
            <Building2 className="w-4 h-4" />
            Data Source
          </button>

          {expandedSections.includes('source') && (
            <div className="space-y-2 pl-5">
              <label className="text-xs text-text-muted">Select Company</label>
              <select
                value={selectedCompanyId}
                onChange={(e) => handleCompanySelect(e.target.value)}
                disabled={isLoadingCompanies}
                className="w-full h-9 px-3 text-sm border border-border-primary rounded-md bg-background-primary text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/50 disabled:opacity-50"
              >
                <option value="">Use sample data</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name} ({company.uen})
                  </option>
                ))}
              </select>
              <p className="text-xs text-text-muted">
                {selectedCompanyId
                  ? 'Using real company data for preview'
                  : 'Using sample data for preview'}
              </p>
            </div>
          )}
        </div>

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
            Directors ({mockData.directors.length})
          </button>

          {expandedSections.includes('directors') && (
            <div className="space-y-2 pl-5">
              {mockData.directors.map((director, index) => (
                <div key={index} className="p-2 bg-background-tertiary rounded">
                  <div className="text-xs font-medium text-text-secondary mb-1">Director {index + 1}</div>
                  <div className="text-xs text-text-primary">{director.name}</div>
                  <div className="text-xs text-text-muted">{director.identificationNumber}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Custom Section - Dynamic based on customPlaceholders */}
        {customPlaceholders.length > 0 && (
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
              Custom Fields ({customPlaceholders.length})
            </button>

            {expandedSections.includes('custom') && (
              <div className="space-y-2 pl-5">
                {customPlaceholders.map((placeholder) => {
                  const customValues = mockData.custom as unknown as Record<string, string>;
                  const fieldValue = customValues[placeholder.key] || placeholder.defaultValue || '';
                  return (
                    <div key={placeholder.id}>
                      <label className="text-xs text-text-muted flex items-center gap-1">
                        {placeholder.label}
                        {placeholder.required && <span className="text-red-500">*</span>}
                      </label>
                      {placeholder.type === 'textarea' ? (
                        <textarea
                          value={fieldValue}
                          onChange={(e) => updateValue(`custom.${placeholder.key}`, e.target.value)}
                          placeholder={`Enter ${placeholder.label.toLowerCase()}...`}
                          className="w-full px-2 py-1 text-xs border border-border-primary rounded bg-background-primary text-text-primary resize-none"
                          rows={2}
                        />
                      ) : (
                        <input
                          type={placeholder.type === 'date' ? 'date' : placeholder.type === 'number' || placeholder.type === 'currency' ? 'number' : 'text'}
                          value={fieldValue}
                          onChange={(e) => updateValue(`custom.${placeholder.key}`, e.target.value)}
                          placeholder={`Enter ${placeholder.label.toLowerCase()}...`}
                          className="w-full px-2 py-1 text-xs border border-border-primary rounded bg-background-primary text-text-primary"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Legacy Custom Section - shown when no custom placeholders defined */}
        {customPlaceholders.length === 0 && (
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
        )}
      </div>

    </div>
  );
}

// ============================================================================
// Main Page Component (wrapped for Suspense)
// ============================================================================

function TemplateEditorContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const { success } = useToast();
  const queryClient = useQueryClient();

  const templateId = searchParams.get('id');
  const isEditMode = !!templateId;

  // Tenant selection
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [tenantName, setTenantName] = useState('');
  const activeTenantId = useActiveTenantId(
    session?.isSuperAdmin ?? false,
    selectedTenantId,
    session?.tenantId
  );

  // Fetch tenant name when tenant changes
  useEffect(() => {
    if (!activeTenantId) {
      setTenantName('');
      return;
    }
    fetch(`/api/tenants/${activeTenantId}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => setTenantName(data?.name || ''))
      .catch(() => setTenantName(''));
  }, [activeTenantId]);

  // Editor ref for cursor-based insertion
  const editorRef = useRef<A4PageEditorRef>(null);

  // Form state
  const [formData, setFormData] = useState<TemplateFormData>({
    name: '',
    description: '',
    category: 'OTHER',
    content: '',
    isActive: true,
    customPlaceholders: [],
  });
  const [formError, setFormError] = useState('');

  // Panel states
  const [activeTab, setActiveTab] = useState<'details' | 'placeholders' | 'testdata' | 'ai'>('details');
  const [mockData, setMockData] = useState<MockDataValues>(DEFAULT_MOCK_DATA);
  const [previewContent, setPreviewContent] = useState('');
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  // Resizable panel (combined right panel)
  const rightPanel = useResizablePanel(DEFAULT_PANEL_WIDTH, MIN_PANEL_WIDTH, MAX_PANEL_WIDTH);

  // AI sidebar
  const aiSidebar = useAISidebar({
    mode: 'template_editor',
    templateCategory: formData.category as DocumentCategory,
    templateName: formData.name,
    tenantId: activeTenantId,
    tenantName: tenantName,
  });

  // Fetch existing template if editing
  const { data: existingTemplate, isLoading: isLoadingTemplate } = useQuery({
    queryKey: ['document-template', templateId],
    queryFn: async () => {
      if (!templateId) return null;
      const res = await fetch(`/api/document-templates/${templateId}`);
      if (!res.ok) throw new Error('Failed to fetch template');
      return res.json();
    },
    enabled: !!templateId,
  });

  // Fetch partials for placeholder palette
  const { data: partialsData, isLoading: isLoadingPartials } = useQuery({
    queryKey: ['template-partials', activeTenantId],
    queryFn: async () => {
      if (!activeTenantId) return { partials: [] };
      const res = await fetch(`/api/template-partials?tenantId=${activeTenantId}`);
      if (!res.ok) throw new Error('Failed to fetch partials');
      return res.json();
    },
    enabled: !!activeTenantId,
  });

  // Fetch companies for test data
  const { data: companiesData, isLoading: isLoadingCompanies } = useQuery({
    queryKey: ['companies-list', activeTenantId],
    queryFn: async () => {
      if (!activeTenantId) return { companies: [] };
      const res = await fetch(`/api/companies?tenantId=${activeTenantId}&limit=100`);
      if (!res.ok) throw new Error('Failed to fetch companies');
      return res.json();
    },
    enabled: !!activeTenantId,
  });

  // Type for save data (storage format with placeholders array)
  type TemplateSaveData = {
    name: string;
    description: string;
    category: string;
    content: string;
    isActive: boolean;
    placeholders: Array<{
      key: string;
      label: string;
      type: string;
      source: string;
      category: string;
      path: string;
      defaultValue?: string;
      required: boolean;
    }>;
  };

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: TemplateSaveData & { tenantId: string }) => {
      const res = await fetch('/api/document-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to create template');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document-templates'] });
      success('Template created successfully');
      router.push('/admin/template-partials');
    },
    onError: (error: Error) => {
      setFormError(error.message);
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (data: TemplateSaveData & { id: string }) => {
      const res = await fetch(`/api/document-templates/${data.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to update template');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document-templates'] });
      queryClient.invalidateQueries({ queryKey: ['document-template', templateId] });
      success('Template updated successfully');
      router.push('/admin/template-partials');
    },
    onError: (error: Error) => {
      setFormError(error.message);
    },
  });

  // Helper to extract custom placeholders from storage format
  const storageFormatToCustomPlaceholders = (
    placeholders: Array<{ key: string; label: string; type: string; source?: string; category?: string; required?: boolean; defaultValue?: string }>
  ): CustomPlaceholderDefinition[] => {
    return (placeholders || [])
      .filter((p) => p.source === 'custom' || p.category === 'custom')
      .map((p) => ({
        id: crypto.randomUUID(),
        key: p.key.replace('custom.', ''),
        label: p.label,
        type: (p.type === 'list' || p.type === 'conditional' ? 'text' : p.type) as CustomPlaceholderDefinition['type'],
        required: p.required ?? true,
        defaultValue: p.defaultValue,
      }));
  };

  // Load existing template data
  useEffect(() => {
    if (existingTemplate) {
      setFormData({
        name: existingTemplate.name || '',
        description: existingTemplate.description || '',
        category: existingTemplate.category || 'OTHER',
        content: existingTemplate.content || '',
        isActive: existingTemplate.isActive ?? true,
        customPlaceholders: storageFormatToCustomPlaceholders(existingTemplate.placeholders || []),
      });
    }
  }, [existingTemplate]);

  // Handle form change
  const handleFormChange = useCallback((changes: Partial<TemplateFormData>) => {
    setFormData((prev) => ({ ...prev, ...changes }));
  }, []);

  // Handle placeholder insertion at cursor position
  const handleInsertPlaceholder = useCallback((placeholder: string) => {
    if (editorRef.current) {
      editorRef.current.insertAtCursor(placeholder);
    }
  }, []);

  // Handle AI content insertion at cursor position
  const handleAIInsert = useCallback((content: string) => {
    if (editorRef.current) {
      editorRef.current.insertAtCursor(content);
    }
  }, []);

  // Handle company selection for test data
  const handleSelectCompany = useCallback(async (companyId: string) => {
    try {
      const res = await fetch(`/api/companies/${companyId}`);
      if (!res.ok) throw new Error('Failed to fetch company');
      const company = await res.json();

      setMockData((prev) => {
        // Parse address from registeredAddress string
        const parseAddress = (addr: string | undefined) => {
          if (!addr) return prev.company.address;
          // Try to extract postal code (6 digits at end)
          const postalMatch = addr.match(/(\d{6})$/);
          const postalCode = postalMatch?.[1] || '';
          return {
            ...prev.company.address,
            postalCode,
          };
        };

        return {
        ...prev,
        company: {
          name: company.name || prev.company.name,
          uen: company.uen || prev.company.uen,
          registeredAddress: company.registeredAddress || prev.company.registeredAddress,
          address: parseAddress(company.registeredAddress),
          incorporationDate: company.incorporationDate ? new Date(company.incorporationDate) : prev.company.incorporationDate,
          entityType: company.entityType || prev.company.entityType,
          capital: company.shareCapital || prev.company.capital,
        },
        directors: company.officers?.filter((o: { role: string }) => o.role === 'DIRECTOR').map((d: { name: string; identificationNumber?: string; nationality: string; address?: string; role: string; contact?: { identificationNumber?: string } }) => ({
          name: d.name,
          identificationNumber: d.identificationNumber || d.contact?.identificationNumber || '',
          nationality: d.nationality || '',
          role: d.role ? d.role.charAt(0) + d.role.slice(1).toLowerCase() : 'Director',
          address: d.address || '',
        })) || prev.directors,
        shareholders: company.shareholders?.map((s: { name: string; shareClass: string; numberOfShares: number; percentageHeld: number; identificationNumber?: string; nationality?: string; contact?: { identificationNumber?: string } }) => ({
          name: s.name,
          shareClass: s.shareClass || 'Ordinary',
          numberOfShares: s.numberOfShares || 0,
          percentageHeld: s.percentageHeld || 0,
          identificationNumber: s.identificationNumber || s.contact?.identificationNumber || '',
          nationality: s.nationality || '',
        })) || prev.shareholders,
        };
      });
    } catch (error) {
      console.error('Failed to fetch company data:', error);
    }
  }, []);

  // Handle preview generation
  const handlePreview = useCallback(async () => {
    if (!formData.content.trim()) {
      setPreviewContent('<p>No content to preview</p>');
      return;
    }

    setIsPreviewLoading(true);
    try {
      let preview = formData.content;
      const { company, directors, shareholders, contact, custom, system } = mockData;

      // Company placeholders
      preview = preview.replace(/\{\{company\.name\}\}/g, company.name || '');
      preview = preview.replace(/\{\{company\.uen\}\}/g, company.uen || '');
      preview = preview.replace(/\{\{company\.registeredAddress\}\}/g, company.registeredAddress || '');
      preview = preview.replace(/\{\{company\.entityType\}\}/g, company.entityType || '');
      preview = preview.replace(/\{\{company\.capital\}\}/g, company.capital ? `$${company.capital.toLocaleString()}` : '');
      preview = preview.replace(/\{\{company\.incorporationDate\}\}/g, company.incorporationDate ? new Date(company.incorporationDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '');

      // Address breakdown placeholders
      preview = preview.replace(/\{\{company\.address\.block\}\}/g, company.address?.block || '');
      preview = preview.replace(/\{\{company\.address\.street\}\}/g, company.address?.street || '');
      preview = preview.replace(/\{\{company\.address\.level\}\}/g, company.address?.level || '');
      preview = preview.replace(/\{\{company\.address\.unit\}\}/g, company.address?.unit || '');
      preview = preview.replace(/\{\{company\.address\.building\}\}/g, company.address?.building || '');
      preview = preview.replace(/\{\{company\.address\.postalCode\}\}/g, company.address?.postalCode || '');

      // Contact placeholders
      preview = preview.replace(/\{\{contact\.fullName\}\}/g, contact.fullName || '');
      preview = preview.replace(/\{\{contact\.email\}\}/g, contact.email || '');
      preview = preview.replace(/\{\{contact\.phone\}\}/g, contact.phone || '');
      preview = preview.replace(/\{\{contact\.identificationNumber\}\}/g, contact.identificationNumber || '');

      // Custom placeholders
      preview = preview.replace(/\{\{custom\.resolutionNumber\}\}/g, custom.resolutionNumber || '');
      preview = preview.replace(/\{\{custom\.amount\}\}/g, custom.amount ? `$${custom.amount.toLocaleString()}` : '');
      preview = preview.replace(/\{\{custom\.effectiveDate\}\}/g, custom.effectiveDate ? new Date(custom.effectiveDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
      preview = preview.replace(/\{\{custom\.meetingDate\}\}/g, custom.meetingDate ? new Date(custom.meetingDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '');

      // User-defined custom placeholders (dynamic)
      const customData = custom as unknown as Record<string, string | number | undefined>;
      formData.customPlaceholders.forEach((placeholder) => {
        const regex = new RegExp(`\\{\\{custom\\.${placeholder.key}\\}\\}`, 'g');
        let value = customData[placeholder.key] || '';

        // Format based on type
        if (placeholder.type === 'date' && value) {
          try {
            value = new Date(value as string).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
          } catch {
            // Keep original value if date parsing fails
          }
        } else if ((placeholder.type === 'currency' || placeholder.type === 'number') && value) {
          const num = Number(value);
          if (!isNaN(num)) {
            value = placeholder.type === 'currency' ? `$${num.toLocaleString()}` : num.toLocaleString();
          }
        }

        preview = preview.replace(regex, String(value));
      });

      // System placeholders
      preview = preview.replace(/\{\{system\.currentDate\}\}/g, new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }));
      preview = preview.replace(/\{\{system\.generatedBy\}\}/g, system.generatedBy || '');

      // First director placeholders (outside loop)
      if (directors.length > 0) {
        preview = preview.replace(/\{\{directors\[0\]\.name\}\}/g, directors[0].name || '');
        preview = preview.replace(/\{\{directors\[0\]\.identificationNumber\}\}/g, directors[0].identificationNumber || '');
        preview = preview.replace(/\{\{directors\[0\]\.nationality\}\}/g, directors[0].nationality || '');
      }

      // First shareholder placeholders (outside loop)
      if (shareholders.length > 0) {
        preview = preview.replace(/\{\{shareholders\[0\]\.name\}\}/g, shareholders[0].name || '');
        preview = preview.replace(/\{\{shareholders\[0\]\.identificationNumber\}\}/g, shareholders[0].identificationNumber || '');
        preview = preview.replace(/\{\{shareholders\[0\]\.nationality\}\}/g, shareholders[0].nationality || '');
        preview = preview.replace(/\{\{shareholders\[0\]\.shareClass\}\}/g, shareholders[0].shareClass || '');
        preview = preview.replace(/\{\{shareholders\[0\]\.numberOfShares\}\}/g, shareholders[0].numberOfShares?.toLocaleString() || '');
        preview = preview.replace(/\{\{shareholders\[0\]\.percentageHeld\}\}/g, shareholders[0].percentageHeld ? `${shareholders[0].percentageHeld}%` : '');
      }

      // Handle director loops - support both {{name}} and {{this.name}} syntax
      const directorLoopRegex = /\{\{#each directors\}\}([\s\S]*?)\{\{\/each\}\}/g;
      preview = preview.replace(directorLoopRegex, (_match, template) => {
        return directors.map((director, index) => {
          let item = template;
          // Support both {{this.field}} and {{field}} syntax
          item = item.replace(/\{\{(?:this\.)?name\}\}/g, director.name || '');
          item = item.replace(/\{\{(?:this\.)?identificationNumber\}\}/g, director.identificationNumber || '');
          item = item.replace(/\{\{(?:this\.)?nationality\}\}/g, director.nationality || '');
          item = item.replace(/\{\{(?:this\.)?address\}\}/g, director.address || '');
          item = item.replace(/\{\{(?:this\.)?role\}\}/g, director.role || '');
          item = item.replace(/\{\{@index\}\}/g, String(index));
          item = item.replace(/\{\{@number\}\}/g, String(index + 1));
          return item;
        }).join('');
      });

      // Handle shareholder loops - support both {{name}} and {{this.name}} syntax
      const shareholderLoopRegex = /\{\{#each shareholders\}\}([\s\S]*?)\{\{\/each\}\}/g;
      preview = preview.replace(shareholderLoopRegex, (_match, template) => {
        return shareholders.map((shareholder, index) => {
          let item = template;
          // Support both {{this.field}} and {{field}} syntax
          item = item.replace(/\{\{(?:this\.)?name\}\}/g, shareholder.name || '');
          item = item.replace(/\{\{(?:this\.)?identificationNumber\}\}/g, shareholder.identificationNumber || '');
          item = item.replace(/\{\{(?:this\.)?nationality\}\}/g, shareholder.nationality || '');
          item = item.replace(/\{\{(?:this\.)?shareClass\}\}/g, shareholder.shareClass || '');
          item = item.replace(/\{\{(?:this\.)?numberOfShares\}\}/g, shareholder.numberOfShares?.toLocaleString() || '');
          item = item.replace(/\{\{(?:this\.)?percentageHeld\}\}/g, shareholder.percentageHeld ? `${shareholder.percentageHeld}%` : '');
          item = item.replace(/\{\{@index\}\}/g, String(index));
          item = item.replace(/\{\{@number\}\}/g, String(index + 1));
          return item;
        }).join('');
      });

      // Handle conditionals - {{#if field}}...{{/if}} and {{#if field}}...{{else}}...{{/if}}
      const ifElseRegex = /\{\{#if\s+([^}]+)\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{\/if\}\}/g;
      preview = preview.replace(ifElseRegex, (_match, field, ifContent, elseContent) => {
        const value = field.split('.').reduce((obj: Record<string, unknown>, key: string) => {
          if (obj && typeof obj === 'object') return (obj as Record<string, unknown>)[key];
          return undefined;
        }, { company, directors, shareholders, contact, custom, system } as Record<string, unknown>);
        return value ? ifContent : elseContent;
      });

      const ifRegex = /\{\{#if\s+([^}]+)\}\}([\s\S]*?)\{\{\/if\}\}/g;
      preview = preview.replace(ifRegex, (_match, field, content) => {
        const value = field.split('.').reduce((obj: Record<string, unknown>, key: string) => {
          if (obj && typeof obj === 'object') return (obj as Record<string, unknown>)[key];
          return undefined;
        }, { company, directors, shareholders, contact, custom, system } as Record<string, unknown>);
        return value ? content : '';
      });

      // Handle {{#unless field}}...{{/unless}} (opposite of if)
      const unlessRegex = /\{\{#unless\s+([^}]+)\}\}([\s\S]*?)\{\{\/unless\}\}/g;
      preview = preview.replace(unlessRegex, (_match, field, content) => {
        const value = field.split('.').reduce((obj: Record<string, unknown>, key: string) => {
          if (obj && typeof obj === 'object') return (obj as Record<string, unknown>)[key];
          return undefined;
        }, { company, directors, shareholders, contact, custom, system } as Record<string, unknown>);
        return !value ? content : '';
      });

      // Preserve empty paragraphs by replacing empty <p></p> with <p>&nbsp;</p>
      preview = preview.replace(/<p><\/p>/g, '<p>&nbsp;</p>');
      preview = preview.replace(/<p>\s*<\/p>/g, '<p>&nbsp;</p>');

      setPreviewContent(preview);
      // Preview will be shown inline in the A4PageEditor via the previewContent prop
    } catch (error) {
      console.error('Preview error:', error);
      setPreviewContent('<p class="text-red-500">Error generating preview</p>');
    } finally {
      setIsPreviewLoading(false);
    }
  }, [formData.content, mockData]);

  // Handle save
  // Helper to convert custom placeholders to storage format
  const customPlaceholdersToStorageFormat = (
    customPlaceholders: CustomPlaceholderDefinition[]
  ) => {
    return customPlaceholders.map((p) => ({
      key: `custom.${p.key}`,
      label: p.label,
      type: p.type === 'textarea' ? 'text' : p.type,
      source: 'custom',
      category: 'custom',
      path: `custom.${p.key}`,
      defaultValue: p.defaultValue,
      required: p.required,
    }));
  };

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
    if (!activeTenantId) {
      setFormError('Please select a tenant');
      return;
    }

    // Convert custom placeholders to storage format
    const placeholders = customPlaceholdersToStorageFormat(formData.customPlaceholders);
    const dataToSave = {
      name: formData.name,
      description: formData.description,
      category: formData.category,
      content: formData.content,
      isActive: formData.isActive,
      placeholders,
    };

    if (isEditMode && templateId) {
      await updateMutation.mutateAsync({ id: templateId, ...dataToSave });
    } else {
      await createMutation.mutateAsync({ tenantId: activeTenantId, ...dataToSave });
    }
  }, [formData, activeTenantId, isEditMode, templateId, createMutation, updateMutation]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleSave]);

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const partials = partialsData?.partials || [];
  const companies = companiesData?.companies || [];

  if (isLoadingTemplate) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-accent-primary" />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background-primary">
      {/* Header */}
      <header className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-border-primary bg-background-secondary">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-accent-primary" />
          <h1 className="text-lg font-semibold text-text-primary">
            {isEditMode ? 'Edit Template' : 'Create Template'}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {formData.name && (
            <span className="text-sm text-text-muted mr-4">{formData.name}</span>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => router.push('/admin/template-partials')}
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
        </div>
      </header>

      {/* Error message */}
      {formError && (
        <div className="flex-shrink-0 px-4 py-3 bg-status-error/10 border-b border-status-error/30">
          <div className="flex items-center gap-2 text-status-error text-sm">
            <AlertCircle className="w-4 h-4" />
            {formError}
          </div>
        </div>
      )}

      {/* Main content - Editor (left) + Combined Panel (right) */}
      <div className="flex-1 flex overflow-hidden">
        {/* A4 Page Editor - takes up remaining space */}
        <div className="flex-1 min-w-0">
          <A4PageEditor
            ref={editorRef}
            value={formData.content}
            onChange={(html) => setFormData((prev) => ({ ...prev, content: html }))}
            placeholder="Start typing your template content..."
            tenantId={activeTenantId}
            previewContent={previewContent}
            showPreviewToggle={true}
            onPreview={handlePreview}
            isPreviewLoading={isPreviewLoading}
          />
        </div>

        {/* Right panel resize handle */}
        <div
          className={cn(
            'flex-shrink-0 w-2 cursor-col-resize hover:bg-accent-primary/30 transition-colors flex items-center justify-center relative',
            rightPanel.isResizing && 'bg-accent-primary/30'
          )}
          onMouseDown={(e) => rightPanel.startResize(e, 'left')}
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); rightPanel.toggle(); }}
            className="absolute z-20 p-1.5 rounded-md bg-background-secondary border border-border-primary shadow-sm hover:bg-background-tertiary transition-colors"
            title={rightPanel.isCollapsed ? 'Expand panel' : 'Collapse panel'}
          >
            {rightPanel.isCollapsed ? (
              <ChevronLeft className="w-3 h-3 text-text-muted" />
            ) : (
              <ChevronRight className="w-3 h-3 text-text-muted" />
            )}
          </button>
        </div>

        {/* Combined Right Panel - All tools */}
        <div
          className={cn(
            'flex-shrink-0 flex flex-col border-l border-border-primary bg-background-secondary transition-all duration-200',
            rightPanel.isCollapsed && 'w-0 overflow-hidden border-l-0'
          )}
          style={{ width: rightPanel.isCollapsed ? 0 : rightPanel.width }}
        >
          {!rightPanel.isCollapsed && (
            <>
              {/* Panel tabs */}
              <div className="flex border-b border-border-primary">
                <button
                  type="button"
                  onClick={() => setActiveTab('details')}
                  className={cn(
                    'flex-1 px-2 py-2 text-xs font-medium transition-colors flex items-center justify-center gap-1',
                    activeTab === 'details'
                      ? 'text-accent-primary border-b-2 border-accent-primary'
                      : 'text-text-muted hover:text-text-primary'
                  )}
                >
                  <Settings className="w-3.5 h-3.5" />
                  Details
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('placeholders')}
                  className={cn(
                    'flex-1 px-2 py-2 text-xs font-medium transition-colors flex items-center justify-center gap-1',
                    activeTab === 'placeholders'
                      ? 'text-accent-primary border-b-2 border-accent-primary'
                      : 'text-text-muted hover:text-text-primary'
                  )}
                >
                  <Braces className="w-3.5 h-3.5" />
                  Placeholders
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('testdata')}
                  className={cn(
                    'flex-1 px-2 py-2 text-xs font-medium transition-colors flex items-center justify-center gap-1',
                    activeTab === 'testdata'
                      ? 'text-accent-primary border-b-2 border-accent-primary'
                      : 'text-text-muted hover:text-text-primary'
                  )}
                >
                  <TestTube className="w-3.5 h-3.5" />
                  Test
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('ai')}
                  className={cn(
                    'flex-1 px-2 py-2 text-xs font-medium transition-colors flex items-center justify-center gap-1',
                    activeTab === 'ai'
                      ? 'text-accent-primary border-b-2 border-accent-primary'
                      : 'text-text-muted hover:text-text-primary'
                  )}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  AI
                </button>
              </div>

              {/* Panel content */}
              <div className="flex-1 overflow-hidden">
                {activeTab === 'details' && (
                  <DetailsTab
                    formData={formData}
                    onChange={handleFormChange}
                    isSuperAdmin={session?.isSuperAdmin}
                    selectedTenantId={selectedTenantId}
                    onTenantChange={setSelectedTenantId}
                  />
                )}
                {activeTab === 'placeholders' && (
                  <PlaceholdersTab
                    onInsert={handleInsertPlaceholder}
                    partials={partials}
                    isLoadingPartials={isLoadingPartials}
                    customPlaceholders={formData.customPlaceholders}
                    onCustomPlaceholdersChange={(placeholders) =>
                      setFormData((prev) => ({ ...prev, customPlaceholders: placeholders }))
                    }
                  />
                )}
                {activeTab === 'testdata' && (
                  <TestDataTab
                    mockData={mockData}
                    onMockDataChange={setMockData}
                    companies={companies}
                    isLoadingCompanies={isLoadingCompanies}
                    onSelectCompany={handleSelectCompany}
                    customPlaceholders={formData.customPlaceholders}
                  />
                )}
                {activeTab === 'ai' && (
                  <AISidebar
                    isOpen={true}
                    onClose={() => rightPanel.toggle()}
                    context={{
                      ...aiSidebar.context,
                    }}
                    onInsert={handleAIInsert}
                    onReplace={handleAIInsert}
                    className="w-full h-full border-0"
                  />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Page Export with Suspense
// ============================================================================

export default function TemplateEditorPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-accent-primary" />
      </div>
    }>
      <TemplateEditorContent />
    </Suspense>
  );
}
