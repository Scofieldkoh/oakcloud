import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { candidatesResponse, jsonResponse } from '../helpers/sentroweb-ui-fixtures';
import { SENTROWEB_ERROR_MESSAGES } from '@/lib/sentroweb/error-codes';
import type { SentrowebCandidatesResponse } from '@/lib/sentroweb/types';

const mocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock('@/hooks/use-auth', () => ({
  useSession: () => ({ data: { isSuperAdmin: false, tenantId: 'tenant-1' } }),
}));
vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ success: mocks.success, error: mocks.error }),
}));

import { SentrowebCheckDialog } from '@/components/companies/company-detail/sentroweb-check-dialog';
import { SentrowebCheckAction } from '@/components/companies/company-detail/sentroweb-check-action';

const CANDIDATES_URL = '/api/companies/company-1/sentroweb-checks/candidates?tenantId=tenant-1';
const START_URL = '/api/companies/company-1/sentroweb-checks?tenantId=tenant-1';

interface FetchSetup {
  candidates: SentrowebCandidatesResponse;
  start?: (body: { entityKeys: string[]; force?: boolean }) => Promise<Response> | Response;
}

function setupFetch({ candidates, start }: FetchSetup) {
  const startBodies: Array<{ entityKeys: string[]; force?: boolean }> = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === CANDIDATES_URL) return jsonResponse(candidates);
    if (url === START_URL && init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as { entityKeys: string[]; force?: boolean };
      startBodies.push(body);
      return start ? start(body) : jsonResponse({ runId: 'run-new' }, 202);
    }
    throw new Error(`Unexpected fetch ${init?.method ?? 'GET'} ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, startBodies };
}

function renderDialog(onClose = vi.fn(), onStarted = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <SentrowebCheckDialog companyId="company-1" isOpen onClose={onClose} onStarted={onStarted} />
    </QueryClientProvider>,
  );
  return { ...view, onClose, onStarted };
}

const runButton = () => screen.getByRole('button', { name: /^(Run check|Run again anyway)$/ });
const personCheckboxes = () => screen.getAllByRole('checkbox') as HTMLInputElement[];

describe('SentrowebCheckDialog', () => {
  beforeEach(() => {
    mocks.success.mockReset();
    mocks.error.mockReset();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('ticks everyone by default when there are 10 or fewer, with labelled checkboxes, role badges and credits', async () => {
    setupFetch({
      candidates: candidatesResponse(3, {
        candidates: [
          { key: 'k1', name: 'Acme Holdings Pte Ltd', entityKind: 'CORPORATE', searchType: 'ENTITY', roles: ['SHAREHOLDER'], identifierType: null, identifier: null },
          { key: 'k2', name: 'Alice Tan', entityKind: 'INDIVIDUAL', searchType: 'INDIVIDUAL', roles: ['DIRECTOR', 'MANAGING_DIRECTOR'], identifierType: null, identifier: null },
          { key: 'k3', name: 'Bob Lim', entityKind: 'INDIVIDUAL', searchType: 'INDIVIDUAL', roles: ['NOMINEE_DIRECTOR'], identifierType: null, identifier: null },
        ],
      }),
    });
    renderDialog();

    expect(await screen.findByRole('checkbox', { name: 'Alice Tan' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Acme Holdings Pte Ltd' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Bob Lim' })).toBeChecked();
    expect(screen.getByText('Managing director')).toBeInTheDocument();
    expect(screen.getByText('Nominee director')).toBeInTheDocument();
    expect(screen.getByText('Shareholder')).toBeInTheDocument();
    expect(screen.getByText('Entity')).toBeInTheDocument();
    expect(screen.getAllByText('Individual')).toHaveLength(2);
    expect(screen.getByText('This will use up to 3 Sentroweb credits')).toBeInTheDocument();
    expect(screen.getByText(/added to Sentroweb ongoing monitoring/)).toBeInTheDocument();
    expect(runButton()).toBeEnabled();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Bob Lim' }));
    expect(screen.getByText('This will use up to 2 Sentroweb credits')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Alice Tan' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Acme Holdings Pte Ltd' }));
    expect(screen.getByText('This will use up to 0 Sentroweb credits')).toBeInTheDocument();
    expect(runButton()).toBeDisabled();
  });

  it('ticks nobody when there are more than 10, blocks Run above 10 ticks and never sends more than 10 keys', async () => {
    const { startBodies } = setupFetch({ candidates: candidatesResponse(12) });
    renderDialog();

    await screen.findByRole('checkbox', { name: 'Person 1' });
    expect(personCheckboxes()).toHaveLength(12);
    expect(personCheckboxes().every((box) => !box.checked)).toBe(true);
    expect(runButton()).toBeDisabled();
    expect(screen.getByText('This will use up to 0 Sentroweb credits')).toBeInTheDocument();

    for (let index = 1; index <= 11; index += 1) {
      fireEvent.click(screen.getByRole('checkbox', { name: `Person ${index}` }));
    }
    expect(screen.getByText('Choose at most 10')).toBeInTheDocument();
    expect(runButton()).toBeDisabled();
    expect(screen.getByText('This will use up to 11 Sentroweb credits')).toBeInTheDocument();
    fireEvent.click(runButton());
    expect(startBodies).toHaveLength(0);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Person 11' }));
    expect(screen.queryByText('Choose at most 10')).not.toBeInTheDocument();
    expect(runButton()).toBeEnabled();
    fireEvent.click(runButton());

    await waitFor(() => expect(startBodies).toHaveLength(1));
    expect(startBodies[0].entityKeys).toHaveLength(10);
    expect(startBodies[0].entityKeys).toEqual(Array.from({ length: 10 }, (_, index) => `key-${index + 1}`));
    expect(startBodies[0]).not.toHaveProperty('force');
  });

  it('caps the limit at 10 even if the server reports a larger maxEntities', async () => {
    setupFetch({ candidates: candidatesResponse(11, { maxEntities: 50 }) });
    renderDialog();
    await screen.findByRole('checkbox', { name: 'Person 1' });
    // 11 candidates exceed the fixed limit of 10, so nothing is ticked.
    expect(personCheckboxes().every((box) => !box.checked)).toBe(true);
  });

  it('disables the Run button while the start request is pending and does not double submit', async () => {
    let resolveStart: (response: Response) => void = () => undefined;
    const { startBodies } = setupFetch({
      candidates: candidatesResponse(2),
      start: () => new Promise<Response>((resolve) => { resolveStart = resolve; }),
    });
    const { onClose, onStarted } = renderDialog();

    await screen.findByRole('checkbox', { name: 'Person 1' });
    fireEvent.click(runButton());

    await waitFor(() => expect(startBodies).toHaveLength(1));
    await waitFor(() => expect(runButton()).toBeDisabled());
    fireEvent.click(runButton());
    expect(startBodies).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => {
      resolveStart(jsonResponse({ runId: 'run-new' }, 202));
    });
    await waitFor(() => expect(onStarted).toHaveBeenCalledWith('run-new'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mocks.success).toHaveBeenCalledWith('Sentroweb check started');
  });

  it('shows the cooldown warning, labels the button "Run again anyway" and sends force: true', async () => {
    const future = new Date(Date.now() + 5 * 60_000).toISOString();
    const { startBodies } = setupFetch({ candidates: candidatesResponse(2, { cooldownUntil: future }) });
    renderDialog();

    expect(await screen.findByText('This company was checked recently')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Run check' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Run again anyway' }));

    await waitFor(() => expect(startBodies).toHaveLength(1));
    expect(startBodies[0]).toEqual({ entityKeys: ['key-1', 'key-2'], force: true });
  });

  it('ignores a cooldown that has already passed and sends no force flag', async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const { startBodies } = setupFetch({ candidates: candidatesResponse(1, { cooldownUntil: past }) });
    renderDialog();

    await screen.findByRole('checkbox', { name: 'Person 1' });
    expect(screen.queryByText('This company was checked recently')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Run check' }));
    await waitFor(() => expect(startBodies).toHaveLength(1));
    expect(startBodies[0]).toEqual({ entityKeys: ['key-1'] });
  });

  it('disables Run and explains when a check is already running', async () => {
    setupFetch({ candidates: candidatesResponse(2, { activeRunId: 'run-active' }) });
    renderDialog();
    expect(await screen.findByText('A check is already running for this company.')).toBeInTheDocument();
    expect(runButton()).toBeDisabled();
  });

  it("opens but disables Run when Sentroweb isn't configured", async () => {
    setupFetch({ candidates: candidatesResponse(2, { configured: false }) });
    renderDialog();
    expect(await screen.findByText(/Sentroweb isn't configured/)).toBeInTheDocument();
    expect(runButton()).toBeDisabled();
  });

  it.each([
    [409, 'ALREADY_RUNNING', 'A Sentroweb check is already running for this company.'],
    [422, 'TOO_MANY_ENTITIES', 'A check can screen at most 10 people and companies at a time.'],
    [503, 'SENTROWEB_NOT_CONFIGURED', "Sentroweb isn't configured on this server."],
  ])('shows the server error message for %s %s and keeps the dialog open', async (status, code, message) => {
    setupFetch({
      candidates: candidatesResponse(2),
      start: () => jsonResponse({ error: message, code }, status),
    });
    const { onClose, onStarted } = renderDialog();

    await screen.findByRole('checkbox', { name: 'Person 1' });
    fireEvent.click(runButton());

    const alert = await screen.findByText(message);
    expect(alert).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(onStarted).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it('falls back to the fixed code message when the server sends no error text', async () => {
    setupFetch({
      candidates: candidatesResponse(1),
      start: () => jsonResponse({ code: 'TOO_MANY_ENTITIES' }, 422),
    });
    renderDialog();
    await screen.findByRole('checkbox', { name: 'Person 1' });
    fireEvent.click(runButton());
    expect(await screen.findByText(SENTROWEB_ERROR_MESSAGES.TOO_MANY_ENTITIES)).toBeInTheDocument();
  });

  it('shows a generic message, not raw server text, for other failures', async () => {
    setupFetch({
      candidates: candidatesResponse(1),
      start: () => jsonResponse({ error: 'PrismaClientKnownRequestError: secret details' }, 500),
    });
    renderDialog();
    await screen.findByRole('checkbox', { name: 'Person 1' });
    fireEvent.click(runButton());
    expect(await screen.findByText('The check could not be started. Please try again.')).toBeInTheDocument();
    expect(screen.queryByText(/secret details/)).not.toBeInTheDocument();
  });

  it('switches to "Run again anyway" when the server answers COOLDOWN', async () => {
    const future = new Date(Date.now() + 5 * 60_000).toISOString();
    setupFetch({
      candidates: candidatesResponse(1),
      start: () => jsonResponse({ error: 'This company was checked recently.', code: 'COOLDOWN', details: { cooldownUntil: future } }, 409),
    });
    renderDialog();
    await screen.findByRole('checkbox', { name: 'Person 1' });
    fireEvent.click(runButton());
    expect(await screen.findByRole('button', { name: 'Run again anyway' })).toBeEnabled();
  });

  it('lists the candidates inside a labelled dialog', async () => {
    setupFetch({ candidates: candidatesResponse(1) });
    renderDialog();
    const dialog = await screen.findByRole('dialog', { name: 'Sentroweb check' });
    expect(await within(dialog).findByRole('list', { name: 'People and companies to check' })).toBeInTheDocument();
  });
});

describe('SentrowebCheckAction', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  function renderAction(canUpdate: boolean, isOpen = false) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const onOpenChange = vi.fn();
    render(
      <QueryClientProvider client={client}>
        <SentrowebCheckAction companyId="company-1" canUpdate={canUpdate} isOpen={isOpen} onOpenChange={onOpenChange} />
      </QueryClientProvider>,
    );
    return { onOpenChange };
  }

  it('renders nothing without update permission', () => {
    setupFetch({ candidates: candidatesResponse(1) });
    renderAction(false);
    expect(screen.queryByRole('button', { name: 'Sentroweb check' })).not.toBeInTheDocument();
  });

  it('opens the dialog from the button', () => {
    setupFetch({ candidates: candidatesResponse(1) });
    const { onOpenChange } = renderAction(true);
    fireEvent.click(screen.getByRole('button', { name: 'Sentroweb check' }));
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it('disables the action button while the start request is pending', async () => {
    let resolveStart: (response: Response) => void = () => undefined;
    setupFetch({
      candidates: candidatesResponse(1),
      start: () => new Promise<Response>((resolve) => { resolveStart = resolve; }),
    });
    renderAction(true, true);

    await screen.findByRole('checkbox', { name: 'Person 1' });
    expect(screen.getByRole('button', { name: 'Sentroweb check' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Run check' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sentroweb check' })).toBeDisabled());

    await act(async () => {
      resolveStart(jsonResponse({ runId: 'run-new' }, 202));
    });
  });
});
