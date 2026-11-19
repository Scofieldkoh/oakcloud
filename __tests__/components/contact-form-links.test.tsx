import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/use-auth', () => ({ useSession: () => ({ data: { isSuperAdmin: false, tenantId: 'tenant-1' } }) }));
vi.mock('@/components/ui/workspace-selector', () => ({ useActiveWorkspaceId: () => undefined }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));

import { ContactFormLinksSection } from '@/components/contacts/contact-form-links';
import type { ContactFormLinkDto } from '@/types/contact-form-link';

const CONTACT = '00000000-0000-4000-8000-0000000000c1';
const LINK = '00000000-0000-4000-8000-0000000000a1';

function link(overrides: Partial<ContactFormLinkDto> = {}): ContactFormLinkDto {
  return {
    id: LINK,
    state: 'ACTIVE',
    formId: 'form-1',
    formTitle: 'Customer due diligence',
    submissionId: 'sub-1',
    submittedAt: '2026-11-01T00:00:00.000Z',
    personRowIndex: 1,
    linkedAt: '2026-11-02T00:00:00.000Z',
    personName: 'Dina Tan',
    responseUrl: '/forms/form-1/responses/sub-1',
    pdfUrl: '/api/forms/form-1/responses/sub-1/export/pdf',
    attachments: [{ id: 'u1', fileName: 'nric.pdf', mimeType: 'application/pdf', sizeBytes: 10, fieldLabel: 'Identity document', scope: 'person', url: '/api/forms/form-1/responses/sub-1/uploads/u1' }],
    suggestions: [
      { field: 'dateOfBirth', label: 'Date of birth', current: null, proposed: '1980-01-01', canApply: true, reason: null },
      { field: 'fullAddress', label: 'Address', current: '1 Old Road', proposed: '2 New Road', canApply: true, reason: null },
      { field: 'nationality', label: 'Nationality', current: 'Indian', proposed: 'Malaysian', canApply: false, reason: "Can't apply: example" },
    ],
    readOnlyAnswers: [{ label: 'Politically exposed person (as answered)', value: 'no' }],
    ...overrides,
  };
}

interface Scripted {
  links: ContactFormLinkDto[] | { status: number };
  accept?: { status: number; body?: unknown };
}
let script: Scripted;
let calls: Array<{ url: string; method: string; body: unknown }>;

function mountFetch() {
  calls = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (method === 'GET' && url.includes('/form-links') && !url.includes('/candidates')) {
      if (!Array.isArray(script.links)) return Response.json({ error: 'Permission denied: document:read' }, { status: script.links.status });
      return Response.json({ links: script.links });
    }
    if (method === 'GET' && url.includes('/candidates')) {
      if (url.includes('submissionId=')) {
        return Response.json({ persons: [
          { rowIndex: 0, rowNumber: 1, kind: 'individual', name: 'Dina Tan', fingerprint: 'f'.repeat(64), eligible: true, reason: null },
          { rowIndex: 1, rowNumber: 2, kind: 'organisation', name: 'Acme', fingerprint: 'e'.repeat(64), eligible: false, reason: 'A company cannot be linked to an individual contact' },
        ] });
      }
      if (url.includes('formId=')) return Response.json({ submissions: [{ id: 'sub-9', submittedAt: '2026-11-01T00:00:00.000Z', respondentName: null, personCount: 2 }] });
      return Response.json({ forms: [{ id: 'form-9', title: 'CDD form' }] });
    }
    if (url.includes('/suggestions/accept')) return Response.json(script.accept?.body ?? { success: true }, { status: script.accept?.status ?? 200 });
    return Response.json({ success: true });
  }));
}

function mount(canEdit: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ContactFormLinksSection contactId={CONTACT} canEdit={canEdit} />
    </QueryClientProvider>,
  );
}

