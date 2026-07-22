'use client';

import { useMemo, useState } from 'react';
import { Loader2, RefreshCw, Search, UserRound } from 'lucide-react';
import type { DocumentParty } from '@/lib/document-party';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export interface DocumentPartyChoiceListProps {
  id: string;
  label: string;
  options: DocumentParty[];
  value: string;
  onChange: (value: string) => void;
  isLoading: boolean;
  error?: string | null;
  onRetry?: () => void;
  required?: boolean;
}

function partyMeta(option: DocumentParty): string[] {
  return [option.detail, option.email, option.phone].filter(
    (item): item is string => Boolean(item),
  );
}

export function DocumentPartyChoiceList({
  id,
  label,
  options,
  value,
  onChange,
  isLoading,
  error,
  onRetry,
  required = false,
}: DocumentPartyChoiceListProps) {
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleOptions = useMemo(() => {
    if (!normalizedQuery) return options;

    const matching = options.filter((option) =>
      [option.name, ...partyMeta(option)]
        .some((item) => item.toLocaleLowerCase().includes(normalizedQuery)),
    );
    const selected = options.find((option) => option.id === value);

    return selected && !matching.some((option) => option.id === selected.id)
      ? [selected, ...matching]
      : matching;
  }, [normalizedQuery, options, value]);

  return (
    <fieldset className="space-y-2">
      <legend className="text-xs font-medium text-text-secondary">
        {label}
        {required ? <span className="ml-1 text-status-error" aria-hidden="true">*</span> : null}
      </legend>

      {isLoading ? (
        <div className="flex min-h-11 items-center gap-2 text-sm text-text-muted" role="status">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading {label.toLocaleLowerCase()} options...
        </div>
      ) : error ? (
        <div className="flex min-h-11 flex-wrap items-center gap-3 rounded-lg border border-status-error/25 bg-status-error/5 p-3" role="alert">
          <p className="text-sm text-status-error">{error}</p>
          {onRetry ? (
            <Button variant="secondary" size="sm" onClick={onRetry} aria-label="Retry party options">
              <RefreshCw className="h-4 w-4" />
              Retry
            </Button>
          ) : null}
        </div>
      ) : options.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border-primary p-4 text-sm text-text-muted">
          No {label.toLocaleLowerCase()} options are available for this company.
        </div>
      ) : (
        <>
          <div className="relative max-w-xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              id={`${id}-search`}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label={`Search ${label.toLocaleLowerCase()}`}
              placeholder={`Search ${label.toLocaleLowerCase()}...`}
              className="min-h-11 w-full rounded-lg border border-border-primary bg-background-elevated py-2 pl-9 pr-4 text-sm text-text-primary placeholder:text-text-muted focus:border-oak-primary focus:outline-none focus:ring-2 focus:ring-oak-primary/30"
            />
          </div>

          <div className="max-h-[360px] overflow-y-auto rounded-lg border border-border-primary bg-background-primary">
            {visibleOptions.map((option) => {
              const selected = option.id === value;
              const metadata = partyMeta(option);
              return (
                <label
                  key={option.id}
                  className={cn(
                    'flex min-h-11 cursor-pointer items-start gap-3 border-b border-border-secondary p-3 transition-colors last:border-b-0',
                    'hover:bg-background-secondary focus-within:ring-2 focus-within:ring-inset focus-within:ring-oak-primary/30',
                    selected && 'bg-oak-primary/5',
                  )}
                >
                  <input
                    type="radio"
                    name={id}
                    value={option.id}
                    checked={selected}
                    onChange={() => onChange(option.id)}
                    required={required}
                    className="mt-1 h-4 w-4 shrink-0 accent-oak-primary"
                  />
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-oak-primary/10 text-oak-primary">
                    <UserRound className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-text-primary">{option.name}</span>
                    {metadata.length > 0 ? (
                      <span className="mt-0.5 block truncate text-xs text-text-muted">
                        {metadata.join(' · ')}
                      </span>
                    ) : null}
                  </span>
                </label>
              );
            })}
            {visibleOptions.length === 0 ? (
              <div className="p-5 text-center text-sm text-text-muted">
                No {label.toLocaleLowerCase()} options match your search.
              </div>
            ) : null}
          </div>
        </>
      )}
    </fieldset>
  );
}
