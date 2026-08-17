'use client';

import { useMemo } from 'react';
import { RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DocumentContactChoiceList,
  type DocumentContact,
} from '@/components/documents/document-contact-choice-list';
import {
  DocumentPartyChoiceList,
} from '@/components/documents/document-party-choice-list';
import { SingleDateInput } from '@/components/ui/single-date-input';
import type { DocumentParty } from '@/lib/document-party';
import type {
  BatchItemConfiguration,
  MasterFieldCatalogue,
} from '@/types/document-generation-batch';
import type { CustomPlaceholderDefinition } from '@/types/placeholders';
import type {
  EditableBatchItem,
} from './batch-workspace-state';
import { BatchCustomFieldForm } from './batch-custom-field-form';
import { BatchSection } from './batch-section';
import { ApplyToOthersMenu, type ApplyScope } from './apply-to-others-menu';
import type { ItemCompleteness } from './batch-completeness';

export interface StandardDocumentConfigProps {
  item: EditableBatchItem;
  templateFields: CustomPlaceholderDefinition[];
  masterFields: MasterFieldCatalogue;
  effectiveMasterValues: Record<string, string>;
  directors: DocumentParty[];
  shareholders: DocumentParty[];
  /** Current contact result page. */
  contacts: DocumentContact[];
  /** Every contact seen so far, so existing selections stay resolvable. */
  contactsById?: Map<string, DocumentContact>;
  companyContacts: DocumentContact[];
  partyLoading?: boolean;
  partyError?: string | null;
  onPartyRetry?: () => void;
  onContactSearch?: (query: string) => void;
  contactsLoading?: boolean;
  onPatch: (patch: Partial<BatchItemConfiguration>) => void;
  disabled?: boolean;
  completeness?: ItemCompleteness;
  otherItemCount?: number;
  otherIncompleteCount?: number;
  onApplyToOthers?: (scope: ApplyScope, patch: Partial<BatchItemConfiguration>) => void;
}

function missingCount(completeness: ItemCompleteness | undefined, prefix: string): number {
  if (!completeness) return 0;
  return completeness.missing.filter((entry) => entry.id.startsWith(prefix)).length;
}

