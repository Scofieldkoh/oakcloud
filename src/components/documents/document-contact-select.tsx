'use client';

import { useMemo, useState } from 'react';
import { Check, Search, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DocumentContact } from '@/types/document-generation';

export interface DocumentContactSelectProps {
  id: string;
  label: string;
  contacts: DocumentContact[];
  value: string;
  onChange: (contactId: string) => void;
  required?: boolean;
  hint?: string;
  emptyMessage?: string;
  disabled?: boolean;
}

function contactMeta(contact: DocumentContact): string[] {
  return [contact.designation, contact.email, contact.phone].filter(
    (item): item is string => Boolean(item),
  );
}

export function DocumentContactSelect({
  id,
  label,
  contacts,
  value,
  onChange,
  required = false,
  hint,
  emptyMessage = 'No contacts are available for this company.',
  disabled = false,
}: DocumentContactSelectProps) {
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visible = useMemo(() => {
    if (!normalizedQuery) return contacts;
    const matching = contacts.filter((contact) =>
      [contact.fullName, ...contactMeta(contact)]
        .some((item) => item.toLocaleLowerCase().includes(normalizedQuery)),
    );
    const selected = contacts.find((contact) => contact.id === value);
    return selected && !matching.some((contact) => contact.id === selected.id)
      ? [selected, ...matching]
      : matching;
  }, [contacts, normalizedQuery, value]);

  const missingRequired = required && !value;

  return (
    <fieldset className="space-y-2">
      <legend className="text-xs font-medium text-text-secondary">
        {label}
        {required ? <span className="ml-1 text-status-error" aria-hidden="true">*</span> : null}
      </legend>
      {hint ? <p className="text-xs text-text-muted">{hint}</p> : null}

      {contacts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border-primary p-4 text-sm text-text-muted">
          {emptyMessage}
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
              disabled={disabled}
              aria-label={`Search ${label.toLowerCase()}`}
              placeholder={`Search ${label.toLowerCase()}...`}
              className="min-h-11 w-full rounded-lg border border-border-primary bg-background-elevated py-2 pl-9 pr-4 text-sm text-text-primary placeholder:text-text-muted focus:border-oak-primary focus:outline-none focus:ring-2 focus:ring-oak-primary/30 lg:min-h-9"
            />
          </div>

          <div
            className={cn(
              'max-h-[360px] overflow-y-auto rounded-lg border bg-background-primary',
              missingRequired ? 'border-status-error/40' : 'border-border-primary',
            )}
          >
            {visible.map((contact) => {
              const selected = contact.id === value;
              const metadata = contactMeta(contact);
              return (
                <label
                  key={contact.id}
                  className={cn(
                    'flex min-h-11 cursor-pointer items-start gap-3 border-b border-border-secondary p-3 transition-colors last:border-b-0',
                    'hover:bg-background-secondary focus-within:ring-2 focus-within:ring-inset focus-within:ring-oak-primary/30',
                    selected && 'bg-oak-primary/5',
                    disabled && 'cursor-not-allowed opacity-60',
                  )}
                >
                  <input
                    type="radio"
                    name={id}
                    value={contact.id}
                    checked={selected}
                    onChange={() => onChange(contact.id)}
                    disabled={disabled}
                    className="mt-1 h-4 w-4 shrink-0 accent-oak-primary"
                  />
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-oak-primary/10 text-oak-primary">
                    <UserRound className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-text-primary">{contact.fullName}</span>
                    {metadata.length > 0 ? (
                      <span className="mt-0.5 block truncate text-xs text-text-muted">
                        {metadata.join(' · ')}
                      </span>
                    ) : null}
                  </span>
                  {selected ? (
                    <Check className="h-4 w-4 shrink-0 text-oak-primary" aria-hidden="true" />
                  ) : null}
                </label>
              );
            })}
            {visible.length === 0 ? (
              <div className="p-5 text-center text-sm text-text-muted">
                No contacts match your search.
              </div>
            ) : null}
          </div>
        </>
      )}

      {missingRequired ? (
        <p className="text-xs text-status-error" role="status">
          Select a {label.toLowerCase()} to continue.
        </p>
      ) : null}
    </fieldset>
  );
}
