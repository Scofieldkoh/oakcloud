'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, X } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { readA4DraftConversionMetadata } from '@/lib/document-editor/oakdoc-draft-conversion';
import { useOakDocConversion, type OakDocConversionResponse } from '@/hooks/use-oakdoc-conversion';

interface OakDocConversionReviewProps {
  documentId: string;
  revision: number;
  metadata: unknown;
  /** Unsaved Word edits block review decisions. */
  dirty: boolean;
  onAccepted: (result: OakDocConversionResponse) => void;
  onRejected: () => void;
  onError: (message: string) => void;
}

/**
 * Review panel for an OakDoc copy of an A4 draft (P8). Each conversion
 * problem must be fixed in the copy and confirmed before it can be
 * accepted; rejecting removes the copy and leaves the original untouched.
 */
export function OakDocConversionReview({
  documentId,
  revision,
  metadata,
  dirty,
  onAccepted,
  onRejected,
  onError,
}: OakDocConversionReviewProps) {
  const conversion = useMemo(() => readA4DraftConversionMetadata(metadata), [metadata]);
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());
  const [rejectOpen, setRejectOpen] = useState(false);
  const mutation = useOakDocConversion(documentId);

  if (!conversion || conversion.status !== 'PENDING_REVIEW') return null;

  const errors = conversion.diagnostics.filter((entry) => entry.severity === 'error');
  const warnings = conversion.diagnostics.filter((entry) => entry.severity === 'warning');
  const errorCodes = Array.from(new Set(errors.map((entry) => entry.code)));
  const allConfirmed = errorCodes.every((code) => confirmed.has(code));

  const toggle = (code: string, checked: boolean) => {
    setConfirmed((current) => {
      const next = new Set(current);
      if (checked) next.add(code);
      else next.delete(code);
      return next;
    });
  };

  const accept = async () => {
    try {
      onAccepted(await mutation.mutateAsync({
        action: 'accept',
        expectedRevision: revision,
        acknowledgedCodes: Array.from(confirmed),
      }));
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Could not accept the copy');
    }
  };

  const reject = async () => {
    try {
      await mutation.mutateAsync({ action: 'reject', expectedRevision: revision });
      setRejectOpen(false);
      onRejected();
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Could not reject the copy');
    }
  };

  return (
    <Alert variant={errors.length > 0 ? 'warning' : 'info'} title="Review this OakDoc copy" className="mb-4">
      <p>
        This copy was made from an{' '}
        <Link href={`/generated-documents/${conversion.sourceDocumentId}`} className="underline">
          A4 draft
        </Link>
        , which is unchanged. Compare them, fix anything below in the copy, then accept it. It can&apos;t be finalized until it&apos;s accepted.
      </p>

      {errors.length > 0 ? (
        <div className="mt-3 space-y-2">
          {errors.map((entry) => (
            <Checkbox
              key={entry.code}
              size="sm"
              checked={confirmed.has(entry.code)}
              onChange={(event) => toggle(entry.code, event.target.checked)}
              label={entry.message}
              description="Tick once this is fixed in the copy."
            />
          ))}
        </div>
      ) : null}

      {warnings.length > 0 ? (
        <ul className="mt-3 list-disc space-y-0.5 pl-5 text-xs text-text-secondary">
          {warnings.map((entry) => <li key={entry.code}>{entry.message}</li>)}
        </ul>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={() => void accept()}
          disabled={dirty || !allConfirmed || mutation.isPending}
          title={dirty ? 'Save your Word edits first' : !allConfirmed ? 'Confirm each problem is fixed' : undefined}
        >
          <Check className="mr-1.5 h-4 w-4" />
          Accept copy
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setRejectOpen(true)}
          disabled={mutation.isPending}
        >
          <X className="mr-1.5 h-4 w-4" />
          Reject copy
        </Button>
      </div>

      <ConfirmDialog
        isOpen={rejectOpen}
        onClose={() => setRejectOpen(false)}
        onConfirm={reject}
        title="Reject this copy?"
        description="The OakDoc copy is removed. The original A4 draft stays as it is and can be converted again."
        confirmLabel="Reject copy"
        variant="warning"
        isLoading={mutation.isPending}
      />
    </Alert>
  );
}
