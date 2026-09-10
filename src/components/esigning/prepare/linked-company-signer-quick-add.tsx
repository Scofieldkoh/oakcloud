'use client';

import { useMemo, useState } from 'react';
import { Check, Loader2, UserPlus } from 'lucide-react';
import type { EsigningEnvelopeRecipientDto } from '@/types/esigning';
import type { EsigningRecipientInput } from '@/lib/validations/esigning';
import { useContacts } from '@/hooks/use-contacts';
import { cn } from '@/lib/utils';

interface LinkedCompanySignerQuickAddProps {
  companyId: string;
  companyName?: string;
  recipients: EsigningEnvelopeRecipientDto[];
  canEdit: boolean;
  onAddRecipient: (data: EsigningRecipientInput) => Promise<void>;
}

function normalizeEmail(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

export function LinkedCompanySignerQuickAdd({
  companyId,
  companyName,
  recipients,
  canEdit,
  onAddRecipient,
}: LinkedCompanySignerQuickAddProps) {
  const [pendingContactId, setPendingContactId] = useState<string | null>(null);
  const { data, isLoading } = useContacts({
    companyId,
    limit: 50,
    sortBy: 'fullName',
    sortOrder: 'asc',
  });

  const signerEmails = useMemo(
    () => new Set(
      recipients
        .filter((recipient) => recipient.type === 'SIGNER')
        .map((recipient) => normalizeEmail(recipient.email))
        .filter(Boolean),
    ),
    [recipients],
  );

  const contacts = data?.contacts ?? [];

  async function handleAddContact(contact: (typeof contacts)[number]) {
    const email = normalizeEmail(contact.defaultEmail);
    if (!email || signerEmails.has(email) || pendingContactId) {
      return;
    }

    setPendingContactId(contact.id);
    try {
      await onAddRecipient({
        name: contact.fullName.trim(),
        email,
        type: 'SIGNER',
        signingOrder: null,
        accessMode: 'EMAIL_LINK',
      });
    } finally {
      setPendingContactId(null);
    }
  }

  if (!companyId || !canEdit) {
    return null;
  }

  return (
    <div className="rounded-xl border border-border-primary bg-background-secondary p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-text-secondary">Quick add from linked company</p>
          {companyName ? (
            <p className="truncate text-xs text-text-muted">{companyName}</p>
          ) : null}
        </div>
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-text-muted" aria-label="Loading company contacts" /> : null}
      </div>

      {!isLoading && contacts.length === 0 ? (
        <p className="text-xs text-text-muted">No contacts are linked to this company.</p>
      ) : null}

      {contacts.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {contacts.map((contact) => {
            const email = normalizeEmail(contact.defaultEmail);
            const isAdded = Boolean(email) && signerEmails.has(email);
            const isPending = pendingContactId === contact.id;
            const isDisabled = !email || isAdded || Boolean(pendingContactId);

            return (
              <button
                key={contact.id}
                type="button"
                onClick={() => void handleAddContact(contact)}
                disabled={isDisabled}
                className={cn(
                  'inline-flex min-h-10 items-center gap-2 rounded-xl border border-border-primary bg-background-primary px-3 py-2 text-sm text-text-primary transition-colors',
                  !isDisabled && 'hover:border-oak-primary/40 hover:bg-background-tertiary',
                  isDisabled && 'cursor-not-allowed opacity-60',
                )}
              >
                {isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin text-text-muted" />
                ) : isAdded ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <UserPlus className="h-4 w-4 text-text-muted" />
                )}
                <span className="max-w-52 truncate">{contact.fullName}</span>
                {!email ? <span className="text-xs text-text-muted">No email</span> : null}
                {isAdded ? <span className="text-xs text-text-muted">Added</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
