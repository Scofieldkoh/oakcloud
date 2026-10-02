'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { TemplateFieldCategory } from '@/components/documents/template-editor/template-field-catalog';
import { OAKDOC_EDITOR_FIELD_CATEGORIES } from '@/lib/document-editor/oakdoc-field-registry';
import type { OakDocFieldDefinition } from '@/lib/document-editor/oakdoc-fields';

export interface OakDocFieldListProps {
  /** Tags already in the document; each shows a dot. */
  presentTags: readonly string[];
  onInsert: (field: OakDocFieldDefinition) => void;
  disabled?: boolean;
  /** Field controls in the document; defaults to the number of distinct tags. */
  fieldCount?: number;
  categories?: readonly Pick<TemplateFieldCategory, 'key' | 'label' | 'fields'>[];
}

/**
 * Searchable list of Oakcloud fields (company, directors, shareholders,
 * contact, system). Clicking one wraps the selection in, or inserts at the
 * caret, that field's Word content control.
 */
export function OakDocFieldList({
  presentTags,
  onInsert,
  disabled = false,
  fieldCount = presentTags.length,
  categories = OAKDOC_EDITOR_FIELD_CATEGORIES,
}: OakDocFieldListProps) {
  const [search, setSearch] = useState('');
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return categories
      .map((category) => ({
        ...category,
        fields: category.fields.filter((field) => !query
          || field.label.toLowerCase().includes(query)
          || field.key.toLowerCase().includes(query)
          || category.label.toLowerCase().includes(query)),
      }))
      .filter((category) => category.fields.length > 0);
  }, [categories, search]);

  return (
    <section>
      <div className="mb-2 flex items-end justify-between gap-2">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Oakcloud fields
          </h2>
          <p className="mt-1 text-xs text-text-secondary">
            Highlight text to wrap it, or place the caret to insert a field.
          </p>
        </div>
        <span className="shrink-0 text-[11px] text-text-muted">
          {fieldCount} in document
        </span>
      </div>

      <label className="relative mb-3 block">
        <span className="sr-only">Search Oakcloud fields</span>
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted"
          aria-hidden="true"
        />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search fields..."
          className="h-9 w-full rounded-lg border border-border-primary bg-background-primary pl-8 pr-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-oak-primary focus:outline-none focus:ring-2 focus:ring-oak-primary/20"
        />
      </label>

      <div className="space-y-4">
        {visible.map((category) => (
          <div key={category.key}>
            <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
              {category.label}
            </h3>
            <div className="space-y-1">
              {category.fields.map((field) => (
                <button
                  key={field.key}
                  type="button"
                  disabled={disabled}
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => onInsert({ tag: field.key, label: field.label, category: category.label })}
                  className="flex w-full items-center justify-between gap-2 rounded-md border border-transparent px-2.5 py-2 text-left transition-colors hover:border-oak-primary/20 hover:bg-oak-primary/5 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium text-text-primary">
                      {field.label}
                    </span>
                    <span className="block truncate text-[10px] text-text-muted">
                      {field.key}
                    </span>
                  </span>
                  {presentTags.includes(field.key) ? (
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full bg-oak-primary"
                      title="Used in this document"
                    />
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
