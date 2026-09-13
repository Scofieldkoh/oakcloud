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
  buildSignatureBlock,
  type ConditionOperator,
  type TemplateCollection,
  type TemplateLoopLayout,
} from '@/components/documents/template-editor/template-builders';
import {
  TEMPLATE_FIELD_CATEGORIES,
  type TemplateField,
} from '@/components/documents/template-editor/template-field-catalog';
import {
  collectFieldUsage,
  commitFieldKeyDraft,
  createCatalogFieldDiscoveryDescriptor,
  createCustomFieldDiscoveryDescriptor,
  createFieldDeletionPreview,
  createFieldKeyDraft,
  filterFieldDiscovery,
  normalizeAuthoringFieldKey,
  pushRecentFieldIdentity,
  reconcileRecentFieldIdentities,
  stableCustomFieldIdentity,
  updateFieldKeyDraftKey,
  updateFieldKeyDraftLabel,
  type FieldDiscoveryDescriptor,
  type FieldOccurrenceLocation,
  type FieldUsageSummary,
} from '@/components/documents/template-editor/field-authoring';
import type { FieldOwnerScope } from '@/lib/template-field-contract';
import type { CustomPlaceholderDefinition, MergedPlaceholder } from '@/types/placeholders';

export interface TemplatePartialOption {
  id: string;
  name: string;
  displayName?: string | null;
  description?: string | null;
}

export interface PlaceholderFieldDeleteRequest {
  field: CustomPlaceholderDefinition;
  identity: string;
  usage?: FieldUsageSummary;
  referenceAction: 'remove-references' | 'keep-unresolved';
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
  /** Optional canonical source supplied by CORE/W consumers for usage-aware deletion. */
  sourceContent?: string;
  ownerScope?: FieldOwnerScope;
  onNavigateToFieldOccurrence?: (location: FieldOccurrenceLocation) => void;
  /** CORE may consume this to run the F2 atomic lifecycle transaction. */
  onDeleteCustomField?: (request: PlaceholderFieldDeleteRequest) => void;
}

type Builder = 'loop-directors' | 'loop-shareholders' | 'condition' | 'signature-block';

type CustomFieldForm = {
  label: string;
  key: string;
  keyMode: 'generated' | 'manual';
  type: CustomPlaceholderDefinition['type'];
  required: boolean;
  defaultValue: string;
  description: string;
};

type CatalogEntry = { field: TemplateField; descriptor: FieldDiscoveryDescriptor };

const CONDITION_FIELDS = ['company.name', 'company.uen', 'company.registeredAddress', 'company.incorporationDate', 'company.entityType', 'company.capital', 'contact.name', 'contact.email', 'system.currentDate', 'system.generatedBy', 'system.tenantName'];
const DEFAULT_FIELD_SCOPE: FieldOwnerScope = { kind: 'template', id: 'field-library' };

const escapeText = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const matches = (query: string, ...values: Array<string | null | undefined>) => values.join(' ').toLowerCase().includes(query);
const resultLabel = (label: string, count: number) => `${label}, ${count} ${count === 1 ? 'result' : 'results'}`;

function emptyCustomFieldForm(): CustomFieldForm {
  return {
    ...createFieldKeyDraft(),
    type: 'text',
    required: true,
    defaultValue: '',
    description: '',
  };
}

function sourceScope(field: CustomPlaceholderDefinition, fallback?: FieldOwnerScope): FieldOwnerScope {
  return field.ownerScope ?? fallback ?? DEFAULT_FIELD_SCOPE;
}

function customFieldPath(field: CustomPlaceholderDefinition): string {
  if (field.storageSource === 'service') return field.storagePath ?? field.key;
  return field.key.startsWith('custom.') ? field.key : `custom.${field.key}`;
}

