'use client';

import { Plus, Trash2 } from 'lucide-react';
import { SearchableSelect, type SelectOption } from '@/components/ui/searchable-select';
import {
  MAX_PERSON_SHARE_CLASSES,
  readPersonShareholdings,
  type PersonShareholding,
} from '@/lib/forms/person-shareholdings';

interface Props {
  value: unknown;
  onChange: (rows: PersonShareholding[]) => void;
  onBlur?: () => void;
  options: SelectOption[];
  error?: string;
  disabled?: boolean;
  label: string;
  idPrefix: string;
}

/** A nested list inside a single person repeat card, without a nested repeat
 * marker. The parent repeat section still owns the stable person record ID.
 */
export function PersonShareholdingsEditor({
  value, onChange, onBlur, options, error, disabled = false, label, idPrefix,
}: Props) {
  const rows = readPersonShareholdings(value);
  const update = (index: number, patch: Partial<PersonShareholding>) =>
    onChange(rows.map((row, i) => i === index ? { ...row, ...patch } : row));

  return (
    <div className="space-y-2" aria-label={label}>
      {rows.length === 0 && (
        <p className="text-xs text-text-muted">No shares recorded for this person.</p>
      )}
      {rows.map((row, index) => (
        <div key={index} className="grid grid-cols-1 gap-2 rounded-lg border border-border-primary/70 p-2 sm:grid-cols-[minmax(0,1.3fr)_minmax(8rem,0.8fr)_auto] sm:items-end">
          <div className="min-w-0">
            <span className="mb-1 block text-xs font-medium text-text-secondary">
              Share class {index + 1}
            </span>
            <SearchableSelect
              options={options}
              value={row.shareClass}
              onChange={(shareClass) => update(index, { shareClass })}
              onBlur={onBlur}
              allowCustomValue
              disabled={disabled}
              ariaLabel={`Share class ${index + 1}`}
              placeholder="Select or enter share class"
              clearable={false}
              showKeyboardHints={false}
              containerClassName="h-10"
            />
          </div>
          <div className="min-w-0">
            <label className="mb-1 block text-xs font-medium text-text-secondary" htmlFor={`${idPrefix}-shares-${index}`}>
              Number of shares
            </label>
            <input
              id={`${idPrefix}-shares-${index}`}
              inputMode="numeric"
              type="text"
              value={row.shares}
              onChange={(event) => update(index, { shares: event.target.value })}
              onBlur={onBlur}
              disabled={disabled}
              placeholder="e.g. 100"
              aria-label={`Number of shares for class ${index + 1}`}
              className="h-10 w-full rounded-lg border border-[#D8E3DF] bg-[#F4F7F6] px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-[#294D44]/20 focus:border-[#294D44]"
            />
          </div>
          <button
            type="button"
            onClick={() => onChange(rows.filter((_, i) => i !== index))}
            disabled={disabled}
            aria-label={`Remove shareholding row ${index + 1}`}
            className="inline-flex h-10 items-center justify-center gap-1 rounded-md border border-border-primary px-3 text-xs text-status-error disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" /> Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...rows, { shareClass: '', shares: '' }])}
        disabled={disabled || rows.length >= MAX_PERSON_SHARE_CLASSES}
        className="inline-flex items-center gap-1.5 rounded-md border border-border-primary bg-background-primary px-3 py-2 text-xs font-medium text-oak-primary hover:bg-background-secondary disabled:opacity-50"
      >
        <Plus className="h-3.5 w-3.5" /> Add share class
      </button>
      {error && <p role="alert" className="text-xs text-status-error">{error}</p>}
      <p className="text-xs text-text-muted">One row per share class; leave empty if this person holds no shares.</p>
    </div>
  );
}
