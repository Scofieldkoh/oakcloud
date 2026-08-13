'use client';

import { cn } from '@/lib/utils';
import type {
  MasterFieldCatalogue,
} from '@/types/document-generation-batch';
import type {
  Company,
} from '@/types/document-generation';

export interface BatchSharedSetupProps {
  companies: Company[];
  primaryCompanyId: string | null;
  masterFields: MasterFieldCatalogue;
  masterFieldValues: Record<string, string>;
  onCompanyChange: (companyId: string | null) => void;
  onMasterValueChange: (fieldId: string, value: string) => void;
  disabled?: boolean;
  overriddenCountByField?: Record<string, number>;
  onSelectOverridden?: (fieldId: string) => void;
}

export function BatchSharedSetup({
  companies,
  primaryCompanyId,
  masterFields,
  masterFieldValues,
  onCompanyChange,
  onMasterValueChange,
  disabled = false,
  overriddenCountByField = {},
  onSelectOverridden,
}: BatchSharedSetupProps) {
  return (
    <div className="space-y-5">
      <section aria-labelledby="primary-company-heading">
        <h2 id="primary-company-heading" className="text-sm font-medium text-text-primary">
          Primary company
        </h2>
        <p className="mt-1 text-xs text-text-muted">
          One company applies to every document in this batch. Service Agreements may add related entities later.
        </p>
        <select
          aria-label="Primary company"
          value={primaryCompanyId ?? ''}
          onChange={(event) => onCompanyChange(event.target.value || null)}
          disabled={disabled}
          className="mt-3 min-h-11 w-full max-w-xl rounded-lg border border-border-primary bg-background-primary px-3 text-sm text-text-primary focus:border-oak-primary focus:outline-none focus:ring-2 focus:ring-oak-primary/30 lg:min-h-9"
        >
          <option value="">Select a company</option>
          {companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.name} ({company.uen})
            </option>
          ))}
        </select>
      </section>

      <section aria-labelledby="shared-fields-heading">
        <h2 id="shared-fields-heading" className="text-sm font-medium text-text-primary">
          Shared fields
        </h2>
        <p className="mt-1 text-xs text-text-muted">
          Values used by more than one document. Precedence: Document override → Shared value → Template default.
        </p>
        {masterFields.fields.length === 0 && (
          <p className="mt-3 rounded-lg border border-dashed border-border-primary p-4 text-sm text-text-muted">
            No shared custom fields were found across the selected templates.
          </p>
        )}
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {masterFields.fields.map((field) => {
            const overrideCount = overriddenCountByField[field.id] ?? 0;
            const isRequired = field.requiredTemplateIds.length > 0;
            const value = masterFieldValues[field.id] ?? '';
            const missing = isRequired && !value.trim();
            return (
              <label key={field.id} className={cn(
                'block rounded-lg border bg-background-primary p-3',
                missing ? 'border-status-error/50' : 'border-border-primary',
              )}>
                <span className="text-sm font-medium text-text-primary">{field.label}</span>
                {isRequired ? <span className="ml-1 text-status-error" aria-hidden="true">*</span> : null}
                <span className="ml-2 text-xs text-text-muted">
                  {field.type} · used by {field.templateIds.length} documents
                </span>
                <input
                  type={field.type === 'date' ? 'date' : 'text'}
                  value={value}
                  onChange={(event) => onMasterValueChange(field.id, event.target.value)}
                  disabled={disabled}
                  aria-label={field.label}
                  aria-required={isRequired || undefined}
                  className="mt-2 min-h-11 w-full rounded-lg border border-border-primary bg-background-primary px-3 text-sm text-text-primary focus:border-oak-primary focus:outline-none focus:ring-2 focus:ring-oak-primary/30 lg:min-h-9"
                />
                {isRequired ? (
                  <p className={cn('mt-1 text-xs', missing ? 'text-status-error' : 'text-text-muted')}>
                    Required by {field.requiredTemplateIds.length} document
                    {field.requiredTemplateIds.length === 1 ? '' : 's'}
                  </p>
                ) : null}
                {overrideCount > 0 && onSelectOverridden && (
                  <button
                    type="button"
                    onClick={() => onSelectOverridden(field.id)}
                    className="mt-2 inline-flex min-h-9 items-center rounded-lg text-xs font-medium text-oak-primary transition-colors hover:text-oak-dark"
                  >
                    {overrideCount} document{overrideCount === 1 ? '' : 's'} override this value
                  </button>
                )}
              </label>
            );
          })}
        </div>
      </section>

      {masterFields.conflicts.length > 0 && (
        <section aria-label="Field type conflicts" className="rounded-lg border border-status-warning/30 bg-status-warning/5 p-3">
          <h2 className="text-sm font-medium text-status-warning">Type conflicts</h2>
          {masterFields.conflicts.map((conflict) => (
            <p key={conflict.key} className="mt-1 text-sm text-text-secondary">
              “{conflict.key}” appears with incompatible types ({conflict.types.join(', ')}). Those fields stay document-specific.
            </p>
          ))}
        </section>
      )}
    </div>
  );
}