export function PlaceholderPanel({
  onInsert,
  partials,
  isLoadingPartials,
  customPlaceholders,
  onCustomPlaceholdersChange,
  mergedPlaceholders = [],
  templateBooleanPlaceholders = [],
  partialPlaceholderLinkings = {},
  onPartialPlaceholderLinkingChange,
  isPartialMode = false,
  sourceContent,
  ownerScope,
  onNavigateToFieldOccurrence,
  onDeleteCustomField,
}: PlaceholderPanelProps) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(['agreement-blocks', 'company', 'loops', 'conditions', 'service-fields']);
  const [recents, setRecents] = useState<string[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [builder, setBuilder] = useState<Builder | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<CustomFieldForm>(emptyCustomFieldForm);
  const [deleteCandidate, setDeleteCandidate] = useState<CustomPlaceholderDefinition | null>(null);
  const normalizedQuery = query.trim().toLowerCase();

  const customFields = useMemo(
    () => customPlaceholders.filter((field) => field.storageSource !== 'service'),
    [customPlaceholders],
  );
  const serviceFields = useMemo(
    () => customPlaceholders.filter((field) => field.storageSource === 'service'),
    [customPlaceholders],
  );
  const customDescriptors = useMemo(
    () => customFields.map((field) => createCustomFieldDiscoveryDescriptor(field, ownerScope)),
    [customFields, ownerScope],
  );
  const serviceDescriptors = useMemo(
    () => serviceFields.map((field) => createCustomFieldDiscoveryDescriptor(field, ownerScope)),
    [serviceFields, ownerScope],
  );
  const catalogCategories = useMemo(() => TEMPLATE_FIELD_CATEGORIES.map((category) => ({
    key: category.key,
    label: category.label,
    entries: category.fields.map((field) => ({
      field,
      descriptor: createCatalogFieldDiscoveryDescriptor(field),
    })),
  })), []);
  const filteredCategories = useMemo(() => catalogCategories
    .map((category) => {
      const filtered = new Set(filterFieldDiscovery(category.entries.map((entry) => entry.descriptor), normalizedQuery).map((field) => field.identity));
      return { ...category, entries: category.entries.filter((entry) => filtered.has(entry.descriptor.identity)) };
    })
    .filter((category) => category.entries.length > 0), [catalogCategories, normalizedQuery]);
  const matchingCustomDescriptors = useMemo(
    () => filterFieldDiscovery(customDescriptors, normalizedQuery),
    [customDescriptors, normalizedQuery],
  );
  const matchingServiceDescriptors = useMemo(
    () => filterFieldDiscovery(serviceDescriptors, normalizedQuery),
    [serviceDescriptors, normalizedQuery],
  );
  const matchingPartials = partials.filter((partial) => !normalizedQuery || matches(normalizedQuery, partial.name, partial.displayName, partial.description, 'Partials'));
  const partialLinks = useMemo(() => mergedPlaceholders.filter((field) => field.source === 'partial').reduce<Record<string, MergedPlaceholder[]>>((groups, field) => {
    (groups[field.sourceName || 'unknown'] ||= []).push(field);
    return groups;
  }, {}), [mergedPlaceholders]);

  const allRecentableFields = useMemo(() => [
    ...catalogCategories.flatMap((category) => category.entries)
      .filter((entry) => !entry.field.builder && entry.descriptor.availability.status === 'available')
      .map((entry) => entry.descriptor),
    ...customDescriptors,
    ...serviceDescriptors,
  ], [catalogCategories, customDescriptors, serviceDescriptors]);
  const descriptorByIdentity = useMemo(
    () => new Map(allRecentableFields.map((field) => [field.identity, field])),
    [allRecentableFields],
  );
  const recentFields = reconcileRecentFieldIdentities(recents, allRecentableFields)
    .map((identity) => descriptorByIdentity.get(identity))
    .filter((field): field is FieldDiscoveryDescriptor => Boolean(field));

  const normalizedFormKey = normalizeAuthoringFieldKey(form.key);
  const duplicateKey = Boolean(normalizedFormKey) && customFields.some((field) => (
    normalizeAuthoringFieldKey(field.key.replace(/^custom\./, '')) === normalizedFormKey
    && field.id !== editingId
  ));

  const deleteDescriptor = deleteCandidate
    ? createCustomFieldDiscoveryDescriptor(deleteCandidate, ownerScope)
    : null;
  const deleteUsage = deleteCandidate && sourceContent !== undefined && deleteDescriptor
    ? collectFieldUsage({
        content: sourceContent,
        scope: sourceScope(deleteCandidate, ownerScope),
        path: deleteDescriptor.key,
        identity: deleteDescriptor.identity,
      })
    : undefined;
  const deletePreview = deleteDescriptor
    ? createFieldDeletionPreview({ identity: deleteDescriptor.identity, usage: deleteUsage })
    : null;

  const resetForm = () => {
    setForm(emptyCustomFieldForm());
    setEditingId(null);
    setFormOpen(false);
  };

  const rememberRecent = (identity: string, available = allRecentableFields) => {
    setRecents((previous) => [...pushRecentFieldIdentity(previous, identity, available)]);
  };

  const insertDescriptor = (descriptor: FieldDiscoveryDescriptor, available = allRecentableFields) => {
    if (descriptor.availability.status !== 'available') return;
    onInsert(descriptor.expression);
    rememberRecent(descriptor.identity, available);
  };

  const copyDescriptor = async (descriptor: FieldDiscoveryDescriptor) => {
    if (descriptor.availability.status !== 'available') return;
    await navigator.clipboard?.writeText(descriptor.expression);
    setCopied(descriptor.identity);
    window.setTimeout(() => setCopied(null), 2000);
  };

  const insertRaw = (html: string) => onInsert(html);

  const startCreate = () => {
    setEditingId(null);
    setForm(emptyCustomFieldForm());
    setFormOpen(true);
  };

  const startEdit = (field: CustomPlaceholderDefinition) => {
    setForm({
      ...createFieldKeyDraft({ label: field.label, key: field.key.replace(/^custom\./, '') }),
      type: field.type,
      required: field.required,
      defaultValue: field.defaultValue || '',
      description: field.description || '',
    });
    setEditingId(field.id);
    setFormOpen(true);
  };

  const saveField = (insertAfterCreate: boolean) => {
    const committed = commitFieldKeyDraft(form);
    if (!committed.label || !committed.key || duplicateKey) return;
    const values = {
      key: committed.key,
      label: committed.label,
      type: form.type,
      required: form.required,
      defaultValue: form.defaultValue.trim() || undefined,
      description: form.description.trim() || undefined,
    };

    if (editingId) {
      onCustomPlaceholdersChange(customPlaceholders.map((field) => (
        field.id === editingId ? { ...field, ...values, key: field.key } : field
      )));
      resetForm();
      return;
    }

    const created: CustomPlaceholderDefinition = {
      id: crypto.randomUUID(),
      ...values,
    };
    onCustomPlaceholdersChange([...customPlaceholders, created]);
    if (insertAfterCreate) {
      const descriptor = createCustomFieldDiscoveryDescriptor(created, ownerScope);
      insertDescriptor(descriptor, [...allRecentableFields, descriptor]);
    }
    resetForm();
  };

  const confirmDelete = (referenceAction: PlaceholderFieldDeleteRequest['referenceAction']) => {
    if (!deleteCandidate || !deleteDescriptor) return;
    if (referenceAction === 'remove-references' && !onDeleteCustomField) return;
    if (onDeleteCustomField) {
      onDeleteCustomField({
        field: deleteCandidate,
        identity: deleteDescriptor.identity,
        ...(deleteUsage ? { usage: deleteUsage } : {}),
        referenceAction,
      });
    } else {
      onCustomPlaceholdersChange(customPlaceholders.filter((candidate) => candidate.id !== deleteCandidate.id));
    }
    setRecents((previous) => [...reconcileRecentFieldIdentities(
      previous.filter((identity) => identity !== deleteDescriptor.identity),
      allRecentableFields.filter((field) => field.identity !== deleteDescriptor.identity),
    )]);
    setDeleteCandidate(null);
  };

  const renderCatalogField = ({ field, descriptor }: CatalogEntry) => (
    <FieldRow
      key={descriptor.identity}
      descriptor={descriptor}
      example={field.example}
      primaryAction={field.builder ? {
        label: 'Build',
        ariaLabel: field.builder === 'loop-directors'
          ? 'Build directors loop'
          : field.builder === 'loop-shareholders'
            ? 'Build shareholders loop'
            : field.builder === 'condition'
              ? 'Build condition'
              : 'Build signature block',
        onClick: () => setBuilder(field.builder!),
      } : descriptor.availability.status === 'available' ? {
        label: 'Insert',
        ariaLabel: `Insert ${field.label}`,
        onClick: () => insertDescriptor(descriptor),
      } : undefined}
      copyAction={!field.builder && descriptor.availability.status === 'available' ? {
        copied: copied === descriptor.identity,
        ariaLabel: `Copy ${field.label}`,
        onClick: () => copyDescriptor(descriptor),
      } : undefined}
    />
  );

  const renderRecentField = (descriptor: FieldDiscoveryDescriptor) => (
    <FieldRow
      key={descriptor.identity}
      descriptor={descriptor}
      primaryAction={{
        label: 'Insert',
        ariaLabel: `Insert ${descriptor.label}`,
        onClick: () => insertDescriptor(descriptor),
      }}
      copyAction={{
        copied: copied === descriptor.identity,
        ariaLabel: `Copy ${descriptor.label}`,
        onClick: () => copyDescriptor(descriptor),
      }}
    />
  );

  return (
    <div className="flex h-full min-w-0 flex-col bg-background-secondary">
      <div className="border-b border-border-primary p-3">
        <label htmlFor="placeholder-search" className="sr-only">Search fields by name or description</label>
        <input
          id="placeholder-search"
          type="search"
          role="searchbox"
          aria-label="Search fields"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search fields"
          className="h-8 w-full rounded-md border border-border-primary bg-background-primary px-3 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-primary/50"
        />
        <p className="mt-1 text-[11px] text-text-muted">Search by business label, description, source, or type.</p>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {recentFields.length > 0 && !normalizedQuery && (
          <section aria-label="Recently used" className="mb-2 rounded-md border border-border-primary">
            <h3 className="px-2 py-2 text-xs font-semibold text-text-primary">Recently used</h3>
            {recentFields.map(renderRecentField)}
          </section>
        )}

        {filteredCategories.map((category) => {
          const isOpen = Boolean(normalizedQuery) || expanded.includes(category.key);
          return (
            <section key={category.key} className="mb-2 rounded-md border border-border-primary">
              <button
                type="button"
                aria-label={resultLabel(category.label, category.entries.length)}
                aria-expanded={isOpen}
                onClick={() => setExpanded((previous) => previous.includes(category.key)
                  ? previous.filter((key) => key !== category.key)
                  : [...previous, category.key])}
                className="flex w-full items-center justify-between gap-2 px-2 py-2 text-left hover:bg-background-tertiary focus:outline-none focus:ring-2 focus:ring-inset focus:ring-accent-primary/50"
              >
                <span className="min-w-0 break-words text-xs font-semibold text-text-primary">{category.label}</span>
                <span className="flex shrink-0 items-center gap-2 text-[11px] text-text-muted">
                  <span className="rounded-full bg-background-tertiary px-1.5 py-0.5">{category.entries.length}</span>
                  {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                </span>
              </button>
              {isOpen && <div className="border-t border-border-secondary">{category.entries.map(renderCatalogField)}</div>}
            </section>
          );
        })}

        {(!normalizedQuery || matchingServiceDescriptors.length > 0) && serviceDescriptors.length > 0 && (
          <section className="mb-2 rounded-md border border-border-primary">
            <div className="px-2 py-2">
              <h3 className="text-xs font-semibold text-text-primary">Service fields</h3>
              <p className="text-[11px] text-text-muted">Only fields supplied by the existing service source are shown.</p>
              <span className="sr-only">{resultLabel('Service fields', matchingServiceDescriptors.length)}</span>
            </div>
            <div className="border-t border-border-secondary">
              {matchingServiceDescriptors.map((descriptor) => (
                <FieldRow
                  key={descriptor.identity}
                  descriptor={descriptor}
                  primaryAction={descriptor.availability.status === 'available' ? {
                    label: 'Insert',
                    ariaLabel: `Insert ${descriptor.label}`,
                    onClick: () => insertDescriptor(descriptor),
                  } : undefined}
                  copyAction={descriptor.availability.status === 'available' ? {
                    copied: copied === descriptor.identity,
                    ariaLabel: `Copy ${descriptor.label}`,
                    onClick: () => copyDescriptor(descriptor),
                  } : undefined}
                />
              ))}
            </div>
          </section>
        )}

        {(!normalizedQuery || matchingCustomDescriptors.length > 0 || formOpen) && (
          <section className="mb-2 rounded-md border border-border-primary">
            <div className="flex flex-wrap items-start justify-between gap-2 px-2 py-2">
              <div className="min-w-0">
                <h3 className="text-xs font-semibold text-text-primary">Custom</h3>
                <p className="text-[11px] text-text-muted">Fields requested during generation.</p>
                <span className="sr-only">{resultLabel('Custom', matchingCustomDescriptors.length)}</span>
              </div>
              {!formOpen && <Button size="xs" variant="secondary" leftIcon={<Plus />} onClick={startCreate}>Add custom field</Button>}
            </div>

            {formOpen && (
              <div className="space-y-3 border-t border-border-secondary p-3">
                <div>
                  <label htmlFor="custom-field-label" className="mb-1 block text-xs font-medium text-text-secondary">Field label</label>
                  <input
                    id="custom-field-label"
                    value={form.label}
                    onChange={(event) => setForm((previous) => ({
                      ...previous,
                      ...updateFieldKeyDraftLabel(previous, event.target.value),
                    }))}
                    className="h-8 w-full rounded-md border border-border-primary bg-background-primary px-2 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/50"
                  />
                </div>
                <div>
                  <label htmlFor="custom-field-description" className="mb-1 block text-xs font-medium text-text-secondary">Description <span className="font-normal text-text-muted">(optional)</span></label>
                  <textarea
                    id="custom-field-description"
                    rows={2}
                    value={form.description}
                    onChange={(event) => setForm((previous) => ({ ...previous, description: event.target.value }))}
                    className="w-full resize-y rounded-md border border-border-primary bg-background-primary px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/50"
                  />
                </div>
                <div>
                  <label htmlFor="custom-field-key" className="mb-1 block text-xs font-medium text-text-secondary">Field key</label>
                  <input
                    id="custom-field-key"
                    value={form.key}
                    disabled={Boolean(editingId)}
                    onChange={(event) => setForm((previous) => ({
                      ...previous,
                      ...updateFieldKeyDraftKey(previous, event.target.value),
                    }))}
                    className="h-8 w-full rounded-md border border-border-primary bg-background-primary px-2 font-mono text-xs text-text-primary disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-accent-primary/50"
                  />
                  {!editingId && form.keyMode === 'generated' && <p className="mt-1 text-[11px] text-text-muted">The key follows the full label until you edit it yourself.</p>}
                  {editingId && <p className="mt-1 text-[11px] text-text-muted">Existing keys stay stable here. Key migration uses the atomic field lifecycle.</p>}
                  {duplicateKey && <p className="mt-1 text-xs text-status-error">This placeholder key already exists.</p>}
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <label className="text-xs font-medium text-text-secondary">Type
                    <select
                      value={form.type}
                      onChange={(event) => setForm((previous) => ({ ...previous, type: event.target.value as CustomPlaceholderDefinition['type'] }))}
                      className="mt-1 h-8 w-full rounded-md border border-border-primary bg-background-primary px-2 text-xs text-text-primary"
                    >
                      <option value="text">Text</option>
                      <option value="textarea">Long text</option>
                      <option value="date">Date</option>
                      <option value="number">Number</option>
                      <option value="currency">Currency</option>
                      <option value="boolean">Yes / No</option>
                    </select>
                  </label>
                  <label className="text-xs font-medium text-text-secondary">Default value
                    {form.type === 'boolean' ? (
                      <select
                        value={form.defaultValue}
                        onChange={(event) => setForm((previous) => ({ ...previous, defaultValue: event.target.value }))}
                        className="mt-1 h-8 w-full rounded-md border border-border-primary bg-background-primary px-2 text-xs text-text-primary"
                      >
                        <option value="">No default</option>
                        <option value="true">Yes</option>
                        <option value="false">No</option>
                      </select>
                    ) : (
                      <input
                        value={form.defaultValue}
                        onChange={(event) => setForm((previous) => ({ ...previous, defaultValue: event.target.value }))}
                        className="mt-1 h-8 w-full rounded-md border border-border-primary bg-background-primary px-2 text-xs text-text-primary"
                      />
                    )}
                  </label>
                </div>
                <label className="flex items-center gap-2 text-xs text-text-secondary">
                  <input type="checkbox" checked={form.required} onChange={(event) => setForm((previous) => ({ ...previous, required: event.target.checked }))} />
                  Required
                </label>
                <details className="rounded-md bg-background-tertiary p-2">
                  <summary className="cursor-pointer text-[11px] font-medium text-text-secondary">Advanced details</summary>
                  <code className="mt-1 block break-all font-mono text-[11px] text-accent-primary">{`{{custom.${normalizeAuthoringFieldKey(form.key) || 'field_key'}}}`}</code>
                </details>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button variant="ghost" size="xs" onClick={resetForm}>Cancel</Button>
                  {editingId ? (
                    <Button size="xs" aria-label="Update field" onClick={() => saveField(false)} disabled={!form.label.trim() || !form.key.trim() || duplicateKey}>Update field</Button>
                  ) : (
                    <>
                      <Button variant="secondary" size="xs" aria-label="Create field" onClick={() => saveField(false)} disabled={!form.label.trim() || !form.key.trim() || duplicateKey}>Create</Button>
                      <Button size="xs" aria-label="Create and insert field" onClick={() => saveField(true)} disabled={!form.label.trim() || !form.key.trim() || duplicateKey}>Create and insert</Button>
                    </>
                  )}
                </div>
              </div>
            )}

            {matchingCustomDescriptors.map((descriptor) => {
              const field = customFields.find((candidate) => stableCustomFieldIdentity(candidate, ownerScope) === descriptor.identity);
              if (!field) return null;
              return (
                <FieldRow
                  key={descriptor.identity}
                  descriptor={descriptor}
                  primaryAction={descriptor.availability.status === 'available' ? {
                    label: 'Insert',
                    ariaLabel: `Insert ${descriptor.label}`,
                    onClick: () => insertDescriptor(descriptor),
                  } : undefined}
                  copyAction={descriptor.availability.status === 'available' ? {
                    copied: copied === descriptor.identity,
                    ariaLabel: `Copy ${descriptor.label}`,
                    onClick: () => copyDescriptor(descriptor),
                  } : undefined}
                  extraActions={(
                    <>
                      <Button size="xs" variant="ghost" iconOnly aria-label={`Edit ${field.label}`} onClick={() => startEdit(field)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button size="xs" variant="ghost" iconOnly aria-label={`Delete ${field.label}`} onClick={() => setDeleteCandidate(field)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </>
                  )}
                />
              );
            })}
          </section>
        )}

        {(!normalizedQuery || matchingPartials.length > 0) && (
          <section className="mb-2 rounded-md border border-border-primary">
            <div className="px-2 py-2">
              <button type="button" aria-label={resultLabel('Partials', matchingPartials.length)} className="text-left">
                <span className="text-xs font-semibold text-text-primary">Partials</span>
                <span className="ml-2 rounded-full bg-background-tertiary px-1.5 py-0.5 text-[11px] text-text-muted">{matchingPartials.length}</span>
              </button>
            </div>
            <div className="border-t border-border-secondary">
              {isLoadingPartials ? <p className="p-3 text-xs text-text-muted">Loading partials…</p> : matchingPartials.length === 0 ? <p className="p-3 text-xs text-text-muted">No partials available.</p> : matchingPartials.map((partial) => (
                <div key={partial.id} className="border-b border-border-secondary last:border-b-0">
                  <div className="flex flex-wrap items-center gap-2 px-2 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="break-words text-xs font-medium text-text-primary">{partial.displayName || partial.name}</div>
                      {partial.description && <div className="break-words text-[11px] text-text-muted">{partial.description}</div>}
                      <details className="mt-1 text-[11px] text-text-muted">
                        <summary className="cursor-pointer">Advanced details</summary>
                        <code className="block break-all font-mono text-accent-primary">{`{{>${partial.name}}}`}</code>
                      </details>
                    </div>
                    <Button size="xs" aria-label={`Insert ${partial.displayName || partial.name}`} onClick={() => insertRaw(`{{>${partial.name}}}`)}>Insert</Button>
                    <Button size="xs" variant="ghost" iconOnly aria-label={`Copy ${partial.displayName || partial.name}`} onClick={async () => navigator.clipboard?.writeText(`{{>${partial.name}}}`)}><Copy className="h-3.5 w-3.5" /></Button>
                  </div>
                  {!isPartialMode && partialLinks[partial.name]?.map((field) => (
                    <label key={field.id} className="mx-2 mb-2 flex items-center gap-2 rounded bg-background-tertiary p-2 text-xs text-text-secondary">
                      <span className="min-w-0 flex-1 truncate">{field.label}</span>
                      <select
                        aria-label={`Link ${field.label}`}
                        value={partialPlaceholderLinkings[field.key] || ''}
                        onChange={(event) => onPartialPlaceholderLinkingChange?.(field.key, event.target.value || undefined)}
                        className="h-7 max-w-36 rounded border border-border-primary bg-background-primary px-1 text-xs text-text-primary"
                      >
                        <option value="">Always show</option>
                        {templateBooleanPlaceholders.map((booleanField) => <option key={booleanField.id} value={booleanField.key}>Show when: {booleanField.label}</option>)}
                      </select>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          </section>
        )}

        {normalizedQuery && filteredCategories.length === 0 && matchingCustomDescriptors.length === 0 && matchingServiceDescriptors.length === 0 && matchingPartials.length === 0 && (
          <div className="p-4 text-center text-xs text-text-muted">No fields match this search. Clear it or create a custom field.</div>
        )}
      </div>

      <GuidedLoopDialog collection={builder === 'loop-directors' ? 'directors' : builder === 'loop-shareholders' ? 'shareholders' : null} onClose={() => setBuilder(null)} onInsert={(html) => { insertRaw(html); setBuilder(null); }} />
      <GuidedConditionDialog isOpen={builder === 'condition'} onClose={() => setBuilder(null)} onInsert={(html) => { insertRaw(html); setBuilder(null); }} />
      <GuidedSignatureBlockDialog isOpen={builder === 'signature-block'} onClose={() => setBuilder(null)} onInsert={(html) => { insertRaw(html); setBuilder(null); }} />

      <Modal
        isOpen={Boolean(deleteCandidate && deletePreview)}
        onClose={() => setDeleteCandidate(null)}
        title={deleteCandidate ? `Delete ${deleteCandidate.label}?` : 'Delete field?'}
        description="Deleting a field definition is separate from removing references from the document."
        size="md"
      >
        <ModalBody className="space-y-3">
          {deletePreview?.usageCount === null ? (
            <p className="rounded-md bg-status-warning/10 p-2 text-xs text-status-warning">Usage locations are not available in this consumer. Confirming deletion keeps any existing references unresolved rather than guessing that the field is unused.</p>
          ) : deletePreview.usageCount === 0 ? (
            <p className="rounded-md bg-status-success/10 p-2 text-xs text-status-success">This field is not referenced in the supplied document source.</p>
          ) : (
            <>
              <p className="rounded-md bg-status-warning/10 p-2 text-xs text-status-warning">This field is used {deletePreview.usageCount} {deletePreview.usageCount === 1 ? 'time' : 'times'}. Choose whether references should remain unresolved or be removed atomically.</p>
              <ul aria-label="Field usage locations" className="space-y-1">
                {deletePreview.locations.map((location) => (
                  <li key={location.occurrenceId}>
                    {onNavigateToFieldOccurrence ? (
                      <button type="button" onClick={() => onNavigateToFieldOccurrence(location)} className="w-full rounded px-2 py-1 text-left text-xs text-accent-primary hover:bg-background-tertiary focus:outline-none focus:ring-2 focus:ring-accent-primary/50">{location.label}</button>
                    ) : <span className="block px-2 py-1 text-xs text-text-secondary">{location.label}</span>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" size="sm" onClick={() => setDeleteCandidate(null)}>Cancel</Button>
          {deletePreview && deletePreview.usageCount !== 0 && onDeleteCustomField && (
            <Button variant="secondary" size="sm" onClick={() => confirmDelete('remove-references')}>Delete and remove references</Button>
          )}
          <Button size="sm" onClick={() => confirmDelete('keep-unresolved')}>
            {deletePreview?.usageCount === 0 ? 'Delete field' : 'Delete field only'}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

function FieldRow({
  descriptor,
  example,
  primaryAction,
  copyAction,
  extraActions,
}: {
  descriptor: FieldDiscoveryDescriptor;
  example?: string;
  primaryAction?: { label: string; ariaLabel: string; onClick: () => void };
  copyAction?: { copied: boolean; ariaLabel: string; onClick: () => void | Promise<void> };
  extraActions?: React.ReactNode;
}) {
  return (
    <div className="group flex min-w-0 flex-wrap items-start gap-2 border-b border-border-secondary px-2 py-2 last:border-b-0 hover:bg-background-tertiary">
      <div className="min-w-0 flex-1 basis-44">
        <div className="break-words text-xs font-medium text-text-primary">{descriptor.label}</div>
        <div className="mt-1 flex flex-wrap gap-1 text-[11px] text-text-muted">
          <span className="rounded bg-background-tertiary px-1.5 py-0.5">{descriptor.sourceLabel}</span>
          <span className="rounded bg-background-tertiary px-1.5 py-0.5">{descriptor.typeLabel}</span>
        </div>
        <p className="mt-1 break-words text-[11px] text-text-secondary">{descriptor.description}</p>
        {(example || descriptor.valueSummary) && <p className="mt-1 whitespace-pre-line break-words text-[11px] text-text-muted">Example: {example ?? descriptor.valueSummary}</p>}
        {descriptor.defaultSummary && <p className="mt-1 break-words text-[11px] text-text-muted">Default: {descriptor.defaultSummary}</p>}
        {descriptor.availability.status === 'unavailable' && <p className="mt-1 break-words text-[11px] text-status-warning">Unavailable: {descriptor.availability.reason}</p>}
        <details className="mt-1 text-[11px] text-text-muted">
          <summary className="cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent-primary/50">Advanced details</summary>
          <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 rounded bg-background-primary p-2">
            <dt>Key</dt><dd className="min-w-0 break-all font-mono text-accent-primary">{descriptor.key}</dd>
            <dt>Expression</dt><dd className="min-w-0 break-all font-mono text-accent-primary">{descriptor.expression}</dd>
          </dl>
        </details>
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
        {primaryAction && <Button size="xs" variant="primary" aria-label={primaryAction.ariaLabel} onClick={primaryAction.onClick}>{primaryAction.label}</Button>}
        {copyAction && <Button size="xs" variant="ghost" iconOnly aria-label={copyAction.ariaLabel} onClick={copyAction.onClick}>{copyAction.copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}</Button>}
        {extraActions}
      </div>
    </div>
  );
}

function GuidedLoopDialog({ collection, onClose, onInsert }: { collection: TemplateCollection | null; onClose: () => void; onInsert: (html: string) => void }) {
  const [fields, setFields] = useState<string[]>([]);
  const [layout, setLayout] = useState<TemplateLoopLayout>('paragraphs');
  if (!collection) return null;
  const option = TEMPLATE_COLLECTION_OPTIONS.find((candidate) => candidate.value === collection)!;
  const fieldLabel = collection === 'directors' ? 'Director' : 'Shareholder';
  const preview = fields.length ? buildEachBlock({ collection, fields, layout }) : 'Select one or more fields to preview the generated syntax.';
  return <Modal isOpen onClose={onClose} title={`Build ${option.label.toLowerCase()} loop`} description="Choose fields and a starter layout to insert a complete loop." size="md"><ModalBody className="space-y-4"><fieldset><legend className="mb-2 text-xs font-semibold text-text-primary">Fields</legend>{TEMPLATE_FIELD_OPTIONS[collection].map((field) => <label key={field.value} className="mb-2 flex items-center gap-2 text-sm text-text-secondary"><input type="checkbox" aria-label={`${fieldLabel} ${field.label.toLowerCase()}`} checked={fields.includes(field.value)} onChange={(event) => setFields((previous) => event.target.checked ? [...previous, field.value] : previous.filter((value) => value !== field.value))} />{field.label}</label>)}</fieldset><label className="block text-xs font-medium text-text-secondary">Starter layout<select value={layout} onChange={(event) => setLayout(event.target.value as TemplateLoopLayout)} className="mt-1 h-8 w-full rounded-md border border-border-primary bg-background-primary px-2 text-xs text-text-primary"><option value="paragraphs">Paragraphs</option><option value="bullets">Bullets</option><option value="table">Table</option></select></label><details className="rounded-md border border-border-primary p-2"><summary className="cursor-pointer text-xs font-medium text-text-secondary">View syntax</summary><pre className="mt-2 whitespace-pre-wrap font-mono text-[11px] text-accent-primary">{preview}</pre></details></ModalBody><ModalFooter><Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" disabled={!fields.length} onClick={() => onInsert(buildEachBlock({ collection, fields, layout }))}>Insert loop</Button></ModalFooter></Modal>;
}

function GuidedSignatureBlockDialog({ isOpen, onClose, onInsert }: { isOpen: boolean; onClose: () => void; onInsert: (html: string) => void }) {
  const [collection, setCollection] = useState<TemplateCollection>('directors');
  const preview = buildSignatureBlock({ collection });
  return <Modal isOpen={isOpen} onClose={onClose} title="Build signature block" description="Insert a keep-together signature block for every signer in a collection." size="md"><ModalBody className="space-y-4"><label className="block text-xs font-medium text-text-secondary">Signers<select value={collection} onChange={(event) => setCollection(event.target.value as TemplateCollection)} className="mt-1 h-8 w-full rounded-md border border-border-primary bg-background-primary px-2 text-xs text-text-primary">{TEMPLATE_COLLECTION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><details className="rounded-md border border-border-primary p-2"><summary className="cursor-pointer text-xs font-medium text-text-secondary">View syntax</summary><pre className="mt-2 whitespace-pre-wrap font-mono text-[11px] text-accent-primary">{preview}</pre></details></ModalBody><ModalFooter><Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" onClick={() => onInsert(preview)}>Insert signature block</Button></ModalFooter></Modal>;
}

function GuidedConditionDialog({ isOpen, onClose, onInsert }: { isOpen: boolean; onClose: () => void; onInsert: (html: string) => void }) {
  const [field, setField] = useState(CONDITION_FIELDS[0]);
  const [operator, setOperator] = useState<ConditionOperator>('truthy');
  const [value, setValue] = useState('');
  const [body, setBody] = useState('Condition content');
  let preview = '';
  let error = '';
  try {
    preview = buildConditionBlock({ field, operator, value: operator === 'truthy' ? undefined : value, bodyHtml: `<p>${escapeText(body)}</p>` });
  } catch (cause) {
    error = cause instanceof Error ? cause.message : 'Enter a safe comparison value.';
  }
  return <Modal isOpen={isOpen} onClose={onClose} title="Build condition" description="Generate a balanced conditional block." size="md"><ModalBody className="space-y-4"><label className="block text-xs font-medium text-text-secondary">Show content when<select value={field} onChange={(event) => setField(event.target.value)} className="mt-1 h-8 w-full rounded-md border border-border-primary bg-background-primary px-2 text-xs text-text-primary">{CONDITION_FIELDS.map((candidate) => <option key={candidate} value={candidate}>{candidate}</option>)}</select></label><label className="block text-xs font-medium text-text-secondary">Comparison<select value={operator} onChange={(event) => setOperator(event.target.value as ConditionOperator)} className="mt-1 h-8 w-full rounded-md border border-border-primary bg-background-primary px-2 text-xs text-text-primary"><option value="truthy">has a value</option><option value="equals">equals</option><option value="notEquals">does not equal</option></select></label>{operator !== 'truthy' && <label className="block text-xs font-medium text-text-secondary">Value<input value={value} onChange={(event) => setValue(event.target.value)} className="mt-1 h-8 w-full rounded-md border border-border-primary bg-background-primary px-2 text-xs text-text-primary" /></label>}<label className="block text-xs font-medium text-text-secondary">Content<input value={body} onChange={(event) => setBody(event.target.value)} className="mt-1 h-8 w-full rounded-md border border-border-primary bg-background-primary px-2 text-xs text-text-primary" /></label>{error && <p className="text-xs text-status-error">{error}</p>}<details className="rounded-md border border-border-primary p-2"><summary className="cursor-pointer text-xs font-medium text-text-secondary">View syntax</summary><pre className="mt-2 whitespace-pre-wrap font-mono text-[11px] text-accent-primary">{preview}</pre></details></ModalBody><ModalFooter><Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" disabled={!body || Boolean(error) || (operator !== 'truthy' && !value)} onClick={() => onInsert(buildConditionBlock({ field, operator, value: operator === 'truthy' ? undefined : value, bodyHtml: `<p>${escapeText(body)}</p>` }))}>Insert condition</Button></ModalFooter></Modal>;
}
