import type { EsigningEnvelopeRecipientDto } from '@/types/esigning';
import type { EsigningRecipientInput } from '@/lib/validations/esigning';

export interface LinkedCompanyQuickAddContact {
  id: string;
  fullName: string;
  defaultEmail?: string | null;
}

export interface LinkedCompanyQuickAddState {
  email: string;
  isAdded: boolean;
  isPending: boolean;
  isDisabled: boolean;
  stateLabel: string;
}

export function normalizeSignerEmail(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

export function buildSignerEmailSet(recipients: EsigningEnvelopeRecipientDto[]): Set<string> {
  return new Set(
    recipients
      .filter((recipient) => recipient.type === 'SIGNER')
      .map((recipient) => normalizeSignerEmail(recipient.email))
      .filter(Boolean),
  );
}

export function getLinkedCompanyQuickAddState(
  contact: LinkedCompanyQuickAddContact,
  signerEmails: Set<string>,
  pendingContactId: string | null,
): LinkedCompanyQuickAddState {
  const email = normalizeSignerEmail(contact.defaultEmail);
  const isAdded = Boolean(email) && signerEmails.has(email);
  const isPending = pendingContactId === contact.id;
  const isDisabled = !email || isAdded || Boolean(pendingContactId);
  const stateLabel = !email
    ? `${contact.fullName} has no default email`
    : isAdded
      ? `${contact.fullName} is already added as a signer`
      : isPending
        ? `Adding ${contact.fullName} as signer`
        : `Add ${contact.fullName} as signer`;

  return {
    email,
    isAdded,
    isPending,
    isDisabled,
    stateLabel,
  };
}

export function buildLinkedCompanySignerInput(
  contact: LinkedCompanyQuickAddContact,
): EsigningRecipientInput | null {
  const name = contact.fullName.trim();
  const email = normalizeSignerEmail(contact.defaultEmail);

  if (!name || !email) {
    return null;
  }

  return {
    name,
    email,
    type: 'SIGNER',
    signingOrder: null,
    accessMode: 'EMAIL_LINK',
  };
}
