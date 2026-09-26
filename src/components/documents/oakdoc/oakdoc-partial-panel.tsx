'use client';

import { useMemo } from 'react';
import { Alert } from '@/components/ui/alert';
import {
  useAllTemplatePartials,
  type TemplatePartialSummary,
} from '@/hooks/use-template-partials';

interface OakDocPartialPanelProps {
  tenantId?: string;
  /** Partial IDs the open document references, in document order. */
  referencedIds: string[];
  disabled: boolean;
  onInsert: (partial: TemplatePartialSummary) => void;
}

/**
 * Word partials that can be inserted into an OakDoc template, with the ones
 * the template already uses marked and missing references called out.
 */
export function OakDocPartialPanel({
  tenantId,
  referencedIds,
  disabled,
  onInsert,
}: OakDocPartialPanelProps) {
  const { data, isLoading, error } = useAllTemplatePartials(tenantId, Boolean(tenantId));
  const wordPartials = useMemo(
    () => (data?.partials ?? []).filter((partial) => partial.documentEngine === 'OAKDOC'),
    [data],
  );
  const known = useMemo(() => new Set(wordPartials.map((partial) => partial.id)), [wordPartials]);
  const missing = data ? referencedIds.filter((id) => !known.has(id)) : [];

  return (
    <section className="space-y-3">
      <div>
        <div className="flex items-end justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Partials
          </h2>
          <span className="text-[11px] text-text-muted">
            {referencedIds.length} in document
          </span>
        </div>
        <p className="mt-1 text-xs text-text-secondary">
          Put the caret in a paragraph to insert a reusable Word partial after it. The template keeps the partial version it was saved with.
        </p>
      </div>

      {isLoading ? (
        <p className="text-xs text-text-muted">Loading partials…</p>
      ) : error ? (
        <p className="text-xs text-status-error">Could not load partials.</p>
      ) : wordPartials.length === 0 ? (
        <p className="text-xs text-text-muted">No Word partials in this workspace yet.</p>
      ) : (
        <div className="space-y-1">
          {wordPartials.map((partial) => {
            const used = referencedIds.includes(partial.id);
            return (
              <button
                key={partial.id}
                type="button"
                disabled={disabled}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => onInsert(partial)}
                className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-oak-primary/5 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className="min-w-0">
                  <span className="block truncate text-xs font-medium text-text-primary">
                    {partial.displayName || partial.name}
                  </span>
                  <span className="block truncate text-[10px] text-text-muted">
                    {partial.name} · v{partial.version}
                  </span>
                </span>
                {used ? (
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-oak-primary" title="Used in this document" />
                ) : null}
              </button>
            );
          })}
        </div>
      )}

      {missing.length > 0 ? (
        <Alert variant="warning" compact>
          {missing.length === 1
            ? 'One partial in this document no longer exists.'
            : `${missing.length} partials in this document no longer exist.`}
          {' '}Saving will fail until the reference is removed.
        </Alert>
      ) : null}
    </section>
  );
}
