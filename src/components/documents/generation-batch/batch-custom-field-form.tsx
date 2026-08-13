'use client';

import { cn } from '@/lib/utils';
import type { CustomPlaceholderDefinition } from '@/types/placeholders';
import type { EditableBatchItem } from './batch-workspace-state';

export interface BatchCustomFieldFormProps {
  item: EditableBatchItem;
  fields: CustomPlaceholderDefinition[];
  onPatch: (patch: Partial<EditableBatchItem['configuration']>) => void;
  disabled?: boolean;
}

export function BatchCustomFieldForm({
  item,
  fields,
  onPatch,
  disabled = false,
}: BatchCustomFieldFormProps) {
  const itemValues = item.configuration.itemValues;
  const fieldKeys = new Set(fields.map((field) => field.key));
  const extraKeys = Object.keys(itemValues).filter((key) => !fieldKeys.has(key));
  const visibleFields = [
    ...fields,
    ...extraKeys.map((key) => ({
      id: key,
      key,
      label: key,
      type: 'text' as const,
      required: false,
    })),
  ];
  if (visibleFields.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border-primary p-3 text-sm text-text-muted">
        This document has no item-specific custom fields.
      </p>
    );
  }

  const requiredFields = visibleFields.filter((field) => field.required);
  const missingRequired = requiredFields.filter(
    (field) => !(itemValues[field.key] ?? '').trim(),
  );

  return (
    <div className="space-y-3">
      {requiredFields.length > 0 ? (
        <p
          className={cn(
            'text-xs font-medium',
            missingRequired.length > 0 ? 'text-status-warning' : 'text-status-success',
          )}
          aria-live="polite"
        >
          {missingRequired.length === 0
            ? 'All required fields are filled.'
            : `${missingRequired.length} of ${requiredFields.length} required field${requiredFields.length === 1 ? '' : 's'} still need${missingRequired.length === 1 ? 's' : ''} a value.`}
        </p>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        {visibleFields.map((field) => {
          const value = itemValues[field.key] ?? '';
          const missing = field.required && !value.trim();
          return (
            <label key={field.key} className="block">
              <span className="text-sm font-medium text-text-primary">{field.label}</span>
              {field.required && <span className="ml-1 text-status-error" aria-hidden="true">*</span>}
              <input
                type={field.type === 'date' ? 'date' : 'text'}
                value={value}
                onChange={(event) => onPatch({
                  itemValues: { ...itemValues, [field.key]: event.target.value },
                })}
                disabled={disabled}
                aria-label={field.label}
                aria-required={field.required || undefined}
                className={cn(
                  'mt-1 min-h-11 w-full rounded-lg border bg-background-primary px-3 text-sm text-text-primary focus:border-oak-primary focus:outline-none focus:ring-2 focus:ring-oak-primary/30 lg:min-h-9',
                  missing ? 'border-status-error/50' : 'border-border-primary',
                )}
              />
              {missing ? (
                <span className="mt-1 block text-xs text-status-error">Required</span>
              ) : null}
            </label>
          );
        })}
      </div>
    </div>
  );
}
