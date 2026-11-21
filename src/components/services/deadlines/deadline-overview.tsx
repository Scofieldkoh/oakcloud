'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, ListFilter } from 'lucide-react';
import { useComplianceOverview } from '@/hooks/use-deadlines';
import {
  COMPLIANCE_MATRIX_CODES,
  COMPLIANCE_MATRIX_LABELS,
  type ComplianceMatrixCode,
  type ComplianceMatrixCell,
  type ComplianceOverviewStatus,
  type MonthlyWorkloadCounts,
} from '@/lib/validations/deadline-overview';

const STATUS_OPTIONS: { value: ComplianceOverviewStatus; label: string }[] = [
  { value: 'ALL', label: 'All statuses' },
  { value: 'PENDING_FILING', label: 'Pending filing' },
  { value: 'TO_BE_CONFIRMED', label: 'To be confirmed' },
  { value: 'OVERDUE', label: 'Overdue' },
  { value: 'FILED', label: 'Filed' },
  { value: 'MANAGED_EXTERNALLY', label: 'Managed externally' },
  { value: 'NOT_REQUIRED', label: 'Not required' },
  { value: 'NO_RECORD', label: 'No deadline record' },
];

const STATUS_LABELS: Record<NonNullable<ComplianceMatrixCell>['status'], string> = {
  PENDING_FILING: 'Pending filing',
  TO_BE_CONFIRMED: 'To be confirmed',
  FILED: 'Filed',
  MANAGED_EXTERNALLY: 'Managed externally',
  NOT_REQUIRED: 'Not required',
  CANCELLED: 'Cancelled',
};

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function dateLabel(date: string): string {
  const [year, month, day] = date.split('-');
  return day + ' ' + (MONTH_NAMES[Number(month) - 1] ?? month) + ' ' + year;
}

function badgeClass(status: ComplianceMatrixCell['status'], overdue: boolean): string {
  if (overdue) return 'bg-status-error/10 text-status-error';
  if (status === 'FILED') return 'bg-status-success/10 text-status-success';
  if (status === 'PENDING_FILING' || status === 'TO_BE_CONFIRMED') return 'bg-status-warning/10 text-status-warning';
  return 'bg-background-tertiary text-text-secondary';
}

function MatrixCell({ cell, onOpen }: { cell?: ComplianceMatrixCell; onOpen: () => void }) {
  if (!cell) {
    return <span className="text-xs text-text-muted" title="No generated record. Check applicability and engagement scope.">No record</span>;
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      title="Open this filing in the Deadline Tracker"
      className="group flex w-full min-w-[130px] flex-col items-start gap-1 rounded-lg p-2 text-left hover:bg-background-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-oak-primary"
    >
      <span className="text-xs font-medium text-text-primary group-hover:text-oak-light">{dateLabel(cell.dueDate)}</span>
      <span className={'rounded-full px-2 py-0.5 text-[11px] font-medium ' + badgeClass(cell.status, cell.overdue)}>
        {cell.overdue ? 'Overdue · ' : ''}{STATUS_LABELS[cell.status]}
      </span>
      {cell.occurrenceCount > 1 ? <span className="text-[10px] text-text-muted">{cell.occurrenceCount} milestones</span> : null}
    </button>
  );
}

function Metric({ label, value, emphasis }: { label: string; value: number; emphasis?: boolean }) {
  return (
    <div className="min-w-0 rounded-xl border border-border-primary bg-background-secondary p-3">
      <p className="text-xs text-text-secondary">{label}</p>
      <p className={'mt-1 text-xl font-semibold tabular-nums ' + (emphasis ? 'text-status-error' : 'text-text-primary')}>{value.toLocaleString()}</p>
    </div>
  );
}

type View = 'MATRIX' | 'WORKLOAD';
type Change = Partial<Record<'financialYear' | 'dueYear' | 'companyQuery' | 'obligationCode' | 'overviewStatus' | 'page', string | undefined>>;

