import { describe, expect, it } from 'vitest';
import type { EsigningEnvelopeRecipientDto } from '@/types/esigning';
import {
  buildLinkedCompanySignerInput,
  buildSignerEmailSet,
  getLinkedCompanyQuickAddState,
  normalizeSignerEmail,
} from '@/components/esigning/prepare/linked-company-signer-utils';

function recipient(type: 'SIGNER' | 'CC', email: string | null): EsigningEnvelopeRecipientDto {
  return { type, email } as EsigningEnvelopeRecipientDto;
}

describe('linked company signer quick-add rules', () => {
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

  it('disables a company contact that has no default email', () => {
    const state = getLinkedCompanyQuickAddState(
      { id: 'contact-1', fullName: 'No Email', defaultEmail: null },
      new Set(),
      null,
    );

    expect(state.isDisabled).toBe(true);
    expect(state.email).toBe('');
    expect(state.stateLabel).toContain('no default email');
  });

  it('recognizes an existing signer case-insensitively', () => {
    const state = getLinkedCompanyQuickAddState(
      { id: 'contact-1', fullName: 'Jane Example', defaultEmail: 'JANE@EXAMPLE.COM' },
      new Set(['jane@example.com']),
      null,
    );

    expect(state.isAdded).toBe(true);
    expect(state.isDisabled).toBe(true);
    expect(state.stateLabel).toContain('already added');
  });

  it('explains when another contact add is in progress', () => {
    const state = getLinkedCompanyQuickAddState(
      { id: 'contact-2', fullName: 'John Example', defaultEmail: 'john@example.com' },
      new Set(),
      'contact-1',
    );

    expect(state.isPending).toBe(false);
    expect(state.isDisabled).toBe(true);
    expect(state.stateLabel).toContain('Wait for the current signer');
  });

  it('builds an email-link signer payload for an eligible company contact', () => {
    expect(buildLinkedCompanySignerInput({
      id: 'contact-1',
      fullName: '  Jane Example  ',
      defaultEmail: ' Jane@Example.COM ',
    })).toEqual({
      name: 'Jane Example',
      email: 'jane@example.com',
      type: 'SIGNER',
      signingOrder: null,
      accessMode: 'EMAIL_LINK',
    });
  });

  it('does not build a signer payload without both a name and email', () => {
    expect(buildLinkedCompanySignerInput({
      id: 'contact-1',
      fullName: 'Jane Example',
      defaultEmail: null,
    })).toBeNull();
    expect(buildLinkedCompanySignerInput({
      id: 'contact-2',
      fullName: '   ',
      defaultEmail: 'jane@example.com',
    })).toBeNull();
  });
});
