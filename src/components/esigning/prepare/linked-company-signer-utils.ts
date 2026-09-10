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

export function isValidSignerEmail(value: string | null | undefined): boolean {
  const normalized = normalizeSignerEmail(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
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
  const hasValidEmail = isValidSignerEmail(email);
  const isAdded = hasValidEmail && signerEmails.has(email);
  const isPending = pendingContactId === contact.id;
  const isBlockedByPending = Boolean(pendingContactId) && !isPending;
  const isDisabled = !hasValidEmail || isAdded || isPending || isBlockedByPending;
  const stateLabel = !hasValidEmail
    ? `${contact.fullName} needs a valid default email before quick add`
    : isAdded
      ? `${contact.fullName} is already added as a signer`
      : isPending
        ? `Adding ${contact.fullName} as signer`
        : isBlockedByPending
          ? `Wait for the current signer to finish adding before adding ${contact.fullName}`
          : `Add ${contact.fullName} as signer`;

  return { email, isAdded, isPending, isDisabled, stateLabel };
}

export function buildLinkedCompanySignerInput(
  contact: LinkedCompanyQuickAddContact,
): EsigningRecipientInput | null {
  const name = contact.fullName.trim();
  const email = normalizeSignerEmail(contact.defaultEmail);

  if (!name || !isValidSignerEmail(email)) {
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

export function getEligibleLinkedCompanyContacts<T extends LinkedCompanyQuickAddContact>(
  contacts: T[],
  signerEmails: Set<string>,
): T[] {
  const seenEmails = new Set(signerEmails);

  return contacts.filter((contact) => {
    const input = buildLinkedCompanySignerInput(contact);
    const email = normalizeSignerEmail(input?.email);
    if (!input || !email || seenEmails.has(email)) {
      return false;
    }
    seenEmails.add(email);
    return true;
  });
}
