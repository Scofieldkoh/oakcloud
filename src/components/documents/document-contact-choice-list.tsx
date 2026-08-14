'use client';

import { useMemo, useState } from 'react';
import { Loader2, Search, UsersRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export interface DocumentContact {
  id: string;
  fullName: string;
  email?: string | null;
  phone?: string | null;
  designation?: string | null;
}

export interface DocumentContactChoiceListProps {
  contacts: DocumentContact[];
  selected: DocumentContact[];
  onChange: (contacts: DocumentContact[]) => void;
  onSearch?: (query: string) => void | Promise<void>;
  isLoading?: boolean;
  /**
   * Set when `contacts` is already the result of a server-side query. Local
   * filtering is then skipped so matches on fields the server searches but the
   * client does not (identification number, UEN) stay visible.
   */
  serverFiltered?: boolean;
}

function contactMeta(contact: DocumentContact): string[] {
  return [contact.designation, contact.email, contact.phone].filter(
    (item): item is string => Boolean(item),
  );
}

export function DocumentContactChoiceList({
  contacts,
  selected,
  onChange,
  onSearch,
  isLoading = false,
  serverFiltered = false,
}: DocumentContactChoiceListProps) {
  const [query, setQuery] = useState('');
  const selectedIds = useMemo(() => new Set(selected.map((contact) => contact.id)), [selected]);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleContacts = useMemo(() => {
    if (!normalizedQuery || serverFiltered) return contacts;

    const matching = contacts.filter((contact) =>
      [contact.fullName, ...contactMeta(contact)]
        .some((item) => item.toLocaleLowerCase().includes(normalizedQuery)),
    );
    const selectedOutsideQuery = selected.filter(
      (contact) => !matching.some((item) => item.id === contact.id),
    );
    return [...selectedOutsideQuery, ...matching];
  }, [contacts, normalizedQuery, selected, serverFiltered]);

  const toggleContact = (contact: DocumentContact) => {
    onChange(
      selectedIds.has(contact.id)
        ? selected.filter((item) => item.id !== contact.id)
        : [...selected, contact],
    );
  };

  return (
    <section className="space-y-2" aria-labelledby="document-contacts-label">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 id="document-contacts-label" className="text-xs font-medium text-text-secondary">
            Contacts
          </h3>
          <p className="text-xs text-text-muted">
            {selected.length === 0 ? 'No contacts selected' : `${selected.length} selected`}
          </p>
        </div>
        {selected.length > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange([])}
            aria-label="Clear all contacts"
          >
            Clear all
          </Button>
        ) : null}
      </div>

      <div className="relative max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
        <input
          type="search"
          value={query}
          onChange={(event) => {
            const value = event.target.value;
            setQuery(value);
            void onSearch?.(value);
          }}
          aria-label="Search contacts"
          placeholder="Search contacts..."
          className="min-h-11 w-full rounded-lg border border-border-primary bg-background-elevated py-2 pl-9 pr-4 text-sm text-text-primary placeholder:text-text-muted focus:border-oak-primary focus:outline-none focus:ring-2 focus:ring-oak-primary/30"
        />
      </div>

      {isLoading ? (
        <div className="flex min-h-24 items-center justify-center gap-2 text-sm text-text-muted" role="status">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading contacts...
        </div>
      ) : contacts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border-primary p-4 text-sm text-text-muted">
          {normalizedQuery ? 'No contacts match your search.' : 'No contacts are available.'}
        </div>
      ) : (
        <div className="max-h-[360px] overflow-y-auto rounded-lg border border-border-primary bg-background-primary">
          {visibleContacts.map((contact) => {
            const isSelected = selectedIds.has(contact.id);
            const metadata = contactMeta(contact);
            return (
              <label
                key={contact.id}
                className={cn(
                  'flex min-h-11 cursor-pointer items-start gap-3 border-b border-border-secondary p-3 transition-colors last:border-b-0',
                  'hover:bg-background-secondary focus-within:ring-2 focus-within:ring-inset focus-within:ring-oak-primary/30',
                  isSelected && 'bg-oak-primary/5',
                )}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleContact(contact)}
                  className="mt-1 h-4 w-4 shrink-0 rounded accent-oak-primary"
                />
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-oak-primary/10 text-oak-primary">
                  <UsersRound className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-text-primary">{contact.fullName}</span>
                  {metadata.length > 0 ? (
                    <span className="mt-0.5 block truncate text-xs text-text-muted">
                      {metadata.join(' · ')}
                    </span>
                  ) : null}
                </span>
              </label>
            );
          })}
          {visibleContacts.length === 0 ? (
            <div className="p-5 text-center text-sm text-text-muted">
              No contacts match your search.
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
