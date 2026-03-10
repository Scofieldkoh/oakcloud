'use client';

import { FormInput } from '@/components/ui/form-input';
import type { BuilderField, ConditionConfig } from './builder-utils';

export function FieldConditionTab({
  field,
  conditionalCandidates,
  onChange,
}: {
  field: BuilderField;
  conditionalCandidates: BuilderField[];
  onChange: (next: BuilderField) => void;
}) {
  return (
    <>
      <div>
        <label className="mb-1.5 block text-xs font-medium text-text-secondary">Conditional field</label>
        <select
          value={field.condition?.fieldKey || ''}
          onChange={(e) => {
            const fieldKey = e.target.value;
            if (!fieldKey) {
              onChange({ ...field, condition: null });
              return;
            }
            onChange({
              ...field,
              condition: {
                fieldKey,
                operator: field.condition?.operator || 'equals',
                value: field.condition?.value ?? '',
              },
            });
          }}
          className="w-full rounded-lg border border-border-primary bg-background-primary px-3 py-2 text-sm text-text-primary"
        >
          <option value="">Select conditional field</option>
          {conditionalCandidates.map((candidate) => (
            <option key={candidate.clientId} value={candidate.key}>
              {candidate.label || candidate.key}
            </option>
          ))}
        </select>
      </div>

      {field.condition && (
        <>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-text-secondary">Operator</label>
            <select
              value={field.condition.operator}
              onChange={(e) => onChange({
                ...field,
                condition: {
                  ...field.condition!,
                  operator: e.target.value as ConditionConfig['operator'],
                },
              })}
              className="w-full rounded-lg border border-border-primary bg-background-primary px-3 py-2 text-sm text-text-primary"
            >
              <option value="equals">Equals</option>
              <option value="not_equals">Not equals</option>
              <option value="contains">Contains</option>
              <option value="is_empty">Is empty</option>
              <option value="not_empty">Is not empty</option>
            </select>
          </div>

          {!['is_empty', 'not_empty'].includes(field.condition.operator) && (
            <FormInput
              label="Conditional value"
              value={String(field.condition.value ?? '')}
              onChange={(e) => onChange({
                ...field,
                condition: {
                  ...field.condition!,
                  value: e.target.value,
                },
              })}
            />
          )}
        </>
      )}
    </>
  );
}