describe('KYC/CDD forms section on a contact', () => {
  beforeEach(() => {
    script = { links: [link()] };
    mountFetch();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('shows the link with its response, PDF, attachments and the answers that are shown only', async () => {
    mount(true);
    expect(await screen.findByText('Customer due diligence')).toBeInTheDocument();
    expect(screen.getByText('Linked')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open response' })).toHaveAttribute('href', '/forms/form-1/responses/sub-1');
    expect(screen.getByRole('link', { name: /Response PDF \(all people on the form\)/ })).toHaveAttribute('href', '/api/forms/form-1/responses/sub-1/export/pdf');
    expect(screen.getByRole('link', { name: 'nric.pdf' })).toHaveAttribute('href', '/api/forms/form-1/responses/sub-1/uploads/u1');
    expect(screen.getByText('Politically exposed person (as answered)')).toBeInTheDocument();
    expect(screen.getByText('1 Jan 1980')).toBeInTheDocument();
  });

  it('Accept and Dismiss each send one field, with the values the user saw', async () => {
    mount(true);
    fireEvent.click(await screen.findByRole('button', { name: 'Accept Address' }));
    await waitFor(() => expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1));
    expect(calls.find((c) => c.method === 'POST')).toMatchObject({
      url: expect.stringContaining(`/api/contacts/${CONTACT}/form-links/${LINK}/suggestions/accept`),
      body: { field: 'fullAddress', expectedCurrentValue: '1 Old Road', proposedValue: '2 New Road' },
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Dismiss Date of birth' }));
    await waitFor(() => expect(calls.filter((c) => c.method === 'POST')).toHaveLength(2));
    expect(calls.filter((c) => c.method === 'POST')[1]).toMatchObject({
      url: expect.stringContaining('/suggestions/dismiss'),
      body: { field: 'dateOfBirth', proposedValue: '1980-01-01' },
    });
  });

  it('a value that cannot be applied has no working Accept and says why', async () => {
    mount(true);
    expect(await screen.findByText("Can't apply: example")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Accept Nationality' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Accept Date of birth' })).toBeEnabled();
  });

  it('a 409 shows the refresh message and reloads the list', async () => {
    script.accept = { status: 409, body: { error: 'This changed since you opened it. Refresh and try again.', details: { reason: 'STALE_SUGGESTION' } } };
    mount(true);
    fireEvent.click(await screen.findByRole('button', { name: 'Accept Address' }));
    expect(await screen.findByText('This changed since you opened it. Refresh.')).toBeInTheDocument();
    await waitFor(() => expect(calls.filter((c) => c.method === 'GET' && !c.url.includes('/candidates')).length).toBeGreaterThan(1));
  });

  it('without contact:update there is no Accept, Dismiss, Unlink or Link form', async () => {
    mount(false);
    await screen.findByText('Customer due diligence');
    expect(screen.queryByRole('button', { name: /Accept|Dismiss|Unlink|Link form/ })).not.toBeInTheDocument();
    expect(screen.getByText('Address')).toBeInTheDocument();
  });

  it('a changed row hides files and suggestions; a deleted response says so; both can be unlinked', async () => {
    script.links = [
      link({ state: 'ROW_CHANGED', personName: null, responseUrl: null, pdfUrl: null, attachments: [], suggestions: [], readOnlyAnswers: [] }),
      link({ id: '00000000-0000-4000-8000-0000000000a2', state: 'RESPONSE_DELETED', personName: null, responseUrl: null, pdfUrl: null, attachments: [], suggestions: [], readOnlyAnswers: [] }),
    ];
    mount(true);
    expect(await screen.findByText('This form response changed; unlink and link again.')).toBeInTheDocument();
    expect(screen.getByText('Form response deleted. You can still unlink it.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open response' })).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Unlink' })).toHaveLength(2);
  });

  it('renders nothing at all when the API refuses the section (no document:read)', async () => {
    script.links = { status: 403 };
    const { container } = mount(true);
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(screen.queryByText('KYC/CDD forms')).not.toBeInTheDocument();
  });

  it('linking sends the person the picker showed, with its fingerprint, and offers no ineligible person', async () => {
    script.links = [];
    mount(true);
    fireEvent.click(await screen.findByRole('button', { name: 'Link form' }));
    fireEvent.change(await screen.findByLabelText('Form'), { target: { value: 'form-9' } });
    fireEvent.change(await screen.findByLabelText('Response'), { target: { value: 'sub-9' } });
    const dina = await screen.findByRole('radio', { name: /Person 1: Dina Tan/ });
    expect(screen.getByRole('radio', { name: /Person 2: Acme/ })).toBeDisabled();
    fireEvent.click(dina);
    fireEvent.click(screen.getByRole('button', { name: 'Link' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    expect(calls.find((c) => c.method === 'POST')).toMatchObject({
      url: expect.stringContaining(`/api/contacts/${CONTACT}/form-links`),
      body: { formId: 'form-9', submissionId: 'sub-9', personRowIndex: 0, expectedFingerprint: 'f'.repeat(64) },
    });
  });
});
