'use client';

import type { Company, DocumentContact } from '@/types/document-generation';
import { DocumentContactSelect } from '@/components/documents/document-contact-select';

interface ServiceAgreementSetupProps {
  primaryCompany: Company | null;
  companies: Company[];
  contacts: DocumentContact[];
  entityIds: string[];
  authorizedContactId: string;
  onEntityIdsChange: (entityIds: string[]) => void;
  onBeforeEntityRemove?: (company: Company) => boolean;
  onAuthorizedContactIdChange: (contactId: string) => void;
  onSearchCompanies?: (query: string) => void | Promise<void>;
}

export function ServiceAgreementSetup({
  primaryCompany,
  companies,
  contacts,
  entityIds,
  authorizedContactId,
  onEntityIdsChange,
  onBeforeEntityRemove,
  onAuthorizedContactIdChange,
  onSearchCompanies,
}: ServiceAgreementSetupProps) {
  const selected = new Set(entityIds);
  return (
    <section className="rounded-xl border border-border-primary bg-background-primary p-4">
      <h2 className="text-lg font-semibold text-text-primary">Agreement parties</h2>
      <p className="mt-1 text-xs text-text-muted">
        Select the authorised representative and every entity covered by this agreement.
      </p>
      <div className="mt-4">
        <DocumentContactSelect
          id="authorized-contact"
          label="Authorised representative"
          contacts={contacts}
          value={authorizedContactId}
          onChange={onAuthorizedContactIdChange}
          required
          hint="The contact who signs on behalf of the agreement."
        />
      </div>
      <fieldset className="mt-4">
        <legend className="text-xs font-medium text-text-secondary">Agreement entities</legend>
        {onSearchCompanies ? (
          <input
            type="search"
            aria-label="Search agreement entities"
            placeholder="Search companies..."
            onChange={(event) => void onSearchCompanies(event.target.value)}
            className="mt-2 h-11 w-full rounded-md border border-border-primary bg-background-primary px-3 text-sm sm:h-9"
          />
        ) : null}
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {companies.map((company) => {
            const isPrimary = company.id === primaryCompany?.id;
            return (
              <label
                key={company.id}
                className="flex min-h-11 items-center gap-2 rounded-md border border-border-primary px-3 text-sm"
              >
                <input
                  type="checkbox"
                  checked={isPrimary || selected.has(company.id)}
                  disabled={isPrimary}
                  onChange={(event) => {
                    if (!event.target.checked && onBeforeEntityRemove && !onBeforeEntityRemove(company)) {
                      return;
                    }
                    const next = new Set(entityIds);
                    if (event.target.checked) next.add(company.id);
                    else next.delete(company.id);
                    onEntityIdsChange([...next]);
                  }}
                />
                <span className="min-w-0 flex-1 truncate">
                  {company.name} <span className="text-text-muted">({company.uen})</span>
                </span>
                {isPrimary ? (
                  <span className="shrink-0 rounded-full bg-oak-primary/10 px-2 py-0.5 text-xs font-medium text-oak-primary">
                    Primary
                  </span>
                ) : null}
              </label>
            );
          })}
        </div>
      </fieldset>
    </section>
  );
}
