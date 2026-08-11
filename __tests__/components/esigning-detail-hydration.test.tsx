import { createElement } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import { EsigningDetailPage } from '@/components/esigning/esigning-detail-page';
import type { EsigningEnvelopeDetailDto } from '@/types/esigning';

const hookMocks = vi.hoisted(() => ({
  envelope: null as EsigningEnvelopeDetailDto | null,
  mutateAsync: vi.fn().mockResolvedValue({}),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/link', () => {
  const LinkMock = ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
    createElement('a', { href, ...props }, children);
  LinkMock.displayName = 'LinkMock';
  return { __esModule: true, default: LinkMock, Link: LinkMock };
});

vi.mock('@/hooks/use-auth', () => ({
  useSession: () => ({
    data: {
      id: 'user-1',
      tenantId: 'tenant-1',
      firstName: 'Sender',
      lastName: '',
      email: 'sender@example.com',
      isSuperAdmin: false,
    },
  }),
}));

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    can: {
      readEsigning: true,
      createEsigning: true,
      updateEsigning: true,
      deleteEsigning: true,
      manageEsigning: true,
    },
  }),
}));

vi.mock('@/hooks/use-companies', () => ({
  useCompanies: () => ({ data: { companies: [], total: 0 }, isLoading: false }),
}));

vi.mock('@/hooks/use-esigning', () => {
  const mutation = (overrides: Record<string, unknown> = {}) => ({
    isPending: false,
    mutateAsync: hookMocks.mutateAsync,
    ...overrides,
  });
  return {
    useEsigningEnvelope: () => ({ data: hookMocks.envelope, isLoading: false }),
    useUpdateEsigningEnvelope: () => mutation(),
    useUploadEsigningDocument: () => mutation(),
    useSaveEsigningFields: () => mutation(),
    useSendEsigningEnvelope: () => mutation(),
    useVoidEsigningEnvelope: () => mutation(),
    useRetryEsigningEnvelopeProcessing: () => mutation(),
    useDeleteEsigningEnvelope: () => mutation(),
    useDuplicateEsigningEnvelope: () => mutation(),
    useAddEsigningRecipient: () => mutation(),
    useReorderEsigningRecipients: () => mutation(),
    useUpdateEsigningRecipient: () => mutation(),
    useRemoveEsigningRecipient: () => mutation(),
    useDeleteEsigningDocument: () => mutation(),
    useResendEsigningRecipient: () => mutation(),
    useEsigningRecipientManualLink: () => mutation(),
  };
});

vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

vi.mock('@/components/esigning/esigning-upload-files', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/esigning/esigning-upload-files')>();
  return {
    ...actual,
    isAllowedEsigningUploadFile: () => true,
    useEsigningWordUploadAvailability: () => false,
  };
});

vi.mock('@/components/ui/single-date-input', () => ({
  SingleDateInput: ({
    label,
    value,
    onChange,
  }: {
    label?: string;
    value?: string;
    onChange: (value: string) => void;
  }) =>
    createElement(
      'label',
      null,
      label,
      createElement('input', {
        'data-testid': 'single-date-input',
        value: value ?? '',
        onChange: (event: React.ChangeEvent<HTMLInputElement>) => onChange(event.target.value),
      })
    ),
}));

vi.mock('@/components/ui/company-searchable-select', () => ({
  CompanySearchableSelect: () => createElement('div', { 'data-testid': 'company-searchable-select' }),
}));

vi.mock('@/components/ui/contact-search-select', () => ({
  ContactSearchSelect: () => createElement('div', { 'data-testid': 'contact-search-select' }),
}));

vi.mock('@/hooks/use-contacts', () => ({
  useCreateContact: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/components/ui/workspace-selector', () => ({
  useActiveWorkspaceId: () => 'tenant-1',
}));

vi.mock('@/components/processing/document-page-viewer', () => ({
  DocumentPageViewer: () =>
    createElement('div', {
      'data-main-pdf-canvas': 'true',
      'data-document-scroll-container': 'true',
    }),
  DOCUMENT_PAGE_VIEWER_ZOOM_LEVELS: [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5],
}));

