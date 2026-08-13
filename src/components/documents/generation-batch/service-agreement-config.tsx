'use client';

import type { Company, DocumentContact } from '@/types/document-generation';
import type {
  MasterFieldCatalogue,
  ServiceAgreementWorkspaceState,
} from '@/types/document-generation-batch';
import type { CustomPlaceholderDefinition } from '@/types/placeholders';
import { ServiceAgreementSetup } from '@/components/documents/service-agreement/service-agreement-setup';
import { ServiceSelectionStep } from '@/components/documents/service-agreement/service-selection-step';
import type {
  EditableBatchItem,
} from './batch-workspace-state';
import { BatchCustomFieldForm } from './batch-custom-field-form';

export interface ServiceAgreementConfigProps {
  item: EditableBatchItem;
  primaryCompany: Company | null;
  companies: Company[];
  contacts: DocumentContact[];
  masterFields: MasterFieldCatalogue;
  effectiveMasterValues: Record<string, string>;
  templateFields?: CustomPlaceholderDefinition[];
  onPatch: (patch: Partial<EditableBatchItem['configuration']>) => void;
  disabled?: boolean;
}

function emptyWorkspace(primaryCompanyId: string | null): ServiceAgreementWorkspaceState {
  return {
    authorizedContactId: null,
    entityIds: primaryCompanyId ? [primaryCompanyId] : [],
    agreementDate: new Date().toISOString().slice(0, 10),
    effectiveDate: null,
    termMonths: 12,
    items: [],
  };
}

export function ServiceAgreementConfig({
  item,
  primaryCompany,
  companies,
  contacts,
  masterFields,
  effectiveMasterValues,
  templateFields = [],
  onPatch,
  disabled = false,
}: ServiceAgreementConfigProps) {
  const workspace = item.configuration.serviceAgreement
    ?? emptyWorkspace(primaryCompany?.id ?? null);
  const updateWorkspace = (patch: Partial<ServiceAgreementWorkspaceState>) => {
    onPatch({
      serviceAgreement: { ...workspace, ...patch },
    });
  };
  const entities = companies.filter((company) =>
    workspace.entityIds.includes(company.id));

  return (
    <div className="space-y-5">
      <label className="block max-w-xl">
        <span className="text-sm font-medium text-text-primary">Document title</span>
        <input
          type="text"
          value={item.configuration.title}
          onChange={(event) => onPatch({ title: event.target.value })}
          disabled={disabled}
          aria-label="Document title"
          className="mt-1 min-h-11 w-full rounded-lg border border-border-primary bg-background-primary px-3 text-sm text-text-primary focus:border-oak-primary focus:outline-none focus:ring-2 focus:ring-oak-primary/30 lg:min-h-9"
        />
      </label>

      <section aria-labelledby="related-entities-heading">
        <h2 id="related-entities-heading" className="text-sm font-medium text-text-primary">Related entities</h2>
        <h3 className="mt-1 text-xs font-medium text-text-secondary">Representative</h3>
        <div className="mt-2">
          <ServiceAgreementSetup
            primaryCompany={primaryCompany}
            companies={companies}
            contacts={contacts}
            entityIds={workspace.entityIds}
            authorizedContactId={workspace.authorizedContactId ?? ''}
            onEntityIdsChange={(entityIds) => updateWorkspace({ entityIds })}
            onAuthorizedContactIdChange={(authorizedContactId) =>
              updateWorkspace({ authorizedContactId: authorizedContactId || null })}
          />
        </div>
      </section>

      <section aria-labelledby="services-fees-heading">
        <h2 id="services-fees-heading" className="text-sm font-medium text-text-primary">Services and fees</h2>
        <div className="mt-2">
          <ServiceSelectionStep
            entities={entities}
            items={workspace.items}
            onChange={(items) => updateWorkspace({ items })}
          />
        </div>
      </section>

      <section aria-labelledby="agreement-details-heading">
        <h2 id="agreement-details-heading" className="text-sm font-medium text-text-primary">Agreement details</h2>
        <div className="mt-2 grid max-w-xl gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-text-primary">Agreement date</span>
            <input
              type="date"
              value={workspace.agreementDate}
              onChange={(event) => updateWorkspace({ agreementDate: event.target.value })}
              disabled={disabled}
              aria-label="Agreement date"
              className="mt-1 min-h-11 w-full rounded-lg border border-border-primary bg-background-primary px-3 text-sm text-text-primary focus:border-oak-primary focus:outline-none focus:ring-2 focus:ring-oak-primary/30 lg:min-h-9"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-text-primary">Effective date</span>
            <input
              type="date"
              value={workspace.effectiveDate ?? ''}
              onChange={(event) => updateWorkspace({ effectiveDate: event.target.value || null })}
              disabled={disabled}
              aria-label="Effective date"
              className="mt-1 min-h-11 w-full rounded-lg border border-border-primary bg-background-primary px-3 text-sm text-text-primary focus:border-oak-primary focus:outline-none focus:ring-2 focus:ring-oak-primary/30 lg:min-h-9"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-text-primary">Term (months)</span>
            <input
              type="number"
              min={1}
              value={workspace.termMonths}
              onChange={(event) => updateWorkspace({
                termMonths: Math.max(1, Number(event.target.value) || 1),
              })}
              disabled={disabled}
              aria-label="Term months"
              className="mt-1 min-h-11 w-full rounded-lg border border-border-primary bg-background-primary px-3 text-sm text-text-primary focus:border-oak-primary focus:outline-none focus:ring-2 focus:ring-oak-primary/30 lg:min-h-9"
            />
          </label>
        </div>
      </section>

      <section aria-labelledby="sa-custom-fields-heading">
        <h2 id="sa-custom-fields-heading" className="text-sm font-medium text-text-primary">Custom fields</h2>
        <div className="mt-2">
          <BatchCustomFieldForm
            item={item}
            fields={templateFields}
            onPatch={onPatch}
            disabled={disabled}
          />
        </div>
      </section>

      {masterFields.fields.length > 0 && (
        <section aria-labelledby="sa-shared-heading">
          <h2 id="sa-shared-heading" className="text-sm font-medium text-text-primary">Shared values</h2>
          <p className="mt-1 text-xs text-text-muted">Effective shared values for this document:</p>
          <dl className="mt-2 grid gap-2 sm:grid-cols-2">
            {masterFields.fields.map((field) => (
              <div key={field.id} className="rounded-lg border border-border-primary bg-background-primary p-3">
                <dt className="text-xs font-medium text-text-secondary">{field.label}</dt>
                <dd className="mt-1 text-sm text-text-primary">
                  {effectiveMasterValues[field.key] || '—'}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </div>
  );
}
