'use client';

import {
  DocumentContactChoiceList,
  type DocumentContact,
} from '@/components/documents/document-contact-choice-list';
import {
  DocumentPartyChoiceList,
} from '@/components/documents/document-party-choice-list';
import type { DocumentParty } from '@/lib/document-party';
import type {
  MasterFieldCatalogue,
} from '@/types/document-generation-batch';
import type { CustomPlaceholderDefinition } from '@/types/placeholders';
import type {
  EditableBatchItem,
} from './batch-workspace-state';
import { BatchCustomFieldForm } from './batch-custom-field-form';

export interface StandardDocumentConfigProps {
  item: EditableBatchItem;
  templateFields: CustomPlaceholderDefinition[];
  masterFields: MasterFieldCatalogue;
  effectiveMasterValues: Record<string, string>;
  directors: DocumentParty[];
  shareholders: DocumentParty[];
  contacts: DocumentContact[];
  companyContacts: DocumentContact[];
  partyLoading?: boolean;
  partyError?: string | null;
  onPartyRetry?: () => void;
  onPatch: (patch: Partial<EditableBatchItem['configuration']>) => void;
  disabled?: boolean;
}

export function StandardDocumentConfig({
  item,
  templateFields,
  masterFields,
  effectiveMasterValues,
  directors,
  shareholders,
  contacts,
  companyContacts,
  partyLoading = false,
  partyError = null,
  onPartyRetry,
  onPatch,
  disabled = false,
}: StandardDocumentConfigProps) {
  const configuration = item.configuration;
  return (
    <div className="space-y-5">
      <label className="block max-w-xl">
        <span className="text-sm font-medium text-text-primary">Document title</span>
        <input
          type="text"
          value={configuration.title}
          onChange={(event) => onPatch({ title: event.target.value })}
          disabled={disabled}
          aria-label="Document title"
          className="mt-1 min-h-11 w-full rounded-lg border border-border-primary bg-background-primary px-3 text-sm text-text-primary focus:border-oak-primary focus:outline-none focus:ring-2 focus:ring-oak-primary/30 lg:min-h-9"
        />
      </label>

      <section aria-labelledby="party-options-heading">
        <h2 id="party-options-heading" className="text-sm font-medium text-text-primary">Parties</h2>
        <div className="mt-2 grid gap-4 lg:grid-cols-2">
          <DocumentPartyChoiceList
            id="selected-director"
            label="Director"
            options={directors}
            value={configuration.selectedDirectorId ?? ''}
            onChange={(value) => onPatch({ selectedDirectorId: value || null })}
            isLoading={partyLoading}
            error={partyError}
            onRetry={onPartyRetry}
          />
          <DocumentPartyChoiceList
            id="selected-shareholder"
            label="Shareholder"
            options={shareholders}
            value={configuration.selectedShareholderId ?? ''}
            onChange={(value) => onPatch({ selectedShareholderId: value || null })}
            isLoading={partyLoading}
            error={partyError}
            onRetry={onPartyRetry}
          />
          <DocumentPartyChoiceList
            id="selected-contact"
            label="Company contact"
            options={companyContacts.map((contact) => ({
              id: contact.id,
              contactId: contact.id,
              name: contact.fullName,
              detail: contact.designation ?? null,
              email: contact.email ?? null,
              phone: contact.phone ?? null,
              address: { letter: null, full: null },
              contactType: 'INDIVIDUAL',
            }))}
            value={configuration.selectedContactId ?? ''}
            onChange={(value) => onPatch({ selectedContactId: value || null })}
            isLoading={partyLoading}
            error={partyError}
            onRetry={onPartyRetry}
          />
        </div>
      </section>

      <section aria-labelledby="contacts-heading">
        <h2 id="contacts-heading" className="text-sm font-medium text-text-primary">Contacts</h2>
        <div className="mt-2">
          <DocumentContactChoiceList
            contacts={contacts}
            selected={contacts.filter((contact) =>
              configuration.contactIds.includes(contact.id))}
            onChange={(selected) => onPatch({
              contactIds: selected.map((contact) => contact.id),
            })}
          />
        </div>
      </section>

      <section aria-labelledby="shared-values-heading">
        <h2 id="shared-values-heading" className="text-sm font-medium text-text-primary">
          Shared values
        </h2>
        <div className="mt-2 grid gap-3 lg:grid-cols-2">
          {masterFields.fields.map((field) => {
            const hasOverride = Object.prototype.hasOwnProperty.call(
              configuration.masterOverrides,
              field.id,
            );
            const value = hasOverride
              ? configuration.masterOverrides[field.id]
              : effectiveMasterValues[field.key] ?? '';
            return (
              <label key={field.id} className="block rounded-lg border border-border-primary bg-background-primary p-3">
                <span className="text-sm font-medium text-text-primary">{field.label}</span>
                <span className="ml-2 text-xs text-text-muted">
                  {hasOverride ? 'Override' : 'Using shared value'}
                </span>
                <input
                  type={field.type === 'date' ? 'date' : 'text'}
                  value={value}
                  disabled={disabled && !hasOverride}
                  onChange={(event) => {
                    const next = { ...configuration.masterOverrides };
                    if (!hasOverride) next[field.id] = event.target.value;
                    else next[field.id] = event.target.value;
                    onPatch({ masterOverrides: next });
                  }}
                  aria-label={field.label}
                  className="mt-2 min-h-11 w-full rounded-lg border border-border-primary bg-background-primary px-3 text-sm text-text-primary focus:border-oak-primary focus:outline-none focus:ring-2 focus:ring-oak-primary/30 lg:min-h-9"
                />
                <button
                  type="button"
                  onClick={() => {
                    const next = { ...configuration.masterOverrides };
                    if (hasOverride) delete next[field.id];
                    else next[field.id] = effectiveMasterValues[field.key] ?? '';
                    onPatch({ masterOverrides: next });
                  }}
                  disabled={disabled}
                  aria-label={`${hasOverride ? 'Clear' : 'Override'} ${field.label}`}
                  className="mt-2 inline-flex min-h-9 items-center rounded-lg text-xs font-medium text-oak-primary transition-colors hover:text-oak-dark"
                >
                  {hasOverride ? 'Clear override' : 'Set override'}
                </button>
              </label>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="custom-fields-heading">
        <h2 id="custom-fields-heading" className="text-sm font-medium text-text-primary">
          Document fields
        </h2>
        <div className="mt-2">
          <BatchCustomFieldForm
            item={item}
            fields={templateFields}
            onPatch={onPatch}
            disabled={disabled}
          />
        </div>
      </section>

      <label className="flex min-h-11 items-center gap-2 text-sm text-text-primary">
        <input
          type="checkbox"
          checked={configuration.useLetterhead}
          onChange={(event) => onPatch({ useLetterhead: event.target.checked })}
          disabled={disabled}
          className="h-4 w-4 rounded accent-oak-primary"
        />
        Use company letterhead
      </label>
    </div>
  );
}
