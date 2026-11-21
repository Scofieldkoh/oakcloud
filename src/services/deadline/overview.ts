import type { Prisma } from '@/generated/prisma';
import { prisma } from '@/lib/prisma';
import { getCompanyDisplayLabel } from '@/lib/company-display-label';
import { deadlineSearchSchema } from '@/lib/validations/deadline';
import {
  COMPLIANCE_MATRIX_CODES,
  type ComplianceMatrixResult,
  type ComplianceOverviewQuery,
  type ComplianceOverviewResult,
  type ComplianceWorkloadResult,
} from '@/lib/validations/deadline-overview';
import { currentDateInSingapore } from '@/services/service-schedule/date-only';
import { deadlineWhereForSearch } from './service';
import type { DeadlineScope } from './types';
import {
  aggregateMatrixCells,
  buildMonthlyWorkload,
  matrixRowMatchesStatus,
} from './overview-model';

type OverviewDb = Pick<typeof prisma, 'company' | 'deadlineOccurrence'>;

function matrixColumns(input: ComplianceOverviewQuery) {
  return input.serviceCode ? [input.serviceCode] : [...COMPLIANCE_MATRIX_CODES];
}

export function emptyComplianceOverview(input: ComplianceOverviewQuery): ComplianceOverviewResult {
  if (input.overview === 'MATRIX') {
    return {
      overview: 'MATRIX',
      financialYear: input.year,
      columns: matrixColumns(input),
      rows: [],
      totalCompanies: 0,
      page: input.page,
      totalPages: 0,
    };
  }
  const { months, totals, services } = buildMonthlyWorkload([], input.year, currentDateInSingapore());
  return { overview: 'WORKLOAD', dueYear: input.year, months, totals, services };
}

/**
 * The matrix is keyed to the financial period, not the due month. A Form C
 * falling due the following year remains beside ECI, AGM and AR for that FY.
 * Absence is rendered as "No record", never "Filed" or "Not required".
 */
async function listComplianceMatrix(
  input: ComplianceOverviewQuery,
  scope: DeadlineScope,
  db: OverviewDb,
): Promise<ComplianceMatrixResult> {
  const columns = matrixColumns(input);
  const companies = await db.company.findMany({
    where: {
      tenantId: scope.tenantId,
      deletedAt: null,
      ...(scope.companyIds ? { id: { in: scope.companyIds } } : {}),
      ...(input.companyQuery ? {
        OR: [
          { name: { contains: input.companyQuery, mode: 'insensitive' as const } },
          { displayAlias: { contains: input.companyQuery, mode: 'insensitive' as const } },
          { uen: { contains: input.companyQuery, mode: 'insensitive' as const } },
        ],
      } : {}),
    },
    select: { id: true, name: true, displayAlias: true },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  });

  if (companies.length === 0) return emptyComplianceOverview(input) as ComplianceMatrixResult;

  const search = deadlineSearchSchema.parse({ openOnly: false, financialYear: input.year });
  const where: Prisma.DeadlineOccurrenceWhereInput = {
    AND: [
      deadlineWhereForSearch(search, scope),
      {
        ownershipScope: 'COMPANY',
        obligationCode: { in: columns },
        companyId: { in: companies.map((company) => company.id) },
      },
    ],
  };
  const occurrences = await db.deadlineOccurrence.findMany({
    where,
    select: {
      id: true,
      companyId: true,
      obligationCode: true,
      operativeDueDate: true,
      status: true,
      ownershipScope: true,
      filingResponsibility: true,
      filingStatusUnconfirmed: true,
    },
  });

  const grouped = new Map<string, typeof occurrences>();
  for (const occurrence of occurrences) {
    const rows = grouped.get(occurrence.companyId) ?? [];
    rows.push(occurrence);
    grouped.set(occurrence.companyId, rows);
  }
  const today = currentDateInSingapore();
  const allRows = companies.map((company) => ({
    companyId: company.id,
    companyName: company.name,
    displayLabel: getCompanyDisplayLabel({ name: company.name, displayAlias: company.displayAlias }),
    cells: aggregateMatrixCells(grouped.get(company.id) ?? [], today),
  }));
  const matchingRows = allRows.filter((row) => matrixRowMatchesStatus(row, columns, input.status));
  const PAGE_SIZE = 50;
  const totalCompanies = matchingRows.length;

  return {
    overview: 'MATRIX',
    financialYear: input.year,
    columns,
    rows: matchingRows.slice((input.page - 1) * PAGE_SIZE, input.page * PAGE_SIZE),
    totalCompanies,
    page: input.page,
    totalPages: Math.ceil(totalCompanies / PAGE_SIZE),
  };
}

/** Aggregates *all* matching occurrences, not the paginated tracker or capped calendar. */
async function getMonthlyComplianceWorkload(
  input: ComplianceOverviewQuery,
  scope: DeadlineScope,
  db: OverviewDb,
): Promise<ComplianceWorkloadResult> {
  const from = String(input.year) + '-01-01';
  const to = String(input.year) + '-12-31';
  const search = deadlineSearchSchema.parse({
    from, to,
    mode: 'TABLE',
    openOnly: false,
    companyQuery: input.companyQuery,
    financialYear: input.financialYear,
  });
  const where: Prisma.DeadlineOccurrenceWhereInput = {
    AND: [
      deadlineWhereForSearch(search, scope),
      { status: { not: 'CANCELLED' } },
      ...(input.serviceCode ? [{ ownershipScope: 'COMPANY' as const, obligationCode: input.serviceCode }] : []),
    ],
  };
  const groups = await db.deadlineOccurrence.groupBy({
    by: ['operativeDueDate', 'status', 'ownershipScope', 'filingResponsibility', 'filingStatusUnconfirmed', 'obligationCode'],
    where,
    _count: { _all: true },
  });
  const { months, totals, services } = buildMonthlyWorkload(
    groups.map((entry) => ({
      operativeDueDate: entry.operativeDueDate,
      status: entry.status,
      ownershipScope: entry.ownershipScope,
      obligationCode: entry.obligationCode,
      filingResponsibility: entry.filingResponsibility,
      filingStatusUnconfirmed: entry.filingStatusUnconfirmed,
      count: entry._count._all,
    })),
    input.year,
    currentDateInSingapore(),
    input.status,
  );
  return { overview: 'WORKLOAD', dueYear: input.year, months, totals, services };
}

export async function getComplianceOverview(
  input: ComplianceOverviewQuery,
  scope: DeadlineScope,
  db: OverviewDb = prisma,
): Promise<ComplianceOverviewResult> {
  if (scope.companyIds?.length === 0) return emptyComplianceOverview(input);
  return input.overview === 'MATRIX'
    ? listComplianceMatrix(input, scope, db)
    : getMonthlyComplianceWorkload(input, scope, db);
}
