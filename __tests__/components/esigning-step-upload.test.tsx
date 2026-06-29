import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EsigningStepUpload } from '@/components/esigning/prepare/esigning-step-upload';
import type { EsigningEnvelopeDetailDto } from '@/types/esigning';

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock('@/components/ui/single-date-input', () => ({
  SingleDateInput: ({ label, value, onChange }: { label?: string; value?: string; onChange: (value: string) => void }) => (
    <label>
      {label}
      <input
        aria-label={label}
        data-testid="single-date-input"
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  ),
}));

vi.mock('@/components/ui/company-searchable-select', () => ({
  CompanySearchableSelect: () => <div data-testid="company-searchable-select" />,
}));

vi.mock('@/components/ui/contact-search-select', () => ({
  ContactSearchSelect: () => <div data-testid="contact-search-select" />,
}));

vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

vi.mock('@/hooks/use-auth', () => ({
  useSession: () => ({ data: { tenantId: 'workspace-1', isSuperAdmin: false } }),
}));

vi.mock('@/hooks/use-contacts', () => ({
  useCreateContact: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/components/ui/workspace-selector', () => ({
  useActiveWorkspaceId: () => 'workspace-1',
}));

vi.mock('@/components/esigning/esigning-upload-files', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/esigning/esigning-upload-files')>();
  return {
    ...actual,
    useEsigningWordUploadAvailability: () => false,
  };
});

function makeEnvelope(overrides: Partial<EsigningEnvelopeDetailDto> = {}): EsigningEnvelopeDetailDto {
  return {
    id: 'envelope-1',
    tenantId: 'workspace-1',
    companyId: null,
    companyName: null,
    title: 'NDA',
    message: '',
    status: 'DRAFT',
    signingOrder: 'PARALLEL',
    expiresAt: '2026-07-04T08:30:00.000Z',
    reminderFrequencyDays: null,
    reminderStartDays: null,
    expiryWarningDays: null,
    certificateId: 'certificate-1',
    voidReason: null,
    pdfGenerationStatus: null,
    pdfGenerationError: null,
    createdById: 'user-1',
    createdByName: 'Sender',
    canEdit: true,
    canDelete: true,
    canSend: true,
    canVoid: true,
    canDuplicate: true,
    canRetryPdf: false,
    documentCount: 1,
    signerCount: 1,
    recipientCount: 1,
    completedSignerCount: 0,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    completedAt: null,
    voidedAt: null,
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
        name: 'Client',
        email: 'client@example.com',
        type: 'SIGNER',
        signingOrder: 1,
        status: 'QUEUED',
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
      },
    ],
    fields: [],
    fieldValues: [],
    events: [],
    ...overrides,
  };
}

describe('EsigningStepUpload', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation((...args) => {
      if (typeof args[0] === 'string' && args[0].startsWith('Failed to render e-signing thumbnail')) {
        return;
      }
      throw new Error(args.map(String).join(' '));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses the shared form date picker for the advanced expiration field', async () => {
    render(
      <EsigningStepUpload
        envelope={makeEnvelope()}
        currentUser={null}
        onUpdateSettings={vi.fn()}
        isUpdating={false}
        onUploadDocuments={vi.fn()}
        isUploading={false}
        onDeleteDocument={vi.fn()}
        onAddRecipient={vi.fn()}
        onReorderRecipients={vi.fn()}
        isReorderingRecipients={false}
        onEditRecipient={vi.fn()}
        onRemoveRecipient={vi.fn()}
        companies={[]}
        companiesLoading={false}
        onNext={vi.fn()}
        onBack={vi.fn()}
      />
    );

    await waitFor(() => expect(screen.getByTestId('single-date-input')).toHaveValue('2026-07-04'));
    expect(screen.queryByDisplayValue('2026-07-04T08:30')).not.toBeInTheDocument();
  });

  it('submits the selected expiration date as an ISO datetime', async () => {
    const onUpdateSettings = vi.fn().mockResolvedValue(undefined);

    render(
      <EsigningStepUpload
        envelope={makeEnvelope({ expiresAt: null })}
        currentUser={null}
        onUpdateSettings={onUpdateSettings}
        isUpdating={false}
        onUploadDocuments={vi.fn()}
        isUploading={false}
        onDeleteDocument={vi.fn()}
        onAddRecipient={vi.fn()}
        onReorderRecipients={vi.fn()}
        isReorderingRecipients={false}
        onEditRecipient={vi.fn()}
        onRemoveRecipient={vi.fn()}
        companies={[]}
        companiesLoading={false}
        onNext={vi.fn()}
        onBack={vi.fn()}
      />
    );

    fireEvent.change(screen.getByTestId('single-date-input'), { target: { value: '2026-08-15' } });
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));

    await waitFor(() => expect(onUpdateSettings).toHaveBeenCalled());
    expect(onUpdateSettings.mock.calls[0][0].expiresAt).toBe(new Date('2026-08-15T00:00').toISOString());
  });
});
