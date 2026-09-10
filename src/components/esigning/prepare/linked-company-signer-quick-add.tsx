'use client';

import { useMemo, useState } from 'react';
import { Check, Loader2, RefreshCw, UserRound } from 'lucide-react';
import type { EsigningRecipientAccessMode, EsigningRecipientType } from '@/generated/prisma';
import type { EsigningEnvelopeRecipientDto } from '@/types/esigning';
import type { EsigningRecipientInput } from '@/lib/validations/esigning';
import { ESIGNING_LIMITS } from '@/lib/validations/esigning';
import { ESIGNING_ACCESS_MODE_LABELS, ESIGNING_RECIPIENT_TYPE_LABELS } from '@/components/esigning/esigning-shared';
import { ContactSearchSelect, type SearchableContact } from '@/components/ui/contact-search-select';
import { FormInput } from '@/components/ui/form-input';
import { Button } from '@/components/ui/button';
import { useContacts } from '@/hooks/use-contacts';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { buildSignerEmailSet, getLinkedCompanyQuickAddState, normalizeSignerEmail } from './linked-company-signer-utils';

interface LinkedCompanySignerQuickAddProps {
  companyId: string;
  companyName?: string;
  recipients: EsigningEnvelopeRecipientDto[];
  canEdit: boolean;
  onAddRecipient: (data: EsigningRecipientInput) => Promise<void>;
}

interface RecipientDraft {
  name: string;
  email: string;
  type: EsigningRecipientType;
  accessMode: EsigningRecipientAccessMode;
  accessCode: string;
}

const EMPTY_DRAFT: RecipientDraft = { name: '', email: '', type: 'SIGNER', accessMode: 'EMAIL_LINK', accessCode: '' };

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function buildDraft(contact: SearchableContact): RecipientDraft {
  const email = contact.defaultEmail?.trim() ?? '';
  return { name: contact.fullName.trim(), email, type: 'SIGNER', accessMode: email ? 'EMAIL_LINK' : 'MANUAL_LINK', accessCode: '' };
}

