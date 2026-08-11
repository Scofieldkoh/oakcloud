import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EsigningSignPage } from '@/components/esigning/esigning-sign-page';
import type {
  EsigningFieldDefinitionDto,
  EsigningSigningSessionDto,
  EsigningSigningSessionStatusDto,
} from '@/types/esigning';

const mocks = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ token: 'token-1' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ success: mocks.toastSuccess, error: mocks.toastError }),
}));

vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
}));

vi.mock('@/components/processing/document-page-viewer', () => ({
  DocumentPageViewer: ({
    renderHighlightContent,
    highlights,
  }: {
    renderHighlightContent: (highlight: { label: string }, pixelRect: unknown, index: number) => React.ReactNode;
    highlights: Array<{ label: string }>;
  }) => (
    <div data-testid="document-page-viewer">
      {(highlights ?? []).map((highlight, index) => (
        <div key={highlight.label}>{renderHighlightContent(highlight, null, index)}</div>
      ))}
    </div>
  ),
}));

vi.mock('@/components/esigning/signing/esigning-consent-screen', () => ({
  EsigningConsentScreen: ({
    envelopeTitle,
    isSubmitting,
    onConsent,
  }: {
    envelopeTitle: string;
    isSubmitting: boolean;
    onConsent: () => void;
  }) => (
    <div data-testid="consent-screen">
      <h1>{envelopeTitle}</h1>
      <label>
        <input type="checkbox" aria-label="I agree to use electronic records" />
        I agree to use electronic records
      </label>
      <button type="button" onClick={() => void onConsent()} disabled={isSubmitting}>
        Continue to Document
      </button>
    </div>
  ),
}));

vi.mock('@/components/esigning/signing/esigning-signing-header', () => ({
  EsigningSigningHeader: () => null,
}));

vi.mock('@/components/esigning/signing/esigning-signature-modal', () => ({
  EsigningSignatureModal: () => null,
}));

vi.mock('@/components/esigning/signing/esigning-decline-modal', () => ({
  EsigningDeclineModal: () => null,
}));

vi.mock('@/components/esigning/signing/esigning-post-it-tab', () => ({
  EsigningPostItTab: () => null,
}));

let consentHandler: () => Promise<Response> | Response;
let consentRequestCount = 0;
let fieldSaveRequests: RequestInit[] = [];
let fieldsHandler: ((init?: RequestInit) => Promise<Response> | Response) | null = null;
let currentSession: EsigningSigningSessionDto;
let statusHandler: (() => Promise<Response> | Response) | null = null;
let statusRequestCount = 0;
let sessionLoadHandler: (() => Promise<Response> | Response) | null = null;

function makeSession(
  overrides: Partial<EsigningSigningSessionDto> = {}
): EsigningSigningSessionDto {
  return {
    envelope: {
      id: 'envelope-1',
      title: 'NDA',
      message: null,
      status: 'SENT',
      pdfGenerationStatus: null,
      certificateId: 'certificate-1',
      companyName: null,
      tenantName: 'Acme Pte Ltd',
      senderName: 'Sender',
      completedAt: null,
      expiresAt: null,
      autoFilingStatus: 'NOT_REQUIRED',
      completionDeliveryStatus: 'NOT_TRACKED',
    },
    recipient: {
      id: 'recipient-1',
      name: 'Client',
      email: 'client@example.com',
      type: 'SIGNER',
      status: 'QUEUED',
      accessMode: 'EMAIL_LINK',
      consentedAt: null,
      viewedAt: null,
      signedAt: null,
      colorTag: '#06b6d4',
    },
    documents: [],
    recipients: [],
    fields: [],
    fieldValues: [],
    downloadToken: null,
    currentRecipientDeliveryStatus: 'AWAITING_COMPLETION',
    ...overrides,
  };
}

function makeField(
  overrides: Partial<EsigningFieldDefinitionDto> = {}
): EsigningFieldDefinitionDto {
  return {
    id: 'field-1',
    documentId: 'document-1',
    recipientId: 'recipient-1',
    type: 'TEXT',
    pageNumber: 1,
    xPercent: 50,
    yPercent: 50,
    widthPercent: 20,
    heightPercent: 10,
    required: true,
    label: null,
    placeholder: null,
    sortOrder: 1,
    ...overrides,
  };
}

