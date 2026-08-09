'use client';

import { useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Copy, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/modal';
import {
  TEMPLATE_COLLECTION_OPTIONS,
  TEMPLATE_FIELD_OPTIONS,
  buildConditionBlock,
  buildEachBlock,
  type ConditionOperator,
  type TemplateCollection,
  type TemplateLoopLayout,
} from '@/components/documents/template-editor/template-builders';
import {
  TEMPLATE_FIELD_CATEGORIES,
  type TemplateField,
} from '@/components/documents/template-editor/template-field-catalog';
import type { CustomPlaceholderDefinition, MergedPlaceholder } from '@/types/placeholders';

export interface TemplatePartialOption {
  id: string;
  name: string;
  displayName?: string | null;
  description?: string | null;
}

export interface PlaceholderPanelProps {
  onInsert: (html: string) => void;
  partials: TemplatePartialOption[];
  isLoadingPartials: boolean;
  customPlaceholders: CustomPlaceholderDefinition[];
  onCustomPlaceholdersChange: (placeholders: CustomPlaceholderDefinition[]) => void;
  mergedPlaceholders?: MergedPlaceholder[];
  templateBooleanPlaceholders?: CustomPlaceholderDefinition[];
  partialPlaceholderLinkings?: Record<string, string>;
  onPartialPlaceholderLinkingChange?: (key: string, linkedTo: string | undefined) => void;
  isPartialMode?: boolean;
}

type Builder = 'loop-directors' | 'loop-shareholders' | 'condition';

const CONDITION_FIELDS = ['company.name', 'company.uen', 'company.registeredAddress', 'company.incorporationDate', 'company.entityType', 'company.capital', 'contact.name', 'contact.email', 'system.currentDate', 'system.generatedBy', 'system.tenantName'];

const fieldId = (field: TemplateField) => `${field.category}:${field.key}`;
const syntax = (key: string) => key.startsWith('{{') || /^[ULP]CASE\(/.test(key) ? key : `{{${key}}}`;
const normalizeKey = (value: string) => value.toLowerCase().trim().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
const escapeText = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const matches = (query: string, ...values: Array<string | null | undefined>) => values.join(' ').toLowerCase().includes(query);
const resultLabel = (label: string, count: number) => `${label}, ${count} ${count === 1 ? 'result' : 'results'}`;

export function PlaceholderPanel({ onInsert, partials, isLoadingPartials, customPlaceholders, onCustomPlaceholdersChange, mergedPlaceholders = [], templateBooleanPlaceholders = [], partialPlaceholderLinkings = {}, onPartialPlaceholderLinkingChange, isPartialMode = false }: PlaceholderPanelProps) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(['agreement-blocks', 'company', 'loops', 'conditions', 'service-fields']);
  const [recents, setRecents] = useState<string[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [builder, setBuilder] = useState<Builder | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ label: '', key: '', type: 'text' as CustomPlaceholderDefinition['type'], required: true, defaultValue: '' });
  const normalizedQuery = query.trim().toLowerCase();
  const serviceFields = customPlaceholders.filter((field) => field.storageSource === 'service');
  const filteredCategories = useMemo(() => [
    ...TEMPLATE_FIELD_CATEGORIES,
    {
      key: 'service-fields',
      label: 'Service fields',
      fields: serviceFields.map((field) => ({
        key: field.key,
        label: field.label,
        category: 'service',
        example: field.defaultValue || field.type,
      })),
    },
  ].map((category) => ({ ...category, fields: category.fields.filter((field) => !normalizedQuery || matches(normalizedQuery, field.label, field.key, field.category, field.example, category.label)) })).filter((category) => category.fields.length > 0), [normalizedQuery, serviceFields]);
  const allFields = useMemo(() => TEMPLATE_FIELD_CATEGORIES.flatMap((category) => category.fields), []);
  const recentFields = recents.map((id) => allFields.find((field) => fieldId(field) === id)).filter((field): field is TemplateField => Boolean(field));
  const customFields = customPlaceholders.filter((field) => field.storageSource !== 'service');
  const matchingCustom = customFields.filter((field) => !normalizedQuery || matches(normalizedQuery, field.label, field.key, field.defaultValue, 'Custom'));
  const matchingPartials = partials.filter((partial) => !normalizedQuery || matches(normalizedQuery, partial.name, partial.displayName, partial.description, 'Partials'));
  const partialLinks = useMemo(() => mergedPlaceholders.filter((field) => field.source === 'partial').reduce<Record<string, MergedPlaceholder[]>>((groups, field) => { (groups[field.sourceName || 'unknown'] ||= []).push(field); return groups; }, {}), [mergedPlaceholders]);
  const duplicateKey = Boolean(form.key) && customFields.some((field) => field.key === normalizeKey(form.key) && field.id !== editingId);

  const resetForm = () => { setForm({ label: '', key: '', type: 'text', required: true, defaultValue: '' }); setEditingId(null); setFormOpen(false); };
  const insert = (html: string, id: string) => { onInsert(html); setRecents((previous) => [id, ...previous.filter((item) => item !== id)].slice(0, 5)); };
  const copy = async (html: string, id: string) => { await navigator.clipboard?.writeText(html); setCopied(id); window.setTimeout(() => setCopied(null), 2000); };
  const startEdit = (field: CustomPlaceholderDefinition) => { setForm({ label: field.label, key: field.key, type: field.type, required: field.required, defaultValue: field.defaultValue || '' }); setEditingId(field.id); setFormOpen(true); };
  const saveField = () => {
    const key = normalizeKey(form.key);
    if (!form.label.trim() || !key || duplicateKey) return;
    const values = { key, label: form.label.trim(), type: form.type, required: form.required, defaultValue: form.type === 'boolean' ? form.defaultValue.trim() || 'false' : form.defaultValue.trim() || undefined };
    onCustomPlaceholdersChange(editingId ? customPlaceholders.map((field) => field.id === editingId ? { ...field, ...values } : field) : [...customPlaceholders, { id: crypto.randomUUID(), ...values }]);
    resetForm();
  };

  const renderField = (field: TemplateField) => <div key={fieldId(field)} className="group flex items-center gap-2 rounded-md px-2 py-2 hover:bg-background-tertiary"><div className="min-w-0 flex-1"><div className="text-xs font-medium text-text-primary">{field.label}</div><div className="truncate font-mono text-[11px] text-accent-primary">{field.builder ? 'Guided builder' : syntax(field.key)}</div><div className="whitespace-pre-line break-words text-[11px] text-text-muted">Example: {field.example}</div></div><Button size="xs" variant="primary" aria-label={field.builder === 'loop-directors' ? 'Build directors loop' : field.builder === 'loop-shareholders' ? 'Build shareholders loop' : field.builder === 'condition' ? 'Build condition' : `Insert ${field.label}`} onClick={() => field.builder ? setBuilder(field.builder) : insert(syntax(field.key), fieldId(field))}>{field.builder ? 'Build' : 'Insert'}</Button>{!field.builder && <Button size="xs" variant="ghost" iconOnly aria-label={`Copy ${field.label}`} onClick={() => copy(syntax(field.key), fieldId(field))}>{copied === fieldId(field) ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}</Button>}</div>;

  return <div className="flex h-full flex-col bg-background-secondary"><div className="border-b border-border-primary p-3"><label htmlFor="placeholder-search" className="sr-only">Search fields</label><input id="placeholder-search" type="search" role="searchbox" aria-label="Search fields" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search fields" className="h-8 w-full rounded-md border border-border-primary bg-background-primary px-3 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-primary/50" /></div><div className="flex-1 overflow-y-auto p-2">{recentFields.length > 0 && !normalizedQuery && <section aria-label="Recently used" className="mb-2 rounded-md border border-border-primary"><h3 className="px-2 py-2 text-xs font-semibold text-text-primary">Recently used</h3>{recentFields.map(renderField)}</section>}{filteredCategories.map((category) => { const isOpen = Boolean(normalizedQuery) || expanded.includes(category.key); return <section key={category.key} className="mb-2 rounded-md border border-border-primary"><button type="button" aria-label={resultLabel(category.label, category.fields.length)} aria-expanded={isOpen} onClick={() => setExpanded((previous) => previous.includes(category.key) ? previous.filter((key) => key !== category.key) : [...previous, category.key])} className="flex w-full items-center justify-between px-2 py-2 text-left hover:bg-background-tertiary"><span className="text-xs font-semibold text-text-primary">{category.label}</span><span className="flex items-center gap-2 text-[11px] text-text-muted"><span className="rounded-full bg-background-tertiary px-1.5 py-0.5">{category.fields.length}</span>{isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}</span></button>{isOpen && <div className="border-t border-border-secondary">{category.fields.map(renderField)}</div>}</section>; })}{(!normalizedQuery || matchingCustom.length > 0 || formOpen) && <section className="mb-2 rounded-md border border-border-primary"><div className="flex items-center justify-between px-2 py-2"><button type="button" aria-label={resultLabel('Custom', matchingCustom.length)} className="text-left"><span className="text-xs font-semibold text-text-primary">Custom</span><span className="ml-2 rounded-full bg-background-tertiary px-1.5 py-0.5 text-[11px] text-text-muted">{matchingCustom.length}</span><p className="text-[11px] text-text-muted">Fields requested during generation.</p></button>{!formOpen && <Button size="xs" variant="secondary" leftIcon={<Plus />} onClick={() => { setEditingId(null); setFormOpen(true); }}>Add custom field</Button>}</div>{formOpen && <div className="space-y-3 border-t border-border-secondary p-3"><div><label htmlFor="custom-field-label" className="mb-1 block text-xs font-medium text-text-secondary">Field label</label><input id="custom-field-label" value={form.label} onChange={(event) => setForm((previous) => ({ ...previous, label: event.target.value, key: previous.key || normalizeKey(event.target.value) }))} className="h-8 w-full rounded-md border border-border-primary bg-background-primary px-2 text-xs text-text-primary" /></div><div><label htmlFor="custom-field-key" className="mb-1 block text-xs font-medium text-text-secondary">Field key</label><input id="custom-field-key" value={form.key} onChange={(event) => setForm((previous) => ({ ...previous, key: event.target.value }))} className="h-8 w-full rounded-md border border-border-primary bg-background-primary px-2 font-mono text-xs text-text-primary" />{duplicateKey && <p className="mt-1 text-xs text-status-error">This placeholder key already exists.</p>}</div><div className="grid grid-cols-2 gap-2"><label className="text-xs font-medium text-text-secondary">Type<select value={form.type} onChange={(event) => setForm((previous) => ({ ...previous, type: event.target.value as CustomPlaceholderDefinition['type'] }))} className="mt-1 h-8 w-full rounded-md border border-border-primary bg-background-primary px-2 text-xs text-text-primary"><option value="text">Text</option><option value="textarea">Long text</option><option value="date">Date</option><option value="number">Number</option><option value="currency">Currency</option><option value="boolean">Boolean</option></select></label><label className="text-xs font-medium text-text-secondary">Default value<input value={form.defaultValue} onChange={(event) => setForm((previous) => ({ ...previous, defaultValue: event.target.value }))} className="mt-1 h-8 w-full rounded-md border border-border-primary bg-background-primary px-2 text-xs text-text-primary" /></label></div><label className="flex items-center gap-2 text-xs text-text-secondary"><input type="checkbox" checked={form.required} onChange={(event) => setForm((previous) => ({ ...previous, required: event.target.checked }))} />Required</label><p className="rounded bg-background-tertiary p-2 font-mono text-[11px] text-accent-primary">{`{{custom.${normalizeKey(form.key) || 'field_key'}}}`}</p><div className="flex justify-end gap-2"><Button variant="ghost" size="xs" onClick={resetForm}>Cancel</Button><Button size="xs" aria-label={editingId ? 'Update field' : 'Add field'} onClick={saveField} disabled={!form.label.trim() || !form.key.trim() || duplicateKey}>{editingId ? 'Update field' : 'Add field'}</Button></div></div>}{matchingCustom.map((field) => <div key={field.id} className="flex items-center gap-2 border-t border-border-secondary px-2 py-2"><div className="min-w-0 flex-1"><div className="text-xs font-medium text-text-primary">{field.label}</div><div className="font-mono text-[11px] text-accent-primary">{`{{custom.${field.key}}}`}</div></div><Button size="xs" aria-label={`Insert ${field.label}`} onClick={() => insert(`{{custom.${field.key}}}`, `custom.${field.key}`)}>Insert</Button><Button size="xs" variant="ghost" iconOnly aria-label={`Copy ${field.label}`} onClick={() => copy(`{{custom.${field.key}}}`, `custom.${field.key}`)}>{copied === `custom.${field.key}` ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}</Button><Button size="xs" variant="ghost" iconOnly aria-label={`Edit ${field.label}`} onClick={() => startEdit(field)}><Pencil className="h-3.5 w-3.5" /></Button><Button size="xs" variant="ghost" iconOnly aria-label={`Delete ${field.label}`} onClick={() => onCustomPlaceholdersChange(customPlaceholders.filter((candidate) => candidate.id !== field.id))}><Trash2 className="h-3.5 w-3.5" /></Button></div>)}</section>}{(!normalizedQuery || matchingPartials.length > 0) && <section className="mb-2 rounded-md border border-border-primary"><div className="px-2 py-2"><button type="button" aria-label={resultLabel('Partials', matchingPartials.length)} className="text-left"><span className="text-xs font-semibold text-text-primary">Partials</span><span className="ml-2 rounded-full bg-background-tertiary px-1.5 py-0.5 text-[11px] text-text-muted">{matchingPartials.length}</span></button></div><div className="border-t border-border-secondary">{isLoadingPartials ? <p className="p-3 text-xs text-text-muted">Loading partials…</p> : matchingPartials.length === 0 ? <p className="p-3 text-xs text-text-muted">No partials available.</p> : matchingPartials.map((partial) => <div key={partial.id} className="border-b border-border-secondary last:border-b-0"><div className="flex items-center gap-2 px-2 py-2"><div className="min-w-0 flex-1"><div className="text-xs font-medium text-text-primary">{partial.displayName || partial.name}</div><div className="font-mono text-[11px] text-accent-primary">{`{{>${partial.name}}}`}</div></div><Button size="xs" aria-label={`Insert ${partial.displayName || partial.name}`} onClick={() => insert(`{{>${partial.name}}}`, `partial.${partial.name}`)}>Insert</Button><Button size="xs" variant="ghost" iconOnly aria-label={`Copy ${partial.displayName || partial.name}`} onClick={() => copy(`{{>${partial.name}}}`, `partial.${partial.name}`)}>{copied === `partial.${partial.name}` ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}</Button></div>{!isPartialMode && partialLinks[partial.name]?.map((field) => <label key={field.id} className="mx-2 mb-2 flex items-center gap-2 rounded bg-background-tertiary p-2 text-xs text-text-secondary"><span className="min-w-0 flex-1 truncate">{field.label}</span><select aria-label={`Link ${field.label}`} value={partialPlaceholderLinkings[field.key] || ''} onChange={(event) => onPartialPlaceholderLinkingChange?.(field.key, event.target.value || undefined)} className="h-7 max-w-36 rounded border border-border-primary bg-background-primary px-1 text-xs text-text-primary"><option value="">Always show</option>{templateBooleanPlaceholders.map((booleanField) => <option key={booleanField.id} value={booleanField.key}>Show when: {booleanField.label}</option>)}</select></label>)}</div>)}</div></section>}{normalizedQuery && filteredCategories.length === 0 && matchingCustom.length === 0 && matchingPartials.length === 0 && <div className="p-4 text-center text-xs text-text-muted">No fields match this search. Clear it or create a custom field.</div>}</div><GuidedLoopDialog collection={builder === 'loop-directors' ? 'directors' : builder === 'loop-shareholders' ? 'shareholders' : null} onClose={() => setBuilder(null)} onInsert={(html, id) => { insert(html, id); setBuilder(null); }} /><GuidedConditionDialog isOpen={builder === 'condition'} onClose={() => setBuilder(null)} onInsert={(html) => { insert(html, 'Conditions:condition'); setBuilder(null); }} /></div>;
}

