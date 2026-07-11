import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import UploadBizFilePage from '@/app/(dashboard)/companies/upload/page';

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  upload: vi.fn(),
  push: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => mocks.searchParams,
}));
vi.mock('@/hooks/use-auth', () => ({
  useSession: () => ({ data: { isSuperAdmin: false, tenantId: 'tenant-1' } }),
}));
vi.mock('@/hooks/use-companies', () => ({
  useCompany: () => ({ data: { id: 'company-1', name: 'Existing Pte. Ltd.', uen: '202400001A' } }),
}));
vi.mock('@/components/ui/workspace-selector', () => ({ useActiveWorkspaceId: () => 'tenant-1' }));
vi.mock('@/components/ui/ai-model-selector', () => ({
  AIModelSelector: () => <div>AI model selector</div>,
  buildFullContext: () => '',
}));
vi.mock('@/lib/browser-upload', () => ({ postFormDataWithFallback: mocks.upload }));
vi.mock('react-dropzone', () => ({
  useDropzone: ({ onDrop }: { onDrop: (files: File[]) => void }) => ({
    getRootProps: () => ({}),
    getInputProps: () => ({
      type: 'file',
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => onDrop(Array.from(event.target.files ?? [])),
    }),
    isDragActive: false,
  }),
}));
vi.mock('@/components/processing', () => ({
  DocumentPageViewer: () => <div>Document viewer</div>,
  ResizableSplitView: ({ leftPanel, rightPanel }: { leftPanel: React.ReactNode; rightPanel: React.ReactNode }) => (
    <div>{leftPanel}{rightPanel}</div>
  ),
}));

const extractedData = {
  entityDetails: {
    uen: '202400001A',
    name: 'Example Pte. Ltd.',
    entityType: 'PRIVATE_LIMITED',
    status: 'LIVE',
  },
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function reachPreview(updateMode = false) {
  mocks.searchParams = new URLSearchParams(updateMode ? 'companyId=company-1' : '');
  mocks.upload.mockResolvedValueOnce(jsonResponse({ documentId: 'doc-1' }));
  mocks.fetch.mockResolvedValueOnce(updateMode
    ? jsonResponse({
        extractedData,
        diff: { hasDifferences: true, differences: [], existingCompany: { name: 'Existing Pte. Ltd.', uen: '202400001A' } },
        companyUpdatedAt: '2026-07-12T00:00:00.000Z',
      })
    : jsonResponse({ extractedData }));

  const view = render(<UploadBizFilePage />);
  const input = view.container.querySelector('input[type="file"]');
  expect(input).not.toBeNull();
  fireEvent.change(input!, { target: { files: [new File(['pdf'], 'bizfile.pdf', { type: 'application/pdf' })] } });
  fireEvent.click(screen.getByRole('button', { name: 'Upload & Extract' }));
  await screen.findByText(updateMode ? 'Changes to Apply' : 'Review extracted information');
  return view;
}

describe('companies upload BizFile review integration', () => {
  beforeEach(() => {
    mocks.fetch.mockReset();
    mocks.upload.mockReset();
    mocks.push.mockReset();
    mocks.searchParams = new URLSearchParams();
    vi.stubGlobal('fetch', mocks.fetch);
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:preview') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  });

  it('submits the corrected workspace draft once and completes successfully', async () => {
    await reachPreview();
    const sectionSelect = screen.getByRole('combobox', { name: 'Review section' });
    expect(within(sectionSelect).getAllByRole('option')).toHaveLength(10);

    fireEvent.change(screen.getByLabelText('Company name'), { target: { value: 'Corrected Pte. Ltd.' } });
    mocks.fetch.mockResolvedValueOnce(jsonResponse({ companyId: 'company-new' }));
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });

    await screen.findByText('Company Created Successfully!');
    const confirmCalls = mocks.fetch.mock.calls.filter(([url]) => String(url).endsWith('/confirm'));
    expect(confirmCalls).toHaveLength(1);
    expect(JSON.parse(String(confirmCalls[0][1]?.body))).toMatchObject({
      extractedData: { entityDetails: { name: 'Corrected Pte. Ltd.' } },
    });
    expect(screen.getByRole('link', { name: 'View Company' })).toHaveAttribute('href', '/companies/company-new');
  });

  it('keeps the edited draft mounted and renders structured route issues for retry', async () => {
    await reachPreview();
    const name = screen.getByLabelText('Company name');
    fireEvent.change(name, { target: { value: 'Corrected Pte. Ltd.' } });
    mocks.fetch.mockResolvedValueOnce(jsonResponse({
      error: 'Please correct the highlighted fields',
      issues: [{ path: 'entityDetails.name', message: 'Name conflicts with UEN', section: 'entity' }],
    }, 400));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm & Save' }));

    expect(await screen.findByText('Name conflicts with UEN')).toBeVisible();
    expect(screen.getByLabelText('Company name')).toHaveValue('Corrected Pte. Ltd.');
    expect(screen.getByText('Review extracted information')).toBeVisible();
  });

  it('keeps the workspace mounted and reports a generic 500 response', async () => {
    await reachPreview();
    fireEvent.change(screen.getByLabelText('Company name'), { target: { value: 'Still Here Pte. Ltd.' } });
    mocks.fetch.mockResolvedValueOnce(new Response('<html>failure</html>', { status: 500 }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm & Save' }));

    expect(await screen.findByText('Failed to save data (HTTP 500)')).toBeVisible();
    expect(screen.getByLabelText('Company name')).toHaveValue('Still Here Pte. Ltd.');
  });

  it('reports the exact JSON 400 error when no structured issues are returned', async () => {
    await reachPreview();
    mocks.fetch.mockResolvedValueOnce(jsonResponse({ error: 'The submitted company is no longer available' }, 400));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm & Save' }));

    expect(await screen.findByText('The submitted company is no longer available')).toBeVisible();
    expect(screen.queryByText('Failed to save data (HTTP 400)')).not.toBeInTheDocument();
  });

  it.each([
    ['resolution', (request: ReturnType<typeof deferred<Response>>) => request.resolve(jsonResponse({ companyId: 'stale-company' }))],
    ['rejection', (request: ReturnType<typeof deferred<Response>>) => request.reject(new Error('stale failure'))],
  ])('does not resurrect confirm state after cancel and late %s', async (_label, settle) => {
    await reachPreview();
    const request = deferred<Response>();
    mocks.fetch.mockReturnValueOnce(request.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm & Save' }));

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Upload Different File' })).toBeDisabled();
    fireEvent.keyDown(window, { key: 'Backspace', ctrlKey: true });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Upload & Extract' })).toBeVisible());

    settle(request);
    await Promise.resolve();
    await Promise.resolve();
    expect(screen.queryByText('Company Created Successfully!')).not.toBeInTheDocument();
    expect(screen.queryByText('stale failure')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload & Extract' })).toBeVisible();
  });

  it('preserves update-mode markup and sends saves to apply-update', async () => {
    await reachPreview(true);
    expect(screen.getByText('Changes to Apply')).toBeVisible();
    mocks.fetch.mockResolvedValueOnce(jsonResponse({ updatedFields: ['name'] }));
    fireEvent.click(screen.getByRole('button', { name: /Confirm & Save Document/i }));
    await waitFor(() => expect(mocks.fetch.mock.calls.some(([url]) => String(url).endsWith('/apply-update'))).toBe(true));
    expect(mocks.fetch.mock.calls.some(([url]) => String(url).endsWith('/confirm'))).toBe(false);
  });
});