function makeSigningSession(
  field: EsigningFieldDefinitionDto,
  overrides: Partial<EsigningSigningSessionDto> = {}
): EsigningSigningSessionDto {
  return makeSession({
    envelope: {
      ...makeSession().envelope,
      status: 'IN_PROGRESS',
    },
    recipient: {
      ...makeSession().recipient,
      status: 'VIEWED',
      consentedAt: '2026-08-11T08:00:00.000Z',
      viewedAt: '2026-08-11T08:01:00.000Z',
    },
    documents: [
      {
        id: 'document-1',
        fileName: 'nda.pdf',
        pageCount: 1,
        sortOrder: 1,
        fileSize: 1024,
        originalHash: 'original-hash',
        signedHash: null,
        pdfUrl: '/nda.pdf',
        signedPdfUrl: null,
      },
    ],
    recipients: [
      {
        id: 'recipient-1',
        name: 'Client',
        type: 'SIGNER',
        status: 'VIEWED',
        signingOrder: 1,
        colorTag: '#06b6d4',
      },
    ],
    fields: [field],
    fieldValues: [],
    ...overrides,
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function statusForSession(session: EsigningSigningSessionDto): EsigningSigningSessionStatusDto {
  return {
    envelope: {
      id: session.envelope.id,
      status: session.envelope.status,
      expiresAt: session.envelope.expiresAt,
      pdfGenerationStatus: session.envelope.pdfGenerationStatus,
      autoFilingStatus: session.envelope.autoFilingStatus,
      completionDeliveryStatus: session.envelope.completionDeliveryStatus,
    },
    recipient: {
      id: session.recipient.id,
      status: session.recipient.status,
      signedAt: session.recipient.signedAt,
    },
    currentRecipientDeliveryStatus: session.currentRecipientDeliveryStatus,
    remainingSignerCount: session.recipients.filter(
      (recipient) => recipient.type === 'SIGNER' && recipient.status !== 'SIGNED'
    ).length,
    terminal: false,
  };
}

function stubSigningFetch(session: EsigningSigningSessionDto) {
  consentRequestCount = 0;
  fieldSaveRequests = [];
  fieldsHandler = null;
  currentSession = session;
  statusHandler = null;
  statusRequestCount = 0;
  sessionLoadHandler = null;

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith('/api/esigning/sign/token-1')) {
        return jsonResponse({ requiresAccessCode: false });
      }
      if (url.endsWith('/api/public-bootstrap/esigning/session')) {
        return sessionLoadHandler
          ? sessionLoadHandler()
          : jsonResponse({ session: currentSession });
      }
      if (url.endsWith('/api/esigning/sign/session/view')) {
        return jsonResponse(currentSession);
      }
      if (url.endsWith('/api/esigning/sign/session/consent')) {
        consentRequestCount += 1;
        return consentHandler();
      }
      if (url.endsWith('/api/esigning/sign/session/status')) {
        statusRequestCount += 1;
        return statusHandler ? statusHandler() : jsonResponse(statusForSession(currentSession));
      }
      if (url.endsWith('/api/esigning/sign/session/fields')) {
        fieldSaveRequests.push(init ?? {});
        return fieldsHandler ? fieldsHandler(init) : jsonResponse(currentSession);
      }

      throw new Error(`Unexpected fetch in test: ${url}`);
    })
  );
}

async function renderConsentFlow(session: EsigningSigningSessionDto = makeSession()) {
  stubSigningFetch(session);
  render(<EsigningSignPage />);
  await screen.findByTestId('consent-screen');
  return { user: userEvent.setup() };
}

