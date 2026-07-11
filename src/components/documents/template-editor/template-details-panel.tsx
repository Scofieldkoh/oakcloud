'use client';

import type { A4DocumentLayout } from '@/components/documents/a4-pagination/layout';

export interface TemplateEditorTemplateForm {
  name: string;
  description: string;
  category: string;
  content: string;
  isActive: boolean;
  layout: A4DocumentLayout;
}

export interface TemplateEditorPartialForm {
  name: string;
  displayName: string;
  description: string;
  content: string;
}

export interface TemplateDetailsPanelProps {
  mode: 'template' | 'partial';
  templateForm: TemplateEditorTemplateForm;
  partialForm?: TemplateEditorPartialForm;
  onTemplateChange: (changes: Partial<TemplateEditorTemplateForm>) => void;
  onPartialChange?: (changes: Partial<TemplateEditorPartialForm>) => void;
  isSuperAdmin?: boolean;
  activeTenantId?: string;
  tenantName?: string;
}

const CATEGORIES = [
  { value: 'RESOLUTION', label: 'Resolution' },
  { value: 'CONTRACT', label: 'Contract' },
  { value: 'LETTER', label: 'Letter' },
  { value: 'MINUTES', label: 'Minutes' },
  { value: 'NOTICE', label: 'Notice' },
  { value: 'CERTIFICATE', label: 'Certificate' },
  { value: 'OTHER', label: 'Other' },
];

function WorkspaceContext({ isSuperAdmin, activeTenantId, tenantName }: Pick<TemplateDetailsPanelProps, 'isSuperAdmin' | 'activeTenantId' | 'tenantName'>) {
  if (!isSuperAdmin) return null;
  return <div><label className="mb-1.5 block text-xs font-medium text-text-secondary">Workspace</label><div className="rounded-md border border-accent-primary/20 bg-accent-primary/10 px-3 py-2 text-xs text-accent-primary">{activeTenantId ? tenantName || 'Current Workspace' : 'Workspace context is required'}</div></div>;
}

export function TemplateDetailsPanel({ mode, templateForm, partialForm, onTemplateChange, onPartialChange, isSuperAdmin, activeTenantId, tenantName }: TemplateDetailsPanelProps) {
  const updateMargin = (side: keyof A4DocumentLayout['marginsMm'], value: string) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    onTemplateChange({ layout: { ...templateForm.layout, marginsMm: { ...templateForm.layout.marginsMm, [side]: parsed } } });
  };

  if (mode === 'partial' && partialForm && onPartialChange) {
    return <div className="space-y-4 p-4"><WorkspaceContext isSuperAdmin={isSuperAdmin} activeTenantId={activeTenantId} tenantName={tenantName} /><label className="block text-xs font-medium text-text-secondary">Name<input aria-label="Name" value={partialForm.displayName} onChange={(event) => onPartialChange({ displayName: event.target.value })} className="mt-1 h-8 w-full rounded-md border border-border-primary bg-background-primary px-2 text-xs text-text-primary" /></label><label className="block text-xs font-medium text-text-secondary">Identifier<input aria-label="Identifier" value={partialForm.name} onChange={(event) => onPartialChange({ name: event.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '') })} className="mt-1 h-8 w-full rounded-md border border-border-primary bg-background-primary px-2 font-mono text-xs text-text-primary" /></label><label className="block text-xs font-medium text-text-secondary">Description<textarea aria-label="Description" value={partialForm.description} onChange={(event) => onPartialChange({ description: event.target.value })} rows={3} className="mt-1 w-full rounded-md border border-border-primary bg-background-primary px-2 py-2 text-xs text-text-primary" /></label><p className="rounded-md bg-status-info/10 p-3 text-xs text-text-secondary">Partials are reusable content blocks. Insert them into templates with <code>{'{{> identifier }}'}</code>.</p></div>;
  }

  return <div className="space-y-4 p-4"><WorkspaceContext isSuperAdmin={isSuperAdmin} activeTenantId={activeTenantId} tenantName={tenantName} /><label className="block text-xs font-medium text-text-secondary">Template Name<input aria-label="Template Name" value={templateForm.name} onChange={(event) => onTemplateChange({ name: event.target.value })} className="mt-1 h-8 w-full rounded-md border border-border-primary bg-background-primary px-2 text-xs text-text-primary" /></label><label className="block text-xs font-medium text-text-secondary">Category<select aria-label="Category" value={templateForm.category} onChange={(event) => onTemplateChange({ category: event.target.value })} className="mt-1 h-8 w-full rounded-md border border-border-primary bg-background-primary px-2 text-xs text-text-primary">{CATEGORIES.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}</select></label><label className="block text-xs font-medium text-text-secondary">Description<textarea aria-label="Description" value={templateForm.description} onChange={(event) => onTemplateChange({ description: event.target.value })} rows={3} className="mt-1 w-full rounded-md border border-border-primary bg-background-primary px-2 py-2 text-xs text-text-primary" /></label><div className="rounded-md border border-border-primary p-3"><div className="mb-2 text-xs font-semibold text-text-primary">Page layout</div><div className="grid grid-cols-2 gap-2">{(['top', 'right', 'bottom', 'left'] as const).map((side) => <label key={side} className="text-xs text-text-secondary">{side[0].toUpperCase() + side.slice(1)} margin<input aria-label={`${side[0].toUpperCase() + side.slice(1)} margin`} type="number" min="5" max="60" value={templateForm.layout.marginsMm[side]} onChange={(event) => updateMargin(side, event.target.value)} className="mt-1 h-8 w-full rounded-md border border-border-primary bg-background-primary px-2 text-xs text-text-primary" /></label>)}</div></div><div className="flex items-center justify-between rounded-md border border-border-primary p-3"><span className="text-xs text-text-secondary">{templateForm.isActive ? 'Available for document generation' : 'Hidden from document generation'}</span><button type="button" role="switch" aria-label="Template status" aria-checked={templateForm.isActive} onClick={() => onTemplateChange({ isActive: !templateForm.isActive })} className="h-6 w-11 rounded-full bg-accent-primary text-xs text-white transition-colors duration-150">{templateForm.isActive ? 'On' : 'Off'}</button></div></div>;
}
