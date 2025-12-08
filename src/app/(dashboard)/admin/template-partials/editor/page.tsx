'use client';

import { useState, useCallback, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from '@/hooks/use-auth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { FormInput } from '@/components/ui/form-input';
import { useToast } from '@/components/ui/toast';
import { useActiveTenantId, useTenantSelection } from '@/components/ui/tenant-selector';
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

type EditorType = 'template' | 'partial';

interface TemplateFormData {
  name: string;
  description: string;
  category: string;
  content: string;
  isActive: boolean;
  customPlaceholders: CustomPlaceholderDefinition[];
}

interface PartialFormData {
  name: string;
  description: string;
  content: string;
}

interface CustomPlaceholderDefinition {
  id: string;
  key: string;
  label: string;
  type: 'text' | 'date' | 'number' | 'currency' | 'boolean' | 'textarea';
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

// CustomData is now a dynamic type based on user-defined placeholders
type CustomData = Record<string, string | number | Date | undefined>;

interface SystemData {
  currentDate: Date;
  generatedBy: string;
}

interface MockDataValues {
  company: CompanyData;
  directors: DirectorData[];
  shareholders: ShareholderData[];
  custom: CustomData;
  system: SystemData;
}

interface TemplatePartial {
  id: string;
  name: string;
  description?: string;
  content?: string;
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
    tip: 'Use {{#each directors}}...{{/each}} to loop through all directors. Inside the loop, use {{this.name}} or just {{name}} to access each director\'s properties.',
    placeholders: [
      { key: '{{#each directors}}...{{/each}}', label: 'Loop All Directors', example: 'Iterator block', isBlock: true },
      { key: 'this.name', label: '↳ Director Name (in loop)', example: 'John Tan Wei Ming', inLoop: true },
      { key: 'this.identificationNumber', label: '↳ Director ID (in loop)', example: 'S1234567A', inLoop: true },
      { key: 'this.nationality', label: '↳ Director Nationality (in loop)', example: 'Singaporean', inLoop: true },
      { key: 'this.address', label: '↳ Director Address (in loop)', example: '123 Sample St', inLoop: true },
      { key: '@index', label: '↳ Loop Index (0-based)', example: '0, 1, 2...', inLoop: true, usage: '{{#each directors}}Director {{@index}}: {{name}}{{/each}} → Director 0: John, Director 1: Mary' },
      { key: '@number', label: '↳ Loop Number (1-based)', example: '1, 2, 3...', inLoop: true, usage: '{{#each directors}}{{@number}}. {{name}}{{/each}} → 1. John, 2. Mary' },
      { key: 'directors[0].name', label: 'First Director Name', example: 'John Tan Wei Ming' },
      { key: 'directors[0].identificationNumber', label: 'First Director ID', example: 'S1234567A' },
      { key: 'directors[0].nationality', label: 'First Director Nationality', example: 'Singaporean' },
      { key: 'directors[1].name', label: 'Second Director Name', example: 'Mary Lee Mei Ling' },
      { key: 'directors[1].identificationNumber', label: 'Second Director ID', example: 'S7654321B' },
      { key: 'directors[1].nationality', label: 'Second Director Nationality', example: 'Singaporean' },
    ],
  },
  {
    key: 'shareholders',
    label: 'Shareholders',
    tip: 'Use {{#each shareholders}}...{{/each}} to loop through all shareholders. Access properties with {{this.name}}, {{this.numberOfShares}}, etc.',
    placeholders: [
      { key: '{{#each shareholders}}...{{/each}}', label: 'Loop All Shareholders', example: 'Iterator block', isBlock: true },
      { key: 'this.name', label: '↳ Shareholder Name (in loop)', example: 'John Tan Wei Ming', inLoop: true },
      { key: 'this.identificationNumber', label: '↳ ID Number (in loop)', example: 'S8901234A', inLoop: true },
      { key: 'this.nationality', label: '↳ Nationality (in loop)', example: 'Singaporean', inLoop: true },
      { key: 'this.shareClass', label: '↳ Share Class (in loop)', example: 'Ordinary', inLoop: true },
      { key: 'this.numberOfShares', label: '↳ Number of Shares (in loop)', example: '50,000', inLoop: true },
      { key: 'this.percentageHeld', label: '↳ Percentage Held (in loop)', example: '50%', inLoop: true },
      { key: '@index', label: '↳ Loop Index (0-based)', example: '0, 1, 2...', inLoop: true, usage: '{{#each shareholders}}Shareholder {{@index}}: {{name}}{{/each}} → Shareholder 0: John, Shareholder 1: Mary' },
      { key: '@number', label: '↳ Loop Number (1-based)', example: '1, 2, 3...', inLoop: true, usage: '{{#each shareholders}}{{@number}}. {{name}}{{/each}} → 1. John, 2. Mary' },
      { key: 'shareholders[0].name', label: 'First Shareholder Name', example: 'John Tan Wei Ming' },
      { key: 'shareholders[0].identificationNumber', label: 'First Shareholder ID', example: 'S8901234A' },
      { key: 'shareholders[0].nationality', label: 'First Shareholder Nationality', example: 'Singaporean' },
      { key: 'shareholders[0].shareClass', label: 'First Shareholder Share Class', example: 'Ordinary' },
      { key: 'shareholders[0].numberOfShares', label: 'First Shareholder Shares', example: '50,000' },
      { key: 'shareholders[0].percentageHeld', label: 'First Shareholder Percentage', example: '50%' },
      { key: 'shareholders[1].name', label: 'Second Shareholder Name', example: 'Mary Lee Mei Ling' },
      { key: 'shareholders[1].identificationNumber', label: 'Second Shareholder ID', example: 'S8502468B' },
      { key: 'shareholders[1].numberOfShares', label: 'Second Shareholder Shares', example: '50,000' },
    ],
  },
  {
    key: 'custom',
    label: 'Custom',
    tip: 'Define your own custom placeholders that will be prompted during document generation. Click "Add custom placeholder" below to create one.',
    placeholders: [],
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
    tip: 'Conditionals show or hide content based on data. {{#if}} shows content when field exists/is truthy. Use == for comparisons. {{#unless}} shows content when field is empty/falsy.',
    placeholders: [
      { key: '{{#if field}}...{{/if}}', label: 'IF condition', example: 'Show if field exists', isBlock: true, usage: '{{#if company.name}}Company: {{company.name}}{{/if}}' },
      { key: '{{#if field}}...{{else}}...{{/if}}', label: 'IF-ELSE condition', example: 'Show one or the other', isBlock: true, usage: '{{#if company.address.building}}Building: {{company.address.building}}{{else}}No building name{{/if}}' },
      { key: '{{#if field == \'value\'}}...{{/if}}', label: 'IF equals value', example: 'Compare field to value', isBlock: true, usage: '{{#if company.entityType == \'Private Limited\'}}This is a private company{{/if}}' },
      { key: '{{#if field != \'value\'}}...{{/if}}', label: 'IF not equals value', example: 'Check field is not value', isBlock: true, usage: '{{#if company.entityType != \'Sole Proprietor\'}}Not a sole prop{{/if}}' },
      { key: '{{#unless field}}...{{/unless}}', label: 'UNLESS (if not)', example: 'Show if field is empty', isBlock: true, usage: '{{#unless company.formerName}}(No former name){{/unless}}' },
      { key: '{{#if company.entityType == \'Private Limited\'}}', label: '↳ If Private Limited', example: 'Check entity type', inLoop: true },
      { key: '{{#if company.address.building}}', label: '↳ If building exists', example: 'Check building name', inLoop: true },
      { key: '{{#if directors.length}}', label: '↳ If has directors', example: 'Check array has items', inLoop: true },
    ],
  },
  {
    key: 'modifiers',
    label: 'Modifiers',
    tip: 'Text modifiers transform placeholder values. Wrap any placeholder with a modifier function to change its case.',
    placeholders: [
      { key: 'UCASE({{field}})', label: 'UPPERCASE', example: 'SAMPLE COMPANY PTE LTD', usage: 'UCASE({{company.name}}) → SAMPLE COMPANY PTE LTD' },
      { key: 'LCASE({{field}})', label: 'lowercase', example: 'sample company pte ltd', usage: 'LCASE({{company.name}}) → sample company pte ltd' },
      { key: 'PCASE({{field}})', label: 'Proper Case', example: 'Sample Company Pte Ltd', usage: 'PCASE({{company.name}}) → Sample Company Pte Ltd' },
      { key: 'UCASE({{company.name}})', label: '↳ Company Name (UPPER)', example: 'SAMPLE COMPANY PTE LTD', inLoop: true },
      { key: 'LCASE({{company.uen}})', label: '↳ UEN (lower)', example: '202312345a', inLoop: true },
      { key: 'PCASE({{this.name}})', label: '↳ Name in loop (Proper)', example: 'John Tan Wei Ming', inLoop: true },
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
    { name: 'John Tan Wei Ming', shareClass: 'Ordinary', numberOfShares: 50000, percentageHeld: 50, identificationNumber: 'S8901234A', nationality: 'Singaporean' },
    { name: 'Mary Lee Mei Ling', shareClass: 'Ordinary', numberOfShares: 50000, percentageHeld: 50, identificationNumber: 'S8502468B', nationality: 'Singaporean' },
  ],
  custom: {},
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
  activeTenantId?: string;
  tenantName?: string;
}

function DetailsTab({ formData, onChange, isSuperAdmin, activeTenantId, tenantName }: DetailsTabProps) {
  return (
    <div className="p-4 space-y-4">
      {/* Tenant context info for SUPER_ADMIN */}
      {isSuperAdmin && (
        <div>
          <label className="text-xs font-medium text-text-secondary block mb-1.5">Tenant</label>
          {activeTenantId ? (
            <div className="px-3 py-1.5 text-xs bg-accent-primary/10 text-accent-primary rounded-md border border-accent-primary/20">
              {tenantName || activeTenantId}
            </div>
          ) : (
            <div className="px-3 py-1.5 text-xs bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 rounded-md border border-amber-200 dark:border-amber-800">
              Select a tenant from the sidebar
            </div>
          )}
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
// Partial Details Tab Component
// ============================================================================

interface PartialDetailsTabProps {
  formData: PartialFormData;
  onChange: (data: Partial<PartialFormData>) => void;
  isSuperAdmin?: boolean;
  activeTenantId?: string;
  tenantName?: string;
}

function PartialDetailsTab({ formData, onChange, isSuperAdmin, activeTenantId, tenantName }: PartialDetailsTabProps) {
  // Auto-format partial name: convert spaces to hyphens, lowercase, remove invalid chars
  const handleNameChange = (value: string) => {
    const formatted = value
      .toLowerCase()
      .replace(/\s+/g, '-')           // spaces to hyphens
      .replace(/[^a-z0-9_-]/g, '');   // remove invalid characters
    onChange({ name: formatted });
  };

  return (
    <div className="p-4 space-y-4">
      {/* Tenant context info for SUPER_ADMIN */}
      {isSuperAdmin && (
        <div>
          <label className="text-xs font-medium text-text-secondary block mb-1.5">Tenant</label>
          {activeTenantId ? (
            <div className="px-3 py-1.5 text-xs bg-accent-primary/10 text-accent-primary rounded-md border border-accent-primary/20">
              {tenantName || activeTenantId}
            </div>
          ) : (
            <div className="px-3 py-1.5 text-xs bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 rounded-md border border-amber-200 dark:border-amber-800">
              Select a tenant from the sidebar
            </div>
          )}
        </div>
      )}

      <FormInput
        label="Partial Name (Identifier)"
        value={formData.name}
        onChange={(e) => handleNameChange(e.target.value)}
        placeholder="e.g., director-resolution-header"
        inputSize="xs"
        hint="Auto-formatted: lowercase, hyphens instead of spaces. Used in templates as {{> name }}"
        required
      />

      <div>
        <label className="text-xs font-medium text-text-secondary block mb-1.5">Description</label>
        <textarea
          value={formData.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="Brief description of what this partial is used for"
          rows={3}
          className="w-full px-3 py-2 text-xs border border-border-primary rounded-md bg-background-primary text-text-primary placeholder:text-text-muted placeholder:text-xs focus:outline-none focus:ring-2 focus:ring-accent-primary/50 resize-none"
        />
      </div>

      <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
        <p className="text-xs text-blue-700 dark:text-blue-300">
          <strong>Tip:</strong> Partials are reusable content blocks. Insert them into templates using{' '}
          <code className="px-1 py-0.5 bg-blue-100 dark:bg-blue-800 rounded text-[10px]">
            {'{{>'} {formData.name || 'partial-name'} {'}}'}
          </code>
        </p>
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
    // Don't wrap if already has {{ or if it's a modifier function (UCASE, LCASE, PCASE)
    const isModifier = /^[ULP]CASE\(/.test(key);
    const placeholder = key.startsWith('{{') || isModifier ? key : `{{${key}}}`;
    onInsert(placeholder);
  };

  const handleCopy = async (key: string) => {
    // Don't wrap if already has {{ or if it's a modifier function (UCASE, LCASE, PCASE)
    const isModifier = /^[ULP]CASE\(/.test(key);
    const placeholder = key.startsWith('{{') || isModifier ? key : `{{${key}}}`;
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
                {/* Tip for this category */}
                {'tip' in category && category.tip && (
                  <div className="mx-4 mb-2 p-2 bg-accent-primary/5 border border-accent-primary/20 rounded text-[11px] text-text-secondary">
                    <div className="flex items-start gap-1.5">
                      <Info className="w-3 h-3 text-accent-primary flex-shrink-0 mt-0.5" />
                      <span>{category.tip}</span>
                    </div>
                  </div>
                )}
                {/* Standard placeholders for this category */}
                {category.placeholders.map((placeholder) => (
                  <div
                    key={placeholder.key}
                    className="group flex items-center gap-2 px-4 py-1.5 hover:bg-background-tertiary relative"
                  >
                    <button
                      type="button"
                      onClick={() => handleInsert(placeholder.key)}
                      className="flex-1 text-left"
                      title={'usage' in placeholder && placeholder.usage ? `Example: ${placeholder.usage}` : undefined}
                    >
                      <div className="text-xs font-mono text-accent-primary truncate">
                        {placeholder.key.startsWith('{{') ? placeholder.key : `{{${placeholder.key}}}`}
                      </div>
                      <div className="text-xs text-text-muted truncate">{placeholder.label}</div>
                      {'usage' in placeholder && placeholder.usage && (
                        <div className="text-[10px] text-text-muted/70 truncate mt-0.5 italic">
                          Example: {placeholder.usage}
                        </div>
                      )}
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
                              <option value="boolean">Boolean</option>
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
  // Auto-expand custom section if custom placeholders exist
  const [expandedSections, setExpandedSections] = useState<string[]>(['source']);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');

  // Auto-expand custom section when custom placeholders are added
  useEffect(() => {
    if (customPlaceholders.length > 0 && !expandedSections.includes('custom')) {
      setExpandedSections(prev => [...prev, 'custom']);
    }
  }, [customPlaceholders.length]); // eslint-disable-line react-hooks/exhaustive-deps

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
              {isLoadingCompanies ? (
                <div className="flex items-center gap-2 py-2">
                  <Loader2 className="w-4 h-4 animate-spin text-text-muted" />
                  <span className="text-xs text-text-muted">Loading companies...</span>
                </div>
              ) : companies.length === 0 ? (
                <div className="text-xs text-text-muted py-2 italic">
                  {selectedCompanyId === '' ? 'Select a tenant in Details tab to load companies' : 'No companies found'}
                </div>
              ) : (
                <select
                  value={selectedCompanyId}
                  onChange={(e) => handleCompanySelect(e.target.value)}
                  className="w-full h-9 px-3 text-sm border border-border-primary rounded-md bg-background-primary text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/50"
                >
                  <option value="">Use sample data</option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name} ({company.uen})
                    </option>
                  ))}
                </select>
              )}
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
                <label className="text-xs text-text-muted">Full Address</label>
                <input
                  type="text"
                  value={mockData.company.registeredAddress || ''}
                  onChange={(e) => updateValue('company.registeredAddress', e.target.value)}
                  className="w-full px-2 py-1 text-xs border border-border-primary rounded bg-background-primary text-text-primary"
                />
              </div>

              {/* Address Breakdown */}
              <div className="mt-2 pt-2 border-t border-border-secondary">
                <div className="text-xs text-text-muted mb-1 font-medium">Address Breakdown</div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-text-muted">Block</label>
                    <input
                      type="text"
                      value={mockData.company.address?.block || ''}
                      readOnly
                      className="w-full px-2 py-1 text-xs border border-border-primary rounded bg-background-tertiary text-text-secondary"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-text-muted">Postal Code</label>
                    <input
                      type="text"
                      value={mockData.company.address?.postalCode || ''}
                      readOnly
                      className="w-full px-2 py-1 text-xs border border-border-primary rounded bg-background-tertiary text-text-secondary"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-[10px] text-text-muted">Street</label>
                    <input
                      type="text"
                      value={mockData.company.address?.street || ''}
                      readOnly
                      className="w-full px-2 py-1 text-xs border border-border-primary rounded bg-background-tertiary text-text-secondary"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-text-muted">Level</label>
                    <input
                      type="text"
                      value={mockData.company.address?.level || ''}
                      readOnly
                      className="w-full px-2 py-1 text-xs border border-border-primary rounded bg-background-tertiary text-text-secondary"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-text-muted">Unit</label>
                    <input
                      type="text"
                      value={mockData.company.address?.unit || ''}
                      readOnly
                      className="w-full px-2 py-1 text-xs border border-border-primary rounded bg-background-tertiary text-text-secondary"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-[10px] text-text-muted">Building</label>
                    <input
                      type="text"
                      value={mockData.company.address?.building || ''}
                      readOnly
                      className="w-full px-2 py-1 text-xs border border-border-primary rounded bg-background-tertiary text-text-secondary"
                    />
                  </div>
                </div>
                <p className="text-[10px] text-text-muted/70 mt-1 italic">
                  Auto-parsed from company address. Select a company to populate.
                </p>
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
              {mockData.directors.length === 0 ? (
                <div className="text-xs text-text-muted italic">No directors data</div>
              ) : (
                mockData.directors.map((director, index) => (
                  <div key={index} className="p-2 bg-background-tertiary rounded">
                    <div className="text-xs font-medium text-text-secondary mb-1">Director {index + 1}</div>
                    <div className="text-xs text-text-primary">{director.name}</div>
                    <div className="text-xs text-text-muted">{director.identificationNumber} • {director.nationality}</div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Shareholders Section */}
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => toggleSection('shareholders')}
            className="flex items-center gap-2 text-sm font-medium text-text-primary"
          >
            {expandedSections.includes('shareholders') ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
            Shareholders ({mockData.shareholders.length})
          </button>

          {expandedSections.includes('shareholders') && (
            <div className="space-y-2 pl-5">
              {mockData.shareholders.length === 0 ? (
                <div className="text-xs text-text-muted italic">No shareholders data</div>
              ) : (
                mockData.shareholders.map((shareholder, index) => (
                  <div key={index} className="p-2 bg-background-tertiary rounded">
                    <div className="text-xs font-medium text-text-secondary mb-1">Shareholder {index + 1}</div>
                    <div className="text-xs text-text-primary">{shareholder.name}</div>
                    <div className="text-xs text-text-muted">
                      {shareholder.shareClass} • {shareholder.numberOfShares.toLocaleString()} shares ({shareholder.percentageHeld}%)
                    </div>
                    <div className="text-xs text-text-muted">{shareholder.identificationNumber} • {shareholder.nationality}</div>
                  </div>
                ))
              )}
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
                      ) : placeholder.type === 'boolean' ? (
                        <input
                          type="checkbox"
                          checked={fieldValue === 'true' || fieldValue === '1'}
                          onChange={(e) => updateValue(`custom.${placeholder.key}`, e.target.checked ? 'true' : 'false')}
                          className="w-4 h-4 rounded border-border-primary text-accent-primary focus:ring-accent-primary"
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

        {/* Message when no custom placeholders defined */}
        {customPlaceholders.length === 0 && (
          <div className="text-xs text-text-muted italic px-1 py-2">
            No custom placeholders defined. Add them in the Placeholders tab.
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

  // Determine editor type from query params
  const editorType: EditorType = (searchParams.get('type') as EditorType) || 'template';
  const itemId = searchParams.get('id');
  const isEditMode = !!itemId;
  const isPartialMode = editorType === 'partial';

  // Tenant selection (from centralized store for SUPER_ADMIN)
  const { selectedTenantId, selectedTenantName } = useTenantSelection();
  const activeTenantId = useActiveTenantId(
    session?.isSuperAdmin ?? false,
    session?.tenantId
  );

  // Editor ref for cursor-based insertion
  const editorRef = useRef<A4PageEditorRef>(null);

  // Form state for templates
  const [formData, setFormData] = useState<TemplateFormData>({
    name: '',
    description: '',
    category: 'OTHER',
    content: '',
    isActive: true,
    customPlaceholders: [],
  });

  // Form state for partials
  const [partialFormData, setPartialFormData] = useState<PartialFormData>({
    name: '',
    description: '',
    content: '',
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
    tenantName: selectedTenantName || undefined,
  });

  // Fetch existing template if editing (template mode)
  const { data: existingTemplate, isLoading: isLoadingTemplate } = useQuery({
    queryKey: ['document-template', itemId, activeTenantId],
    queryFn: async () => {
      if (!itemId || !activeTenantId) return null;
      const res = await fetch(`/api/document-templates/${itemId}?tenantId=${activeTenantId}`);
      if (!res.ok) throw new Error('Failed to fetch template');
      return res.json();
    },
    enabled: !!itemId && !isPartialMode && !!activeTenantId,
  });

  // Fetch existing partial if editing (partial mode)
  const { data: existingPartial, isLoading: isLoadingPartial } = useQuery({
    queryKey: ['template-partial', itemId, activeTenantId],
    queryFn: async () => {
      if (!itemId || !activeTenantId) return null;
      const res = await fetch(`/api/template-partials/${itemId}?tenantId=${activeTenantId}`);
      if (!res.ok) throw new Error('Failed to fetch partial');
      return res.json();
    },
    enabled: !!itemId && isPartialMode && !!activeTenantId,
  });

  // Fetch partials for placeholder palette (with content for preview resolution)
  const { data: partialsData, isLoading: isLoadingPartials } = useQuery({
    queryKey: ['template-partials', activeTenantId, 'all'],
    queryFn: async () => {
      if (!activeTenantId) return { partials: [] };
      const res = await fetch(`/api/template-partials?tenantId=${activeTenantId}&all=true`);
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

  // Update mutation (template)
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
      queryClient.invalidateQueries({ queryKey: ['document-template', itemId] });
      success('Template updated successfully');
      router.push('/admin/template-partials');
    },
    onError: (error: Error) => {
      setFormError(error.message);
    },
  });

  // Type for partial save data
  type PartialSaveData = {
    name: string;
    description: string | null;
    content: string;
    placeholders: unknown[];
  };

  // Create mutation (partial)
  const createPartialMutation = useMutation({
    mutationFn: async (data: PartialSaveData & { tenantId: string }) => {
      const res = await fetch('/api/template-partials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to create partial');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['template-partials'] });
      success('Partial created successfully');
      router.push('/admin/template-partials?tab=partials');
    },
    onError: (error: Error) => {
      setFormError(error.message);
    },
  });

  // Update mutation (partial)
  const updatePartialMutation = useMutation({
    mutationFn: async (data: PartialSaveData & { id: string }) => {
      const res = await fetch(`/api/template-partials/${data.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to update partial');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['template-partials'] });
      queryClient.invalidateQueries({ queryKey: ['template-partial', itemId] });
      success('Partial updated successfully');
      router.push('/admin/template-partials?tab=partials');
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
      .filter((p) => p.source === 'custom' || p.category === 'custom' || p.key?.startsWith('custom.'))
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
    if (existingTemplate && !isPartialMode) {
      // Handle case where placeholders might be a string (JSON) or already parsed
      let placeholdersArray = existingTemplate.placeholders || [];
      if (typeof placeholdersArray === 'string') {
        try {
          placeholdersArray = JSON.parse(placeholdersArray);
        } catch {
          placeholdersArray = [];
        }
      }

      setFormData({
        name: existingTemplate.name || '',
        description: existingTemplate.description || '',
        category: existingTemplate.category || 'OTHER',
        content: existingTemplate.content || '',
        isActive: existingTemplate.isActive ?? true,
        customPlaceholders: storageFormatToCustomPlaceholders(placeholdersArray),
      });
    }
  }, [existingTemplate, isPartialMode, itemId]);

  // Load existing partial data
  useEffect(() => {
    if (existingPartial && isPartialMode) {
      setPartialFormData({
        name: existingPartial.name || '',
        description: existingPartial.description || '',
        content: existingPartial.content || '',
      });
    }
  }, [existingPartial, isPartialMode, itemId]);

  // Handle form change (template)
  const handleFormChange = useCallback((changes: Partial<TemplateFormData>) => {
    setFormData((prev) => ({ ...prev, ...changes }));
  }, []);

  // Handle form change (partial)
  const handlePartialFormChange = useCallback((changes: Partial<PartialFormData>) => {
    setPartialFormData((prev) => ({ ...prev, ...changes }));
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

  // Helper to extract capital amount from company data
  // shareCapital is an array of ShareCapital objects, paidUpCapitalAmount is a Decimal
  interface ShareCapitalItem {
    totalValue?: number | string;
  }
  interface CompanyWithCapital {
    paidUpCapitalAmount?: number | string | null;
    shareCapital?: ShareCapitalItem[];
  }
  const getCapitalAmount = (company: CompanyWithCapital): number => {
    // First try paidUpCapitalAmount (direct field on Company)
    if (company.paidUpCapitalAmount) {
      const amount = Number(company.paidUpCapitalAmount);
      if (!isNaN(amount)) return amount;
    }
    // Then try summing shareCapital array totalValue
    if (Array.isArray(company.shareCapital) && company.shareCapital.length > 0) {
      const total = company.shareCapital.reduce((sum, sc) => {
        const val = Number(sc.totalValue || 0);
        return sum + (isNaN(val) ? 0 : val);
      }, 0);
      if (total > 0) return total;
    }
    return 0;
  };

  // Handle company selection for test data
  const handleSelectCompany = useCallback(async (companyId: string) => {
    try {
      const res = await fetch(`/api/companies/${companyId}?full=true`);
      if (!res.ok) throw new Error('Failed to fetch company');
      const company = await res.json();

      setMockData((prev) => {
        // Get registered office address from addresses array
        interface CompanyAddressData {
          addressType: string;
          fullAddress?: string;
          block?: string;
          streetName?: string;
          level?: string;
          unit?: string;
          buildingName?: string;
          postalCode?: string;
          isCurrent?: boolean;
        }
        const registeredAddress = company.addresses?.find(
          (a: CompanyAddressData) => a.addressType === 'REGISTERED_OFFICE' && a.isCurrent
        ) || company.addresses?.[0];

        // Format entity type to proper case (e.g., "PRIVATE_LIMITED" -> "Private Limited")
        const formatEntityType = (type: string | undefined): string => {
          if (!type) return prev.company.entityType;
          return type
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
        };

        // Build address data from CompanyAddress fields
        const addressData: AddressData = registeredAddress ? {
          block: registeredAddress.block || '',
          street: registeredAddress.streetName || '',
          level: registeredAddress.level || '',
          unit: registeredAddress.unit || '',
          building: registeredAddress.buildingName || '',
          postalCode: registeredAddress.postalCode || '',
        } : prev.company.address;

        return {
        ...prev,
        company: {
          name: company.name || prev.company.name,
          uen: company.uen || prev.company.uen,
          registeredAddress: registeredAddress?.fullAddress || prev.company.registeredAddress,
          address: addressData,
          incorporationDate: company.incorporationDate ? new Date(company.incorporationDate) : prev.company.incorporationDate,
          entityType: formatEntityType(company.entityType),
          capital: getCapitalAmount(company) || prev.company.capital,
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
      const { company, directors, shareholders, custom, system } = mockData;

      // Debug: Log the raw content to see how partials are stored
      console.log('[Preview] Raw content:', preview);
      console.log('[Preview] Content includes {{>:', preview.includes('{{>'));
      console.log('[Preview] Content includes {{&gt;:', preview.includes('{{&gt;'));

      // Resolve partials first ({{>partial-name}}) so their content also gets placeholder processing
      // Get partials from the query data
      const availablePartials = partialsData?.partials || [];

      // Handle raw > and all HTML-encoded variations (rich text editors encode special chars)
      // Pattern: {{> partial-name }} or {{&gt; partial-name }} or {{&#62; partial-name }} or {{&#x3e; partial-name }}
      const partialRegex = /\{\{(?:>|&gt;|&#62;|&#x3[eE];)\s*([a-zA-Z0-9_-]+)\s*\}\}/g;
      preview = preview.replace(partialRegex, (_match, partialName) => {
        console.log('[Preview] Resolving partial:', partialName, 'Available:', availablePartials.map((p: TemplatePartial) => p.name));
        const partial = availablePartials.find((p: TemplatePartial) => p.name === partialName);
        if (partial?.content) {
          // Return the partial content (HTML preserved)
          console.log('[Preview] Found partial content, length:', partial.content.length);
          return partial.content;
        }
        // If partial not found, return a placeholder message
        console.log('[Preview] Partial not found:', partialName);
        return `<span style="color: #ef4444; background: #fef2f2; padding: 2px 6px; border-radius: 4px; font-size: 12px;">[Partial "${partialName}" not found]</span>`;
      });

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
        } else if (placeholder.type === 'boolean') {
          // Boolean values render as 'true'/'false' for conditionals
          // The value is already stored as 'true' or 'false' string
          value = value === 'true' || value === '1' ? 'true' : 'false';
        }

        preview = preview.replace(regex, String(value));
      });

      // System placeholders
      preview = preview.replace(/\{\{system\.currentDate\}\}/g, new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }));
      preview = preview.replace(/\{\{system\.generatedBy\}\}/g, system.generatedBy || '');

      // Indexed director placeholders (directors[0], directors[1], etc.)
      directors.forEach((director, index) => {
        preview = preview.replace(new RegExp(`\\{\\{directors\\[${index}\\]\\.name\\}\\}`, 'g'), director.name || '');
        preview = preview.replace(new RegExp(`\\{\\{directors\\[${index}\\]\\.identificationNumber\\}\\}`, 'g'), director.identificationNumber || '');
        preview = preview.replace(new RegExp(`\\{\\{directors\\[${index}\\]\\.nationality\\}\\}`, 'g'), director.nationality || '');
        preview = preview.replace(new RegExp(`\\{\\{directors\\[${index}\\]\\.address\\}\\}`, 'g'), director.address || '');
        preview = preview.replace(new RegExp(`\\{\\{directors\\[${index}\\]\\.role\\}\\}`, 'g'), director.role || '');
      });

      // Indexed shareholder placeholders (shareholders[0], shareholders[1], etc.)
      shareholders.forEach((shareholder, index) => {
        preview = preview.replace(new RegExp(`\\{\\{shareholders\\[${index}\\]\\.name\\}\\}`, 'g'), shareholder.name || '');
        preview = preview.replace(new RegExp(`\\{\\{shareholders\\[${index}\\]\\.identificationNumber\\}\\}`, 'g'), shareholder.identificationNumber || '');
        preview = preview.replace(new RegExp(`\\{\\{shareholders\\[${index}\\]\\.nationality\\}\\}`, 'g'), shareholder.nationality || '');
        preview = preview.replace(new RegExp(`\\{\\{shareholders\\[${index}\\]\\.shareClass\\}\\}`, 'g'), shareholder.shareClass || '');
        preview = preview.replace(new RegExp(`\\{\\{shareholders\\[${index}\\]\\.numberOfShares\\}\\}`, 'g'), shareholder.numberOfShares?.toLocaleString() || '');
        preview = preview.replace(new RegExp(`\\{\\{shareholders\\[${index}\\]\\.percentageHeld\\}\\}`, 'g'), shareholder.percentageHeld ? `${shareholder.percentageHeld}%` : '');
      });

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

      // Helper to get value by path
      const getValueByPath = (path: string): unknown => {
        const context: Record<string, unknown> = { company, directors, shareholders, custom, system };
        return path.trim().split('.').reduce<unknown>((obj, key) => {
          if (obj && typeof obj === 'object') return (obj as Record<string, unknown>)[key];
          return undefined;
        }, context);
      };

      // Helper to evaluate conditional expressions (supports == and != comparisons)
      const evaluateCondition = (expression: string): boolean => {
        // Check for comparison operators
        const eqMatch = expression.match(/^(.+?)\s*==\s*['"](.+?)['"]$/);
        const neqMatch = expression.match(/^(.+?)\s*!=\s*['"](.+?)['"]$/);

        if (eqMatch) {
          const [, fieldPath, compareValue] = eqMatch;
          const value = getValueByPath(fieldPath);
          return String(value) === compareValue;
        }

        if (neqMatch) {
          const [, fieldPath, compareValue] = neqMatch;
          const value = getValueByPath(fieldPath);
          return String(value) !== compareValue;
        }

        // Simple truthy check (handle string boolean values)
        const value = getValueByPath(expression);
        if (value === 'false' || value === '0' || value === false) return false;
        return !!value;
      };

      // Handle conditionals - {{#if field}}...{{/if}} and {{#if field}}...{{else}}...{{/if}}
      const ifElseRegex = /\{\{#if\s+([^}]+)\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{\/if\}\}/g;
      preview = preview.replace(ifElseRegex, (_match, expression, ifContent, elseContent) => {
        return evaluateCondition(expression) ? ifContent : elseContent;
      });

      const ifRegex = /\{\{#if\s+([^}]+)\}\}([\s\S]*?)\{\{\/if\}\}/g;
      preview = preview.replace(ifRegex, (_match, expression, content) => {
        return evaluateCondition(expression) ? content : '';
      });

      // Handle {{#unless field}}...{{/unless}} (opposite of if)
      const unlessRegex = /\{\{#unless\s+([^}]+)\}\}([\s\S]*?)\{\{\/unless\}\}/g;
      preview = preview.replace(unlessRegex, (_match, expression, content) => {
        return !evaluateCondition(expression) ? content : '';
      });

      // Text modifiers - UCASE(), LCASE(), PCASE()
      // Helper for proper case conversion
      const toProperCase = (str: string): string => {
        return str.replace(/\w\S*/g, (txt) =>
          txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase()
        );
      };

      // Process UCASE modifier - converts text to uppercase
      const ucaseRegex = /UCASE\(([^)]+)\)/g;
      preview = preview.replace(ucaseRegex, (_match, content) => {
        return content.toUpperCase();
      });

      // Process LCASE modifier - converts text to lowercase
      const lcaseRegex = /LCASE\(([^)]+)\)/g;
      preview = preview.replace(lcaseRegex, (_match, content) => {
        return content.toLowerCase();
      });

      // Process PCASE modifier - converts text to proper/title case
      const pcaseRegex = /PCASE\(([^)]+)\)/g;
      preview = preview.replace(pcaseRegex, (_match, content) => {
        return toProperCase(content);
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
  }, [formData.content, mockData, partialsData]);

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

    if (!activeTenantId) {
      setFormError('Please select a tenant');
      return;
    }

    if (isPartialMode) {
      // Save partial
      if (!partialFormData.name.trim()) {
        setFormError('Partial name is required');
        return;
      }
      if (!partialFormData.content.trim()) {
        setFormError('Partial content is required');
        return;
      }

      const dataToSave = {
        name: partialFormData.name,
        description: partialFormData.description || null,
        content: partialFormData.content,
        placeholders: [],
      };

      if (isEditMode && itemId) {
        await updatePartialMutation.mutateAsync({ id: itemId, ...dataToSave });
      } else {
        await createPartialMutation.mutateAsync({ tenantId: activeTenantId, ...dataToSave });
      }
    } else {
      // Save template
      if (!formData.name.trim()) {
        setFormError('Template name is required');
        return;
      }
      if (!formData.content.trim()) {
        setFormError('Template content is required');
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

      if (isEditMode && itemId) {
        await updateMutation.mutateAsync({ id: itemId, ...dataToSave });
      } else {
        await createMutation.mutateAsync({ tenantId: activeTenantId, ...dataToSave });
      }
    }
  }, [formData, partialFormData, activeTenantId, isEditMode, itemId, isPartialMode, createMutation, updateMutation, createPartialMutation, updatePartialMutation]);

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

  const isSaving = createMutation.isPending || updateMutation.isPending || createPartialMutation.isPending || updatePartialMutation.isPending;
  const partials = partialsData?.partials || [];
  const companies = companiesData?.companies || [];

  // Show loading when fetching existing data
  const isLoadingExisting = isPartialMode ? isLoadingPartial : isLoadingTemplate;
  if (isLoadingExisting) {
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
          {isPartialMode ? (
            <Code className="w-5 h-5 text-accent-primary" />
          ) : (
            <FileText className="w-5 h-5 text-accent-primary" />
          )}
          <h1 className="text-lg font-semibold text-text-primary">
            {isPartialMode
              ? (isEditMode ? 'Edit Partial' : 'Create Partial')
              : (isEditMode ? 'Edit Template' : 'Create Template')
            }
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {(isPartialMode ? partialFormData.name : formData.name) && (
            <span className="text-sm text-text-muted mr-4">
              {isPartialMode ? partialFormData.name : formData.name}
            </span>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => router.push(isPartialMode ? '/admin/template-partials?tab=partials' : '/admin/template-partials')}
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
            {isPartialMode ? 'Save Partial' : 'Save Template'}
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
            value={isPartialMode ? partialFormData.content : formData.content}
            onChange={(html) => {
              if (isPartialMode) {
                setPartialFormData((prev) => ({ ...prev, content: html }));
              } else {
                setFormData((prev) => ({ ...prev, content: html }));
              }
            }}
            placeholder={isPartialMode ? "Start typing your partial content..." : "Start typing your template content..."}
            tenantId={activeTenantId}
            previewContent={isPartialMode ? '' : previewContent}
            showPreviewToggle={!isPartialMode}
            onPreview={isPartialMode ? undefined : handlePreview}
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
                {/* Test Data tab - only for templates */}
                {!isPartialMode && (
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
                )}
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
                  isPartialMode ? (
                    <PartialDetailsTab
                      formData={partialFormData}
                      onChange={handlePartialFormChange}
                      isSuperAdmin={session?.isSuperAdmin}
                      activeTenantId={activeTenantId}
                      tenantName={selectedTenantName || undefined}
                    />
                  ) : (
                    <DetailsTab
                      formData={formData}
                      onChange={handleFormChange}
                      isSuperAdmin={session?.isSuperAdmin}
                      activeTenantId={activeTenantId}
                      tenantName={selectedTenantName || undefined}
                    />
                  )
                )}
                {activeTab === 'placeholders' && (
                  <PlaceholdersTab
                    onInsert={handleInsertPlaceholder}
                    partials={partials}
                    isLoadingPartials={isLoadingPartials}
                    customPlaceholders={isPartialMode ? [] : formData.customPlaceholders}
                    onCustomPlaceholdersChange={isPartialMode ? () => {} : (placeholders) =>
                      setFormData((prev) => ({ ...prev, customPlaceholders: placeholders }))
                    }
                  />
                )}
                {activeTab === 'testdata' && !isPartialMode && (
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
