import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, result, run } from '../helpers/sentroweb-ui-fixtures';
import { SENTROWEB_ERROR_MESSAGES } from '@/lib/sentroweb/error-codes';
import type { SentrowebResultDto, SentrowebRunDto } from '@/lib/sentroweb/types';

vi.mock('@/hooks/use-auth', () => ({
  useSession: () => ({ data: { isSuperAdmin: false, tenantId: 'tenant-1' } }),
}));

import { CompanyScreeningTab } from '@/components/companies/company-detail/company-screening-tab';

const LIST_PATH = '/api/companies/company-1/sentroweb-checks';

interface FakeApi {
  /** Run list pages, by cursor ('' for the first page). */
  pages: Record<string, { runs: SentrowebRunDto[]; nextCursor: string | null }>;
  /** Called for every run detail read. Return the run (with results) to serve. */
  detail: (runId: string, readNumber: number) => SentrowebRunDto | null;
}

function setupApi(api: FakeApi) {
  const detailReads: Record<string, number> = {};
  const requests: string[] = [];
  const fetchMock = vi.fn(async (input: string) => {
    requests.push(input);
    const url = new URL(input, 'http://localhost');
    if (url.pathname === LIST_PATH) {
      const page = api.pages[url.searchParams.get('cursor') ?? ''];
      return page ? jsonResponse(page) : jsonResponse({ error: 'bad cursor' }, 400);
    }
    const match = url.pathname.match(/^\/api\/companies\/company-1\/sentroweb-checks\/([^/]+)$/);
    if (match) {
      const runId = decodeURIComponent(match[1]);
      detailReads[runId] = (detailReads[runId] ?? 0) + 1;
      const found = api.detail(runId, detailReads[runId]);
      return found ? jsonResponse({ run: found }) : jsonResponse({ error: 'not found' }, 404);
    }
    throw new Error(`Unexpected fetch ${input}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return {
    fetchMock,
    requests,
    detailReads,
    detailCalls: () => requests.filter((url) => /sentroweb-checks\/[^/?]+(\?|$)/.test(url)).length,
  };
}

function singleRunApi(detailRun: SentrowebRunDto): FakeApi {
  const { results: _results, ...summary } = detailRun;
  void _results;
  return {
    pages: { '': { runs: [summary], nextCursor: null } },
    detail: () => detailRun,
  };
}

function renderTab(initialRunId: string | null = null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CompanyScreeningTab companyId="company-1" initialRunId={initialRunId} />
    </QueryClientProvider>,
  );
}

const withResults = (results: SentrowebResultDto[], overrides: Partial<SentrowebRunDto> = {}) =>
  run({ results, entityCount: results.length, creditsUsed: results.length, ...overrides });

async function settle(ms = 50) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('CompanyScreeningTab', () => {
  it('shows an empty state with a hint when there are no runs', async () => {
    setupApi({ pages: { '': { runs: [], nextCursor: null } }, detail: () => null });
    renderTab();
    expect(await screen.findByText('No Sentroweb checks yet')).toBeInTheDocument();
    expect(screen.getByText(/Sentroweb check action/)).toBeInTheDocument();
  });

  it('shows the latest run with its badge, who ran it, counts and an accessible results table', async () => {
    const detail = withResults(
      [
        result({ id: 'r1', position: 0, name: 'Alice Tan', roles: ['DIRECTOR', 'SHAREHOLDER'], status: 'CLEAR' }),
        result({ id: 'r2', position: 1, name: 'Acme Holdings Pte Ltd', searchType: 'ENTITY', entityKind: 'CORPORATE', roles: ['SHAREHOLDER'], status: 'CLEAR' }),
      ],
      { overallResult: 'CLEAR', entityCount: 2, creditsUsed: 2 },
    );
    setupApi(singleRunApi(detail));
    renderTab();

    const table = await screen.findByRole('table');
    for (const header of ['Name', 'Roles', 'Type', 'Status', 'Matches', 'Reports']) {
      expect(within(table).getByRole('columnheader', { name: header })).toBeInTheDocument();
    }
    expect(within(table).getByText('Alice Tan')).toBeInTheDocument();
    expect(within(table).getByText('Director')).toBeInTheDocument();
    expect(within(table).getAllByText('Shareholder')).toHaveLength(2);
    expect(within(table).getByText('Individual')).toBeInTheDocument();
    expect(within(table).getByText('Entity')).toBeInTheDocument();
    expect(screen.getAllByText('Clear').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Run by Sam Lee').length).toBeGreaterThan(0);
    expect(screen.getAllByText('2 names, 2 credits used').length).toBeGreaterThan(0);
  });

  it('shows what each result was searched with', async () => {
    const detail = withResults([
      result({ id: 'r1', name: 'Alice Tan', searchDetails: { country: 'Singapore', dateOfBirth: true, gender: false } }),
      result({ id: 'r2', position: 1, name: 'Bob Lim' }),
      result({ id: 'r3', position: 2, name: 'Acme Pte Ltd', searchType: 'ENTITY', entityKind: 'CORPORATE' }),
    ]);
    setupApi(singleRunApi(detail));
    renderTab();
    const table = await screen.findByRole('table');
    expect(within(table).getByText('Sent: name, country (Singapore), date of birth. Not sent: gender')).toBeInTheDocument();
    expect(within(table).getByText('Sent: name. Not sent: country, date of birth, gender')).toBeInTheDocument();
    expect(within(table).getByText('Sent: name only')).toBeInTheDocument();
  });

  it('expands a row to show match details and links to the PDF and screenshot', async () => {
    const detail = withResults(
      [
        result({
          id: 'r1',
          name: 'Bob Lim',
          status: 'POSSIBLE_MATCH',
          matchCount: 3,
          categoryCounts: { PEP: 2, SIP: 1 },
          documentId: 'doc-9',
          hasScreenshot: true,
          matches: [
            { category: 'PEP', uniqueId: 'm1', name: 'Bob Limm', matchType: 'Close associate', country: 'Singapore', dateOfBirth: '1980-02-03', yearOfBirth: null, source: 'Current PEP list', aliases: ['Bobby Lim', 'B. Lim'] },
            { category: 'SIP', uniqueId: 'm2', name: 'Robert Lim', matchType: null, country: null, dateOfBirth: null, yearOfBirth: '1975', source: null, aliases: [] },
          ],
        }),
      ],
      { overallResult: 'POSSIBLE_MATCH' },
    );
    setupApi(singleRunApi(detail));
    renderTab();

    expect(await screen.findByText('PEP 2 \u00b7 SIP 1')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'PDF report for Bob Lim' })).toHaveAttribute(
      'href',
      '/api/companies/company-1/sentroweb-checks/run-1/results/r1/report?tenantId=tenant-1',
    );
    expect(screen.getByRole('link', { name: 'Screenshot for Bob Lim' })).toHaveAttribute(
      'href',
      '/api/companies/company-1/sentroweb-checks/run-1/results/r1/screenshot?tenantId=tenant-1',
    );
    expect(screen.getByRole('link', { name: 'Screenshot for Bob Lim' })).toHaveAttribute('target', '_blank');
    expect(screen.queryByText('Bob Limm')).not.toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: 'Show matches for Bob Lim' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    expect(screen.getByText('Bob Limm')).toBeInTheDocument();
    expect(screen.getByText('Close associate')).toBeInTheDocument();
    expect(screen.getByText('Singapore')).toBeInTheDocument();
    expect(screen.getByText('1980-02-03')).toBeInTheDocument();
    expect(screen.getByText('Current PEP list')).toBeInTheDocument();
    expect(screen.getByText('Bobby Lim, B. Lim')).toBeInTheDocument();
    expect(screen.getByText('Robert Lim')).toBeInTheDocument();
    expect(screen.getByText('1975')).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Bob Limm')).not.toBeInTheDocument();
  });

  it('never renders the Clear badge for POSSIBLE_MATCH, ERROR or NOT_RUN results or their run', async () => {
    const detail = withResults(
      [
        result({ id: 'r1', position: 0, name: 'Hit Person', status: 'POSSIBLE_MATCH', matchCount: 1, categoryCounts: { PEP: 1 } }),
        result({ id: 'r2', position: 1, name: 'Broken Person', status: 'ERROR', errorCode: 'TIMEOUT' }),
        result({ id: 'r3', position: 2, name: 'Skipped Person', status: 'NOT_RUN' }),
      ],
      { overallResult: 'POSSIBLE_MATCH' },
    );
    setupApi(singleRunApi(detail));
    renderTab();

    await screen.findByRole('table');
    expect(screen.queryByText('Clear')).not.toBeInTheDocument();
    const rows = screen.getAllByRole('row');
    expect(within(rows[1]).getByText('Possible match')).toHaveClass('badge-error');
    expect(within(rows[2]).getByText('Error')).toHaveClass('badge-warning');
    expect(within(rows[3]).getByText('Not run')).toHaveClass('badge-neutral');
  });

  it('renders "Incomplete" for an INCOMPLETE overall result', async () => {
    setupApi(singleRunApi(withResults([result({ status: 'ERROR', errorCode: 'TIMEOUT' })], { overallResult: 'INCOMPLETE' })));
    renderTab();
    await screen.findByRole('table');
    expect(screen.getAllByText('Incomplete').length).toBeGreaterThan(0);
    expect(screen.queryByText('Clear')).not.toBeInTheDocument();
  });

  it('renders "Incomplete" for a FAILED run whose overall result is CLEAR, and null', async () => {
    for (const overallResult of ['CLEAR', null] as const) {
      setupApi(singleRunApi(withResults([result({ status: 'ERROR', errorCode: 'LOGIN_FAILED' })], { status: 'FAILED', overallResult, errorCode: 'LOGIN_FAILED' })));
      const view = renderTab();
      await screen.findByRole('table');
      expect(screen.getAllByText('Incomplete').length).toBeGreaterThan(0);
      expect(screen.queryByText('Clear')).not.toBeInTheDocument();
      expect(screen.getAllByText(SENTROWEB_ERROR_MESSAGES.LOGIN_FAILED).length).toBeGreaterThan(0);
      view.unmount();
      cleanup();
    }
  });

  it('shows the fixed message for an error code, never the stored text', async () => {
    const detail = withResults(
      [
        result({ id: 'r1', position: 0, name: 'Broken Person', status: 'ERROR', errorCode: 'LAYOUT_CHANGED', errorMessage: 'RAW PAGE TEXT balance 1,234' }),
        result({ id: 'r2', position: 1, name: 'Odd Person', status: 'ERROR', errorCode: 'NOT_A_REAL_CODE', errorMessage: 'MORE RAW TEXT' }),
        result({ id: 'r3', position: 2, name: 'Nameless Error', status: 'ERROR', errorCode: null, errorMessage: 'ALSO RAW' }),
      ],
      { overallResult: 'INCOMPLETE' },
    );
    setupApi(singleRunApi(detail));
    renderTab();

    await screen.findByRole('table');
    expect(screen.getByText(SENTROWEB_ERROR_MESSAGES.LAYOUT_CHANGED)).toBeInTheDocument();
    expect(screen.getAllByText(SENTROWEB_ERROR_MESSAGES.UNEXPECTED_ERROR)).toHaveLength(2);
    expect(screen.queryByText(/RAW/)).not.toBeInTheDocument();
  });

  it('shows Queued with a spinner and no results yet for a queued run', async () => {
    setupApi(singleRunApi(run({ status: 'QUEUED', overallResult: null, startedAt: null, finishedAt: null, results: [], entityCount: 3, creditsUsed: 0 })));
    renderTab();
    expect(await screen.findByText('Queued')).toBeInTheDocument();
    expect(screen.getAllByText('In progress').length).toBeGreaterThan(0);
    expect(screen.getAllByText('3 names, 0 credits used').length).toBeGreaterThan(0);
  });

  it('shows the run that was just started even before the list includes it', async () => {
    setupApi({
      pages: { '': { runs: [], nextCursor: null } },
      detail: (id) => run({ id, status: 'RUNNING', overallResult: null, finishedAt: null, results: [] }),
    });
    renderTab('run-new');
    expect(await screen.findByText('Running')).toBeInTheDocument();
  });

  describe('polling', () => {
    it('polls every 3 seconds while RUNNING and stops once the run is COMPLETED', async () => {
      vi.useFakeTimers();
      const running = run({ status: 'RUNNING', overallResult: null, finishedAt: null, results: [result({ status: 'NOT_RUN' })] });
      const completed = run({ status: 'COMPLETED', overallResult: 'CLEAR', results: [result({ status: 'CLEAR' })] });
      const api = setupApi({
        pages: { '': { runs: [running], nextCursor: null } },
        detail: (_id, read) => (read < 3 ? running : completed),
      });
      renderTab();

      await settle();
      expect(api.detailReads['run-1']).toBe(1);
      expect(screen.getByText('Running')).toBeInTheDocument();

      await settle(2900);
      expect(api.detailReads['run-1']).toBe(1);
      await settle(200);
      expect(api.detailReads['run-1']).toBe(2);
      await settle(3000);
      expect(api.detailReads['run-1']).toBe(3);

      // The third read says COMPLETED, so there are no more reads however long we wait.
      expect(screen.queryByText('Running')).not.toBeInTheDocument();
      expect(screen.getAllByText('Clear').length).toBeGreaterThan(0);
      await settle(30_000);
      expect(api.detailReads['run-1']).toBe(3);
    });

    it('does not poll a run that is already COMPLETED or FAILED', async () => {
      vi.useFakeTimers();
      const api = setupApi(singleRunApi(withResults([result()], { status: 'FAILED', overallResult: null })));
      renderTab();
      await settle();
      expect(api.detailReads['run-1']).toBe(1);
      await settle(30_000);
      expect(api.detailReads['run-1']).toBe(1);
    });

    it('stops polling when the tab unmounts', async () => {
      vi.useFakeTimers();
      const running = run({ status: 'RUNNING', overallResult: null, finishedAt: null, results: [] });
      const api = setupApi(singleRunApi(running));
      const view = renderTab();
      await settle();
      await settle(3100);
      const readsBeforeUnmount = api.detailReads['run-1'];
      expect(readsBeforeUnmount).toBe(2);

      view.unmount();
      await settle(30_000);
      expect(api.detailReads['run-1']).toBe(readsBeforeUnmount);
    });
  });

  describe('history', () => {
    const first = run({ id: 'run-3', createdAt: '2026-11-18T03:00:00.000Z', entityCount: 3, creditsUsed: 3 });
    const second = run({ id: 'run-2', createdAt: '2026-11-17T03:00:00.000Z', overallResult: 'POSSIBLE_MATCH', entityCount: 2, creditsUsed: 2 });
    const third = run({ id: 'run-1', createdAt: '2026-11-16T03:00:00.000Z', status: 'FAILED', overallResult: null, entityCount: 1, creditsUsed: 0 });

    function historyApi() {
      return setupApi({
        pages: {
          '': { runs: [first, second], nextCursor: 'cursor-2' },
          'cursor-2': { runs: [third], nextCursor: null },
        },
        detail: (id) => {
          const base = { 'run-3': first, 'run-2': second, 'run-1': third }[id];
          return base ? { ...base, results: [result({ id: `res-${id}`, name: `Person of ${id}` })] } : null;
        },
      });
    }

    it('loads more runs with the cursor and shows a run when it is clicked', async () => {
      const api = historyApi();
      renderTab();

      expect(await screen.findByText('Person of run-3')).toBeInTheDocument();
      const history = screen.getByRole('list', { name: 'Sentroweb check history' });
      expect(within(history).getAllByRole('listitem')).toHaveLength(2);

      fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
      await waitFor(() => expect(within(history).getAllByRole('listitem')).toHaveLength(3));
      expect(api.requests.some((url) => url.includes('cursor=cursor-2'))).toBe(true);
      expect(api.requests.some((url) => url.includes('limit=10'))).toBe(true);
      expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument();

      const items = within(history).getAllByRole('listitem');
      fireEvent.click(within(items[1]).getByRole('button'));
      expect(await screen.findByText('Person of run-2')).toBeInTheDocument();
      expect(within(items[1]).getByRole('button')).toHaveAttribute('aria-current', 'true');

      fireEvent.click(within(items[2]).getByRole('button'));
      expect(await screen.findByText('Person of run-1')).toBeInTheDocument();
      // The FAILED run in the history is Incomplete, never Clear.
      expect(within(items[2]).getByText('Incomplete')).toBeInTheDocument();
    });
  });
});
