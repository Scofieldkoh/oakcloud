'use client';

import { cn } from '@/lib/utils';
import type { Company, DocumentContact } from '@/types/document-generation';
import type {
  BatchItemConfiguration,
  MasterFieldCatalogue,
  ServiceAgreementWorkspaceState,
} from '@/types/document-generation-batch';
import type { CustomPlaceholderDefinition } from '@/types/placeholders';
import { SingleDateInput } from '@/components/ui/single-date-input';
import { ServiceAgreementSetup } from '@/components/documents/service-agreement/service-agreement-setup';
import { ServiceSelectionStep } from '@/components/documents/service-agreement/service-selection-step';
import type {
  EditableBatchItem,
} from './batch-workspace-state';
import { BatchCustomFieldForm } from './batch-custom-field-form';
import { BatchSection } from './batch-section';
import type { ItemCompleteness } from './batch-completeness';

export interface ServiceAgreementConfigProps {
  item: EditableBatchItem;
  primaryCompany: Company | null;
  companies: Company[];
  contacts: DocumentContact[];
  masterFields: MasterFieldCatalogue;
  effectiveMasterValues: Record<string, string>;
  templateFields?: CustomPlaceholderDefinition[];
  onPatch: (patch: Partial<BatchItemConfiguration>) => void;
  disabled?: boolean;
  completeness?: ItemCompleteness;
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
  completeness,
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

  const titleMissing = item.configuration.title.trim().length === 0;
  const fieldMissing = completeness
    ? completeness.missing.filter((entry) => entry.id.startsWith('field:')).length
    : 0;
  const requiredTemplateFields = templateFields.filter((field) => field.required).length;
  const partiesComplete = Boolean(workspace.authorizedContactId)
    && workspace.entityIds.length > 0;
  const servicesComplete = workspace.items.length > 0;

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
            value={item.configuration.title}
            onChange={(event) => onPatch({ title: event.target.value })}
            disabled={disabled}
            aria-label="Document title"
            aria-required="true"
            aria-invalid={titleMissing || undefined}
            className={cn(
              'mt-1 min-h-11 w-full rounded-lg border bg-background-primary px-3 text-sm text-text-primary focus:border-oak-primary focus:outline-none focus:ring-2 focus:ring-oak-primary/30 lg:min-h-10',
              titleMissing ? 'border-status-error/60' : 'border-border-primary',
            )}
          />
        </label>
      </BatchSection>

      <BatchSection
        title="Entities and representative"
        description="Every entity covered by this agreement, plus who signs for them."
        status={{
          complete: partiesComplete,
          label: partiesComplete
            ? 'Complete'
            : !workspace.authorizedContactId
              ? 'Representative required'
              : 'Entity required',
        }}
      >
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
      </BatchSection>

      <BatchSection
        title="Services and fees"
        status={{
          complete: servicesComplete,
          label: servicesComplete
            ? `${workspace.items.length} service${workspace.items.length === 1 ? '' : 's'}`
            : 'At least one service required',
        }}
      >
        <ServiceSelectionStep
          entities={entities}
          items={workspace.items}
          onChange={(items) => updateWorkspace({ items })}
        />
      </BatchSection>

      <BatchSection title="Agreement details">
        <div className="grid max-w-xl gap-3 sm:grid-cols-2">
          <div className="block">
            <span className="text-sm font-medium text-text-primary">Agreement date</span>
            <SingleDateInput
              value={workspace.agreementDate}
              onChange={(next) => updateWorkspace({ agreementDate: next })}
              disabled={disabled}
              ariaLabel="Agreement date"
              className="mt-1"
            />
          </div>
          <div className="block">
            <span className="text-sm font-medium text-text-primary">Effective date</span>
            <SingleDateInput
              value={workspace.effectiveDate ?? ''}
              onChange={(next) => updateWorkspace({ effectiveDate: next || null })}
              disabled={disabled}
              ariaLabel="Effective date"
              className="mt-1"
            />
          </div>
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
              className="mt-1 min-h-11 w-full rounded-lg border border-border-primary bg-background-primary px-3 text-sm text-text-primary focus:border-oak-primary focus:outline-none focus:ring-2 focus:ring-oak-primary/30 lg:min-h-10"
            />
          </label>
        </div>
      </BatchSection>

      <BatchSection
        title="Document fields"
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

      {masterFields.fields.length > 0 && (
        <BatchSection
          title="Shared values"
          description="Effective shared values for this document."
          defaultOpen={false}
        >
          <dl className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {masterFields.fields.map((field) => (
              <div
                key={field.id}
                className="rounded-lg border border-border-primary bg-background-primary p-3"
              >
                <dt className="text-xs font-medium text-text-secondary">{field.label}</dt>
                <dd className="mt-1 text-sm text-text-primary">
                  {effectiveMasterValues[field.key] || '—'}
                </dd>
              </div>
            ))}
          </dl>
        </BatchSection>
      )}
    </div>
  );
}
