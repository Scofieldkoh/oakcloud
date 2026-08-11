import { useState } from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EsigningFieldCanvas,
  LARGE_NUDGE_STEP,
  NUDGE_STEP,
  type PlacedField,
} from '@/components/esigning/prepare/esigning-field-canvas';
import type { EsigningEnvelopeDocumentDto, EsigningEnvelopeRecipientDto } from '@/types/esigning';

vi.mock('@/components/processing/document-page-viewer', () => ({
  DocumentPageViewer: () => (
    <div data-document-scroll-container="true" style={{ width: 800, height: 1000 }}>
      <canvas
        data-main-pdf-canvas="true"
        tabIndex={0}
        aria-label="PDF canvas"
        style={{ width: 800, height: 1000 }}
      />
    </div>
  ),
}));

const documents: EsigningEnvelopeDocumentDto[] = [
  {
    id: 'document-1',
    fileName: 'nda.pdf',
    pageCount: 2,
    sortOrder: 1,
    fileSize: 1024,
    originalHash: 'hash-1',
    signedHash: null,
    pdfUrl: '/nda.pdf',
    signedPdfUrl: null,
  },
  {
    id: 'document-2',
    fileName: 'second.pdf',
    pageCount: 1,
    sortOrder: 2,
    fileSize: 1024,
    originalHash: 'hash-2',
    signedHash: null,
    pdfUrl: '/second.pdf',
    signedPdfUrl: null,
  },
];

const recipients: EsigningEnvelopeRecipientDto[] = [
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
];

function makeField(overrides: Partial<PlacedField> = {}): PlacedField {
  return {
    localId: 'field-a',
    documentId: 'document-1',
    recipientId: 'recipient-1',
    type: 'TEXT',
    pageNumber: 1,
    xPercent: 0.5,
    yPercent: 0.5,
    widthPercent: 0.2,
    heightPercent: 0.04,
    required: true,
    label: null,
    placeholder: null,
    sortOrder: 1,
    ...overrides,
  };
}

function CanvasHarness({
  initialFields,
  initialDocumentId = 'document-1',
  initialPage = 1,
  initialSelection = null,
}: {
  initialFields: PlacedField[];
  initialDocumentId?: string;
  initialPage?: number;
  initialSelection?: string | null;
}) {
  const [fields, setFields] = useState(initialFields);
  const [documentId, setDocumentId] = useState(initialDocumentId);
  const [page, setPage] = useState(initialPage);
  const [selection, setSelection] = useState<string | null>(initialSelection);

  return (
    <div>
      <div data-testid="harness-selection" data-selection={selection ?? ''} />
      <div
        data-testid="harness-fields"
        data-fields={JSON.stringify(
          fields.map((field) => [field.localId, field.xPercent, field.yPercent])
        )}
      />
      <button type="button" onClick={() => setPage(2)}>
        Go to page 2
      </button>
      <button type="button" onClick={() => setDocumentId('document-2')}>
        Go to document 2
      </button>
      <EsigningFieldCanvas
        documents={documents}
        selectedDocumentId={documentId}
        onDocumentChange={setDocumentId}
        fields={fields}
        onFieldsChange={setFields}
        selectedFieldId={selection}
        onFieldSelect={setSelection}
        placementType={null}
        placementRecipientId="recipient-1"
        recipients={recipients}
        viewerPage={page}
        onPageChange={setPage}
        zoomLevel={1}
        onZoomLevelChange={vi.fn()}
        canEdit
      />
    </div>
  );
}

function dispatchKey(key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  act(() => {
    document.body.dispatchEvent(event);
  });
  return event;
}

function canvasElement(): HTMLCanvasElement {
  const canvas = document.querySelector<HTMLCanvasElement>('[data-main-pdf-canvas="true"]');
  if (!canvas) throw new Error('Canvas stub missing');
  return canvas;
}

describe('EsigningFieldCanvas keyboard ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      'ResizeObserver',
      class ResizeObserverStub {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not prevent arrows from the body with no selection', () => {
    render(<CanvasHarness initialFields={[makeField()]} />);

    const event = dispatchKey('ArrowDown');
    expect(event.defaultPrevented).toBe(false);
    expect(screen.getByTestId('harness-fields').getAttribute('data-fields')).toContain('0.5');
  });

  it('does not move an off-page selection even when the canvas is focused', () => {
    const fieldOnPage2 = makeField({ localId: 'field-b', pageNumber: 2 });
    render(
      <CanvasHarness
        initialFields={[makeField(), fieldOnPage2]}
        initialPage={1}
        initialSelection="field-b"
      />
    );

    act(() => canvasElement().focus());
    const event = dispatchKey('ArrowDown');

    expect(event.defaultPrevented).toBe(false);
  });

  it('moves a focused visible selection by the nudge step', () => {
    render(
      <CanvasHarness
        initialFields={[makeField()]}
        initialPage={1}
        initialSelection="field-a"
      />
    );

    act(() => canvasElement().focus());
    const event = dispatchKey('ArrowDown');

    expect(event.defaultPrevented).toBe(true);
    const fieldsJson = screen.getByTestId('harness-fields').getAttribute('data-fields') ?? '';
    const fieldEntry = JSON.parse(fieldsJson).find(
      (entry: [string, number, number]) => entry[0] === 'field-a'
    ) as [string, number, number];
    expect(fieldEntry[2]).toBeCloseTo(0.5 + NUDGE_STEP, 6);
  });

  it('uses the large nudge step with Shift+Arrow', () => {
    render(
      <CanvasHarness
        initialFields={[makeField()]}
        initialPage={1}
        initialSelection="field-a"
      />
    );

    act(() => canvasElement().focus());
    const event = dispatchKey('ArrowRight', { shiftKey: true });

    expect(event.defaultPrevented).toBe(true);
    const fieldsJson = screen.getByTestId('harness-fields').getAttribute('data-fields') ?? '';
    const fieldEntry = JSON.parse(fieldsJson).find(
      (entry: [string, number, number]) => entry[0] === 'field-a'
    ) as [string, number, number];
    expect(fieldEntry[1]).toBeCloseTo(0.5 + LARGE_NUDGE_STEP, 6);
  });

  it('deletes only a focused visible selection', () => {
    render(
      <CanvasHarness
        initialFields={[makeField(), makeField({ localId: 'field-other', xPercent: 0.8 })]}
        initialPage={1}
        initialSelection="field-a"
      />
    );

    act(() => canvasElement().focus());
    const event = dispatchKey('Delete');

    expect(event.defaultPrevented).toBe(true);
    expect(screen.getByTestId('harness-selection').getAttribute('data-selection')).toBe('');
    const fieldsJson = screen.getByTestId('harness-fields').getAttribute('data-fields') ?? '';
    expect(JSON.parse(fieldsJson)).toHaveLength(1);
  });

  it('reconciles selection when the page or document changes and does not resurrect it', () => {
    render(
      <CanvasHarness
        initialFields={[makeField()]}
        initialPage={1}
        initialSelection="field-a"
      />
    );

    expect(screen.getByTestId('harness-selection').getAttribute('data-selection')).toBe('field-a');

    act(() => screen.getByRole('button', { name: /Go to page 2/ }).click());
    expect(screen.getByTestId('harness-selection').getAttribute('data-selection')).toBe('');

    act(() => screen.getByRole('button', { name: /Go to page 2/ }).click());
    expect(screen.getByTestId('harness-selection').getAttribute('data-selection')).toBe('');

    act(() => screen.getByRole('button', { name: /Go to document 2/ }).click());
    expect(screen.getByTestId('harness-selection').getAttribute('data-selection')).toBe('');
  });
});
