'use client';

import { useMemo, useState } from 'react';
import { FileText, GripVertical, Plus, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  DocumentTemplateSummary,
} from '@/types/document-generation';
import type {
  EditableBatchItem,
} from './batch-workspace-state';

export interface BatchTemplatePickerProps {
  templates: DocumentTemplateSummary[];
  selected: EditableBatchItem[];
  onAdd: (template: DocumentTemplateSummary) => void;
  onRemove: (itemId: string) => void;
  onReorder: (itemId: string, direction: -1 | 1) => void;
  disabled?: boolean;
  maxDocuments?: number;
}

export function BatchTemplatePicker({
  templates,
  selected,
  onAdd,
  onRemove,
  onReorder,
  disabled = false,
  maxDocuments = 20,
}: BatchTemplatePickerProps) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const selectedIds = useMemo(
    () => new Set(selected.map((item) => item.templateId)),
    [selected],
  );
  const atLimit = selected.length >= maxDocuments;
  const categories = useMemo(
    () => Array.from(new Set(templates.map((template) => template.category))).sort(),
    [templates],
  );
  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return templates.filter((template) => {
      if (selectedIds.has(template.id)) return false;
      if (category && template.category !== category) return false;
      if (!normalized) return true;
      return [template.name, template.category, template.description ?? '']
        .some((value) => value.toLocaleLowerCase().includes(normalized));
    });
  }, [templates, selectedIds, category, query]);

  const remove = (item: EditableBatchItem) => {
    if (disabled) return;
    const hasDraftData = Boolean(
      item.previewContent
      || item.editedContent
      || item.configuration.serviceAgreement
      || Object.keys(item.configuration.itemValues).length > 0,
    );
    if (
      hasDraftData
      && !window.confirm(
        `Remove "${item.templateName}"? Its unfinished configuration and draft will be discarded.`,
      )
    ) {
      return;
    }
    onRemove(item.key);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <label className="relative block flex-1">
          <span className="sr-only">Search templates</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search templates by name or description..."
            className="min-h-11 w-full rounded-lg border border-border-primary bg-background-primary pl-9 pr-4 text-sm text-text-primary placeholder:text-text-muted focus:border-oak-primary focus:outline-none focus:ring-2 focus:ring-oak-primary/30 lg:min-h-9"
          />
        </label>
        {categories.length > 0 && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by category">
            <button
              type="button"
              onClick={() => setCategory(null)}
              className={cn(
                'inline-flex min-h-9 items-center rounded-full px-3 text-sm font-medium transition-colors',
                category === null
                  ? 'bg-oak-primary text-white'
                  : 'border border-border-primary bg-background-elevated text-text-secondary hover:text-text-primary',
              )}
            >
              All
            </button>
            {categories.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setCategory(category === item ? null : item)}
                aria-pressed={category === item}
                className={cn(
                  'inline-flex min-h-9 items-center rounded-full px-3 text-sm font-medium transition-colors',
                  category === item
                    ? 'bg-oak-primary text-white'
                    : 'border border-border-primary bg-background-elevated text-text-secondary hover:text-text-primary',
                )}
              >
                {item}
              </button>
            ))}
          </div>
        )}
      </div>

      <p className="text-sm text-text-secondary" aria-live="polite">
        {selected.length} of {maxDocuments} documents selected
        {atLimit ? <span className="ml-2 font-medium text-status-warning">20 document maximum reached</span> : null}
      </p>

      {selected.length > 0 && (
        <section aria-label="Selected documents" className="rounded-lg border border-border-primary">
          <h2 className="border-b border-border-secondary px-3 py-2 text-xs font-medium text-text-secondary">
            Selected documents
          </h2>
          <ul className="divide-y divide-border-secondary">
            {selected.map((item, index) => (
              <li key={item.key} className="flex min-h-11 items-center gap-2 px-3 py-2">
                <span aria-hidden="true" className="text-text-muted">
                  <GripVertical className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-text-primary">
                    {item.templateName}
                  </span>
                  <span className="text-xs text-text-muted">
                    {item.templateKind === 'SERVICE_AGREEMENT' ? 'Service Agreement' : 'Standard'}
                    {' · '}v{item.templateVersion}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => onReorder(item.key, -1)}
                  disabled={disabled || index === 0}
                  aria-label={`Move ${item.templateName} up`}
                  className="rounded-lg p-2 text-text-secondary transition-colors hover:bg-background-tertiary hover:text-text-primary disabled:opacity-40"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => onReorder(item.key, 1)}
                  disabled={disabled || index === selected.length - 1}
                  aria-label={`Move ${item.templateName} down`}
                  className="rounded-lg p-2 text-text-secondary transition-colors hover:bg-background-tertiary hover:text-text-primary disabled:opacity-40"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => remove(item)}
                  disabled={disabled || selected.length <= 1}
                  aria-label={`Remove ${item.templateName}`}
                  className="rounded-lg p-2 text-text-secondary transition-colors hover:bg-status-error/10 hover:text-status-error disabled:opacity-40"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div aria-live="polite" className="sr-only">
        {selected.length} document{selected.length === 1 ? '' : 's'} selected
      </div>

      <section aria-label="Available templates" className="grid gap-2 lg:grid-cols-2">
        {visible.length === 0 && (
          <div className="rounded-lg border border-dashed border-border-primary p-6 text-center text-sm text-text-muted lg:col-span-2">
            No templates match your search.
          </div>
        )}
        {visible.map((template) => (
          <article
            key={template.id}
            className="flex items-start gap-3 rounded-lg border border-border-primary bg-background-primary p-3"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-oak-primary/10 text-oak-primary">
              <FileText className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-medium text-text-primary">{template.name}</h3>
              {template.description && (
                <p className="mt-0.5 line-clamp-2 text-xs text-text-muted">{template.description}</p>
              )}
              <p className="mt-1 text-xs text-text-muted">
                {template.compositionType === 'SERVICE_AGREEMENT' ? 'Service Agreement' : template.category}
                {' · '}{template.placeholders.length} field{template.placeholders.length === 1 ? '' : 's'}
                {' · '}v{template.version}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onAdd(template)}
              disabled={disabled || atLimit}
              aria-label={`Add ${template.name}`}
              className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg border border-border-primary px-2.5 text-sm font-medium text-oak-primary transition-colors hover:bg-oak-primary/5 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Add
            </button>
          </article>
        ))}
      </section>
    </div>
  );
}