function makeEnvelope(
  overrides: Partial<EsigningEnvelopeDetailDto> = {}
): EsigningEnvelopeDetailDto {
  return {
    id: 'envelope-1',
    tenantId: 'tenant-1',
    title: 'NDA',
    message: null,
    status: 'DRAFT',
    signingOrder: 'PARALLEL',
    expiresAt: null,
    reminderFrequencyDays: null,
    reminderStartDays: null,
    expiryWarningDays: null,
    companyId: null,
    companyName: null,
    certificateId: 'certificate-1',
    completedAt: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    voidedAt: null,
    voidReason: null,
    pdfGenerationStatus: null,
    pdfGenerationError: null,
    createdById: 'user-1',
    createdByName: 'Sender',
    canEdit: true,
    canDelete: true,
    canSend: true,
    canVoid: false,
    canDuplicate: false,
    canRetryCompletionProcessing: false,
    emailDelivery: { status: 'ok', lastFailureAt: null, failures: [] },
    postCompletion: {
      artifactStatus: null,
      autoFilingStatus: 'NOT_REQUIRED',
      completionDeliveryStatus: 'NOT_TRACKED',
      failedCompletionDeliveryCount: 0,
    },
    documentCount: 1,
    signerCount: 1,
    recipientCount: 1,
    completedSignerCount: 0,
    documents: [
      {
        id: 'document-1',
        fileName: 'nda.pdf',
        pageCount: 1,
        sortOrder: 1,
        fileSize: 1024,
        originalHash: 'hash-original',
        signedHash: null,
        pdfUrl: '/nda.pdf',
        signedPdfUrl: null,
      },
    ],
    recipients: [
      {
        id: 'recipient-1',
        name: 'Signer',
        email: 'signer@example.com',
        type: 'SIGNER',
        status: 'QUEUED',
        signingOrder: 1,
        accessMode: 'EMAIL_LINK',
        hasAccessCode: false,
        colorTag: '#06b6d4',
        consentedAt: null,
        viewedAt: null,
        signedAt: null,
        declinedAt: null,
        declineReason: null,
        fieldsAssigned: 0,
        requiredFieldsAssigned: 0,
        signatureFieldsAssigned: 0,
        copyDeliveryStatus: 'AWAITING_COMPLETION',
      },
    ],
    fields: [],
    fieldValues: [],
    events: [],
    ...overrides,
  };
}

describe('E-signing detail hydration', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.replaceChildren(container);
    hookMocks.envelope = makeEnvelope();
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it('hydrates a newly opened draft without server/client divergence', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const tree = createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(EsigningDetailPage, { envelopeId: 'envelope-1' })
    );

    const serverHtml = renderToString(tree);
    container.innerHTML = serverHtml;

    const recoverableErrors: Error[] = [];
    hydrateRoot(container, tree, {
      onRecoverableError: (error) => recoverableErrors.push(error as Error),
    });

    await waitFor(() => {
      expect(recoverableErrors).toHaveLength(0);
    });
    expect(container.textContent).toContain('Upload documents');
  });

  it('hydrates a completed envelope detail without server/client divergence', async () => {
    hookMocks.envelope = makeEnvelope({
      status: 'COMPLETED',
      completedAt: '2026-08-02T00:00:00.000Z',
      pdfGenerationStatus: 'COMPLETED',
      recipients: [
        {
          ...makeEnvelope().recipients[0],
          status: 'SIGNED',
          signedAt: '2026-08-02T00:00:00.000Z',
        },
      ],
      completedSignerCount: 1,
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const tree = createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(EsigningDetailPage, { envelopeId: 'envelope-1' })
    );

    const serverHtml = renderToString(tree);
    container.innerHTML = serverHtml;

    const recoverableErrors: Error[] = [];
    hydrateRoot(container, tree, {
      onRecoverableError: (error) => recoverableErrors.push(error as Error),
    });

    await waitFor(() => {
      expect(recoverableErrors).toHaveLength(0);
    });
  });
});
