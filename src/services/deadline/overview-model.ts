import {
  COMPLIANCE_MATRIX_CODES,
  COMPLIANCE_MATRIX_LABELS,
  type ComplianceMatrixCode,
  type ComplianceMatrixRow,
  type ComplianceOverviewStatus,
  type ComplianceWorkloadMonth,
  type MatrixFilingStatus,
  type MonthlyWorkloadCounts,
} from '@/lib/validations/deadline-overview';

export type OverviewOccurrence = {
  id: string;
  companyId: string;
  obligationCode: string | null;
  operativeDueDate: Date | string;
  status: string;
  ownershipScope: string;
  filingResponsibility: string | null;
  filingStatusUnconfirmed: boolean;
};

export type OverviewGroupedOccurrence = Omit<OverviewOccurrence, 'id' | 'companyId'> & {
  count: number;
};

export function dateOnlyOf(value: Date | string): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
}

export function filingStateOf(record: Pick<OverviewOccurrence, 'status' | 'filingResponsibility' | 'ownershipScope'>): MatrixFilingStatus {
  if (record.status === 'COMPLETED') return 'FILED';
  if (record.status === 'WAIVED') return 'NOT_REQUIRED';
  if (record.status === 'CANCELLED') return 'CANCELLED';
  if (record.ownershipScope === 'COMPANY') {
    if (record.filingResponsibility === 'EXTERNAL_PROVIDER' || record.filingResponsibility === 'CLIENT') {
      return 'MANAGED_EXTERNALLY';
    }
    if (record.filingResponsibility !== 'OAKCLOUD') return 'TO_BE_CONFIRMED';
  }
  return 'PENDING_FILING';
}

export function isOverdueFiling(
  record: Pick<OverviewOccurrence, 'status' | 'ownershipScope' | 'filingResponsibility' | 'filingStatusUnconfirmed' | 'operativeDueDate'>,
  today: string,
): boolean {
  return filingStateOf(record) === 'PENDING_FILING'
    && !record.filingStatusUnconfirmed
    && dateOnlyOf(record.operativeDueDate) < today;
}

const STATUS_PRIORITY: Record<MatrixFilingStatus, number> = {
  PENDING_FILING: 0,
  TO_BE_CONFIRMED: 1,
  FILED: 2,
  MANAGED_EXTERNALLY: 3,
  NOT_REQUIRED: 4,
  CANCELLED: 5,
};

export function aggregateMatrixCells(occurrences: readonly OverviewOccurrence[], today: string): ComplianceMatrixRow['cells'] {
  const grouped = new Map<ComplianceMatrixCode, OverviewOccurrence[]>();
  for (const item of occurrences) {
    if (!COMPLIANCE_MATRIX_CODES.includes(item.obligationCode as ComplianceMatrixCode)) continue;
    const code = item.obligationCode as ComplianceMatrixCode;
    grouped.set(code, [...(grouped.get(code) ?? []), item]);
  }
  const cells: ComplianceMatrixRow['cells'] = {};
  for (const [code, items] of grouped) {
    // If a rule creates multiple milestones, an outstanding one takes priority.
    const sorted = [...items].sort((a, b) =>
      STATUS_PRIORITY[filingStateOf(a)] - STATUS_PRIORITY[filingStateOf(b)]
      || dateOnlyOf(a.operativeDueDate).localeCompare(dateOnlyOf(b.operativeDueDate))
      || a.id.localeCompare(b.id));
    const primary = sorted[0]!;
    cells[code] = {
      deadlineId: primary.id,
      dueDate: dateOnlyOf(primary.operativeDueDate),
      status: filingStateOf(primary),
      overdue: sorted.some((item) => isOverdueFiling(item, today)),
      occurrenceCount: items.length,
    };
  }
  return cells;
}

export function matrixRowMatchesStatus(
  row: ComplianceMatrixRow,
  columns: readonly ComplianceMatrixCode[],
  status: ComplianceOverviewStatus,
): boolean {
  if (status === 'ALL') return true;
  return columns.some((code) => {
    const cell = row.cells[code];
    if (status === 'NO_RECORD') return !cell;
    if (status === 'OVERDUE') return cell?.overdue === true;
    return cell?.status === status;
  });
}

export function emptyWorkloadCounts(): MonthlyWorkloadCounts {
  return { total: 0, pending: 0, toConfirm: 0, filed: 0, managedExternally: 0, notRequired: 0, overdue: 0 };
}

export function buildMonthlyWorkload(
  grouped: readonly OverviewGroupedOccurrence[],
  dueYear: number,
  today: string,
  statusFilter: ComplianceOverviewStatus = 'ALL',
): { months: ComplianceWorkloadMonth[]; totals: MonthlyWorkloadCounts; services: Array<{ code: ComplianceMatrixCode | 'OTHER'; label: string; counts: MonthlyWorkloadCounts }> } {
  const months: ComplianceWorkloadMonth[] = Array.from({ length: 12 }, (_, index) => ({
    ...emptyWorkloadCounts(),
    month: String(dueYear) + '-' + String(index + 1).padStart(2, '0'),
  }));
  const totals = emptyWorkloadCounts();
  const serviceTotals = new Map<ComplianceMatrixCode | 'OTHER', MonthlyWorkloadCounts>();

  for (const entry of grouped) {
    const state = filingStateOf(entry);
    if (entry.status === 'CANCELLED') continue;
    const overdue = isOverdueFiling(entry, today);
    if (statusFilter !== 'ALL' && !(statusFilter === 'OVERDUE' ? overdue : state === statusFilter)) continue;
    const dueMonth = dateOnlyOf(entry.operativeDueDate).slice(0, 7);
    const target = months.find((month) => month.month === dueMonth);
    if (!target) continue;
    const serviceCode = COMPLIANCE_MATRIX_CODES.includes(entry.obligationCode as ComplianceMatrixCode)
      ? entry.obligationCode as ComplianceMatrixCode : 'OTHER';
    const serviceCounts = serviceTotals.get(serviceCode) ?? emptyWorkloadCounts();
    serviceTotals.set(serviceCode, serviceCounts);
    const bump = (bucket: keyof MonthlyWorkloadCounts, by: number) => {
      target[bucket] += by;
      totals[bucket] += by;
      serviceCounts[bucket] += by;
    };
    bump('total', entry.count);
    if (state === 'PENDING_FILING') bump('pending', entry.count);
    if (state === 'TO_BE_CONFIRMED') bump('toConfirm', entry.count);
    if (state === 'FILED') bump('filed', entry.count);
    if (state === 'MANAGED_EXTERNALLY') bump('managedExternally', entry.count);
    if (state === 'NOT_REQUIRED') bump('notRequired', entry.count);
    if (overdue) bump('overdue', entry.count);
  }
  const services = ([...COMPLIANCE_MATRIX_CODES, 'OTHER'] as const).map((code) => ({
    code,
    label: code === 'OTHER' ? 'Other deadlines' : COMPLIANCE_MATRIX_LABELS[code],
    counts: serviceTotals.get(code) ?? emptyWorkloadCounts(),
  }));
  return { months, totals, services };
}
