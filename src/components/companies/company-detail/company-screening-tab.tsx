'use client';

import { Fragment, useEffect, useId, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronRight, FileText, Image as ImageIcon, Loader2, ShieldCheck } from 'lucide-react';
import { CompanyAccentSection } from '@/components/companies/company-accent-section';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { SENTROWEB_ERROR_MESSAGES, sentrowebErrorMessage } from '@/lib/sentroweb/error-codes';
import type { SentrowebMatch, SentrowebResultDto, SentrowebRunDto } from '@/lib/sentroweb/types';
import {
  isSentrowebActiveStatus,
  sentrowebReportUrl,
  sentrowebScreenshotUrl,
  useSentrowebRun,
  useSentrowebRuns,
  useSentrowebTenantId,
} from '@/hooks/use-sentroweb-checks';
import { cn, formatDateTime } from '@/lib/utils';
import {
  SentrowebOverallBadge,
  SentrowebResultBadge,
  formatSentrowebCategoryCounts,
  sentrowebRoleLabel,
  sentrowebSearchTypeLabel,
  formatSentrowebSearchDetails,
} from './sentroweb-badges';

interface CompanyScreeningTabProps {
  companyId: string;
  /** A run to show first, for example the one that was just started. */
  initialRunId?: string | null;
}

/** "5 names, 5 credits used" (names chosen for the run; credits are what Sentroweb charged). */
function runCountsText(run: Pick<SentrowebRunDto, 'entityCount' | 'creditsUsed'>): string {
  const searches = run.entityCount === 1 ? '1 name' : `${run.entityCount} names`;
  const credits = run.creditsUsed === 1 ? '1 credit' : `${run.creditsUsed} credits`;
  return `${searches}, ${credits} used`;
}

/** The fixed message for a stored error code. Never shows any other stored text. */
function resultErrorText(result: SentrowebResultDto): string | null {
  const fromCode = sentrowebErrorMessage(result.errorCode);
  if (fromCode) return fromCode;
  return result.status === 'ERROR' ? SENTROWEB_ERROR_MESSAGES.UNEXPECTED_ERROR : null;
}

/** The Screening tab: the latest Sentroweb check, its per-person results and the history. */
export function CompanyScreeningTab({ companyId, initialRunId = null }: CompanyScreeningTabProps) {
  const queryClient = useQueryClient();
  const [selectedRunId, setSelectedRunId] = useState<string | null>(initialRunId);
  const runsQuery = useSentrowebRuns(companyId);
  const runs = runsQuery.data?.pages.flatMap((page) => page.runs) ?? [];
  const latestRunId = runs[0]?.id ?? null;
  const activeRunId = selectedRunId ?? latestRunId;
  const runQuery = useSentrowebRun(companyId, activeRunId);
  const run = runQuery.data;

  // When the shown run stops being active, refresh the history so its badge catches up.
  const previousActive = useRef(false);
  const isActive = isSentrowebActiveStatus(run?.status);
  useEffect(() => {
    if (previousActive.current && !isActive) {
      void queryClient.invalidateQueries({ queryKey: ['sentroweb-checks', 'runs', companyId] });
    }
    previousActive.current = isActive;
  }, [isActive, queryClient, companyId]);

  if (runsQuery.isLoading && !activeRunId) {
    return (
      <div className="space-y-3" aria-label="Loading Sentroweb checks" role="status">
        <div className="h-10 skeleton" />
        <div className="h-24 skeleton" />
      </div>
    );
  }

  if (runsQuery.error && !activeRunId) {
    return (
      <Alert variant="error">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>Could not load the Sentroweb checks.</span>
          <Button size="xs" variant="secondary" onClick={() => void runsQuery.refetch()}>
            Try again
          </Button>
        </div>
      </Alert>
    );
  }

  if (!activeRunId) {
    return (
      <div className="card">
        <EmptyState
          icon={ShieldCheck}
          title="No Sentroweb checks yet"
          description="Use the Sentroweb check action at the top of this page to screen this company's directors and shareholders."
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <CompanyAccentSection title="Sentroweb screening">
        {runQuery.isLoading ? (
          <div className="space-y-3 p-4" role="status" aria-label="Loading Sentroweb check">
            <div className="h-8 skeleton" />
            <div className="h-24 skeleton" />
          </div>
        ) : runQuery.error || !run ? (
          <div className="p-4">
            <Alert variant="error">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>Could not load this Sentroweb check.</span>
                <Button size="xs" variant="secondary" onClick={() => void runQuery.refetch()}>
                  Try again
                </Button>
              </div>
            </Alert>
          </div>
        ) : (
          <RunDetail companyId={companyId} run={run} />
        )}
      </CompanyAccentSection>

      {runs.length > 0 ? (
        <RunHistory
          runs={runs}
          activeRunId={activeRunId}
          onSelect={setSelectedRunId}
          hasMore={Boolean(runsQuery.hasNextPage)}
          isLoadingMore={runsQuery.isFetchingNextPage}
          onShowMore={() => void runsQuery.fetchNextPage()}
        />
      ) : null}
    </div>
  );
}

function RunStatusText({ run }: { run: SentrowebRunDto }) {
  if (run.status === 'QUEUED' || run.status === 'RUNNING') {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-text-secondary" role="status">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        {run.status === 'QUEUED' ? 'Queued' : 'Running'}
      </span>
    );
  }
  if (run.status === 'FAILED') {
    return <span className="text-sm text-text-secondary">Failed</span>;
  }
  return <span className="text-sm text-text-secondary">Completed</span>;
}

