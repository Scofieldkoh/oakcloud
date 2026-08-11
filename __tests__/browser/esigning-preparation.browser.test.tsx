import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { Modal } from '@/components/ui/modal';
import { EsigningStepFields } from '@/components/esigning/prepare/esigning-step-fields';
import type { EsigningEnvelopeDetailDto } from '@/types/esigning';
import '@/app/globals.css';

vi.mock('@/components/processing/document-page-viewer', () => ({
  DocumentPageViewer: () => (
    <div
      data-main-pdf-canvas="true"
      data-document-scroll-container="true"
      style={{ width: '100%', height: 600 }}
    />
  ),
  DOCUMENT_PAGE_VIEWER_ZOOM_LEVELS: [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5],
}));

async function waitUntil(check: () => boolean, timeout = 4000) {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > timeout) {
      throw new Error('Timed out waiting for E-signing preparation UI');
    }
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  }
}

function makeEnvelope(): EsigningEnvelopeDetailDto {
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
    recipientCount: 2,
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
      {
        id: 'recipient-2',
        name: 'CC Person',
        email: 'cc@example.com',
        type: 'CC',
        status: 'QUEUED',
        signingOrder: null,
        accessMode: 'EMAIL_LINK',
        hasAccessCode: false,
        colorTag: '#10b981',
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
  };
}

function ModalHarness() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" id="modal-opener" onClick={() => setOpen(true)}>
        Open modal
      </button>
      <Modal isOpen={open} onClose={() => setOpen(false)} title="Bottom sheet" placement="bottom">
        <button type="button">First</button>
        <button type="button">Last</button>
      </Modal>
    </div>
  );
}

describe('E-signing preparation responsive layout', () => {
  let host: HTMLDivElement;
  let root: Root;
  const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT;

  beforeAll(() => {
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(() => {
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
  });

  beforeEach(async () => {
    host = document.createElement('div');
    document.body.replaceChildren(host);
    root = createRoot(host);
    await page.viewport(390, 844);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  it('renders bottom placement as a focus-trapped dialog with Escape close and focus restoration', async () => {
    await act(async () => root.render(<ModalHarness />));
    const opener = document.querySelector<HTMLButtonElement>('#modal-opener');
    if (!opener) throw new Error('Modal opener missing');
    await act(async () => opener.focus());
    await act(async () => opener.click());

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(dialog?.textContent).toContain('Bottom sheet');
    expect(document.body.style.overflow).toBe('hidden');

    const lastButton = [...(dialog?.querySelectorAll('button') ?? [])].at(-1) as HTMLButtonElement;
    await act(async () => lastButton.focus());
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    await waitUntil(() => !document.querySelector('[role="dialog"]'));
    expect(document.activeElement).toBe(opener);
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('keeps center placement dialog semantics unchanged', async () => {
    await act(async () =>
      root.render(
        <Modal isOpen onClose={() => undefined} title="Center sheet">
          content
        </Modal>
      )
    );
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    const content = dialog?.firstElementChild as HTMLElement | null;
    expect(content?.className).toContain('rounded-2xl');
  });

  it('opens the mobile palette as an overlay and auto-closes after field selection', async () => {
    const envelope = makeEnvelope();
    await act(async () =>
      root.render(
        <EsigningStepFields
          envelope={envelope}
          fields={[]}
          onFieldsChange={vi.fn()}
          onSaveFields={vi.fn().mockResolvedValue(undefined)}
          isSaving={false}
          canUndo={false}
          canRedo={false}
          onUndo={vi.fn()}
          onRedo={vi.fn()}
          onNext={vi.fn()}
          onBack={vi.fn()}
          canEdit
        />
      )
    );

    const canvas = document.querySelector<HTMLElement>('[data-main-pdf-canvas="true"]');
    if (!canvas) throw new Error('Canvas stub missing');
    const canvasWidth = canvas.getBoundingClientRect().width;
    expect(canvasWidth).toBeGreaterThan(0);

    const paletteButton = document.querySelector<HTMLButtonElement>('button[aria-label="Open field palette"]');
    if (!paletteButton) throw new Error('Mobile palette button missing');
    await act(async () => paletteButton.click());
    await waitUntil(() => Boolean(document.querySelector('[role="dialog"]')));
    expect(canvas.getBoundingClientRect().width).toBe(canvasWidth);

    const signatureButton = [...document.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Signature')
    );
    if (!signatureButton) throw new Error('Signature palette option missing');
    await act(async () => signatureButton.click());

    await waitUntil(() => !document.querySelector('[role="dialog"]'));
    expect(host.textContent).toContain('Placing: Signature');
    expect(canvas.getBoundingClientRect().width).toBe(canvasWidth);
  });
});
