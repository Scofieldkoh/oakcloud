import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EsigningStepUpload } from '@/components/esigning/prepare/esigning-step-upload';
import type { EsigningEnvelopeDetailDto } from '@/types/esigning';
import type { UpdateEsigningEnvelopeInput } from '@/lib/validations/esigning';
import type { EsigningRecipientInput } from '@/lib/validations/esigning';
import type { ReorderEsigningRecipientsPayload } from '@/hooks/use-esigning';
import type { SearchableContact } from '@/components/ui/contact-search-select';

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
  CompanySearchableSelect: ({
    companies,
    value,
    onChange,
    label,
    placeholder,
    disabled,
  }: {
    companies?: Array<{ id: string; name: string }>;
    value?: string;
    onChange?: (value: string) => void;
    label?: string;
    placeholder?: string;
    disabled?: boolean;
  }) => (
    <label>
      {label}
      <select
        aria-label={label ?? placeholder}
        value={value ?? ''}
        onChange={(event) => onChange?.(event.target.value)}
        disabled={disabled}
      >
        <option value="">{placeholder ?? 'Select company'}</option>
        {(companies ?? []).map((company) => (
          <option key={company.id} value={company.id}>{company.name}</option>
        ))}
      </select>
    </label>
  ),
}));

vi.mock('@/components/ui/contact-search-select', () => ({
  ContactSearchSelect: ({
    onChange,
  }: {
    onChange: (contactId: string, contact: SearchableContact | null) => void;
  }) => (
    <button
      type="button"
      data-testid="contact-search-select"
      onClick={() => onChange('contact-1', {
        id: 'contact-1',
        fullName: 'Existing Contact',
        defaultEmail: 'existing@example.com',
      } as unknown as SearchableContact)}
    >
      Select existing contact
    </button>
  ),
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
    emailSubject: 'NDA',
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
    canRetryCompletionProcessing: false,
    emailDelivery: {
      status: 'ok',
      lastFailureAt: null,
      failures: [],
    },
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
        copyDeliveryStatus: 'AWAITING_COMPLETION',
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

  it('uses the shared form date picker for the expiration field', async () => {
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

  function renderUpload(
    envelopeOverrides: Partial<EsigningEnvelopeDetailDto> = {},
    propOverrides: {
      onUpdateSettings?: (settings: UpdateEsigningEnvelopeInput) => Promise<void>;
      onReorderRecipients?: (payload: ReorderEsigningRecipientsPayload) => Promise<void>;
      onAttachGeneratedDocuments?: (documentIds: string[]) => Promise<void>;
      onAddRecipient?: (data: EsigningRecipientInput) => Promise<void>;
      currentUser?: { firstName: string; lastName: string; email: string } | null;
      onNext?: () => void;
      isUploading?: boolean;
      companies?: Array<{ id: string; name: string; uen: string }>;
    } = {}
  ) {
    const onUpdateSettings = propOverrides.onUpdateSettings ?? vi.fn().mockResolvedValue(undefined);
    const onReorderRecipients =
      propOverrides.onReorderRecipients ?? vi.fn().mockResolvedValue(undefined);
    const onNext = propOverrides.onNext ?? vi.fn();

    const { container } = render(
      <EsigningStepUpload
        envelope={makeEnvelope(envelopeOverrides)}
        currentUser={propOverrides.currentUser ?? null}
        onUpdateSettings={onUpdateSettings}
        isUpdating={false}
        onUploadDocuments={vi.fn()}
        isUploading={propOverrides.isUploading ?? false}
        onAttachGeneratedDocuments={propOverrides.onAttachGeneratedDocuments}
        onDeleteDocument={vi.fn()}
        onAddRecipient={propOverrides.onAddRecipient ?? vi.fn()}
        onReorderRecipients={onReorderRecipients}
        isReorderingRecipients={false}
        onEditRecipient={vi.fn()}
        onRemoveRecipient={vi.fn()}
        companies={propOverrides.companies ?? []}
        companiesLoading={false}
        onNext={onNext}
        onBack={vi.fn()}
      />
    );

    return { onUpdateSettings, onReorderRecipients, onNext, container };
  }

  function nextButton() {
    return screen.getByRole('button', { name: /Next/i });
  }

  it('uses the requested two-row panel layout with Companies detail headers', () => {
    const { container } = renderUpload();

    expect(container.firstElementChild?.className).toContain('lg:grid-cols-2');
    expect(container.firstElementChild?.className).toContain('w-full');
    expect(container.firstElementChild?.className).toContain('max-w-[1550px]');
    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual([
      'Documents (1)',
      'Add recipients',
      'Email subject & message',
      'Settings',
    ]);
    screen.getAllByRole('heading', { level: 2 }).forEach((heading) => {
      expect(heading.parentElement?.className).toContain('bg-oak-primary');
    });
  });

  it('keeps document actions visible outside the thumbnail card bounds', async () => {
    const user = userEvent.setup();
    renderUpload();

    await user.click(screen.getByRole('button', { name: 'More document actions' }));

    expect(screen.getByRole('button', { name: 'View document' })).toBeVisible();
    expect(screen.getByText('nda.pdf').closest('.group')).toHaveClass('overflow-visible');
    expect(screen.getByRole('heading', { name: 'Documents (1)' }).closest('section')).toHaveClass('overflow-visible');
  });

  it('keeps envelope name and email subject independent with standardized control heights', async () => {
    const user = userEvent.setup();
    const { onUpdateSettings } = renderUpload();

    const envelopeName = screen.getByRole('textbox', { name: 'Envelope name' });
    const emailSubject = screen.getByRole('textbox', { name: 'Email subject' });
    expect(envelopeName).toHaveValue('NDA');
    expect(emailSubject).toHaveValue('NDA');
    expect(envelopeName.className).toContain('h-10');
    expect(emailSubject.className).toContain('h-10');

    await user.clear(envelopeName);
    await user.type(envelopeName, 'Envelope label');
    await user.clear(emailSubject);
    await user.type(emailSubject, 'Please review and sign');
    await user.click(nextButton());

    await waitFor(() => expect(onUpdateSettings).toHaveBeenCalled());
    expect(onUpdateSettings).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Envelope label',
      emailSubject: 'Please review and sign',
    }));
  });

  it('defaults new recipients to manual link access', async () => {
    const user = userEvent.setup();
    renderUpload({ recipients: [], recipientCount: 0, signerCount: 0 });

    await user.click(screen.getByRole('button', { name: 'Add recipient' }));

    expect(screen.getByRole('combobox', { name: 'Access method' })).toHaveValue('MANUAL_LINK');
  });

  it('adds the current user with manual link access', async () => {
    const onAddRecipient = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderUpload(
      { recipients: [], recipientCount: 0, signerCount: 0 },
      {
        onAddRecipient,
        currentUser: {
          firstName: 'Alex',
          lastName: 'Tan',
          email: 'alex@example.com',
        },
      }
    );

    await user.click(screen.getByRole('button', { name: /I'm signing this document/i }));

    expect(onAddRecipient).toHaveBeenCalledWith(expect.objectContaining({
      email: 'alex@example.com',
      accessMode: 'MANUAL_LINK',
    }));
  });

  it('shows the access method beside each recipient role badge', () => {
    renderUpload();

    expect(screen.getByTestId('recipient-access-method-badge-recipient-1')).toHaveTextContent('Email Link');
  });

  it('disables email subject and message when all recipients use manual links', () => {
    renderUpload({
      recipients: [{
        ...makeEnvelope().recipients[0],
        accessMode: 'MANUAL_LINK',
      }],
    });

    expect(screen.getByRole('textbox', { name: 'Email subject' })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: 'Message' })).toBeDisabled();
  });

  it('organizes recipient fields and footer actions around contact changes', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ defaultDetails: [] }), { status: 200 }));
    renderUpload({ recipients: [], recipientCount: 0, signerCount: 0 });

    await user.click(screen.getByRole('button', { name: 'Add recipient' }));

    const contactPicker = screen.getByTestId('contact-search-select');
    const nameInput = screen.getByRole('textbox', { name: 'Full name' });
    const detailsRow = screen.getByTestId('recipient-details-row');
    expect(contactPicker.compareDocumentPosition(nameInput)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(nameInput.compareDocumentPosition(detailsRow)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(screen.getByRole('button', { name: 'Quick add' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'New recipient' }).parentElement?.className).toContain('bg-oak-primary');
    expect(screen.getByTestId('recipient-details-row').className).toContain('sm:grid-cols-3');
    expect([...screen.getByTestId('recipient-actions').querySelectorAll('button')].map((button) => button.textContent?.trim()))
      .toEqual(['Cancel', 'Quick add', 'Add recipient']);
    expect(screen.queryByText('Save as a contact?')).not.toBeInTheDocument();

    await user.click(contactPicker);

    expect(screen.queryByRole('button', { name: 'Update contact' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Quick add' })).not.toBeInTheDocument();
    expect([...screen.getByTestId('recipient-actions').querySelectorAll('button')].map((button) => button.textContent?.trim()))
      .toEqual(['Cancel', 'Add recipient']);

    await user.clear(screen.getByRole('textbox', { name: 'Email address' }));
    await user.type(screen.getByRole('textbox', { name: 'Email address' }), 'updated@example.com');

    expect(screen.getByRole('button', { name: 'Update contact' })).toBeInTheDocument();
    expect([...screen.getByTestId('recipient-actions').querySelectorAll('button')].map((button) => button.textContent?.trim()))
      .toEqual(['Cancel', 'Update contact', 'Add recipient']);
  });

  it('is a keyboard-operable upload control with a 44px mobile target', async () => {
    const user = userEvent.setup();
    const { container } = renderUpload();

    const uploadButton = screen.getByRole('button', { name: /Drop PDF documents here/i });
    expect(uploadButton).toHaveAccessibleName();
    expect(uploadButton.className).toContain('min-h-[44px]');

    const fileInput = container.querySelector('input[type="file"]');
    expect(fileInput).not.toBeNull();
    const clickSpy = vi.spyOn(fileInput as HTMLInputElement, 'click').mockImplementation(() => undefined);

    uploadButton.focus();
    await user.keyboard('{Enter}');
    expect(clickSpy).toHaveBeenCalledTimes(1);
    await user.keyboard(' ');
    expect(clickSpy).toHaveBeenCalledTimes(2);
  });

  it('disables the upload control while uploading', () => {
    renderUpload({}, { isUploading: true });

    const uploadButton = screen.getByRole('button', { name: /Uploading/i });
    expect(uploadButton).toBeDisabled();
  });

  it('filters, sorts, and multi-selects finalized generated documents', async () => {
    const user = userEvent.setup();
    const onAttachGeneratedDocuments = vi.fn().mockResolvedValue(undefined);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      expect(url).toContain('/api/generated-documents?');
      return new Response(JSON.stringify({
        documents: [
          {
            id: 'generated-1',
            title: 'Board resolution',
            updatedAt: '2026-08-30T00:00:00.000Z',
            company: { id: 'company-1', name: 'Acme Pte Ltd', uen: '201900001A' },
          },
          {
            id: 'generated-2',
            title: 'Service agreement',
            updatedAt: '2026-08-28T00:00:00.000Z',
            company: { id: 'company-2', name: 'Beta Pte Ltd', uen: '201900002B' },
          },
        ],
        total: 2,
      }), { status: 200 });
    });

    renderUpload(
      { documents: [], documentCount: 0 },
      {
        onAttachGeneratedDocuments,
        companies: [
          { id: 'company-1', name: 'Acme Pte Ltd', uen: '201900001A' },
          { id: 'company-2', name: 'Beta Pte Ltd', uen: '201900002B' },
        ],
      },
    );

    await user.click(screen.getByRole('button', { name: 'Add from Generated documents' }));
    await waitFor(() => expect(screen.getByText('Board resolution')).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('status=FINALIZED'),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('sortOrder=desc'),
      expect.anything(),
    );

    await user.click(screen.getByRole('checkbox', { name: 'Select Board resolution' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select Service agreement' }));
    expect(screen.getByText('2 selected')).toBeInTheDocument();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Sort by updated date' }), 'asc');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('sortOrder=asc'),
      expect.anything(),
    ));

    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter by company' }), 'company-1');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('companyId=company-1'),
      expect.anything(),
    ));

    await user.click(screen.getByRole('button', { name: 'Add selected' }));
    await waitFor(() => expect(onAttachGeneratedDocuments).toHaveBeenCalledWith([
      'generated-1',
      'generated-2',
    ]));
  });

  it('sends null when a saved message is cleared', async () => {
    const user = userEvent.setup();
    const { onUpdateSettings, onNext } = renderUpload({ message: 'Sensitive old text' });

    await user.clear(screen.getByRole('textbox', { name: 'Message' }));
    await user.click(nextButton());

    await waitFor(() => expect(onUpdateSettings).toHaveBeenCalled());
    expect(onUpdateSettings).toHaveBeenCalledWith(expect.objectContaining({ message: null }));
    expect(onNext).toHaveBeenCalled();
  });

  it.each([
    ['blank subject', '', 'String must contain at least 1 character(s)'],
    ['overlong subject', 'x'.repeat(161), 'String must contain at most 160 character(s)'],
  ] as const)('blocks %s and focuses the subject field', async (_label, value, message) => {
    const user = userEvent.setup();
    const { onUpdateSettings, onNext } = renderUpload();

    fireEvent.change(screen.getByRole('textbox', { name: 'Email subject' }), {
      target: { value },
    });
    await user.click(nextButton());

    expect(onNext).not.toHaveBeenCalled();
    expect(onUpdateSettings).not.toHaveBeenCalled();
    expect(screen.getByText(message)).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Email subject' })).toHaveFocus()
    );
  });

  it('blocks an overlong message and focuses it', async () => {
    const user = userEvent.setup();
    const { onNext } = renderUpload();

    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), {
      target: { value: 'x'.repeat(4001) },
    });
    await user.click(nextButton());

    expect(onNext).not.toHaveBeenCalled();
    expect(screen.getByText(/at most 4000 character/)).toBeInTheDocument();
    await waitFor(() => expect(document.activeElement?.tagName).toBe('TEXTAREA'));
  });

  it.each([
    ['out-of-range reminder', '0'],
    ['fractional reminder', '1.5'],
  ] as const)('blocks %s and focuses the first invalid advanced field', async (_label, value) => {
    const user = userEvent.setup();
    const { onNext } = renderUpload();

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Reminder every' }), {
      target: { value },
    });
    await user.click(nextButton());

    expect(onNext).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByRole('spinbutton', { name: 'Reminder every' })).toHaveFocus()
    );
  });

  it('keeps the step mounted and announces a rejected settings update', async () => {
    const user = userEvent.setup();
    const onUpdateSettings = vi.fn().mockRejectedValue(new Error('Server rejected title'));
    const { onNext } = renderUpload({}, { onUpdateSettings });

    await user.click(nextButton());

    await waitFor(() => expect(onUpdateSettings).toHaveBeenCalled());
    expect(onNext).not.toHaveBeenCalled();
    expect(screen.getByText('Server rejected title')).toBeInTheDocument();
  });

  it('keeps the step mounted and announces a rejected recipient reorder', async () => {
    const user = userEvent.setup();
    const onReorderRecipients = vi.fn().mockRejectedValue(new Error('Server rejected reorder'));
    const { onNext } = renderUpload({}, { onReorderRecipients });

    await user.click(screen.getByRole('button', { name: /Order: Parallel/i }));
    await user.click(nextButton());

    await waitFor(() => expect(onReorderRecipients).toHaveBeenCalled());
    expect(onNext).not.toHaveBeenCalled();
    expect(screen.getByText('Server rejected reorder')).toBeInTheDocument();
  });
});
