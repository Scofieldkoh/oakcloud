import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import UploadBizFilePage from '@/app/(dashboard)/companies/upload/page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams('companyId=company-1'),
}));
vi.mock('@/hooks/use-auth', () => ({ useSession: () => ({ data: { isSuperAdmin: false, tenantId: 'tenant-1' } }) }));
vi.mock('@/hooks/use-companies', () => ({ useCompany: () => ({ data: { id: 'company-1', name: 'Existing Pte. Ltd.', uen: '202400001A' } }) }));
vi.mock('@/components/ui/workspace-selector', () => ({ useActiveWorkspaceId: () => 'tenant-1' }));
vi.mock('@/components/ui/ai-model-selector', () => ({ AIModelSelector: () => <div />, buildFullContext: () => '' }));
vi.mock('@/lib/browser-upload', () => ({ postFormDataWithFallback: async () => new Response(JSON.stringify({ documentId: 'doc-1' })) }));
vi.mock('react-dropzone', () => ({
  useDropzone: ({ onDrop }: { onDrop: (files: File[]) => void }) => ({
    getRootProps: () => ({}),
    getInputProps: () => ({ type: 'file', onChange: (e: React.ChangeEvent<HTMLInputElement>) => onDrop(Array.from(e.target.files ?? [])) }),
    isDragActive: false,
  }),
}));
vi.mock('@/components/processing', () => ({
  DocumentPageViewer: () => <div />,
  ResizableSplitView: ({ leftPanel, rightPanel }: { leftPanel: React.ReactNode; rightPanel: React.ReactNode }) => <div>{leftPanel}{rightPanel}</div>,
}));

const id = '00000000-0000-4000-8000-000000000001';
const entityDetails = { uen: '202400001A', name: 'Existing Pte. Ltd.', entityType: 'PRIVATE_LIMITED', status: 'LIVE' };
const person = { name: 'Synthetic Person', identificationType: 'NRIC', identificationNumber: 'S1234567A', dateOfBirth: '1980-01-01' };
const reply = (body: unknown, status = 200) => Response.json(body, { status });

afterEach(() => vi.unstubAllGlobals());

