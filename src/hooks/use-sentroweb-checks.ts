/**
 * Sentroweb Check Hooks
 *
 * React hooks for the company Sentroweb screening feature: the people and companies that can be
 * checked, starting a check, the run history and one run's results (polled while it is running).
 *
 * @module hooks/use-sentroweb-checks
 */

'use client';

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/hooks/use-auth';
import { useActiveWorkspaceId } from '@/components/ui/workspace-selector';
import type {
  SentrowebCandidatesResponse,
  SentrowebRunDto,
  SentrowebRunListResponse,
  SentrowebRunStatusValue,
} from '@/lib/sentroweb/types';

/** How often a QUEUED or RUNNING run is re-read. */
export const SENTROWEB_POLL_INTERVAL_MS = 3000;

/** How many runs the history asks for per page. */
export const SENTROWEB_RUNS_PAGE_SIZE = 10;

export const sentrowebKeys = {
  all: ['sentroweb-checks'] as const,
  candidates: (companyId: string, tenantId?: string) =>
    ['sentroweb-checks', 'candidates', companyId, tenantId ?? null] as const,
  runs: (companyId: string, tenantId?: string) =>
    ['sentroweb-checks', 'runs', companyId, tenantId ?? null] as const,
  run: (companyId: string, runId: string, tenantId?: string) =>
    ['sentroweb-checks', 'run', companyId, runId, tenantId ?? null] as const,
};

/** The mutation key the page uses to tell that a start request is in flight. */
export function sentrowebStartMutationKey(companyId: string) {
  return ['sentroweb-checks', 'start', companyId] as const;
}

/**
 * A failed Sentroweb request. `serverMessage` is the server's own `error` string, or null when
 * it sent none; `message` is that string or a fixed fallback.
 */
export class SentrowebRequestError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly cooldownUntil: string | null;
  readonly serverMessage: string | null;

  constructor(
    message: string,
    status: number,
    code: string | null,
    cooldownUntil: string | null,
    serverMessage: string | null = null,
  ) {
    super(message);
    this.name = 'SentrowebRequestError';
    this.status = status;
    this.code = code;
    this.cooldownUntil = cooldownUntil;
    this.serverMessage = serverMessage;
  }
}

export function isSentrowebActiveStatus(status: SentrowebRunStatusValue | null | undefined): boolean {
  return status === 'QUEUED' || status === 'RUNNING';
}

