import type { EsigningEnvelopeRecipientDto } from '@/types/esigning';

export interface LinkedCompanyQuickAddContact {
  id: string;
  fullName: string;
  defaultEmail?: string | null;
}

export interface LinkedCompanyQuickAddState {
  email: string;
  isAdded: boolean;
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
): LinkedCompanyQuickAddState {
  const email = normalizeSignerEmail(contact.defaultEmail);
  const isAdded = Boolean(email) && signerEmails.has(email);
  return {
    email,
    isAdded,
    stateLabel: isAdded
      ? `${contact.fullName} is already added as a signer`
      : `${contact.fullName} can be configured as a recipient`,
  };
}
