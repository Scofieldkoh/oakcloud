import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/hooks/use-auth';
import { useActiveWorkspaceId } from '@/components/ui/workspace-selector';
import type { ContactFormCandidates, ContactFormLinkDto } from '@/types/contact-form-link';

/** An API failure with the HTTP status and, for a 409, the reason (STALE_SUGGESTION, ROW_CHANGED, ...). */
export class ContactFormLinkApiError extends Error {
  constructor(message: string, public status: number, public reason?: string) {
    super(message);
    this.name = 'ContactFormLinkApiError';
  }
}

async function readError(response: Response, fallback: string): Promise<ContactFormLinkApiError> {
  const body = await response.json().catch(() => ({}));
  return new ContactFormLinkApiError(body?.error || fallback, response.status, body?.details?.reason);
}

export const contactFormLinkKeys = {
  all: (contactId: string) => ['contact-form-links', contactId] as const,
  candidates: (contactId: string, formId?: string, submissionId?: string) =>
    ['contact-form-links', contactId, 'candidates', formId ?? '', submissionId ?? ''] as const,
};

function useBase(contactId: string) {
  const { data: session } = useSession();
  const tenantId = useActiveWorkspaceId(session?.isSuperAdmin ?? false, session?.tenantId);
  const query = tenantId ? `?tenantId=${tenantId}` : '';
  return { base: `/api/contacts/${contactId}/form-links`, query, tenantId };
}

export function useContactFormLinks(contactId: string, enabled = true) {
  const { base, query } = useBase(contactId);
  return useQuery({
    queryKey: contactFormLinkKeys.all(contactId),
    queryFn: async (): Promise<ContactFormLinkDto[]> => {
      const response = await fetch(`${base}${query}`);
      if (!response.ok) throw await readError(response, 'Failed to load linked form responses');
      return (await response.json()).links;
    },
    enabled,
    retry: false,
  });
}

export function useFormLinkCandidates(contactId: string, selection: { formId?: string; submissionId?: string }, enabled: boolean) {
  const { base, tenantId } = useBase(contactId);
  return useQuery({
    queryKey: contactFormLinkKeys.candidates(contactId, selection.formId, selection.submissionId),
    queryFn: async (): Promise<ContactFormCandidates> => {
      const params = new URLSearchParams();
      if (selection.formId) params.set('formId', selection.formId);
      if (selection.submissionId) params.set('submissionId', selection.submissionId);
      if (tenantId) params.set('tenantId', tenantId);
      const response = await fetch(`${base}/candidates?${params.toString()}`);
      if (!response.ok) throw await readError(response, 'Failed to load forms');
      return response.json();
    },
    enabled,
    retry: false,
  });
}

function useRefreshAfter(contactId: string) {
  const queryClient = useQueryClient();
  return async (alsoContact: boolean) => {
    await queryClient.invalidateQueries({ queryKey: contactFormLinkKeys.all(contactId) });
    if (alsoContact) {
      await queryClient.invalidateQueries({ queryKey: ['contact', contactId] });
      await queryClient.invalidateQueries({ queryKey: ['contacts'] });
    }
  };
}

async function send(url: string, method: string, body?: unknown): Promise<void> {
  const response = await fetch(url, {
    method,
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
  if (!response.ok) throw await readError(response, 'The request failed');
}

export function useLinkFormPerson(contactId: string) {
  const { base, query } = useBase(contactId);
  const refresh = useRefreshAfter(contactId);
  return useMutation({
    mutationFn: (input: { formId: string; submissionId: string; personRowIndex: number | null; expectedFingerprint: string }) => send(`${base}${query}`, 'POST', input),
    onSuccess: () => refresh(false),
  });
}

export function useUnlinkFormPerson(contactId: string) {
  const { base, query } = useBase(contactId);
  const refresh = useRefreshAfter(contactId);
  return useMutation({
    mutationFn: (linkId: string) => send(`${base}/${linkId}${query}`, 'DELETE'),
    onSuccess: () => refresh(false),
  });
}

export function useAcceptFormSuggestion(contactId: string) {
  const { base, query } = useBase(contactId);
  const refresh = useRefreshAfter(contactId);
  return useMutation({
    mutationFn: (input: { linkId: string; field: string; expectedCurrentValue: string | null; proposedValue: string }) =>
      send(`${base}/${input.linkId}/suggestions/accept${query}`, 'POST', {
        field: input.field,
        expectedCurrentValue: input.expectedCurrentValue,
        proposedValue: input.proposedValue,
      }),
    // A 409 also means the page is out of date: reload it.
    onSettled: (_data, error) => refresh(!error),
  });
}

export function useDismissFormSuggestion(contactId: string) {
  const { base, query } = useBase(contactId);
  const refresh = useRefreshAfter(contactId);
  return useMutation({
    mutationFn: (input: { linkId: string; field: string; proposedValue: string }) =>
      send(`${base}/${input.linkId}/suggestions/dismiss${query}`, 'POST', { field: input.field, proposedValue: input.proposedValue }),
    onSettled: () => refresh(false),
  });
}
