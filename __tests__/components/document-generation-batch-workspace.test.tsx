import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';

vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

const apiMock = vi.hoisted(() => ({
  createDocumentGenerationBatch: vi.fn(),
  saveDocumentGenerationBatch: vi.fn(),
  getDocumentGenerationBatch: vi.fn(),
  previewDocumentGenerationBatchItem: vi.fn(),
  reviewDocumentGenerationBatchItem: vi.fn(),
  preflightDocumentGenerationBatch: vi.fn(),
  generateDocumentGenerationBatch: vi.fn(),
  retryDocumentGenerationBatchItem: vi.fn(),
}));

vi.mock('@/lib/document-generation-batch-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/document-generation-batch-api')>()),
  ...apiMock,
}));

import {
  DocumentGenerationBatchWorkspace,
  type DocumentGenerationBatchWorkspaceProps,
} from '@/components/documents/generation-batch';
import type {
  EditableDocumentGenerationBatch,
} from '@/components/documents/generation-batch';
import type { DocumentTemplateSummary } from '@/types/document-generation';

const templates: DocumentTemplateSummary[] = [
  {
    id: 'template-a',
    name: 'Engagement Letter',
    category: 'LETTER',
    compositionType: 'STANDARD',
    version: 1,
    isActive: true,
    content: '<p>x</p>',
    placeholders: [],
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'template-b',
    name: 'Service Agreement',
    category: 'CONTRACT',
    compositionType: 'SERVICE_AGREEMENT',
    version: 1,
    isActive: true,
    content: '<p>x</p>',
    placeholders: [],
    createdAt: '',
    updatedAt: '',
  },
];

const companies = [
  { id: 'company-1', name: 'Acme Pte. Ltd.', uen: '202600001A', status: 'LIVE' },
];
const contacts: Array<{ id: string; fullName: string }> = [];

function batch(items: Array<{
  key: string;
  templateId: string;
  templateName: string;
  kind: 'STANDARD' | 'SERVICE_AGREEMENT';
  status?: EditableDocumentGenerationBatch['items'][number]['status'];
}>, overrides: Partial<EditableDocumentGenerationBatch> = {}): EditableDocumentGenerationBatch {
  return {
    id: 'batch-1',
    primaryCompanyId: 'company-1',
    company: companies[0],
    activeItemId: items[0]?.key ?? null,
    currentStage: 3,
    revision: 1,
    status: 'DRAFT',
    masterFieldValues: {},
    masterFields: { fields: [], conflicts: [] },
    createdAt: '2026-08-12T00:00:00.000Z',
    updatedAt: '2026-08-12T00:00:00.000Z',
    items: items.map((entry) => ({
      key: entry.key,
      id: entry.key,
      templateId: entry.templateId,
      templateName: entry.templateName,
      templateKind: entry.kind,
      templateVersion: 1,
      status: entry.status ?? 'NOT_STARTED',
      configuration: {
        version: 1,
        title: entry.templateName,
        contactIds: [],
        selectedDirectorId: null,
        selectedShareholderId: null,
        selectedContactId: null,
        itemValues: {},
        masterOverrides: {},
        useLetterhead: true,
        serviceAgreement: null,
      },
      previewContent: null,
      editedContent: null,
      editedContentJson: null,
      previewFingerprint: null,
      reviewedFingerprint: null,
      validationDiagnostics: null,
      lastError: null,
      generatedDocumentId: `child-${entry.key}`,
    })),
    ...overrides,
  };
}

function props(overrides: Partial<DocumentGenerationBatchWorkspaceProps> = {}) {
  return {
    templates,
    companies,
    contacts,
    ...overrides,
  };
}

function stageLabels() {
  return within(screen.getByRole('list', { name: /generation stages/i }))
    .getAllByRole('listitem')
    .map((item) => item.textContent ?? '');
}

describe('DocumentGenerationBatchWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.saveDocumentGenerationBatch.mockResolvedValue({ ...batch([], {}), revision: 2 });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ directors: [], shareholders: [], contacts: [] }), { status: 200 }),
    ));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses exactly the same four stages for standard, service agreement, and mixed batches', () => {
    for (const initialBatch of [
      batch([{ key: 'item-a', templateId: 'template-a', templateName: 'Engagement Letter', kind: 'STANDARD' }]),
      batch([{ key: 'item-b', templateId: 'template-b', templateName: 'Service Agreement', kind: 'SERVICE_AGREEMENT' }]),
      batch([
        { key: 'item-a', templateId: 'template-a', templateName: 'Engagement Letter', kind: 'STANDARD' },
        { key: 'item-b', templateId: 'template-b', templateName: 'Service Agreement', kind: 'SERVICE_AGREEMENT' },
      ]),
    ]) {
      const { unmount } = render(
        <DocumentGenerationBatchWorkspace {...props({ initialBatch })} />,
      );
      const labels = stageLabels();
      expect(labels).toEqual([
        expect.stringContaining('Documents'),
        expect.stringContaining('Shared setup'),
        expect.stringContaining('Configure'),
        expect.stringContaining('Review & generate'),
      ]);
      unmount();
    }
  });

  it('freezes Documents and Shared setup for partial batches', () => {
    const partial = batch(
      [{ key: 'item-a', templateId: 'template-a', templateName: 'Engagement Letter', kind: 'STANDARD', status: 'GENERATED' }],
      { status: 'PARTIAL' },
    );
    const { unmount } = render(
      <DocumentGenerationBatchWorkspace {...props({ initialBatch: partial })} />,
    );
    const stageList = within(screen.getByRole('list', { name: /generation stages/i }))
      .getAllByRole('listitem')
      .map((item) => item.querySelector('button'));
    expect(stageList[0]).toBeDisabled();
    expect(stageList[1]).toBeDisabled();
    unmount();
  });

  it('saves the draft from the sticky footer', () => {
    const initialBatch = batch([
      { key: 'item-a', templateId: 'template-a', templateName: 'Engagement Letter', kind: 'STANDARD' },
    ]);
    apiMock.saveDocumentGenerationBatch.mockResolvedValue(initialBatch);
    const { unmount } = render(
      <DocumentGenerationBatchWorkspace {...props({ initialBatch })} />,
    );
    const saveButtons = screen.getAllByRole('button', { name: /save draft/i });
    fireEvent.click(saveButtons[saveButtons.length - 1]);
    expect(apiMock.saveDocumentGenerationBatch).toHaveBeenCalledWith(
      'batch-1',
      expect.objectContaining({ expectedRevision: 1 }),
    );
    unmount();
  });

  it('auto-generates the preview when entering the review stage', async () => {
    const initialBatch = batch([
      { key: 'item-a', templateId: 'template-a', templateName: 'Engagement Letter', kind: 'STANDARD' },
    ]);
    apiMock.previewDocumentGenerationBatchItem.mockResolvedValue({ ...initialBatch, revision: 3 });
    const { unmount } = render(
      <DocumentGenerationBatchWorkspace {...props({ initialBatch })} />,
    );
    await waitFor(() => {
      expect(apiMock.previewDocumentGenerationBatchItem).toHaveBeenCalledWith(
        'batch-1',
        'item-a',
        expect.objectContaining({ replaceEditedContent: false }),
        expect.any(AbortSignal),
      );
    });
    unmount();
  });
});
