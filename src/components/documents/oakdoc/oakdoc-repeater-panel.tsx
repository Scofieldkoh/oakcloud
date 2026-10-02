'use client';

import {
  OAKDOC_REPEATER_DEFINITIONS,
  type OakDocRepeaterDefinition,
} from '@/lib/document-editor/oakdoc-repeaters';
import type { OakDocFieldDefinition } from '@/lib/document-editor/oakdoc-fields';

export interface OakDocRepeaterPanelProps {
  /** Repeater tags in the document, one per repeating section. */
  repeaterTags: readonly string[];
  /** Repeating sections in the document; defaults to the number of distinct tags. */
  count?: number;
  /** Field tags in the document; each shows a dot. */
  fieldTags: readonly string[];
  disabled?: boolean;
  onAdd: (definition: OakDocRepeaterDefinition) => void;
  onRemoveAtCaret: () => void;
  onAssignField: (field: OakDocFieldDefinition) => void;
}

/**
 * Repeating sections (directors, officers, shareholders, contacts...) and the
 * item fields of those in the document. Shared by the template editor and the
 * Word partial editor.
 */
export function OakDocRepeaterPanel({
  repeaterTags,
  count = repeaterTags.length,
  fieldTags,
  disabled = false,
  onAdd,
  onRemoveAtCaret,
  onAssignField,
}: OakDocRepeaterPanelProps) {
  return (
    <section className="space-y-3">
      <div>
        <div className="flex items-end justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Repeating sections
          </h2>
          <span className="text-[11px] text-text-muted">
            {count} in document
          </span>
        </div>
        <p className="mt-1 text-xs text-text-secondary">
          Put the caret in a paragraph or table row, then make that structure repeat for every person chosen.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {OAKDOC_REPEATER_DEFINITIONS.map((definition) => {
          const present = repeaterTags.includes(definition.tag);
          return (
            <button
              key={definition.tag}
              type="button"
              disabled={disabled}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => onAdd(definition)}
              className="rounded-lg border border-border-primary bg-background-primary px-2.5 py-2 text-left transition-colors hover:border-oak-primary/40 hover:bg-oak-primary/5 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-text-primary">{definition.label}</span>
                {present ? (
                  <span className="h-1.5 w-1.5 rounded-full bg-oak-primary" title="Used in this document" />
                ) : null}
              </span>
              <span className="mt-0.5 block text-[10px] text-text-muted">{definition.tag}</span>
            </button>
          );
        })}
      </div>

      {count > 0 ? (
        <button
          type="button"
          disabled={disabled}
          onClick={onRemoveAtCaret}
          className="w-full rounded-md border border-border-primary px-2.5 py-2 text-xs text-text-secondary transition-colors hover:border-status-error/40 hover:bg-status-error/5 hover:text-status-error disabled:cursor-not-allowed disabled:opacity-40"
        >
          Remove repeater at caret
        </button>
      ) : null}

      {OAKDOC_REPEATER_DEFINITIONS
        .filter((definition) => repeaterTags.includes(definition.tag))
        .map((definition) => (
          <div key={definition.tag} className="rounded-lg border border-border-primary p-2.5">
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
              {definition.itemLabel} fields
            </div>
            <p className="mb-2 text-[10px] leading-relaxed text-text-muted">
              Select sample text inside the repeated row or paragraph, then assign the matching field.
            </p>
            <div className="space-y-1">
              {definition.fields.map((field) => {
                const present = fieldTags.includes(field.tag);
                return (
                  <button
                    key={field.tag}
                    type="button"
                    disabled={disabled}
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() => onAssignField(field)}
                    className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-oak-primary/5 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-medium text-text-primary">
                        {field.label}
                      </span>
                      <span className="block truncate text-[10px] text-text-muted">
                        {field.tag}
                      </span>
                    </span>
                    {present ? (
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-oak-primary" title="Used in this document" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
    </section>
  );
}
