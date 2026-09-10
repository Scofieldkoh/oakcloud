'use client';

import { useMemo, useState } from 'react';
import { Check, Loader2, RefreshCw, UserPlus } from 'lucide-react';
import type { EsigningEnvelopeRecipientDto } from '@/types/esigning';
import type { EsigningRecipientInput } from '@/lib/validations/esigning';
import { useContacts } from '@/hooks/use-contacts';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import {
  buildLinkedCompanySignerInput,
  buildSignerEmailSet,
  getLinkedCompanyQuickAddState,
} from './linked-company-signer-utils';

interface LinkedCompanySignerQuickAddProps {
  companyId: string;
  companyName?: string;
  recipients: EsigningEnvelopeRecipientDto[];
  canEdit: boolean;
  onAddRecipient: (data: EsigningRecipientInput) => Promise<void>;
}

export function LinkedCompanySignerQuickAdd({
  companyId,
  companyName,
  recipients,
  canEdit,
  onAddRecipient,
}: LinkedCompanySignerQuickAddProps) {
  const toast = useToast();
  const [pendingContactId, setPendingContactId] = useState<string | null>(null);
  const {
    data,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useContacts({
    companyId,
    limit: 50,
    sortBy: 'fullName',
    sortOrder: 'asc',
  });

  const signerEmails = useMemo(
    () => buildSignerEmailSet(recipients),
    [recipients],
  );
  const contacts = data?.contacts ?? [];

  async function handleAddContact(contact: (typeof contacts)[number]) {
    const input = buildLinkedCompanySignerInput(contact);
    if (!input || signerEmails.has(input.email ?? '') || pendingContactId) {
      return;
    }

    setPendingContactId(contact.id);
    try {
      await onAddRecipient(input);
      toast.success(`${contact.fullName} added as a signer`);
    } catch (addError) {
      toast.error(addError instanceof Error ? addError.message : `Failed to add ${contact.fullName} as a signer`);
    } finally {
      setPendingContactId(null);
    }
  }

  if (!companyId || !canEdit) {
    return null;
  }

  const isBusy = isLoading || isFetching || Boolean(pendingContactId);

  return (
    <div className="rounded-xl border border-border-primary bg-background-secondary p-3" aria-busy={isBusy}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-text-secondary">Quick add from linked company</p>
          {companyName ? (
            <p className="truncate text-xs text-text-muted">{companyName}</p>
          ) : null}
        </div>
        {isLoading || isFetching ? (
          <Loader2 className="h-4 w-4 animate-spin text-text-muted" aria-label="Loading company contacts" />
        ) : null}
      </div>

      {isError && contacts.length === 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-300/50 bg-amber-50/50 px-3 py-2 dark:bg-amber-950/10">
          <p className="min-w-0 flex-1 text-xs text-text-muted">
            {error instanceof Error ? error.message : 'Could not load the linked company contacts.'}
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border-primary bg-background-primary px-2.5 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-background-tertiary disabled:cursor-wait disabled:opacity-60"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} aria-hidden="true" />
            Retry
          </button>
        </div>
      ) : null}

      {!isLoading && !isError && contacts.length === 0 ? (
        <p className="text-xs text-text-muted">No contacts are linked to this company.</p>
      ) : null}

      {contacts.length > 0 ? (
        <div className="flex flex-wrap gap-2" aria-label="Linked company contacts">
          {contacts.map((contact) => {
            const state = getLinkedCompanyQuickAddState(contact, signerEmails, pendingContactId);

            return (
              <button
                key={contact.id}
                type="button"
                onClick={() => void handleAddContact(contact)}
                disabled={state.isDisabled}
                title={state.stateLabel}
                aria-label={state.stateLabel}
                className={cn(
                  'inline-flex min-h-10 items-center gap-2 rounded-xl border border-border-primary bg-background-primary px-3 py-2 text-sm text-text-primary transition-colors',
                  !state.isDisabled && 'hover:border-oak-primary/40 hover:bg-background-tertiary',
                  state.isDisabled && 'cursor-not-allowed opacity-60',
                )}
              >
                {state.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin text-text-muted" aria-hidden="true" />
                ) : state.isAdded ? (
                  <Check className="h-4 w-4 text-green-600" aria-hidden="true" />
                ) : (
                  <UserPlus className="h-4 w-4 text-text-muted" aria-hidden="true" />
                )}
                <span className="max-w-52 truncate">{contact.fullName}</span>
                {!state.email ? <span className="text-xs text-text-muted">No email</span> : null}
                {state.isAdded ? <span className="text-xs text-text-muted">Added</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
