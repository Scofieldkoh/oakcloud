'use client';

import { useIsMutating } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { sentrowebStartMutationKey } from '@/hooks/use-sentroweb-checks';
import { SentrowebCheckDialog } from './sentroweb-check-dialog';

interface SentrowebCheckActionProps {
  companyId: string;
  /** Only people who can update the company see the action. */
  canUpdate: boolean;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onStarted?: (runId: string) => void;
}

/** The "Sentroweb check" button for the company actions, with its confirm dialog. */
export function SentrowebCheckAction({ companyId, canUpdate, isOpen, onOpenChange, onStarted }: SentrowebCheckActionProps) {
  const pendingStarts = useIsMutating({ mutationKey: sentrowebStartMutationKey(companyId) });

  if (!canUpdate) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        disabled={pendingStarts > 0}
        className="btn-secondary btn-sm flex items-center gap-2 whitespace-nowrap"
        title="Sentroweb check (F4)"
      >
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
        Sentroweb check
      </button>
      <SentrowebCheckDialog
        companyId={companyId}
        isOpen={isOpen}
        onClose={() => onOpenChange(false)}
        onStarted={onStarted}
      />
    </>
  );
}