export function LinkedCompanySignerQuickAdd({ companyId, companyName, recipients, canEdit, onAddRecipient }: LinkedCompanySignerQuickAddProps) {
  const toast = useToast();
  const [selectedContactId, setSelectedContactId] = useState('');
  const [selectedContact, setSelectedContact] = useState<SearchableContact | null>(null);
  const [draft, setDraft] = useState<RecipientDraft>(EMPTY_DRAFT);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const { data, isLoading, isFetching, isError, error, refetch } = useContacts({ companyId, limit: 50, sortBy: 'fullName', sortOrder: 'asc' });
  const signerEmails = useMemo(() => buildSignerEmailSet(recipients), [recipients]);
  const contacts = data?.contacts ?? [];

  function selectContact(contactId: string, contact: SearchableContact | null) {
    setSelectedContactId(contactId);
    setSelectedContact(contact);
    if (!contact) {
      setDraft(EMPTY_DRAFT);
      return;
    }
    setDraft(buildDraft(contact));
    setIsEditorOpen(true);
  }

  function closeEditor() {
    setIsEditorOpen(false);
    setSelectedContactId('');
    setSelectedContact(null);
    setDraft(EMPTY_DRAFT);
  }

  function handleRoleChange(nextType: EsigningRecipientType) {
    setDraft((current) => ({
      ...current,
      type: nextType,
      accessMode: nextType === 'CC' && current.accessMode === 'MANUAL_LINK' ? 'EMAIL_LINK' : current.accessMode,
    }));
  }

  async function handleConfirm() {
    const name = draft.name.trim();
    const email = normalizeSignerEmail(draft.email);
    const requiresEmail = draft.type === 'CC' || draft.accessMode !== 'MANUAL_LINK';
    if (!name) return toast.error('Recipient name is required');
    if (requiresEmail && !email) return toast.error('Recipient email is required for this access method');
    if (email && !isValidEmail(email)) return toast.error('Enter a valid recipient email address');
    if (draft.accessMode === 'EMAIL_WITH_CODE' && draft.accessCode.trim().length < ESIGNING_LIMITS.MIN_ACCESS_CODE_LENGTH) return toast.error(`Access code must be at least ${ESIGNING_LIMITS.MIN_ACCESS_CODE_LENGTH} characters`);
    if (draft.type === 'SIGNER' && email && signerEmails.has(email)) return toast.error(`${draft.email.trim()} is already listed as a signer on this envelope`);

    setIsSubmitting(true);
    try {
      await onAddRecipient({ name, email: email || null, type: draft.type, signingOrder: null, accessMode: draft.accessMode, accessCode: draft.accessCode.trim() || undefined });
      toast.success(`${name} added as ${draft.type === 'SIGNER' ? 'a signer' : 'a copy recipient'}`);
      closeEditor();
    } catch (submitError) {
      toast.error(submitError instanceof Error ? submitError.message : 'Failed to add recipient');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!companyId || !canEdit) return null;

  return (
    <div className="rounded-xl border border-border-primary bg-background-secondary p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-text-secondary">Company contacts</p>
          <p className="truncate text-xs text-text-muted">{companyName ? `${companyName} · ` : ''}Select a contact to configure how they receive this document.</p>
        </div>
        {isLoading || isFetching ? <Loader2 className="h-4 w-4 animate-spin text-text-muted" aria-label="Loading company contacts" /> : null}
      </div>
      {isError && contacts.length === 0 ? <div className="flex items-center gap-2 rounded-lg border border-amber-300/50 px-3 py-2"><p className="min-w-0 flex-1 text-xs text-text-muted">{error instanceof Error ? error.message : 'Could not load company contacts.'}</p><button type="button" onClick={() => void refetch()} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border-primary px-2.5 text-xs"><RefreshCw className="h-3.5 w-3.5" /> Retry</button></div> : null}
      {!isLoading && !isError && contacts.length === 0 ? <p className="text-xs text-text-muted">No contacts are linked to this company.</p> : null}
      {contacts.length > 0 ? <div className="flex flex-wrap gap-2" aria-label="Linked company contacts">{contacts.map((contact) => {
        const state = getLinkedCompanyQuickAddState(contact, signerEmails);
        return <button key={contact.id} type="button" onClick={() => selectContact(contact.id, contact)} disabled={state.isAdded} aria-label={state.stateLabel} className={cn('inline-flex min-h-10 items-center gap-2 rounded-xl border border-border-primary bg-background-primary px-3 py-2 text-sm text-text-primary transition-colors', !state.isAdded && 'hover:border-oak-primary/40 hover:bg-background-tertiary', state.isAdded && 'cursor-not-allowed opacity-60')}>
          {state.isAdded ? <Check className="h-4 w-4 text-green-600" aria-hidden="true" /> : <UserRound className="h-4 w-4 text-text-muted" aria-hidden="true" />}<span className="max-w-52 truncate">{contact.fullName}</span>{state.isAdded ? <span className="text-xs text-text-muted">Added</span> : null}
        </button>;
      })}</div> : null}

      {isEditorOpen ? <div className="mt-3 overflow-hidden rounded-xl border border-border-primary bg-background-primary">
        <div className="border-b border-border-primary px-4 py-3"><p className="text-sm font-semibold text-text-primary">Configure recipient</p><p className="text-xs text-text-muted">Review the contact details, role, and delivery method before adding.</p></div>
        <div className="space-y-3 p-4">
          <ContactSearchSelect key={`linked-company-contact-${selectedContactId || 'empty'}`} label="Search Contact" value={selectedContactId} selectedContact={selectedContact} onChange={selectContact} placeholder="Search contacts..." controlClassName="!h-10 !min-h-0" />
          <FormInput label="Full name" inputSize="lg" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} />
          <div className="grid gap-3 sm:grid-cols-3">
            <FormInput label="Email address" inputSize="lg" type="email" placeholder="Optional for manual link" value={draft.email} onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))} required={draft.type === 'CC' || draft.accessMode !== 'MANUAL_LINK'} hint={draft.type === 'SIGNER' && draft.accessMode === 'MANUAL_LINK' ? 'Optional when using Manual Link.' : undefined} />
            <label className="flex flex-col gap-1 text-xs font-medium text-text-secondary">Role<select value={draft.type} onChange={(event) => handleRoleChange(event.target.value as EsigningRecipientType)} className="h-10 rounded-lg border border-border-primary bg-background-secondary px-3 text-sm text-text-primary">{Object.entries(ESIGNING_RECIPIENT_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="flex flex-col gap-1 text-xs font-medium text-text-secondary">Access method<select value={draft.accessMode} onChange={(event) => setDraft((current) => ({ ...current, accessMode: event.target.value as EsigningRecipientAccessMode }))} disabled={draft.type === 'CC'} className="h-10 rounded-lg border border-border-primary bg-background-secondary px-3 text-sm text-text-primary disabled:opacity-60">{Object.entries(ESIGNING_ACCESS_MODE_LABELS).filter(([value]) => draft.type !== 'CC' || value !== 'MANUAL_LINK').map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          </div>
          {draft.type === 'CC' ? <p className="text-xs text-text-muted">Copy recipients require email delivery, so Manual Link is not available.</p> : null}
          {draft.accessMode === 'EMAIL_WITH_CODE' ? <FormInput label="Access code" inputSize="lg" value={draft.accessCode} onChange={(event) => setDraft((current) => ({ ...current, accessCode: event.target.value }))} placeholder={`Min ${ESIGNING_LIMITS.MIN_ACCESS_CODE_LENGTH} characters`} /> : null}
          <div className="flex justify-end gap-2 border-t border-border-primary pt-3"><Button type="button" variant="secondary" size="sm" onClick={closeEditor} disabled={isSubmitting}>Cancel</Button><Button type="button" size="sm" leftIcon={<Check className="h-4 w-4" />} onClick={() => void handleConfirm()} isLoading={isSubmitting} disabled={isSubmitting}>Add recipient</Button></div>
        </div>
      </div> : null}
    </div>
  );
}