function RunDetail({ companyId, run }: { companyId: string; run: SentrowebRunDto }) {
  const results = [...(run.results ?? [])].sort((a, b) => a.position - b.position);
  const runError = sentrowebErrorMessage(run.errorCode);
  const when = run.finishedAt ?? run.startedAt ?? run.createdAt;

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <SentrowebOverallBadge run={run} />
        <RunStatusText run={run} />
        <span className="text-sm text-text-secondary">{formatDateTime(when)}</span>
        {run.requestedBy ? <span className="text-sm text-text-secondary">Run by {run.requestedBy.name}</span> : null}
        <span className="text-sm text-text-secondary">{runCountsText(run)}</span>
      </div>

      {runError ? <Alert variant="warning">{runError}</Alert> : null}

      {results.length === 0 ? (
        <p className="text-sm text-text-secondary">
          {isSentrowebActiveStatus(run.status) ? 'Results appear here as the check finishes.' : 'This check has no results.'}
        </p>
      ) : (
        <ResultsTable companyId={companyId} runId={run.id} results={results} />
      )}
    </div>
  );
}

function ResultsTable({
  companyId,
  runId,
  results,
}: {
  companyId: string;
  runId: string;
  results: SentrowebResultDto[];
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const idBase = useId();
  const tenantId = useSentrowebTenantId();

  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="overflow-x-auto">
      <table className="table table-compact w-full">
        <caption className="sr-only">Sentroweb results for each person and company</caption>
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Roles</th>
            <th scope="col">Type</th>
            <th scope="col">Status</th>
            <th scope="col">Matches</th>
            <th scope="col">Reports</th>
          </tr>
        </thead>
        <tbody>
          {results.map((result) => {
            const isOpen = expanded.has(result.id);
            const detailId = `${idBase}-${result.id}`;
            const errorText = resultErrorText(result);
            const hasMatches = result.matches.length > 0;
            return (
              <Fragment key={result.id}>
                <tr>
                  <td className="align-top">
                    <div className="flex items-start gap-1.5">
                      {hasMatches ? (
                        <button
                          type="button"
                          aria-expanded={isOpen}
                          aria-controls={detailId}
                          aria-label={`${isOpen ? 'Hide' : 'Show'} matches for ${result.name}`}
                          onClick={() => toggle(result.id)}
                          className="-ml-1 mt-0.5 flex min-h-8 min-w-8 items-center justify-center rounded text-text-muted hover:bg-background-tertiary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-oak-primary/30"
                        >
                          <ChevronRight className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-90')} aria-hidden="true" />
                        </button>
                      ) : null}
                      <div>
                        <span className="font-medium text-text-primary">{result.name}</span>
                        <p className="mt-0.5 text-xs text-text-muted">
                          {formatSentrowebSearchDetails(result.searchDetails, result.searchType)}
                        </p>
                        {errorText ? <p className="mt-1 text-xs text-text-secondary">{errorText}</p> : null}
                      </div>
                    </div>
                  </td>
                  <td className="align-top">
                    <span className="flex flex-wrap gap-1">
                      {result.roles.map((role) => (
                        <span key={role} className="badge badge-info badge-sm">
                          {sentrowebRoleLabel(role)}
                        </span>
                      ))}
                    </span>
                  </td>
                  <td className="align-top text-sm">{sentrowebSearchTypeLabel(result.searchType)}</td>
                  <td className="align-top">
                    <SentrowebResultBadge status={result.status} />
                  </td>
                  <td className="align-top text-sm">
                    {result.status === 'ERROR' || result.status === 'NOT_RUN'
                      ? '\u2014'
                      : formatSentrowebCategoryCounts(result.categoryCounts)}
                  </td>
                  <td className="align-top">
                    <span className="flex flex-wrap gap-3 text-sm">
                      {result.documentId ? (
                        <a
                          href={sentrowebReportUrl(companyId, runId, result.id, tenantId)}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`PDF report for ${result.name}`}
                          className="inline-flex items-center gap-1 text-oak-light hover:underline"
                        >
                          <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                          PDF report
                        </a>
                      ) : null}
                      {result.hasScreenshot ? (
                        <a
                          href={sentrowebScreenshotUrl(companyId, runId, result.id, tenantId)}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`Screenshot for ${result.name}`}
                          className="inline-flex items-center gap-1 text-oak-light hover:underline"
                        >
                          <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
                          Screenshot
                        </a>
                      ) : null}
                      {!result.documentId && !result.hasScreenshot ? '\u2014' : null}
                    </span>
                  </td>
                </tr>
                {isOpen && hasMatches ? (
                  <tr id={detailId}>
                    <td colSpan={6} className="bg-background-tertiary/40">
                      <MatchList matches={result.matches} />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MatchList({ matches }: { matches: SentrowebMatch[] }) {
  return (
    <ul className="space-y-3 py-2">
      {matches.map((match, index) => {
        return (
          <li key={match.uniqueId ?? `${match.name}-${index}`} className="text-sm">
            <p className="font-medium text-text-primary">
              {match.name} <span className="badge badge-neutral badge-sm ml-1">{match.category}</span>
            </p>
            <dl className="mt-1 grid gap-x-4 gap-y-0.5 text-xs text-text-secondary sm:grid-cols-[max-content_1fr]">
              {match.matchType ? <MatchField label="Type" value={match.matchType} /> : null}
              {match.country ? <MatchField label="Country" value={match.country} /> : null}
              {match.dateOfBirth ? <MatchField label="Date of birth" value={match.dateOfBirth} /> : null}
              {!match.dateOfBirth && match.yearOfBirth ? <MatchField label="Year of birth" value={match.yearOfBirth} /> : null}
              {match.source ? <MatchField label="Source" value={match.source} /> : null}
              {match.aliases.length > 0 ? <MatchField label="Aliases" value={match.aliases.join(', ')} /> : null}
            </dl>
          </li>
        );
      })}
    </ul>
  );
}

function MatchField({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="font-medium">{label}</dt>
      <dd>{value}</dd>
    </>
  );
}

function RunHistory({
  runs,
  activeRunId,
  onSelect,
  hasMore,
  isLoadingMore,
  onShowMore,
}: {
  runs: SentrowebRunDto[];
  activeRunId: string | null;
  onSelect: (runId: string) => void;
  hasMore: boolean;
  isLoadingMore: boolean;
  onShowMore: () => void;
}) {
  return (
    <CompanyAccentSection title="Previous checks">
      <ul className="divide-y divide-border-primary" aria-label="Sentroweb check history">
        {runs.map((item) => {
          const isCurrent = item.id === activeRunId;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onSelect(item.id)}
                aria-current={isCurrent ? 'true' : undefined}
                className={cn(
                  'flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-left text-sm transition-colors hover:bg-background-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-oak-primary/30',
                  isCurrent && 'bg-background-tertiary',
                )}
              >
                <span className="text-text-primary">{formatDateTime(item.createdAt)}</span>
                <SentrowebOverallBadge run={item} />
                <span className="text-text-secondary">{runCountsText(item)}</span>
                {item.requestedBy ? <span className="text-text-secondary">{item.requestedBy.name}</span> : null}
              </button>
            </li>
          );
        })}
      </ul>
      {hasMore ? (
        <div className="border-t border-border-primary p-3">
          <Button size="xs" variant="secondary" onClick={onShowMore} isLoading={isLoadingMore} disabled={isLoadingMore}>
            Show more
          </Button>
        </div>
      ) : null}
    </CompanyAccentSection>
  );
}