/** Mounts the real Update-from-BizFile page against a scripted network and returns what it posted. */
async function run(section: 'officers' | 'shareholders', saved: { current: string }, who: { id: string } = { id }, options: { skipCard?: boolean } = {}) {
  const record = section === 'officers'
    ? { ...person, role: 'DIRECTOR' }
    : { ...person, type: 'INDIVIDUAL', shareClass: 'ORDINARY', numberOfShares: 1 };
  const data = { entityDetails, [section]: [record] };
  const diffKey = section === 'officers' ? 'officerDiffs' : 'shareholderDiffs';
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/preview-diff')) {
      return reply({ extractedData: data, companyUpdatedAt: '2026-07-12T00:00:00.000Z', diff: {
        hasDifferences: true, differences: [], existingCompany: entityDetails,
        [diffKey]: [{ type: 'updated', sourceRecordId: `${section}.0`, name: person.name, role: 'DIRECTOR', extractedData: record,
          changes: [{ label: 'Nationality', oldValue: 'SG', newValue: 'Singaporean' }] }],
      } });
    }
    if (url.endsWith('/match-preview')) {
      return reply({ matches: { [`${section}.0`]: {
        contactId: who.id, score: 1, automatic: true, blockedByIdentifierConflict: false, reasons: ['IDENTIFIER'], conflicts: [],
        contact: { id: who.id, fullName: person.name, identificationType: 'NRIC', identificationNumber: person.identificationNumber,
          corporateUen: null, companies: [], dateOfBirth: saved.current },
      } } });
    }
    if (url.endsWith('/prepare-import')) {
      const body = JSON.parse(String(init?.body));
      return reply({ preparationToken: 'synthetic', plan: { schemaVersion: 1, mode: 'UPDATE', tenantId: 'tenant-1', documentId: 'doc-1',
        targetCompanyId: 'company-1', aggregateRevision: 'synthetic', canonicalHash: `synthetic-${Math.random()}`, reviewedData: body.extractedData,
        changes: [{ id: 'change', path: section, section, operation: 'UPDATE', before: { name: person.name }, after: body.extractedData[section][0] }],
        selectedChangeIds: ['change'], contactDecisions: {} } });
    }
    if (url.endsWith('/apply-update')) return reply({ updatedFields: [] });
    throw new Error(`Unexpected network: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: () => 'blob:synthetic' });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: () => undefined });
  const view = render(<UploadBizFilePage />);
  fireEvent.change(view.container.querySelector('input[type=file]')!, { target: { files: [new File(['pdf'], 'synthetic.pdf', { type: 'application/pdf' })] } });
  fireEvent.click(screen.getByRole('button', { name: 'Upload & Extract' }));
  const review = await screen.findByRole('button', { name: /Review proposed changes/i });
  if (!options.skipCard) await screen.findByTestId('dob-replacements');
  const applied = () => {
    const call = fetchMock.mock.calls.find(([url]) => url.endsWith('/apply-update'));
    return call ? JSON.parse(String(call[1]?.body)).extractedData[section][0] : undefined;
  };
  const approve = async () => {
    const general = await screen.findByLabelText('I have reviewed these changes and contact decisions.');
    fireEvent.click(general);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm & Save 1 Change' }));
  };
  const upload = () => {
    fireEvent.change(view.container.querySelector('input[type=file]')!, { target: { files: [new File(['pdf'], 'second.pdf', { type: 'application/pdf' })] } });
    fireEvent.click(screen.getByRole('button', { name: 'Upload & Extract' }));
  };
  return { fetchMock, review, applied, approve, upload };
}

describe.each(['officers', 'shareholders'] as const)('Update from BizFile: date of birth replacement for %s', (section) => {
  it('shows both dates, sends the exact-date approval only when ticked, and keeps other updates', async () => {
    const saved = { current: '1981-01-01' };
    const { review, applied, approve } = await run(section, saved);
    const tick = screen.getByRole('checkbox', { name: /Synthetic Person: replace the saved date of birth \(1 Jan 1981\) with 1 Jan 1980/i });
    expect(tick).not.toBeChecked();
    fireEvent.click(tick);
    fireEvent.click(review);
    await approve();
    await waitFor(() => expect(applied()).toBeDefined());
    expect(applied()).toMatchObject({ dateOfBirth: '1980-01-01', dateOfBirthReplaces: '1981-01-01', contactResolution: { action: 'REUSE', contactId: id } });
  });

  it('does not carry an approval to a different contact after switching files', async () => {
    const saved = { current: '1981-01-01' };
    const who = { id };
    const { review, applied, approve, upload } = await run(section, saved, who);
    fireEvent.click(screen.getByRole('checkbox', { name: /Synthetic Person: replace the saved date of birth \(1 Jan 1981\) with 1 Jan 1980/i }));
    fireEvent.click(screen.getByRole('button', { name: /Upload Different File/ }));
    // Same saved date, same position, but another person's contact.
    who.id = '00000000-0000-4000-8000-000000000002';
    upload();
    await screen.findByRole('button', { name: /Review proposed changes/i });
    const second = await screen.findByRole('checkbox', { name: /Synthetic Person: replace the saved date of birth \(1 Jan 1981\) with 1 Jan 1980/i });
    expect(second).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: /Review proposed changes/i }));
    await approve();
    await waitFor(() => expect(applied()).toBeDefined());
    expect(applied()).not.toHaveProperty('dateOfBirth');
    expect(applied()).not.toHaveProperty('dateOfBirthReplaces');
    expect(review).toBeDefined();
  });

  it('keeps the choice available after Back to review, and then sends the approval', async () => {
    const saved = { current: '1981-01-01' };
    const { review, applied, approve } = await run(section, saved);
    fireEvent.click(review);
    await screen.findByLabelText('I have reviewed these changes and contact decisions.');
    fireEvent.click(screen.getByRole('button', { name: 'Back to review' }));
    const tick = await screen.findByRole('checkbox', { name: /Synthetic Person: replace the saved date of birth \(1 Jan 1981\) with 1 Jan 1980/i });
    expect(tick).not.toBeChecked();
    fireEvent.click(tick);
    fireEvent.click(screen.getByRole('button', { name: /Review proposed changes/i }));
    await approve();
    await waitFor(() => expect(applied()).toBeDefined());
    expect(applied()).toMatchObject({ dateOfBirth: '1980-01-01', dateOfBirthReplaces: '1981-01-01' });
  });

  it('keeps the saved date when the replacement is not ticked, without losing the rest of the update', async () => {
    const saved = { current: '1981-01-01' };
    const { review, applied, approve } = await run(section, saved);
    fireEvent.click(review);
    await approve();
    await waitFor(() => expect(applied()).toBeDefined());
    expect(applied()).not.toHaveProperty('dateOfBirth');
    expect(applied()).not.toHaveProperty('dateOfBirthReplaces');
    expect(applied()).toMatchObject({ name: person.name, identificationNumber: person.identificationNumber, contactResolution: { action: 'REUSE', contactId: id } });
  });

  it.each([
    ['cleared by someone else', null],
    ['now already equal to the proposal', '1980-01-01'],
  ] as const)('blocks without sending anything when the ticked saved date is %s', async (_name, becomes) => {
    const saved = { current: '1981-01-01' as string | null };
    const { fetchMock, review, applied } = await run(section, saved as { current: string });
    fireEvent.click(screen.getByRole('checkbox', { name: /Synthetic Person: replace the saved date of birth \(1 Jan 1981\) with 1 Jan 1980/i }));
    saved.current = becomes;
    fireEvent.click(review);
    expect(await screen.findByText(/A saved date of birth changed since you approved replacing it/)).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/prepare-import'))).toBe(false);
    expect(applied()).toBeUndefined();
  });

  it.each([
    ['cleared by someone else', null],
    ['now already equal to the proposal', '1980-01-01'],
  ] as const)('leaves the date untouched when a shown, unticked replacement is %s before the final review', async (_name, becomes) => {
    const saved = { current: '1981-01-01' as string | null };
    const { fetchMock, review, applied, approve } = await run(section, saved as { current: string });
    // The reviewer saw the card and did not tick it; then the saved date changes before the final review.
    saved.current = becomes;
    fireEvent.click(review);
    await approve();
    await waitFor(() => expect(applied()).toBeDefined());
    const prepared = JSON.parse(String(fetchMock.mock.calls.find(([url]) => url.endsWith('/prepare-import'))?.[1]?.body)).extractedData[section][0];
    for (const sent of [prepared, applied()]) {
      expect(sent).not.toHaveProperty('dateOfBirth');
      expect(sent).not.toHaveProperty('dateOfBirthReplaces');
      expect(sent).toMatchObject({ name: person.name, contactResolution: { action: 'REUSE', contactId: id } });
    }
  });

  it('with no tick, a contact whose saved date is blank is a plain fill and is not blocked', async () => {
    const saved = { current: null as string | null };
    const { fetchMock, review } = await run(section, saved as { current: string }, { id }, { skipCard: true });
    fireEvent.click(review);
    await screen.findByLabelText('I have reviewed these changes and contact decisions.');
    const call = fetchMock.mock.calls.find(([url]) => url.endsWith('/prepare-import'));
    const sent = JSON.parse(String(call?.[1]?.body)).extractedData[section][0];
    expect(sent).toMatchObject({ dateOfBirth: '1980-01-01' });
    expect(sent).not.toHaveProperty('dateOfBirthReplaces');
  });

  it('blocks and re-asks when the saved date changed after it was ticked', async () => {
    const saved = { current: '1981-01-01' };
    const { fetchMock, review, applied } = await run(section, saved);
    fireEvent.click(screen.getByRole('checkbox', { name: /Synthetic Person: replace the saved date of birth \(1 Jan 1981\) with 1 Jan 1980/i }));
    saved.current = '1982-02-02';
    fireEvent.click(review);
    expect(await screen.findByText(/A saved date of birth changed since you approved replacing it/)).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/prepare-import'))).toBe(false);
    expect(applied()).toBeUndefined();
    const again = await screen.findByRole('checkbox', { name: /Synthetic Person: replace the saved date of birth \(2 Feb 1982\) with 1 Jan 1980/i });
    expect(again).not.toBeChecked();
  });
});
