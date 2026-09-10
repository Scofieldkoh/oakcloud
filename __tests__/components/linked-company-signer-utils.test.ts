import { describe, expect, it } from 'vitest';
import type { EsigningEnvelopeRecipientDto } from '@/types/esigning';
import {
  buildSignerEmailSet,
  getLinkedCompanyQuickAddState,
  normalizeSignerEmail,
} from '@/components/esigning/prepare/linked-company-signer-utils';

function recipient(type: 'SIGNER' | 'CC', email: string | null): EsigningEnvelopeRecipientDto {
  return { type, email } as EsigningEnvelopeRecipientDto;
}

describe('linked company recipient shortcut rules', () => {
  it('normalizes signer email addresses for duplicate detection', () => {
    expect(normalizeSignerEmail('  Jane.Example@Example.COM  ')).toBe('jane.example@example.com');
    expect(normalizeSignerEmail(null)).toBe('');
  });

  it('builds the duplicate set from signers only', () => {
    const emails = buildSignerEmailSet([
      recipient('SIGNER', 'Signer@Example.com'),
      recipient('CC', 'copy@example.com'),
      recipient('SIGNER', null),
    ]);
    expect([...emails]).toEqual(['signer@example.com']);
  });

  it('keeps a company contact without email available for configuration', () => {
    const state = getLinkedCompanyQuickAddState(
      { id: 'contact-1', fullName: 'No Email', defaultEmail: null },
      new Set(),
    );
    expect(state.isAdded).toBe(false);
    expect(state.email).toBe('');
    expect(state.stateLabel).toContain('configured as a recipient');
  });

  it('recognizes an existing signer case-insensitively', () => {
    const state = getLinkedCompanyQuickAddState(
      { id: 'contact-1', fullName: 'Jane Example', defaultEmail: 'JANE@EXAMPLE.COM' },
      new Set(['jane@example.com']),
    );
    expect(state.isAdded).toBe(true);
    expect(state.stateLabel).toContain('already added');
  });

  it('does not mark a contact without email as already added just because another manual-link signer has no email', () => {
    const state = getLinkedCompanyQuickAddState(
      { id: 'contact-1', fullName: 'Manual Recipient', defaultEmail: null },
      new Set(),
    );
    expect(state.isAdded).toBe(false);
  });
});
