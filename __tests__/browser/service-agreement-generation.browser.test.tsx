import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import '@/app/globals.css';
import {
  DocumentGenerationBatchWorkspace,
} from '@/components/documents/generation-batch';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
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

vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

async function waitUntil(check: () => boolean, timeout = 4000) {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > timeout) throw new Error('Timed out waiting for browser state');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

function button(host: HTMLElement, label: string) {
  const match = Array.from(host.querySelectorAll('button')).find(
    (candidate) => candidate.textContent?.trim().includes(label),
  );
  if (!match) throw new Error(`Button not found: ${label}`);
  return match;
}

describe('Service Agreement batch generation browser workflow', () => {
  let host: HTMLDivElement;
  let root: Root;
  const actEnvironment = globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  };
  const previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT;

  beforeAll(() => {
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(() => {
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // A fresh Response per call: the workspace also queries the option
    // endpoints and a Response body can only be read once.
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/options')) {
        return Promise.resolve(new Response(
          JSON.stringify({ options: [] }),
          { status: 200 },
        ));
      }
      if (url.includes('/document-parties')) {
        return Promise.resolve(new Response(JSON.stringify({
          directors: [],
          shareholders: [],
          contacts: [{
            id: 'party-contact-1',
            contactId: 'contact-1',
            name: 'Browser Signatory',
            detail: 'Director',
            email: null,
            phone: null,
            address: { letter: null, full: null },
            contactType: 'INDIVIDUAL',
          }],
        }), { status: 200 }));
      }
      return Promise.resolve(new Response(
        JSON.stringify({ directors: [], shareholders: [], contacts: [] }),
        { status: 200 },
      ));
    }));
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  it('renders the four unified stages with embedded Service Agreement configuration', async () => {
    const savedBatch: any = {
      id: 'batch-1',
      primaryCompanyId: 'company-1',
      company: { id: 'company-1', name: 'Browser Company', uen: '202600001A' },
      activeItemId: 'item-1',
      currentStage: 0,
      revision: 1,
      status: 'DRAFT',
      masterFieldValues: {},
      masterFields: { fields: [], conflicts: [] },
      taskContext: null,
      createdAt: '2026-08-12T00:00:00.000Z',
      updatedAt: '2026-08-12T00:00:00.000Z',
      items: [{
        key: 'item-1',
        id: 'item-1',
        templateId: 'template-b',
        templateName: 'Service Agreement',
        templateKind: 'SERVICE_AGREEMENT',
        templateVersion: 1,
        displayOrder: 0,
        status: 'NOT_STARTED',
        configuration: {
          version: 1,
          title: 'Service Agreement',
          contactIds: [],
          selectedDirectorId: null,
          selectedShareholderId: null,
          selectedContactId: null,
          itemValues: {},
          masterOverrides: {},
          useLetterhead: true,
          serviceAgreement: {
            authorizedContactId: null,
            entityIds: ['company-1'],
            agreementDate: '2026-08-12',
            effectiveDate: null,
            termMonths: 12,
            items: [],
          },
        },
        previewContent: null,
        editedContent: null,
        editedContentJson: null,
        previewFingerprint: null,
        reviewedFingerprint: null,
        validationDiagnostics: null,
        lastError: null,
        generatedDocumentId: 'child-1',
        generatedDocumentTitle: null,
        serviceAgreement: null,
      }],
    };
    apiMock.createDocumentGenerationBatch.mockResolvedValue(savedBatch);
    apiMock.saveDocumentGenerationBatch.mockResolvedValue(savedBatch);

    await act(async () => {
      root.render(
        <DocumentGenerationBatchWorkspace
          templates={[{
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
          }]}
          companies={[{
            id: 'company-1',
            name: 'Browser Company',
            uen: '202600001A',
            status: 'ACTIVE',
          }]}
          contacts={[]}
          initialBatch={savedBatch}
        />,
      );
    });

    await waitUntil(() => host.textContent?.includes('Review & generate') ?? false);
    const stageLabels = Array.from(host.querySelectorAll('ol[aria-label="Generation stages"] li'))
      .map((node) => node.textContent?.trim() ?? '');
    expect(stageLabels).toEqual([
      expect.stringContaining('Documents'),
      expect.stringContaining('Shared setup'),
      expect.stringContaining('Configure'),
      expect.stringContaining('Review & generate'),
    ]);

    await act(async () => button(host, 'Configure').click());
    await waitUntil(() => host.textContent?.includes('Services and fees') ?? false);
    expect(host.textContent).toContain('Entities and representative');
    expect(host.textContent).toContain('Agreement entities');
    expect(host.textContent).toContain('Authorised representative');
    expect(host.textContent).toContain('Browser Signatory');
    expect(host.querySelector('input[type="radio"]')).toBeTruthy();
  });
});
