'use client';

import { useMemo, useState } from 'react';
import { Check, Loader2, UserPlus } from 'lucide-react';
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
  const { data, isLoading } = useContacts({
    companyId,
    contactType: 'INDIVIDUAL',
    limit: 50,
    sortBy: 'fullName',
    sortOrder: 'asc',
  });
  const signerEmails = useMemo(() => buildSignerEmailSet(recipients), [recipients]);
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
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Failed to add ${contact.fullName} as a signer`);
    } finally {
      setPendingContactId(null);
    }
  }

  if (!companyId || !canEdit) return null;

  return (
    <div className="rounded-xl border border-border-primary bg-background-secondary p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-text-secondary">Quick add company contacts</p>
          <p className="truncate text-xs text-text-muted">
            {companyName ? `${companyName} · ` : ''}Uses each contact&apos;s default email for the signing request.
          </p>
        </div>
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-text-muted" aria-label="Loading company contacts" />
        ) : null}
      </div>

      {!isLoading && contacts.length === 0 ? (
        <p className="text-xs text-text-muted">No individual contacts are linked to this company.</p>
      ) : null}

      {contacts.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {contacts.map((contact) => {
            const state = getLinkedCompanyQuickAddState(contact, signerEmails, pendingContactId);
            return (
              <button
                key={contact.id}
                type="button"
                onClick={() => void handleAddContact(contact)}
                disabled={state.isDisabled}
                title={state.stateLabel}
                className={cn(
                  'inline-flex min-h-10 items-center gap-2 rounded-xl border border-border-primary bg-background-primary px-3 py-2 text-sm text-text-primary transition-colors',
                  !state.isDisabled && 'hover:border-oak-primary/40 hover:bg-background-tertiary',
                  state.isDisabled && 'cursor-not-allowed opacity-60',
                )}
              >
                {state.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin text-text-muted" />
                ) : state.isAdded ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <UserPlus className="h-4 w-4 text-text-muted" />
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
