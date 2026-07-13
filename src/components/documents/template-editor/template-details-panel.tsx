'use client';

import { useEffect, useRef, useState } from 'react';
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

const LINE_HEIGHT_OPTIONS = [1, 1.15, 1.5, 2, 2.5, 3];
const PARAGRAPH_SPACING_OPTIONS = [
  { value: '0', label: 'No spacing' },
  { value: '0.25em', label: 'Compact' },
  { value: '0.5em', label: 'Normal' },
  { value: '1em', label: 'Loose' },
  { value: '1.5em', label: 'Wide' },
];

function MarginField({ label, value, onCommit }: { label: string; value: number; onCommit(value: number): void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(String(value));
  const [error, setError] = useState('');

  useEffect(() => {
    if (document.activeElement !== inputRef.current) setDraft(String(value));
  }, [value]);

  const commit = () => {
    const parsed = Number(draft);
    if (draft.trim() === '' || !Number.isFinite(parsed) || parsed < 5 || parsed > 60) {
      setError('Enter a value from 5 to 60 mm.');
      return;
    }
    setError('');
    onCommit(parsed);
  };

  return (
    <label className="text-xs text-text-secondary">
      {label}
      <input
        ref={inputRef}
        aria-label={label}
        type="number"
        min="5"
        max="60"
        value={draft}
        onChange={(event) => { setDraft(event.target.value); setError(''); }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') { event.preventDefault(); commit(); }
          if (event.key === 'Escape') { event.preventDefault(); setDraft(String(value)); setError(''); inputRef.current?.blur(); }
        }}
        aria-invalid={Boolean(error)}
        className="mt-1 h-8 w-full rounded-md border border-border-primary bg-background-primary px-2 text-xs text-text-primary"
      />
      {error ? <span className="mt-1 block text-[11px] text-status-error">{error}</span> : null}
    </label>
  );
}

function WorkspaceContext({ isSuperAdmin, activeTenantId, tenantName }: Pick<TemplateDetailsPanelProps, 'isSuperAdmin' | 'activeTenantId' | 'tenantName'>) {
  if (!isSuperAdmin) return null;
  return <div><label className="mb-1.5 block text-xs font-medium text-text-secondary">Workspace</label><div className="rounded-md border border-accent-primary/20 bg-accent-primary/10 px-3 py-2 text-xs text-accent-primary">{activeTenantId ? tenantName || 'Current Workspace' : 'Workspace context is required'}</div></div>;
}

export function TemplateDetailsPanel({ mode, templateForm, partialForm, onTemplateChange, onPartialChange, isSuperAdmin, activeTenantId, tenantName }: TemplateDetailsPanelProps) {
  const updateMargin = (side: keyof A4DocumentLayout['marginsMm'], value: number) => {
    onTemplateChange({ layout: { ...templateForm.layout, marginsMm: { ...templateForm.layout.marginsMm, [side]: value } } });
  };

  if (mode === 'partial' && partialForm && onPartialChange) {
    return <div className="space-y-4 p-4"><WorkspaceContext isSuperAdmin={isSuperAdmin} activeTenantId={activeTenantId} tenantName={tenantName} /><label className="block text-xs font-medium text-text-secondary">Name<input aria-label="Name" value={partialForm.displayName} onChange={(event) => onPartialChange({ displayName: event.target.value })} className="mt-1 h-8 w-full rounded-md border border-border-primary bg-background-primary px-2 text-xs text-text-primary" /></label><label className="block text-xs font-medium text-text-secondary">Identifier<input aria-label="Identifier" value={partialForm.name} onChange={(event) => onPartialChange({ name: event.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '') })} className="mt-1 h-8 w-full rounded-md border border-border-primary bg-background-primary px-2 font-mono text-xs text-text-primary" /></label><label className="block text-xs font-medium text-text-secondary">Description<textarea aria-label="Description" value={partialForm.description} onChange={(event) => onPartialChange({ description: event.target.value })} rows={3} className="mt-1 w-full rounded-md border border-border-primary bg-background-primary px-2 py-2 text-xs text-text-primary" /></label><p className="rounded-md bg-status-info/10 p-3 text-xs text-text-secondary">Partials are reusable content blocks. Insert them into templates with <code>{'{{> identifier }}'}</code>.</p></div>;
  }

  return <div className="space-y-4 p-4"><WorkspaceContext isSuperAdmin={isSuperAdmin} activeTenantId={activeTenantId} tenantName={tenantName} /><label className="block text-xs font-medium text-text-secondary">Template Name<input aria-label="Template Name" value={templateForm.name} onChange={(event) => onTemplateChange({ name: event.target.value })} className="mt-1 h-8 w-full rounded-md border border-border-primary bg-background-primary px-2 text-xs text-text-primary" /></label><label className="block text-xs font-medium text-text-secondary">Category<select aria-label="Category" value={templateForm.category} onChange={(event) => onTemplateChange({ category: event.target.value })} className="mt-1 h-8 w-full rounded-md border border-border-primary bg-background-primary px-2 text-xs text-text-primary">{CATEGORIES.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}</select></label><label className="block text-xs font-medium text-text-secondary">Description<textarea aria-label="Description" value={templateForm.description} onChange={(event) => onTemplateChange({ description: event.target.value })} rows={3} className="mt-1 w-full rounded-md border border-border-primary bg-background-primary px-2 py-2 text-xs text-text-primary" /></label><div className="rounded-md border border-border-primary p-3"><div className="mb-2 text-xs font-semibold text-text-primary">Page layout</div><div className="mb-2 grid grid-cols-2 gap-2"><label className="text-xs text-text-secondary">Line spacing<select aria-label="Line spacing" value={templateForm.layout.lineHeight} onChange={(event) => onTemplateChange({ layout: { ...templateForm.layout, lineHeight: Number(event.target.value) } })} className="mt-1 h-8 w-full rounded-md border border-border-primary bg-background-primary px-2 text-xs text-text-primary">{LINE_HEIGHT_OPTIONS.map((value) => <option key={value} value={value}>{value === 1 ? 'Single' : value}</option>)}</select></label><label className="text-xs text-text-secondary">Paragraph spacing<select aria-label="Paragraph spacing" value={templateForm.layout.paragraphSpacing} onChange={(event) => onTemplateChange({ layout: { ...templateForm.layout, paragraphSpacing: event.target.value } })} className="mt-1 h-8 w-full rounded-md border border-border-primary bg-background-primary px-2 text-xs text-text-primary">{PARAGRAPH_SPACING_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label></div><div className="grid grid-cols-2 gap-2">{(['top', 'right', 'bottom', 'left'] as const).map((side) => <MarginField key={side} label={`${side[0].toUpperCase() + side.slice(1)} margin`} value={templateForm.layout.marginsMm[side]} onCommit={(value) => updateMargin(side, value)} />)}</div></div><div className="flex items-center justify-between rounded-md border border-border-primary p-3"><span className="text-xs text-text-secondary">{templateForm.isActive ? 'Available for document generation' : 'Hidden from document generation'}</span><button type="button" role="switch" aria-label="Template status" aria-checked={templateForm.isActive} onClick={() => onTemplateChange({ isActive: !templateForm.isActive })} className="h-6 w-11 rounded-full bg-accent-primary text-xs text-white transition-colors duration-150">{templateForm.isActive ? 'On' : 'Off'}</button></div></div>;
}