export function StandardDocumentConfig({
  item,
  templateFields,
  masterFields,
  effectiveMasterValues,
  directors,
  shareholders,
  contacts,
  contactsById,
  companyContacts,
  partyLoading = false,
  partyError = null,
  onPartyRetry,
  onContactSearch,
  contactsLoading = false,
  onPatch,
  disabled = false,
  completeness,
  otherItemCount = 0,
  otherIncompleteCount = 0,
  onApplyToOthers,
}: StandardDocumentConfigProps) {
  const configuration = item.configuration;

  const selectedContacts = useMemo<DocumentContact[]>(() => {
    const pool = new Map<string, DocumentContact>(contactsById ?? []);
    for (const contact of contacts) pool.set(contact.id, contact);
    return configuration.contactIds.map((id) => pool.get(id) ?? {
      id,
      fullName: 'Contact unavailable',
    });
  }, [configuration.contactIds, contacts, contactsById]);

  const titleMissing = configuration.title.trim().length === 0;
  const fieldMissing = missingCount(completeness, 'field:');
  const sharedMissing = missingCount(completeness, 'shared:');
  const requiredTemplateFields = templateFields.filter((field) => field.required).length;
  const requiredSharedFields = masterFields.fields.filter(
    (field) => field.requiredTemplateIds.includes(item.templateId),
  ).length;

  const applyMenu = (label: string, keys: Array<keyof BatchItemConfiguration>) =>
    onApplyToOthers ? (
      <ApplyToOthersMenu
        label={label}
        otherCount={otherItemCount}
        incompleteCount={otherIncompleteCount}
        disabled={disabled}
        onApply={(scope) => {
          const patch: Partial<BatchItemConfiguration> = {};
          for (const key of keys) {
            // Structured values are copied so target items never share a
            // reference with the source item's configuration.
            const value = configuration[key];
            (patch as Record<string, unknown>)[key] = Array.isArray(value)
              ? [...value]
              : value;
          }
          onApplyToOthers(scope, patch);
        }}
      />
    ) : null;

  return (
    <div className="space-y-3">
      <BatchSection
        title="Details"
        status={{
          complete: !titleMissing,
          label: titleMissing ? 'Title required' : 'Complete',
        }}
        collapsible={false}
      >
        <label className="block max-w-xl">
          <span className="text-sm font-medium text-text-primary">
            Document title
            <span className="ml-1 text-status-error" aria-hidden="true">*</span>
          </span>
          <input
            type="text"
            value={configuration.title}
            onChange={(event) => onPatch({ title: event.target.value })}
            disabled={disabled}
            aria-label="Document title"
            aria-invalid={titleMissing || undefined}
            aria-required="true"
            className={cn(
              'mt-1 min-h-11 w-full rounded-lg border bg-background-primary px-3 text-sm text-text-primary focus:border-oak-primary focus:outline-none focus:ring-2 focus:ring-oak-primary/30 lg:min-h-10',
              titleMissing ? 'border-status-error/60' : 'border-border-primary',
            )}
          />
          {titleMissing && (
            <span className="mt-1 block text-xs text-status-error">
              A title is required — it becomes the generated document name.
            </span>
          )}
        </label>
      </BatchSection>

      <BatchSection
        title="Parties"
        description="Officers and the contact addressed by this document."
        action={applyMenu('parties', [
          'selectedDirectorId',
          'selectedShareholderId',
          'selectedContactId',
        ])}
      >
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
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
      </BatchSection>

      <BatchSection
        title="Contacts"
        description="Recipients merged into contact placeholders."
        status={{
          complete: true,
          label: `${configuration.contactIds.length} selected`,
        }}
        action={applyMenu('contacts', ['contactIds'])}
      >
        <DocumentContactChoiceList
          contacts={contacts}
          selected={selectedContacts}
          onChange={(selected) => onPatch({
            contactIds: selected.map((contact) => contact.id),
          })}
          onSearch={onContactSearch}
          isLoading={contactsLoading}
          serverFiltered={Boolean(onContactSearch)}
        />
      </BatchSection>

      {masterFields.fields.length > 0 && (
        <BatchSection
          title="Shared values"
          description="Inherited from Shared setup unless this document overrides them."
          status={requiredSharedFields > 0
            ? {
                complete: sharedMissing === 0,
                label: sharedMissing === 0
                  ? 'Complete'
                  : `${sharedMissing} missing`,
              }
            : null}
        >
          <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {masterFields.fields.map((field) => {
              const hasOverride = Object.prototype.hasOwnProperty.call(
                configuration.masterOverrides,
                field.id,
              );
              const sharedValue = effectiveMasterValues[field.key] ?? '';
              const value = hasOverride
                ? configuration.masterOverrides[field.id]
                : sharedValue;
              const isRequired = field.requiredTemplateIds.includes(item.templateId);
              const missing = isRequired && !value.trim();
              const inputId = `item-shared-${field.id}`;
              return (
                <div
                  key={field.id}
                  className={cn(
                    'rounded-lg border bg-background-primary p-3',
                    missing ? 'border-status-error/50' : 'border-border-primary',
                  )}
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <label htmlFor={inputId} className="text-sm font-medium text-text-primary">
                      {field.label}
                    </label>
                    {isRequired ? (
                      <span className="-ml-1 text-status-error" aria-hidden="true">*</span>
                    ) : null}
                    <span
                      className={cn(
                        'rounded-full px-1.5 py-0.5 text-xs font-medium',
                        hasOverride
                          ? 'bg-oak-primary/10 text-oak-primary'
                          : 'bg-background-tertiary text-text-muted',
                      )}
                    >
                      {hasOverride ? 'Override' : 'Shared'}
                    </span>
                  </div>
                  {field.type === 'date' ? (
                    <SingleDateInput
                      value={value}
                      onChange={(next) => onPatch({
                        masterOverrides: {
                          ...configuration.masterOverrides,
                          [field.id]: next,
                        },
                      })}
                      disabled={disabled || !hasOverride}
                      ariaLabel={field.label}
                      error={missing ? 'Required' : undefined}
                      className="mt-2"
                    />
                  ) : (
                    <input
                      id={inputId}
                      type="text"
                      value={value}
                      readOnly={!hasOverride}
                      disabled={disabled}
                      aria-invalid={missing || undefined}
                      onChange={(event) => onPatch({
                        masterOverrides: {
                          ...configuration.masterOverrides,
                          [field.id]: event.target.value,
                        },
                      })}
                      className={cn(
                        'mt-2 min-h-11 w-full rounded-lg border px-3 text-sm focus:border-oak-primary focus:outline-none focus:ring-2 focus:ring-oak-primary/30 lg:min-h-10',
                        hasOverride
                          ? 'border-border-primary bg-background-primary text-text-primary'
                          : 'border-border-secondary bg-background-secondary text-text-secondary',
                        missing && 'border-status-error/60',
                      )}
                    />
                  )}
                  <div className="mt-2 flex items-center gap-3">
                    {hasOverride ? (
                      <button
                        type="button"
                        onClick={() => {
                          const next = { ...configuration.masterOverrides };
                          delete next[field.id];
                          onPatch({ masterOverrides: next });
                        }}
                        disabled={disabled}
                        className="inline-flex min-h-9 items-center gap-1 text-xs font-medium text-text-secondary transition-colors hover:text-text-primary"
                      >
                        <RotateCcw className="h-3 w-3" aria-hidden="true" />
                        Reset to shared
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onPatch({
                          masterOverrides: {
                            ...configuration.masterOverrides,
                            [field.id]: sharedValue,
                          },
                        })}
                        disabled={disabled}
                        className="inline-flex min-h-9 items-center text-xs font-medium text-oak-primary transition-colors hover:text-oak-dark"
                      >
                        Override for this document
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </BatchSection>
      )}

      <BatchSection
        title="Document fields"
        description="Values used only by this document."
        status={requiredTemplateFields > 0
          ? {
              complete: fieldMissing === 0,
              label: fieldMissing === 0 ? 'Complete' : `${fieldMissing} missing`,
            }
          : null}
      >
        <BatchCustomFieldForm
          item={item}
          fields={templateFields}
          onPatch={onPatch}
          disabled={disabled}
        />
      </BatchSection>

      <BatchSection
        title="Output options"
        defaultOpen={false}
        action={applyMenu('output options', ['useLetterhead'])}
      >
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
      </BatchSection>
    </div>
  );
}
