'use client';

import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ServiceAgreementWarning({
  onBackToServices,
}: {
  onBackToServices: () => void;
}) {
  return (
    <div
      role="alert"
      className="mb-3 rounded-lg border border-status-warning/40 bg-status-warning/10 p-3 text-sm text-text-secondary"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <AlertTriangle className="h-4 w-4 shrink-0 text-status-warning" />
        <p className="flex-1">
          This is a Service Agreement. Manual edits to service wording, dates, entities,
          or fees change this document only. Client Services will use the structured
          values from the Services step. Return to Services to change operational data.
        </p>
        <Button variant="secondary" size="sm" onClick={onBackToServices}>
          Back to Services
        </Button>
      </div>
    </div>
  );
}