function withWorkspaceId(url: string, tenantId?: string): string {
  if (!tenantId) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}tenantId=${encodeURIComponent(tenantId)}`;
}

function baseUrl(companyId: string): string {
  return `/api/companies/${encodeURIComponent(companyId)}/sentroweb-checks`;
}

async function toRequestError(response: Response, fallback: string): Promise<SentrowebRequestError> {
  let serverMessage: string | null = null;
  let code: string | null = null;
  let cooldownUntil: string | null = null;
  try {
    const body: unknown = await response.json();
    if (body && typeof body === 'object') {
      const record = body as { error?: unknown; code?: unknown; details?: unknown };
      if (typeof record.error === 'string' && record.error.trim()) serverMessage = record.error;
      if (typeof record.code === 'string') code = record.code;
      if (record.details && typeof record.details === 'object') {
        const until = (record.details as { cooldownUntil?: unknown }).cooldownUntil;
        if (typeof until === 'string') cooldownUntil = until;
      }
    }
  } catch {
    // Not JSON: keep the fixed fallback message.
  }
  return new SentrowebRequestError(serverMessage ?? fallback, response.status, code, cooldownUntil, serverMessage);
}

async function fetchCandidates(companyId: string, tenantId?: string): Promise<SentrowebCandidatesResponse> {
  const response = await fetch(withWorkspaceId(`${baseUrl(companyId)}/candidates`, tenantId));
  if (!response.ok) throw await toRequestError(response, 'Failed to load the people and companies to check');
  return response.json();
}

async function fetchRuns(
  companyId: string,
  cursor: string | null,
  tenantId?: string,
): Promise<SentrowebRunListResponse> {
  const params = new URLSearchParams({ limit: String(SENTROWEB_RUNS_PAGE_SIZE) });
  if (cursor) params.set('cursor', cursor);
  const response = await fetch(withWorkspaceId(`${baseUrl(companyId)}?${params}`, tenantId));
  if (!response.ok) throw await toRequestError(response, 'Failed to load Sentroweb checks');
  return response.json();
}

async function fetchRun(companyId: string, runId: string, tenantId?: string): Promise<SentrowebRunDto> {
  const response = await fetch(withWorkspaceId(`${baseUrl(companyId)}/${encodeURIComponent(runId)}`, tenantId));
  if (!response.ok) throw await toRequestError(response, 'Failed to load the Sentroweb check');
  const body: { run: SentrowebRunDto } = await response.json();
  return body.run;
}

export interface StartSentrowebCheckInput {
  entityKeys: string[];
  /** Run again although the company was checked recently. */
  force?: boolean;
  /** Also find spelling variants of each name. Off unless the person ticks it. */
  fuzzy?: boolean;
}

async function startCheck(
  companyId: string,
  input: StartSentrowebCheckInput,
  tenantId?: string,
): Promise<{ runId: string }> {
  const response = await fetch(withWorkspaceId(baseUrl(companyId), tenantId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      entityKeys: input.entityKeys,
      ...(input.force ? { force: true } : {}),
      ...(input.fuzzy ? { fuzzy: true } : {}),
    }),
  });
  if (!response.ok) throw await toRequestError(response, 'Failed to start the Sentroweb check');
  return response.json();
}

/** The workspace id to send with requests, for super admins working in another workspace. */
export function useSentrowebTenantId(): string | undefined {
  const { data: session } = useSession();
  return useActiveWorkspaceId(session?.isSuperAdmin ?? false, session?.tenantId);
}

/** Link to a result's screenshot (PNG). Opens in a new tab. */
export function sentrowebScreenshotUrl(
  companyId: string,
  runId: string,
  resultId: string,
  tenantId?: string,
): string {
  return withWorkspaceId(
    `${baseUrl(companyId)}/${encodeURIComponent(runId)}/results/${encodeURIComponent(resultId)}/screenshot`,
    tenantId,
  );
}

/**
 * Link to a result's PDF report (Sentroweb's own report, also filed under the company's
 * Documents). Served by the result's `report` route so it is scoped by tenant, company and run.
 */
export function sentrowebReportUrl(
  companyId: string,
  runId: string,
  resultId: string,
  tenantId?: string,
): string {
  return withWorkspaceId(
    `${baseUrl(companyId)}/${encodeURIComponent(runId)}/results/${encodeURIComponent(resultId)}/report`,
    tenantId,
  );
}

/**
 * The people and companies that can be checked, plus whether a check is running, the cooldown
 * and whether Sentroweb is configured. Always re-read when the dialog opens.
 */
export function useSentrowebCandidates(companyId: string, enabled = true) {
  const activeTenantId = useSentrowebTenantId();

  return useQuery({
    queryKey: sentrowebKeys.candidates(companyId, activeTenantId),
    queryFn: () => fetchCandidates(companyId, activeTenantId),
    enabled: !!companyId && enabled,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
}

/**
 * Start a check. Invalidates the run history and the candidates (cooldown, active run).
 * Server errors are thrown as `SentrowebRequestError`.
 */
export function useStartSentrowebCheck(companyId: string) {
  const queryClient = useQueryClient();
  const activeTenantId = useSentrowebTenantId();

  return useMutation({
    mutationKey: sentrowebStartMutationKey(companyId),
    mutationFn: (input: StartSentrowebCheckInput) => startCheck(companyId, input, activeTenantId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sentroweb-checks', 'runs', companyId] });
      void queryClient.invalidateQueries({ queryKey: ['sentroweb-checks', 'candidates', companyId] });
    },
  });
}

/** The run history, newest first, a page at a time (`fetchNextPage` follows `nextCursor`). */
export function useSentrowebRuns(companyId: string, enabled = true) {
  const activeTenantId = useSentrowebTenantId();

  return useInfiniteQuery({
    queryKey: sentrowebKeys.runs(companyId, activeTenantId),
    queryFn: ({ pageParam }) => fetchRuns(companyId, pageParam, activeTenantId),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: !!companyId && enabled,
    // Keep the newest run's status fresh while it is still going.
    refetchInterval: (query) =>
      isSentrowebActiveStatus(query.state.data?.pages[0]?.runs[0]?.status) ? SENTROWEB_POLL_INTERVAL_MS : false,
  });
}

/** One run with its results. Polled every 3 seconds only while it is QUEUED or RUNNING. */
export function useSentrowebRun(companyId: string, runId: string | null | undefined, enabled = true) {
  const activeTenantId = useSentrowebTenantId();

  return useQuery({
    queryKey: sentrowebKeys.run(companyId, runId ?? '', activeTenantId),
    queryFn: () => fetchRun(companyId, runId as string, activeTenantId),
    enabled: !!companyId && !!runId && enabled,
    refetchInterval: (query) =>
      isSentrowebActiveStatus(query.state.data?.status) ? SENTROWEB_POLL_INTERVAL_MS : false,
  });
}
