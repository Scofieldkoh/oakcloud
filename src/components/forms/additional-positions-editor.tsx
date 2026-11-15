'use client';

import { Plus, Trash2 } from 'lucide-react';
import { SearchableSelect, type SelectOption } from '@/components/ui/searchable-select';
import {
  MAX_ADDITIONAL_POSITIONS,
  readAdditionalPositions,
  type AdditionalPosition,
} from '@/lib/forms/additional-positions';

interface Props {
  value: unknown;
  onChange: (rows: AdditionalPosition[]) => void;
  onBlur?: () => void;
  options: SelectOption[];
  error?: string;
  disabled?: boolean;
  idPrefix: string;
}

/** Positions 4 onward are repeatable structured fields, not free-text remarks. */
export function AdditionalPositionsEditor({
  value, onChange, onBlur, options, error, disabled = false, idPrefix,
}: Props) {
  const rows = readAdditionalPositions(value);
  const patchRow = (index: number, patch: Partial<AdditionalPosition>) =>
    onChange(rows.map((row, i) => i === index ? { ...row, ...patch } : row));

  return (
    <div className="space-y-3">
      {rows.length > 0 && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {rows.map((row, index) => (
            <div key={index} className="rounded-lg border border-border-primary/70 bg-background-primary p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-text-secondary">Position {index + 4}</span>
                <button type="button"
                  className="inline-flex items-center gap-1 text-xs text-status-error disabled:opacity-50"
                  aria-label={`Remove position ${index + 4}`}
                  onClick={() => onChange(rows.filter((_, i) => i !== index))}
                  disabled={disabled}>
                  <Trash2 className="h-3.5 w-3.5" /> Remove
                </button>
              </div>
              <SearchableSelect
                options={options}
                value={row.role}
                onChange={(role) => patchRow(index, { role })}
                onBlur={onBlur}
                disabled={disabled}
                allowCustomValue
                ariaLabel={`Position ${index + 4} role`}
                placeholder="Select position"
                clearable={false}
                showKeyboardHints={false}
                containerClassName="h-10"
              />
              <label htmlFor={`${idPrefix}-date-${index}`}
                className="mt-2 mb-1 block text-xs font-medium text-text-secondary">
                Appointment date
              </label>
              <input id={`${idPrefix}-date-${index}`} aria-label={`Appointment date for position ${index + 4}`}
                type="date" value={row.date} disabled={disabled}
                onChange={(e) => patchRow(index, { date: e.target.value })}
                onBlur={onBlur}
                className="w-full rounded-lg border border-[#D8E3DF] bg-[#F4F7F6] px-3 py-2 text-sm text-text-primary focus:border-oak-primary focus:outline-none focus:ring-2 focus:ring-oak-primary/20"
              />
            </div>
          ))}
        </div>
      )}
      <button type="button" disabled={disabled || rows.length >= MAX_ADDITIONAL_POSITIONS}
        onClick={() => onChange([...rows, { role: '', date: '' }])}
        className="inline-flex items-center gap-1.5 rounded-md border border-border-primary bg-background-primary px-3 py-2 text-xs font-medium text-oak-primary hover:bg-background-secondary disabled:opacity-50">
        <Plus className="h-3.5 w-3.5" /> Add position
      </button>
      {error && <p role="alert" className="text-xs text-status-error">{error}</p>}
    </div>
  );
}