export function DeadlineOverview({
  view,
  financialYear,
  dueYear,
  companyQuery,
  serviceCode,
  status,
  page,
  onChange,
  onOpenCell,
  onOpenMonth,
}: {
  view: View;
  financialYear?: number;
  dueYear: number;
  companyQuery: string;
  serviceCode?: ComplianceMatrixCode;
  status: ComplianceOverviewStatus;
  page: number;
  onChange: (changes: Change) => void;
  onOpenCell: (companyId: string, serviceCode: ComplianceMatrixCode, financialYear: number) => void;
  onOpenMonth: (month: string) => void;
}) {
  const nowYear = new Date().getFullYear();
  const matrixYear = financialYear ?? nowYear - 1;
  const effectiveStatus = view === 'WORKLOAD' && status === 'NO_RECORD' ? 'ALL' : status;
  const [searchDraft, setSearchDraft] = useState(companyQuery);

  useEffect(() => setSearchDraft(companyQuery), [companyQuery]);
  useEffect(() => {
    if (searchDraft.trim() === companyQuery) return;
    const timer = window.setTimeout(() => onChange({ companyQuery: searchDraft.trim() || undefined, page: '1' }), 350);
    return () => window.clearTimeout(timer);
  }, [searchDraft, companyQuery, onChange]);

  const query = useComplianceOverview({
    overview: view,
    year: view === 'MATRIX' ? matrixYear : dueYear,
    financialYear: view === 'WORKLOAD' ? financialYear : undefined,
    companyQuery,
    serviceCode,
    status: effectiveStatus,
    page: view === 'MATRIX' ? page : 1,
  });

  const matrixResult = query.data?.overview === 'MATRIX' ? query.data : null;
  const workloadResult = query.data?.overview === 'WORKLOAD' ? query.data : null;

  const years = Array.from(new Set([nowYear + 2, nowYear + 1, nowYear, nowYear - 1, nowYear - 2, nowYear - 3, nowYear - 4, nowYear - 5, matrixYear, dueYear]))
    .sort((a, b) => b - a)
    .filter((year) => year >= 2000 && year <= 2100);

  return (
    <section aria-label={view === 'MATRIX' ? 'Company compliance matrix' : 'Monthly compliance workload'} className="space-y-4">
      <div className="rounded-xl border border-border-primary bg-background-secondary p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-text-primary">
          <ListFilter className="h-4 w-4 text-text-secondary" aria-hidden="true" />
          Compliance filters
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="flex flex-col gap-1.5 text-xs text-text-secondary">
            {view === 'MATRIX' ? 'Financial year / YA' : 'Due calendar year'}
            <select
              aria-label={view === 'MATRIX' ? 'Financial year / YA' : 'Due calendar year'}
              className="min-h-10 rounded-lg border border-border-primary bg-background-primary px-3 text-sm text-text-primary"
              value={view === 'MATRIX' ? matrixYear : dueYear}
              onChange={(event) => onChange(view === 'MATRIX'
                ? { financialYear: event.target.value, page: '1' }
                : { dueYear: event.target.value, page: '1' })}
            >
              {years.map((year) => <option key={year} value={year}>{view === 'MATRIX' ? 'FY ' + year + ' / YA ' + (year + 1) : year}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-xs text-text-secondary">
            Service / filing
            <select
              aria-label="Compliance service"
              className="min-h-10 rounded-lg border border-border-primary bg-background-primary px-3 text-sm text-text-primary"
              value={serviceCode ?? ''}
              onChange={(event) => onChange({ obligationCode: event.target.value || undefined, page: '1' })}
            >
              <option value="">{view === 'MATRIX' ? 'All four filings' : 'All deadlines'}</option>
              {COMPLIANCE_MATRIX_CODES.map((code) => <option key={code} value={code}>{COMPLIANCE_MATRIX_LABELS[code]}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-xs text-text-secondary">
            Status
            <select
              aria-label="Compliance status"
              className="min-h-10 rounded-lg border border-border-primary bg-background-primary px-3 text-sm text-text-primary"
              value={effectiveStatus}
              onChange={(event) => onChange({ overviewStatus: event.target.value, page: '1' })}
            >
              {STATUS_OPTIONS.filter((item) => view === 'MATRIX' || item.value !== 'NO_RECORD').map((option) =>
                <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-xs text-text-secondary">
            Company
            <input
              type="search"
              aria-label="Search company for compliance overview"
              placeholder="Search name or UEN"
              className="min-h-10 rounded-lg border border-border-primary bg-background-primary px-3 text-sm text-text-primary placeholder:text-text-muted"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
            />
          </label>
        </div>
        {view === 'WORKLOAD' ? (
          <label className="mt-3 flex items-center gap-3 text-xs text-text-secondary">
            <span>Financial period</span>
            <select
              aria-label="Financial year filter for workload"
              className="min-h-9 rounded-lg border border-border-primary bg-background-primary px-3 text-xs text-text-primary"
              value={financialYear ?? ''}
              onChange={(event) => onChange({ financialYear: event.target.value || undefined })}
            >
              <option value="">All financial years</option>
              {years.map((year) => <option key={year} value={year}>FY {year} / YA {year + 1}</option>)}
            </select>
          </label>
        ) : null}
      </div>

      {query.error ? (
        <div role="alert" className="rounded-xl border border-status-error/30 bg-status-error/5 p-4 text-sm text-status-error">
          Unable to load the compliance overview. <button type="button" onClick={() => query.refetch()} className="font-medium underline">Retry</button>
        </div>
      ) : null}
      {query.isLoading && !query.data ? <p role="status" className="rounded-xl border border-border-primary p-6 text-sm text-text-secondary">Loading compliance data…</p> : null}
      {matrixResult?.overview === 'MATRIX' && view === 'MATRIX' ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-text-primary">FY {matrixResult.financialYear} / YA {matrixResult.financialYear + 1}</h2>
              <p className="mt-0.5 text-xs text-text-secondary">{matrixResult.totalCompanies} companies match these filters</p>
            </div>
            {query.isFetching ? <span className="text-xs text-text-muted">Refreshing…</span> : null}
          </div>
          <div className="overflow-x-auto rounded-xl border border-border-primary bg-background-secondary">
            <table className="w-full min-w-[650px] border-collapse text-left">
              <thead className="border-b border-border-primary bg-background-tertiary text-xs font-semibold text-text-secondary">
                <tr>
                  <th scope="col" className="sticky left-0 z-10 min-w-[180px] bg-background-tertiary px-4 py-3">Company</th>
                  {matrixResult.columns.map((code) => <th scope="col" key={code} className="min-w-[150px] px-3 py-3">{COMPLIANCE_MATRIX_LABELS[code]}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-primary">
                {matrixResult.rows.map((row) => (
                  <tr key={row.companyId}>
                    <th scope="row" className="sticky left-0 z-10 bg-background-secondary px-4 py-3 text-sm font-medium text-text-primary">
                      {row.displayLabel}
                    </th>
                    {matrixResult.columns.map((code) => (
                      <td key={code} className="px-2 py-1.5 align-middle">
                        <MatrixCell
                          cell={row.cells[code]}
                          onOpen={() => onOpenCell(row.companyId, code, matrixResult!.financialYear)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {matrixResult.rows.length === 0 ? <p className="p-6 text-center text-sm text-text-secondary">No companies match these filters.</p> : null}
          </div>
          {matrixResult.totalPages > 1 ? (
            <div className="flex items-center justify-end gap-3 text-xs text-text-secondary">
              <span>Page {matrixResult.page} of {matrixResult.totalPages}</span>
              <button type="button" aria-label="Previous matrix page" disabled={page <= 1} onClick={() => onChange({ page: String(page - 1) })} className="rounded-lg border border-border-primary p-2 disabled:opacity-40"><ChevronLeft className="h-4 w-4"/></button>
              <button type="button" aria-label="Next matrix page" disabled={page >= matrixResult.totalPages} onClick={() => onChange({ page: String(page + 1) })} className="rounded-lg border border-border-primary p-2 disabled:opacity-40"><ChevronRight className="h-4 w-4"/></button>
            </div>
          ) : null}
          <p className="flex items-start gap-2 text-xs text-text-secondary">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-warning" aria-hidden="true"/>
            “No record” means OakCloud has no generated deadline for that company, service and FY. It does not establish that the filing is exempt or unnecessary.
          </p>
        </div>
      ) : null}

      {workloadResult?.overview === 'WORKLOAD' && view === 'WORKLOAD' ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Metric label="Total deadlines" value={workloadResult.totals.total}/>
            <Metric label="Pending filing" value={workloadResult.totals.pending}/>
            <Metric label="Filed" value={workloadResult.totals.filed}/>
            <Metric label="Overdue" value={workloadResult.totals.overdue} emphasis={workloadResult.totals.overdue > 0}/>
          </div>
          <div className="rounded-xl border border-border-primary bg-background-secondary p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-text-primary">Deadlines due in {workloadResult.dueYear}</h2>
                <p className="mt-1 text-xs text-text-secondary">Select a month to view its deadlines in the Tracker.</p>
              </div>
              {query.isFetching ? <span className="text-xs text-text-muted">Refreshing…</span> : null}
            </div>
            <div className="space-y-2">
              {workloadResult.months.map((month, index) => {
                const total = month.total || 1;
                const parts: { key: keyof MonthlyWorkloadCounts; color: string }[] = [
                  { key: 'pending', color: 'bg-status-warning' },
                  { key: 'toConfirm', color: 'bg-oak-primary' },
                  { key: 'filed', color: 'bg-status-success' },
                  { key: 'managedExternally', color: 'bg-text-muted' },
                  { key: 'notRequired', color: 'bg-background-tertiary' },
                ];
                return (
                  <button
                    key={month.month}
                    type="button"
                    onClick={() => onOpenMonth(month.month)}
                    className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2 text-left hover:bg-background-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-oak-primary"
                    aria-label={'View ' + MONTH_NAMES[index] + ' ' + workloadResult!.dueYear + ' deadlines'}
                  >
                    <span className="w-9 shrink-0 text-xs font-medium text-text-primary">{MONTH_NAMES[index]}</span>
                    <span className="flex h-4 flex-1 overflow-hidden rounded-md bg-background-tertiary">
                      {parts.map((part) => month[part.key] > 0 ? (
                        <span key={part.key} className={part.color} style={{ width: String(month[part.key] / total * 100) + '%' }}/>
                      ) : null)}
                    </span>
                    <span className="w-10 shrink-0 text-right text-sm font-semibold tabular-nums text-text-primary">{month.total}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-border-primary pt-3 text-xs text-text-secondary">
              <span>Pending: {workloadResult.totals.pending}</span>
              <span>To confirm: {workloadResult.totals.toConfirm}</span>
              <span>Filed: {workloadResult.totals.filed}</span>
              <span>Externally managed: {workloadResult.totals.managedExternally}</span>
              <span>Not required: {workloadResult.totals.notRequired}</span>
            </div>
          </div>
          <div className="overflow-x-auto rounded-xl border border-border-primary bg-background-secondary">
            <h3 className="px-4 py-3 text-sm font-semibold text-text-primary">Breakdown by service</h3>
            <table className="w-full min-w-[480px] text-left text-xs">
              <thead className="border-y border-border-primary bg-background-tertiary text-text-secondary">
                <tr>
                  <th scope="col" className="px-4 py-2">Filing / service</th>
                  <th scope="col" className="px-3 py-2 text-right">Total</th>
                  <th scope="col" className="px-3 py-2 text-right">Pending</th>
                  <th scope="col" className="px-3 py-2 text-right">To confirm</th>
                  <th scope="col" className="px-3 py-2 text-right">Filed</th>
                  <th scope="col" className="px-3 py-2 text-right">Overdue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-primary">
                {workloadResult.services.filter((service) => service.counts.total > 0).map((service) => (
                  <tr key={service.code}>
                    <th scope="row" className="px-4 py-3 font-medium text-text-primary">{service.label}</th>
                    <td className="px-3 py-3 text-right tabular-nums">{service.counts.total}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{service.counts.pending}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{service.counts.toConfirm}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{service.counts.filed}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-status-error">{service.counts.overdue}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {workloadResult.services.every((service) => service.counts.total === 0) ? <p className="p-4 text-center text-xs text-text-secondary">No deadlines match these filters.</p> : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
