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
    expect(matrixRowMatchesStatus({ companyId: 'c', companyName: 'C', displayLabel: 'C', cells }, ['SG_AGM_DUE'], 'NO_RECORD')).toBe(true);
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

  it('scopes matrix companies and reads canonical company-owned obligations', async () => {
    const db = {
      company: { findMany: vi.fn().mockResolvedValue([{ id: 'company-a', name: 'Alpha', displayAlias: null }]) },
      deadlineOccurrence: {
        findMany: vi.fn().mockResolvedValue([filing()]),
        groupBy: vi.fn(),
      },
    };
    const result = await getComplianceOverview(
      parseComplianceOverviewParams(new URLSearchParams('overview=MATRIX&year=2025')),
      { tenantId: 'tenant-1', companyIds: ['company-a'] },
      db as never,
    );
    expect(result).toMatchObject({ overview: 'MATRIX', totalCompanies: 1 });
    expect(db.company.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId: 'tenant-1', id: { in: ['company-a'] } }),
    }));
    expect(db.deadlineOccurrence.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { AND: expect.arrayContaining([expect.objectContaining({ ownershipScope: 'COMPANY' })]) },
    }));
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
