import { describe, expect, it, vi } from 'vitest';
import {
  complianceOverviewParams,
  parseComplianceOverviewParams,
} from '@/lib/validations/deadline-overview';
import {
  aggregateMatrixCells,
  buildMonthlyWorkload,
  filingStateOf,
  isOverdueFiling,
  matrixRowMatchesStatus,
  sortComplianceMatrixRows,
  type OverviewOccurrence,
} from '@/services/deadline/overview-model';
import { getComplianceOverview } from '@/services/deadline/overview';

function filing(overrides: Partial<OverviewOccurrence> = {}): OverviewOccurrence {
  return {
    id: 'filing-1',
    companyId: 'company-a',
    obligationCode: 'SG_FORM_C',
    operativeDueDate: new Date('2026-11-30T00:00:00.000Z'),
    status: 'OPEN',
    ownershipScope: 'COMPANY',
    filingResponsibility: 'OAKCLOUD',
    filingStatusUnconfirmed: false,
    ...overrides,
  };
}

describe('compliance overview', () => {
  it('uses a strict, bounded query and does not treat FY as a due month', () => {
    const query = { overview: 'MATRIX' as const, year: 2025, status: 'FILED' as const };
    expect(parseComplianceOverviewParams(new URLSearchParams(complianceOverviewParams(query)))).toMatchObject(query);
    expect(() => parseComplianceOverviewParams(new URLSearchParams('overview=MATRIX&year=2025&year=2026'))).toThrow();
    expect(() => parseComplianceOverviewParams(new URLSearchParams('overview=MATRIX&year=1999'))).toThrow();
    expect(() => parseComplianceOverviewParams(new URLSearchParams('overview=WORKLOAD&year=2026&other=x'))).toThrow();
    expect(() => parseComplianceOverviewParams(new URLSearchParams('overview=MATRIX&year=2025&matrixSortCode=SG_ECI'))).toThrow();
    expect(() => parseComplianceOverviewParams(new URLSearchParams('overview=MATRIX&year=2025&matrixSortYear=2027&matrixSortCode=SG_ECI'))).toThrow();
    expect(() => parseComplianceOverviewParams(new URLSearchParams('overview=MATRIX&year=2100'))).toThrow();
    expect(parseComplianceOverviewParams(new URLSearchParams(complianceOverviewParams({
      overview: 'MATRIX', year: 2025, matrixSortYear: 2026, matrixSortCode: 'SG_ANNUAL_RETURN', matrixSortOrder: 'desc',
    })))).toMatchObject({ matrixSortYear: 2026, matrixSortCode: 'SG_ANNUAL_RETURN', matrixSortOrder: 'desc' });
  });

  it('prioritises outstanding milestones and never marks an absent filing as completed', () => {
    const cells = aggregateMatrixCells([
      filing({ id: 'filed', status: 'COMPLETED', operativeDueDate: '2026-11-30' }),
      filing({ id: 'open', operativeDueDate: '2026-11-30' }),
      filing({ id: 'eci', obligationCode: 'SG_ECI', status: 'WAIVED', operativeDueDate: '2026-03-31' }),
    ], '2026-12-01');

    expect(cells.SG_FORM_C).toMatchObject({ deadlineId: 'open', status: 'PENDING_FILING', overdue: true, occurrenceCount: 2 });
    expect(cells.SG_ECI).toMatchObject({ status: 'NOT_REQUIRED', overdue: false });
    expect(cells.SG_AGM_DUE).toBeUndefined();
    expect(matrixRowMatchesStatus({ companyId: 'c', companyName: 'C', displayLabel: 'C', cellsByYear: { 2025: cells, 2026: {} } }, [2025, 2026], ['SG_AGM_DUE'], 'NO_RECORD')).toBe(true);
  });

  it('protects takeover review and externally managed records from false overdue flags', () => {
    expect(isOverdueFiling(filing({ operativeDueDate: '2025-11-30', filingStatusUnconfirmed: true }), '2026-11-21')).toBe(false);
    expect(isOverdueFiling(filing({ operativeDueDate: '2025-11-30', filingResponsibility: 'EXTERNAL_PROVIDER' }), '2026-11-21')).toBe(false);
    expect(isOverdueFiling(filing({ operativeDueDate: '2025-11-30' }), '2026-11-21')).toBe(true);
    expect(filingStateOf(filing({ filingResponsibility: null }))).toBe('TO_BE_CONFIRMED');
  });

  it('aggregates all grouped occurrences by due month and keeps overdue as a subset', () => {
    const monthly = buildMonthlyWorkload([
      { ...filing({ operativeDueDate: '2026-11-30' }), count: 3 },
      { ...filing({ operativeDueDate: '2026-11-30', status: 'COMPLETED' }), count: 2 },
      { ...filing({ operativeDueDate: '2026-12-15', filingResponsibility: 'UNCONFIRMED' }), count: 1 },
      { ...filing({ operativeDueDate: '2026-10-31', filingResponsibility: 'EXTERNAL_PROVIDER' }), count: 2 },
      { ...filing({ operativeDueDate: '2026-11-30', status: 'CANCELLED' }), count: 4 },
    ], 2026, '2026-12-01');
    expect(monthly.totals).toMatchObject({
      total: 8, pending: 3, filed: 2, toConfirm: 1, managedExternally: 2, overdue: 3,
    });
    expect(monthly.months.find((month) => month.month === '2026-11')).toMatchObject({ total: 5, overdue: 3 });
    expect(monthly.services.find((service) => service.code === 'SG_FORM_C')?.counts).toMatchObject({ total: 8, overdue: 3 });
    expect(buildMonthlyWorkload([
      { ...filing({ operativeDueDate: '2026-11-30' }), count: 3 },
      { ...filing({ operativeDueDate: '2026-11-30', status: 'COMPLETED' }), count: 2 },
    ], 2026, '2026-12-01', 'FILED').totals.total).toBe(2);
  });

  it('sorts across companies before pagination, keeps missing records last and toggles date direction', () => {
    const first = { deadlineId: 'a', dueDate: '2026-04-01', status: 'FILED' as const, overdue: false, occurrenceCount: 1 };
    const second = { ...first, deadlineId: 'b', dueDate: '2026-02-01' };
    const entries = [
      { companyId: 'z', companyName: 'Zed', displayLabel: 'Zed', cellsByYear: { 2025: { SG_ECI: first }, 2026: {} } },
      { companyId: 'a', companyName: 'Alpha', displayLabel: 'Alpha', cellsByYear: { 2025: {}, 2026: {} } },
      { companyId: 'b', companyName: 'Beta', displayLabel: 'Beta', cellsByYear: { 2025: { SG_ECI: second }, 2026: {} } },
    ];
    expect(sortComplianceMatrixRows(entries, 2025, 'SG_ECI', 'asc').map((row) => row.companyName))
      .toEqual(['Beta', 'Zed', 'Alpha']);
    expect(sortComplianceMatrixRows(entries, 2025, 'SG_ECI', 'desc').map((row) => row.companyName))
      .toEqual(['Zed', 'Beta', 'Alpha']);
    expect(sortComplianceMatrixRows(entries).map((row) => row.companyName))
      .toEqual(['Alpha', 'Beta', 'Zed']);
    expect(matrixRowMatchesStatus(entries[2]!, [2025, 2026], ['SG_ECI'], 'FILED')).toBe(true);
    expect(matrixRowMatchesStatus(entries[2]!, [2025, 2026], ['SG_ECI'], 'NO_RECORD')).toBe(true);
  });

  it('scopes matrix companies and reads canonical company-owned obligations', async () => {
    const db = {
      company: { findMany: vi.fn().mockResolvedValue([{ id: 'company-a', name: 'Alpha', displayAlias: null }]) },
      deadlineOccurrence: {
        findMany: vi.fn().mockResolvedValue([
          { ...filing({ id: 'fy2025' }), financialPeriodEnd: new Date('2025-12-31T00:00:00Z'), cycle: { periodEnd: new Date('2025-12-31T00:00:00Z') } },
          { ...filing({ id: 'fy2026', status: 'COMPLETED' }), financialPeriodEnd: null, cycle: { periodEnd: new Date('2026-12-31T00:00:00Z') } },
          { ...filing({ id: 'ignored', status: 'COMPLETED' }), financialPeriodEnd: new Date('2024-12-31T00:00:00Z'), cycle: { periodEnd: new Date('2024-12-31T00:00:00Z') } },
        ]),
        groupBy: vi.fn(),
      },
    };
    const result = await getComplianceOverview(
      parseComplianceOverviewParams(new URLSearchParams('overview=MATRIX&year=2025')),
      { tenantId: 'tenant-1', companyIds: ['company-a'] },
      db as never,
    );
    expect(result).toMatchObject({ overview: 'MATRIX', financialYear: 2025, years: [2025, 2026], totalCompanies: 1 });
    if (result.overview !== 'MATRIX') throw new Error('Expected matrix');
    expect(result.rows[0]?.cellsByYear[2025]?.SG_FORM_C).toMatchObject({ deadlineId: 'fy2025', status: 'PENDING_FILING' });
    expect(result.rows[0]?.cellsByYear[2026]?.SG_FORM_C).toMatchObject({ deadlineId: 'fy2026', status: 'FILED' });
    expect(db.company.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId: 'tenant-1', id: { in: ['company-a'] } }),
    }));
    expect(db.deadlineOccurrence.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { AND: expect.arrayContaining([expect.objectContaining({ ownershipScope: 'COMPANY' })]) },
    }));
  });

  it('sorts the entire two-year company matrix before taking a 50-row page', async () => {
    const companies = Array.from({ length: 52 }, (_, index) => ({
      id: 'company-' + (index + 1),
      name: 'Company ' + String(index + 1).padStart(2, '0'),
      displayAlias: null,
    }));
    const db = {
      company: { findMany: vi.fn().mockResolvedValue(companies) },
      deadlineOccurrence: {
        findMany: vi.fn().mockResolvedValue(companies.map((company, index) => ({
          ...filing({
            id: 'filing-' + (index + 1),
            companyId: company.id,
            operativeDueDate: new Date(Date.UTC(2026, 1, 22 - index)),
          }),
          financialPeriodEnd: new Date('2025-12-31T00:00:00Z'),
          cycle: { periodEnd: new Date('2025-12-31T00:00:00Z') },
        }))),
        groupBy: vi.fn(),
      },
    };
    const query = 'overview=MATRIX&year=2025&matrixSortYear=2025&matrixSortCode=SG_FORM_C&matrixSortOrder=asc';
    const first = await getComplianceOverview(
      parseComplianceOverviewParams(new URLSearchParams(query)),
      { tenantId: 'tenant-1' },
      db as never,
    );
    expect(first).toMatchObject({ overview: 'MATRIX', totalCompanies: 52, totalPages: 2 });
    if (first.overview !== 'MATRIX') throw new Error('Expected matrix');
    expect(first.rows).toHaveLength(50);
    expect(first.rows[0]?.companyName).toBe('Company 52');
    expect(first.rows[49]?.companyName).toBe('Company 03');

    const second = await getComplianceOverview(
      parseComplianceOverviewParams(new URLSearchParams(query + '&page=2')),
      { tenantId: 'tenant-1' },
      db as never,
    );
    if (second.overview !== 'MATRIX') throw new Error('Expected matrix');
    expect(second.rows.map((row) => row.companyName)).toEqual(['Company 02', 'Company 01']);
  });

  it('uses database grouping rather than a paginated tracker for monthly workload', async () => {
    const db = {
      company: { findMany: vi.fn() },
      deadlineOccurrence: {
        findMany: vi.fn(),
        groupBy: vi.fn().mockResolvedValue([
          { operativeDueDate: new Date('2026-11-30T00:00:00Z'), status: 'OPEN', filingResponsibility: 'OAKCLOUD', filingStatusUnconfirmed: false, ownershipScope: 'COMPANY', _count: { _all: 91 } },
        ]),
      },
    };
    const result = await getComplianceOverview(
      parseComplianceOverviewParams(new URLSearchParams('overview=WORKLOAD&year=2026')),
      { tenantId: 'tenant-1', companyIds: ['company-a'] },
      db as never,
    );
    expect(result).toMatchObject({ overview: 'WORKLOAD', totals: { total: 91 } });
    expect(db.deadlineOccurrence.groupBy).toHaveBeenCalledOnce();
    expect(db.deadlineOccurrence.findMany).not.toHaveBeenCalled();
  });
});