function GuidedLoopDialog({ collection, onClose, onInsert }: { collection: TemplateCollection | null; onClose: () => void; onInsert: (html: string, id: string) => void }) {
  const [fields, setFields] = useState<string[]>([]);
  const [layout, setLayout] = useState<TemplateLoopLayout>('paragraphs');
  if (!collection) return null;
  const option = TEMPLATE_COLLECTION_OPTIONS.find((candidate) => candidate.value === collection)!;
  const fieldLabel = collection === 'directors' ? 'Director' : 'Shareholder';
  const preview = fields.length ? buildEachBlock({ collection, fields, layout }) : 'Select one or more fields to preview the generated syntax.';
  return <Modal isOpen onClose={onClose} title={`Build ${option.label.toLowerCase()} loop`} description="Choose fields and a starter layout to insert a complete loop." size="md"><ModalBody className="space-y-4"><fieldset><legend className="mb-2 text-xs font-semibold text-text-primary">Fields</legend>{TEMPLATE_FIELD_OPTIONS[collection].map((field) => <label key={field.value} className="mb-2 flex items-center gap-2 text-sm text-text-secondary"><input type="checkbox" aria-label={`${fieldLabel} ${field.label.toLowerCase()}`} checked={fields.includes(field.value)} onChange={(event) => setFields((previous) => event.target.checked ? [...previous, field.value] : previous.filter((value) => value !== field.value))} />{field.label}</label>)}</fieldset><label className="block text-xs font-medium text-text-secondary">Starter layout<select value={layout} onChange={(event) => setLayout(event.target.value as TemplateLoopLayout)} className="mt-1 h-8 w-full rounded-md border border-border-primary bg-background-primary px-2 text-xs text-text-primary"><option value="paragraphs">Paragraphs</option><option value="bullets">Bullets</option><option value="table">Table</option></select></label><details className="rounded-md border border-border-primary p-2"><summary className="cursor-pointer text-xs font-medium text-text-secondary">View syntax</summary><pre className="mt-2 whitespace-pre-wrap font-mono text-[11px] text-accent-primary">{preview}</pre></details></ModalBody><ModalFooter><Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" disabled={!fields.length} onClick={() => onInsert(buildEachBlock({ collection, fields, layout }), `Loops:${collection}`)}>Insert loop</Button></ModalFooter></Modal>;
}

