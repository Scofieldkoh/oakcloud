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
  /** Existing ACRA appointments are immutable; only their removal is requested. */
  baselineValue?: unknown;
  lockExisting?: boolean;
}

/** Positions 4 onward use a structured list. Prefilled rows are read-only. */
export function AdditionalPositionsEditor({
  value, onChange, onBlur, options, error, disabled = false, idPrefix,
  baselineValue, lockExisting = false,
}: Props) {
  const rows = readAdditionalPositions(value);
  const lockedCount = lockExisting ? readAdditionalPositions(baselineValue).length : 0;
  const patchRow = (index: number, patch: Partial<AdditionalPosition>) =>
    onChange(rows.map((row, i) => i === index ? { ...row, ...patch } : row));

  return (
    <div className="space-y-3">
      {rows.length > 0 && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {rows.map((row, index) => {
            const recorded = index < lockedCount;
            return (
              <div key={index} className="rounded-lg border border-border-primary/70 bg-background-primary p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-text-secondary">
                    Position {index + 4}{recorded ? ' · Recorded' : ''}
                  </span>
                  {!recorded && (
                    <button type="button"
                      className="inline-flex items-center gap-1 text-xs text-status-error disabled:opacity-50"
                      aria-label={`Remove proposed position ${index + 4}`}
                      onClick={() => onChange(rows.filter((_, i) => i !== index))}
                      disabled={disabled}>
                      <Trash2 className="h-3.5 w-3.5" /> Remove
                    </button>
                  )}
                </div>
                {recorded ? (
                  <div aria-label={`Position ${index + 4} role`}
                    className="rounded-lg border border-border-primary bg-background-secondary px-3 py-2 text-sm text-text-primary">
                    {row.role}
                  </div>
                ) : (
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
                )}
                <label htmlFor={`${idPrefix}-date-${index}`}
                  className="mt-2 mb-1 block text-xs font-medium text-text-secondary">
                  Appointment date
                </label>
                <input id={`${idPrefix}-date-${index}`} aria-label={`Appointment date for position ${index + 4}`}
                  type="date" value={row.date} disabled={disabled || recorded}
                  onChange={(e) => patchRow(index, { date: e.target.value })}
                  onBlur={onBlur}
                  className="w-full rounded-lg border border-[#D8E3DF] bg-[#F4F7F6] px-3 py-2 text-sm text-text-primary focus:border-oak-primary focus:outline-none focus:ring-2 focus:ring-oak-primary/20"
                />
                {recorded && (
                  <label className="mt-2 flex items-center gap-2 text-xs text-text-secondary">
                    <input type="checkbox" checked={row.toRemove === true} disabled={disabled}
                      aria-label={`To remove position ${index + 4}`}
                      onChange={(event) => patchRow(index, { toRemove: event.target.checked })} />
                    To remove
                  </label>
                )}
              </div>
            );
          })}
        </div>
      )}
      <button type="button" disabled={disabled || rows.length >= MAX_ADDITIONAL_POSITIONS}
        onClick={() => onChange([...rows, { role: '', date: '' }])}
        className="inline-flex items-center gap-1.5 rounded-md border border-border-primary bg-background-primary px-3 py-2 text-xs font-medium text-oak-primary hover:bg-background-secondary disabled:opacity-50">
        <Plus className="h-3.5 w-3.5" /> {lockExisting ? 'Add proposed position' : 'Add position'}
      </button>
      {error && <p role="alert" className="text-xs text-status-error">{error}</p>}
    </div>
  );
}