describe('EsigningSignPage consent', () => {
  beforeEach(() => {
    mocks.toastError.mockClear();
    mocks.toastSuccess.mockClear();
    consentHandler = () => jsonResponse(makeSession());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each([
    ['network failure', () => Promise.reject(new TypeError('Failed to fetch')), 'Connection lost'],
    ['expired envelope', () => jsonResponse({ error: 'This envelope has expired' }, 400), 'Envelope expired'],
    ['expired session', () => jsonResponse({ error: 'Your signing session expired' }, 401), 'Session expired'],
  ] as const)(
    'does not enter signing when consent fails with %s',
    async (_label, handler, errorTitle) => {
      consentHandler = () => handler();
      const { user } = await renderConsentFlow();

      await user.click(screen.getByRole('checkbox', { name: /I agree/i }));
      await user.click(screen.getByRole('button', { name: /Continue to Document/i }));

      await waitFor(() => expect(consentRequestCount).toBe(1));
      expect(screen.queryByTestId('signing-document')).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { name: errorTitle })).toBeInTheDocument();
    }
  );

  it('keeps the consent screen mounted and announces a generic server error', async () => {
    consentHandler = () => jsonResponse({ error: 'Internal server error' }, 500);
    const { user } = await renderConsentFlow();

    await user.click(screen.getByRole('checkbox', { name: /I agree/i }));
    await user.click(screen.getByRole('button', { name: /Continue to Document/i }));

    await waitFor(() => expect(consentRequestCount).toBe(1));
    expect(screen.queryByTestId('signing-document')).not.toBeInTheDocument();
    expect(screen.getByTestId('consent-screen')).toBeInTheDocument();
    expect(mocks.toastError).toHaveBeenCalledWith('Internal server error');
  });

  it('retries a generic consent failure from the same consent screen', async () => {
    consentHandler = () => jsonResponse({ error: 'Internal server error' }, 500);
    const { user } = await renderConsentFlow();

    await user.click(screen.getByRole('checkbox', { name: /I agree/i }));
    await user.click(screen.getByRole('button', { name: /Continue to Document/i }));
    await waitFor(() => expect(consentRequestCount).toBe(1));

    consentHandler = () => jsonResponse(
      makeSession({
        recipient: {
          ...makeSession().recipient,
          consentedAt: '2026-08-11T08:00:00.000Z',
        },
      })
    );
    await user.click(screen.getByRole('button', { name: /Continue to Document/i }));

    await waitFor(() => expect(screen.getByTestId('signing-document')).toBeInTheDocument());
    expect(consentRequestCount).toBe(2);
  });

  it('provides a resume action for network and session-expired consent failures', async () => {
    consentHandler = () => Promise.reject(new TypeError('Failed to fetch'));
    const { user } = await renderConsentFlow();

    await user.click(screen.getByRole('checkbox', { name: /I agree/i }));
    await user.click(screen.getByRole('button', { name: /Continue to Document/i }));

    await waitFor(() => expect(screen.getByRole('button', { name: /Resume signing/i })).toBeInTheDocument());
    expect(screen.queryByTestId('signing-document')).not.toBeInTheDocument();
    expect(consentRequestCount).toBe(1);
  });

  it('enters signing only after the server confirms consent', async () => {
    const consentedSession = makeSession({
      recipient: {
        ...makeSession().recipient,
        consentedAt: '2026-08-11T08:00:00.000Z',
      },
    });
    consentHandler = () => jsonResponse(consentedSession);
    const { user } = await renderConsentFlow();

    await user.click(screen.getByRole('checkbox', { name: /I agree/i }));
    await user.click(screen.getByRole('button', { name: /Continue to Document/i }));

    await waitFor(() => expect(screen.getByTestId('signing-document')).toBeInTheDocument());
    expect(consentRequestCount).toBe(1);
  });

  it('does not enter signing when the server response omits consentedAt', async () => {
    consentHandler = () => jsonResponse(makeSession());
    const { user } = await renderConsentFlow();

    await user.click(screen.getByRole('checkbox', { name: /I agree/i }));
    await user.click(screen.getByRole('button', { name: /Continue to Document/i }));

    await waitFor(() => expect(consentRequestCount).toBe(1));
    expect(screen.queryByTestId('signing-document')).not.toBeInTheDocument();
    expect(mocks.toastError).toHaveBeenCalledWith('Consent was not confirmed by the server');
  });
});

