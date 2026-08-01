'use client';

import type { Company } from '../document-generation-wizard';
import type { ServiceVariantDto } from '@/services/service-catalog/types';
import type {
  ServiceAgreementItemDto,
  ServiceAgreementItemInput,
} from '@/services/service-agreement';
import { Button } from '@/components/ui/button';
import { ServiceFeeEditor } from './service-fee-editor';

interface ServiceItemEditorProps {
  item: ServiceAgreementItemInput;
  variant?: ServiceVariantDto;
  pinnedItem?: ServiceAgreementItemDto;
  entities: Company[];
  onChange: (item: ServiceAgreementItemInput) => void;
  onRemove: () => void;
  onCopy: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRefresh?: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}

export function ServiceItemEditor({
  item,
  variant: currentVariant,
  pinnedItem,
  entities,
  onChange,
  onRemove,
  onCopy,
  onMoveUp,
  onMoveDown,
  onRefresh,
  canMoveUp,
  canMoveDown,
}: ServiceItemEditorProps) {
  const variant = currentVariant ?? {
    id: item.variantId,
    familyId: '',
    code: '',
    name: pinnedItem?.variantNameSnapshot ?? 'Pinned service',
    description: null,
    serviceCadence: pinnedItem?.serviceCadence ?? 'CUSTOM',
    customCadenceLabel: pinnedItem?.customCadenceLabel ?? null,
    displayOrder: item.displayOrder,
    version: pinnedItem?.variantVersion ?? 1,
    isActive: false,
    sowPartial: {
      id: pinnedItem?.sowPartialId ?? '',
      name: '',
      displayName: null,
      version: pinnedItem?.partialVersion ?? 1,
      placeholders: pinnedItem?.partialPlaceholdersSnapshot ?? [],
    },
    feeTemplates: [],
  } satisfies ServiceVariantDto;
  const names = new Map(entities.map((entity) => [entity.id, entity.name]));
  const placeholders = (
    pinnedItem?.partialPlaceholdersSnapshot
    ?? (Array.isArray(variant.sowPartial.placeholders)
      ? variant.sowPartial.placeholders
      : [])
  ).filter((entry): entry is { key: string; required?: boolean; label?: string } =>
    Boolean(entry)
      && typeof entry === 'object'
      && typeof (entry as { key?: unknown }).key === 'string'
      && (entry as { key: string }).key.startsWith('service.fields.'));
  const isStale = Boolean(
    pinnedItem
    && (
      pinnedItem.staleVariantVersion
      || pinnedItem.stalePartialVersion
      || (currentVariant && (
        currentVariant.version !== pinnedItem.variantVersion
        || currentVariant.sowPartial.version !== pinnedItem.partialVersion
      ))
    ),
  );
  return (
    <article className="rounded-xl border border-border-primary bg-background-primary p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">
            {pinnedItem?.variantNameSnapshot ?? variant?.name}
          </h3>
          <p className="text-xs text-text-muted">
            Pinned from version {variant.version} · SOW version {variant.sowPartial.version}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-1">
          <Button variant="ghost" size="xs" onClick={onMoveUp} disabled={!canMoveUp}>
            Move up
          </Button>
          <Button variant="ghost" size="xs" onClick={onMoveDown} disabled={!canMoveDown}>
            Move down
          </Button>
          <Button variant="ghost" size="xs" onClick={onCopy}>
            Copy
          </Button>
          <Button variant="ghost" size="xs" onClick={onRemove}>
            Remove
          </Button>
        </div>
      </div>
      {isStale ? (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-status-warning/40 bg-status-warning/10 p-3 text-xs text-status-warning">
          <span>Newer catalog wording is available. Your saved wording remains pinned.</span>
          {onRefresh ? (
            <Button variant="secondary" size="xs" onClick={onRefresh}>
              Refresh wording
            </Button>
          ) : null}
        </div>
      ) : null}
      <fieldset className="mt-3">
        <legend className="text-xs font-medium text-text-secondary">Applies to</legend>
        <div className="mt-1 flex flex-wrap gap-3">
          {entities.map((entity) => (
            <label key={entity.id} className="flex min-h-11 items-center gap-2 text-xs">
              <input
                aria-label={`Applies to ${entity.name}`}
                type="checkbox"
                checked={item.entityIds.includes(entity.id)}
                onChange={(event) => {
                  if (
                    !event.target.checked
                    && item.feeLines.some((fee) => fee.companyId === entity.id)
                    && !window.confirm(
                      `Remove ${entity.name} and all of its fee lines from this service?`,
                    )
                  ) {
                    return;
                  }
                  const entityIds = event.target.checked
                    ? [...item.entityIds, entity.id]
                    : item.entityIds.filter((id) => id !== entity.id);
                  const feeLines = event.target.checked
                    ? [
                        ...item.feeLines,
                        ...(variant.feeTemplates.length > 0
                          ? variant.feeTemplates
                          : [{
                              id: 'manual',
                              description: variant.name,
                              defaultAmount: '0.00',
                              currency: 'SGD',
                              billingFrequency: 'ANNUALLY' as const,
                              customFrequencyLabel: null,
                              displayOrder: 0,
                            }]
                        ).map((template, index) => ({
                          clientKey: `${item.clientKey}-${entity.id}-${template.id}`,
                          companyId: entity.id,
                          description: template.description,
                          amount: template.defaultAmount ?? '0.00',
                          currency: template.currency,
                          billingFrequency: template.billingFrequency,
                          customFrequencyLabel: template.customFrequencyLabel,
                          billingStartDate: item.startDate,
                          displayOrder: index,
                        })),
                      ]
                    : item.feeLines.filter((fee) => fee.companyId !== entity.id);
                  onChange({ ...item, entityIds, feeLines });
                }}
              />
              {entity.name}
            </label>
          ))}
        </div>
      </fieldset>
      {placeholders.length > 0 ? (
        <fieldset className="mt-3">
          <legend className="text-xs font-medium text-text-secondary">Service details</legend>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {placeholders.map((placeholder) => {
              const key = placeholder.key.replace(/^service\.fields\./, '');
              const label = placeholder.label
                ?? key.replaceAll('_', ' ').replace(/\b\w/g, (value) => value.toUpperCase());
              return (
                <label key={placeholder.key} className="text-xs text-text-secondary">
                  {label}{placeholder.required ? ' *' : ''}
                  <input
                    required={placeholder.required}
                    value={item.fieldValues[key] ?? ''}
                    onChange={(event) => onChange({
                      ...item,
                      fieldValues: {
                        ...item.fieldValues,
                        [key]: event.target.value,
                      },
                    })}
                    className="mt-1 h-11 w-full rounded border border-border-primary bg-background-primary px-2 text-sm sm:h-8"
                  />
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : null}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-text-secondary">
          Start date
          <input
            type="date"
            value={item.startDate}
            onChange={(event) => onChange({ ...item, startDate: event.target.value })}
            className="mt-1 h-11 w-full rounded border border-border-primary bg-background-primary px-2 sm:h-8"
          />
        </label>
        <label className="text-xs text-text-secondary">
          End date
          <input
            type="date"
            value={item.endDate ?? ''}
            onChange={(event) => onChange({ ...item, endDate: event.target.value || null })}
            className="mt-1 h-11 w-full rounded border border-border-primary bg-background-primary px-2 sm:h-8"
          />
        </label>
      </div>
      <div className="mt-4">
        <ServiceFeeEditor
          fees={item.feeLines}
          entityIds={item.entityIds}
          companyNames={names}
          startDate={item.startDate}
          onChange={(feeLines) => onChange({ ...item, feeLines })}
        />
      </div>
    </article>
  );
}