function GuidedConditionDialog({ isOpen, onClose, onInsert }: { isOpen: boolean; onClose: () => void; onInsert: (html: string) => void }) {
  const [field, setField] = useState(CONDITION_FIELDS[0]);
  const [operator, setOperator] = useState<ConditionOperator>('truthy');
  const [value, setValue] = useState('');
  const [body, setBody] = useState('Condition content');
  let preview = '';
  let error = '';
  try { preview = buildConditionBlock({ field, operator, value: operator === 'truthy' ? undefined : value, bodyHtml: `<p>${escapeText(body)}</p>` }); } catch (cause) { error = cause instanceof Error ? cause.message : 'Enter a safe comparison value.'; }
  return <Modal isOpen={isOpen} onClose={onClose} title="Build condition" description="Generate a balanced conditional block." size="md"><ModalBody className="space-y-4"><label className="block text-xs font-medium text-text-secondary">Show content when<select value={field} onChange={(event) => setField(event.target.value)} className="mt-1 h-8 w-full rounded-md border border-border-primary bg-background-primary px-2 text-xs text-text-primary">{CONDITION_FIELDS.map((candidate) => <option key={candidate} value={candidate}>{candidate}</option>)}</select></label><label className="block text-xs font-medium text-text-secondary">Comparison<select value={operator} onChange={(event) => setOperator(event.target.value as ConditionOperator)} className="mt-1 h-8 w-full rounded-md border border-border-primary bg-background-primary px-2 text-xs text-text-primary"><option value="truthy">has a value</option><option value="equals">equals</option><option value="notEquals">does not equal</option></select></label>{operator !== 'truthy' && <label className="block text-xs font-medium text-text-secondary">Value<input value={value} onChange={(event) => setValue(event.target.value)} className="mt-1 h-8 w-full rounded-md border border-border-primary bg-background-primary px-2 text-xs text-text-primary" /></label>}<label className="block text-xs font-medium text-text-secondary">Content<input value={body} onChange={(event) => setBody(event.target.value)} className="mt-1 h-8 w-full rounded-md border border-border-primary bg-background-primary px-2 text-xs text-text-primary" /></label>{error && <p className="text-xs text-status-error">{error}</p>}<details className="rounded-md border border-border-primary p-2"><summary className="cursor-pointer text-xs font-medium text-text-secondary">View syntax</summary><pre className="mt-2 whitespace-pre-wrap font-mono text-[11px] text-accent-primary">{preview}</pre></details></ModalBody><ModalFooter><Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" disabled={!body || Boolean(error) || (operator !== 'truthy' && !value)} onClick={() => onInsert(buildConditionBlock({ field, operator, value: operator === 'truthy' ? undefined : value, bodyHtml: `<p>${escapeText(body)}</p>` }))}>Insert condition</Button></ModalFooter></Modal>;
}