describe('EsigningSignPage autosave and field values', () => {
  beforeEach(() => {
    mocks.toastError.mockClear();
    mocks.toastSuccess.mockClear();
    consentHandler = () => jsonResponse(makeSession());
    fieldsHandler = null;
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
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('does not save an untouched signature-only envelope', async () => {
    const session = makeSigningSession(makeField({ type: 'SIGNATURE' }));
    stubSigningFetch(session);
    render(<EsigningSignPage />);

    await screen.findByTestId('signing-document');
    await new Promise((resolve) => setTimeout(resolve, 650));

    expect(fieldSaveRequests).toHaveLength(0);
  });

  it.each(['TEXT', 'TITLE'] as const)(
    'does not adopt a %s placeholder as a value',
    async (type) => {
      const session = makeSigningSession(
        makeField({ type, placeholder: 'Enter job title' })
      );
      stubSigningFetch(session);
      render(<EsigningSignPage />);

      await screen.findByTestId('signing-document');
      await userEvent.click(screen.getByRole('button', { name: /Fill In/i }));

      expect(screen.getByRole('textbox')).toHaveValue('');
      expect(screen.getByRole('textbox')).toHaveAttribute('placeholder', 'Enter job title');
    }
  );

  it('saves an automatic DATE_SIGNED value exactly once', async () => {
    const session = makeSigningSession(makeField({ type: 'DATE_SIGNED' }));
    stubSigningFetch(session);
    render(<EsigningSignPage />);

    await screen.findByTestId('signing-document');
    await waitFor(() => expect(fieldSaveRequests).toHaveLength(1));

    const body = JSON.parse(String(fieldSaveRequests[0].body)) as {
      values: Array<{ fieldDefinitionId: string; value: string }>;
    };
    expect(body.values).toHaveLength(1);
    expect(body.values[0].fieldDefinitionId).toBe('field-1');
    expect(body.values[0].value).toMatch(/^\d{2}-\d{2}-\d{4}$/);

    await new Promise((resolve) => setTimeout(resolve, 700));
    expect(fieldSaveRequests).toHaveLength(1);
  });

  it('schedules a second save when the signer edits during an in-flight save', async () => {
    const session = makeSigningSession(makeField({ type: 'TEXT' }));
    stubSigningFetch(session);

    let resolveFirstSave!: (response: Response) => void;
    const firstSave = new Promise<Response>((resolve) => {
      resolveFirstSave = resolve;
    });
    let fieldsCallCount = 0;
    fieldsHandler = () => {
      fieldsCallCount += 1;
      if (fieldsCallCount === 1) {
        return firstSave;
      }
      return jsonResponse(session);
    };

    render(<EsigningSignPage />);
    await screen.findByTestId('signing-document');

    await userEvent.click(screen.getByRole('button', { name: /Fill In/i }));
    await userEvent.clear(screen.getByRole('textbox'));
    await userEvent.type(screen.getByRole('textbox'), 'Edited');
    await userEvent.click(screen.getByRole('button', { name: /Save/i }));

    await waitFor(() => expect(fieldSaveRequests).toHaveLength(1));

    await userEvent.click(screen.getByRole('button', { name: /Fill In/i }));
    await userEvent.clear(screen.getByRole('textbox'));
    await userEvent.type(screen.getByRole('textbox'), 'Final');
    await userEvent.click(screen.getByRole('button', { name: /Save/i }));

    resolveFirstSave(jsonResponse(session));

    await waitFor(() => expect(fieldSaveRequests).toHaveLength(2));
    const secondBody = JSON.parse(String(fieldSaveRequests[1].body)) as {
      values: Array<{ value: string }>;
    };
    expect(secondBody.values[0].value).toBe('Final');
  });
});

describe('EsigningSignPage completion polling', () => {
  beforeEach(() => {
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

  async function advance(ms: number) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  }

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('refreshes to the completion view when the envelope completes without reload', async () => {
    vi.useFakeTimers();
    const initial = makeSigningSession(makeField({ type: 'SIGNATURE' }));
    stubSigningFetch(initial);

    const completedSession: EsigningSigningSessionDto = {
      ...initial,
      envelope: {
        ...initial.envelope,
        status: 'COMPLETED',
        pdfGenerationStatus: 'PENDING',
        autoFilingStatus: 'NOT_REQUIRED',
        completionDeliveryStatus: 'PENDING',
      },
      recipient: {
        ...initial.recipient,
        status: 'SIGNED',
        signedAt: '2026-08-11T08:00:00.000Z',
      },
      currentRecipientDeliveryStatus: 'PENDING',
    };
    let index = 0;
    statusHandler = () => {
      index += 1;
      if (index >= 1) {
        currentSession = completedSession;
      }
      return jsonResponse({ ...statusForSession(completedSession), terminal: false });
    };

    render(<EsigningSignPage />);
    await advance(100);
    expect(screen.getByTestId('signing-document')).toBeInTheDocument();

    await advance(30_100);
    expect(screen.getByRole('heading', { name: 'Completed' })).toBeInTheDocument();
    expect(screen.getByText(/completed copy is being prepared/i)).toBeInTheDocument();
  });

  it('shows signed links after PDF completion and stops polling when terminal', async () => {
    vi.useFakeTimers();
    const base = makeSigningSession(makeField({ type: 'SIGNATURE' }));
    const pendingSession: EsigningSigningSessionDto = {
      ...base,
      envelope: {
        ...base.envelope,
        status: 'COMPLETED',
        pdfGenerationStatus: 'PENDING',
        autoFilingStatus: 'NOT_REQUIRED',
        completionDeliveryStatus: 'PENDING',
      },
      recipient: {
        ...base.recipient,
        status: 'SIGNED',
        signedAt: '2026-08-11T08:00:00.000Z',
      },
      currentRecipientDeliveryStatus: 'PENDING',
    };
    stubSigningFetch(pendingSession);

    const completeSession: EsigningSigningSessionDto = {
      ...pendingSession,
      envelope: {
        ...pendingSession.envelope,
        pdfGenerationStatus: 'COMPLETED',
        completionDeliveryStatus: 'COMPLETED',
      },
      documents: [
        {
          id: 'document-1',
          fileName: 'nda.pdf',
          pageCount: 1,
          sortOrder: 1,
          fileSize: 1024,
          originalHash: 'original-hash',
          signedHash: 'signed-hash',
          pdfUrl: '/nda.pdf',
          signedPdfUrl: '/signed.pdf',
        },
      ],
      currentRecipientDeliveryStatus: 'SENT',
    };

    let statusIndex = 0;
    statusHandler = () => {
      statusIndex += 1;
      if (statusIndex === 1) {
        return jsonResponse({ ...statusForSession(pendingSession), terminal: false });
      }
      currentSession = completeSession;
      return jsonResponse({ ...statusForSession(completeSession), terminal: true });
    };

    render(<EsigningSignPage />);
    await advance(100);
    expect(screen.getByText(/Preparing your signed document/i)).toBeInTheDocument();

    await advance(30_100);
    await advance(30_100);
    expect(screen.getByRole('link', { name: /Save a Copy/i })).toBeInTheDocument();
    expect(screen.getByText(/has been emailed to you/i)).toBeInTheDocument();

    await advance(90_000);
    expect(statusRequestCount).toBe(2);
  });

  it('renders a PDF failure instead of a permanent spinner', async () => {
    vi.useFakeTimers();
    const base = makeSigningSession(makeField({ type: 'SIGNATURE' }));
    const failedSession: EsigningSigningSessionDto = {
      ...base,
      envelope: {
        ...base.envelope,
        status: 'COMPLETED',
        pdfGenerationStatus: 'FAILED',
        autoFilingStatus: 'NOT_REQUIRED',
        completionDeliveryStatus: 'NOT_TRACKED',
      },
      recipient: {
        ...base.recipient,
        status: 'SIGNED',
        signedAt: '2026-08-11T08:00:00.000Z',
      },
      currentRecipientDeliveryStatus: 'NOT_TRACKED',
    };
    stubSigningFetch(failedSession);
    statusHandler = () => jsonResponse({ ...statusForSession(failedSession), terminal: true });

    render(<EsigningSignPage />);
    await advance(100);

    expect(screen.getByText(/Signed document could not be prepared/i)).toBeInTheDocument();
    expect(screen.queryByText(/Preparing your signed document/i)).not.toBeInTheDocument();
  });

  it('tracks copy delivery transitions through retrying and failure', async () => {
    vi.useFakeTimers();
    const base = makeSigningSession(makeField({ type: 'SIGNATURE' }));
    const retryingSession: EsigningSigningSessionDto = {
      ...base,
      envelope: {
        ...base.envelope,
        status: 'COMPLETED',
        pdfGenerationStatus: 'COMPLETED',
        autoFilingStatus: 'COMPLETED',
        completionDeliveryStatus: 'RETRYING',
      },
      recipient: {
        ...base.recipient,
        status: 'SIGNED',
        signedAt: '2026-08-11T08:00:00.000Z',
      },
      currentRecipientDeliveryStatus: 'RETRYING',
    };
    stubSigningFetch(retryingSession);

    let deliveryIndex = 0;
    statusHandler = () => {
      deliveryIndex += 1;
      if (deliveryIndex === 1) {
        return jsonResponse({ ...statusForSession(retryingSession), terminal: false });
      }
      currentSession = {
        ...retryingSession,
        envelope: {
          ...retryingSession.envelope,
          completionDeliveryStatus: 'FAILED',
        },
        currentRecipientDeliveryStatus: 'FAILED',
      };
      return jsonResponse({
        ...statusForSession({
          ...retryingSession,
          envelope: { ...retryingSession.envelope, completionDeliveryStatus: 'FAILED' },
          currentRecipientDeliveryStatus: 'FAILED',
        }),
        terminal: true,
      });
    };

    render(<EsigningSignPage />);
    await advance(100);
    expect(screen.getByText(/retrying to send your completed copy/i)).toBeInTheDocument();

    await advance(30_100);
    await advance(30_100);
    expect(screen.getByText(/could not email your completed copy/i)).toBeInTheDocument();
  });

  it('refreshes immediately when the tab becomes visible while non-terminal', async () => {
    vi.useFakeTimers();
    const base = makeSigningSession(makeField({ type: 'SIGNATURE' }));
    const pendingSession: EsigningSigningSessionDto = {
      ...base,
      envelope: {
        ...base.envelope,
        status: 'COMPLETED',
        pdfGenerationStatus: 'PENDING',
        autoFilingStatus: 'NOT_REQUIRED',
        completionDeliveryStatus: 'PENDING',
      },
      recipient: {
        ...base.recipient,
        status: 'SIGNED',
        signedAt: '2026-08-11T08:00:00.000Z',
      },
      currentRecipientDeliveryStatus: 'PENDING',
    };
    stubSigningFetch(pendingSession);
    statusHandler = () => jsonResponse({ ...statusForSession(pendingSession), terminal: false });

    render(<EsigningSignPage />);
    await advance(100);
    expect(screen.getByRole('heading', { name: 'Completed' })).toBeInTheDocument();
    expect(statusRequestCount).toBe(0);

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    document.dispatchEvent(new Event('visibilitychange'));
    await advance(100);
    expect(statusRequestCount).toBe(1);
  });

  it('recovers terminal hydration after a failed full-session reload', async () => {
    vi.useFakeTimers();
    const base = makeSigningSession(makeField({ type: 'TEXT' }));
    const completedSession: EsigningSigningSessionDto = {
      ...base,
      envelope: {
        ...base.envelope,
        status: 'COMPLETED',
        pdfGenerationStatus: 'PENDING',
        autoFilingStatus: 'NOT_REQUIRED',
        completionDeliveryStatus: 'PENDING',
      },
      recipient: {
        ...base.recipient,
        status: 'SIGNED',
        signedAt: '2026-08-11T08:00:00.000Z',
      },
      currentRecipientDeliveryStatus: 'PENDING',
    };
    stubSigningFetch(base);

    render(<EsigningSignPage />);
    await advance(100);
    expect(screen.getByTestId('signing-document')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Fill In/i }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Draft kept' } });
    expect(screen.getByRole('textbox')).toHaveValue('Draft kept');

    let reloadCount = 0;
    sessionLoadHandler = () => {
      reloadCount += 1;
      if (reloadCount === 1) {
        return jsonResponse({ error: 'Failed to load signing session' }, 500);
      }
      return jsonResponse({ session: currentSession });
    };
    statusHandler = () => {
      currentSession = completedSession;
      return jsonResponse({ ...statusForSession(completedSession), terminal: true });
    };

    await advance(30_100);
    expect(screen.getByText('Failed to load signing session')).toBeInTheDocument();
    expect(screen.getByTestId('signing-document')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Completed' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue('Draft kept');

    await advance(30_100);
    expect(screen.getByRole('heading', { name: 'Completed' })).toBeInTheDocument();

    await advance(90_000);
    expect(statusRequestCount).toBe(2);
    expect(reloadCount).toBe(2);
  });
});
