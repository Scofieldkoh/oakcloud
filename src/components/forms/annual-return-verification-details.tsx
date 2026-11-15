'use client';

import { readAdditionalPositions } from '@/lib/forms/additional-positions';
import { readPersonShareholdings } from '@/lib/forms/person-shareholdings';

export function formatRecordedAppointmentDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.trim() || 'Not recorded';
  const date = new Date(value + 'T00:00:00.000Z');
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-SG', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
}

/** Extra roles after positions 1–3, paired with appointment dates in one row each. */
export function RecordedAdditionalPositions({ value }: { value: unknown }) {
  const positions = readAdditionalPositions(value);
  if (positions.length === 0) return null;
  return (
    <div aria-label="Additional recorded positions" className="space-y-3">
      {positions.map((position, index) => (
        <div key={index} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-medium text-text-secondary">Position {index + 4}</p>
            <div role="textbox" aria-readonly="true" aria-label={`Position ${index + 4}`}
              className="rounded-lg border border-border-primary bg-background-secondary px-3 py-2 text-sm text-text-primary">
              {position.role || 'Not recorded'}
            </div>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-text-secondary">Appointment date {index + 4}</p>
            <div role="textbox" aria-readonly="true" aria-label={`Appointment date ${index + 4}`}
              className="rounded-lg border border-border-primary bg-background-secondary px-3 py-2 text-sm text-text-primary">
              {formatRecordedAppointmentDate(position.date)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Existing class-and-quantity records; there are deliberately no editing controls. */
export function RecordedShareholdings({ value }: { value: unknown }) {
  const holdings = readPersonShareholdings(value);
  if (holdings.length === 0) {
    return <p className="text-xs text-text-muted">No shares recorded for this person.</p>;
  }
  return (
    <div aria-label="Recorded shareholdings" className="space-y-3">
      {holdings.map((holding, index) => (
        <div key={index} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-medium text-text-secondary">Share class {index + 1}</p>
            <div role="textbox" aria-readonly="true" aria-label={`Share class ${index + 1}`}
              className="rounded-lg border border-border-primary bg-background-secondary px-3 py-2 text-sm text-text-primary">
              {holding.shareClass}
            </div>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-text-secondary">Number of shares</p>
            <div role="textbox" aria-readonly="true" aria-label={`Number of shares for class ${index + 1}`}
              className="rounded-lg border border-border-primary bg-background-secondary px-3 py-2 text-sm tabular-nums text-text-primary">
              {holding.shares}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
