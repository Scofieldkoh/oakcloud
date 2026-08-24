import { randomUUID } from 'node:crypto';
import { Prisma } from '@/generated/prisma';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const runPerformanceAssertions = process.env.RUN_PERFORMANCE_TESTS === 'true';
const describePerformance = testDatabaseUrl && runPerformanceAssertions ? describe : describe.skip;

if (process.env.CI === 'true' && !testDatabaseUrl) {
  describe('billing performance PostgreSQL configuration', () => {
    it('requires TEST_DATABASE_URL in CI', () => {
      throw new Error('TEST_DATABASE_URL must reference an isolated PostgreSQL test database in CI');
    });
  });
}

type PrismaClient = Awaited<ReturnType<typeof import('@/lib/prisma')['getPrisma']>>;
const INSERT_BATCH_SIZE = 2_000;

describePerformance('billing representative PostgreSQL performance', () => {
  let prisma: PrismaClient;
  let tenantId: string;
  let companyIds: string[] = [];
  let clientServiceIds: string[] = [];
  let feeLineIds: string[] = [];

  beforeAll(async () => {
    process.env.DATABASE_URL = testDatabaseUrl;
    prisma = (await import('@/lib/prisma')).getPrisma();
    const userId = randomUUID();
    const partialId = randomUUID();
    const familyId = randomUUID();
    const variantId = randomUUID();
    tenantId = randomUUID();
    const suffix = tenantId.replaceAll('-', '').slice(0, 12);

    await prisma.workspace.create({
      data: {
        id: tenantId,
        name: 'Billing performance workspace',
        slug: `billing-performance-${suffix}`,
        status: 'ACTIVE',
        settings: { servicesWorkspace: { enabled: true, deadlineWritesEnabled: true } },
      },
    });
    await prisma.user.create({
      data: {
        id: userId,
        tenantId,
        email: `${suffix}@example.test`,
        passwordHash: 'integration-only',
        firstName: 'Billing',
        lastName: 'Performance',
      },
    });
    await prisma.templatePartial.create({
      data: {
        id: partialId,
        tenantId,
        name: `Billing performance partial ${suffix}`,
        content: '<p>Billing performance service</p>',
        createdById: userId,
      },
    });
    await prisma.serviceFamily.create({
      data: {
        id: familyId,
        tenantId,
        code: `BILLING_PERF_${suffix}`,
        name: 'Billing performance family',
        displayColor: '#2F6F5E',
      },
    });
    await prisma.serviceVariant.create({
      data: {
        id: variantId,
        tenantId,
        familyId,
        sowPartialId: partialId,
        code: `BILLING_PERF_SERVICE_${suffix}`,
        name: 'Billing performance service',
        serviceCadence: 'MONTHLY',
      },
    });

    companyIds = Array.from({ length: 1_000 }, () => randomUUID());
    await createManyInBatches(prisma.company, companyIds.map((id, index) => ({
      id,
      tenantId,
      uen: `P${suffix.toUpperCase()}${String(index).padStart(4, '0')}`,
      name: `Billing performance company ${String(index + 1).padStart(4, '0')}`,
      entityType: 'PRIVATE_LIMITED' as const,
      status: 'LIVE' as const,
    })));

    clientServiceIds = Array.from({ length: 10_000 }, () => randomUUID());
    await createManyInBatches(prisma.clientService, clientServiceIds.map((id, index) => ({
      id,
      tenantId,
      companyId: companyIds[Math.floor(index / 10)]!,
      source: 'MANUAL' as const,
      serviceVariantId: variantId,
      familyName: 'Billing performance family',
      serviceName: `Billing performance service ${String(index + 1).padStart(5, '0')}`,
      status: 'ACTIVE' as const,
      serviceCadence: 'MONTHLY' as const,
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      billingDisposition: 'CONFIGURED' as const,
      fieldValues: {},
    })));

    feeLineIds = Array.from({ length: 10_000 }, () => randomUUID());
    await createManyInBatches(prisma.clientServiceFeeLine, feeLineIds.map((id, index) => ({
      id,
      tenantId,
      clientServiceId: clientServiceIds[index]!,
      description: `Representative fee ${String(index + 1).padStart(5, '0')}`,
      amount: '125.00',
      currency: 'SGD',
      billingFrequency: 'MONTHLY' as const,
      billingStartDate: new Date('2026-01-01T00:00:00.000Z'),
      scheduleConfig: Prisma.JsonNull,
    })));

    const occurrenceRows = clientServiceIds.flatMap((clientServiceId, serviceIndex) => Array.from({ length: 10 }, (_, periodIndex) => {
      const month = periodIndex + 1;
      return {
        id: randomUUID(),
        tenantId,
        companyId: companyIds[Math.floor(serviceIndex / 10)]!,
        clientServiceId,
        feeLineId: feeLineIds[serviceIndex]!,
        billingPeriodKey: `2026-${String(month).padStart(2, '0')}`,
        scheduleEntryKey: 'default',
        generationKey: 'billing-performance-v1',
        calculatedExpectedDate: new Date(`2026-${String(month).padStart(2, '0')}-15T00:00:00.000Z`),
        operativeExpectedDate: new Date(`2026-${String(month).padStart(2, '0')}-15T00:00:00.000Z`),
        baseAmount: '125.00',
        baseCurrency: 'SGD',
        operativeAmount: '125.00',
        operativeCurrency: 'SGD',
        status: 'OPEN' as const,
      };
    }));
    await createManyInBatches(prisma.billingOccurrence, occurrenceRows);

    const issueRows = clientServiceIds.slice(0, 1_000).map((clientServiceId, index) => ({
      id: randomUUID(),
      tenantId,
      companyId: companyIds[Math.floor(index / 10)]!,
      clientServiceId,
      feeLineId: null,
      type: 'MISSING_SCHEDULE_PARAMETER' as const,
      severity: 'ERROR' as const,
      issueKey: `${String(index).padStart(63, '0')}1`,
      details: { scheduleKey: 'representative' },
    }));
    await createManyInBatches(prisma.billingCoverageIssue, issueRows);

    // Bulk fixtures bypass the normal write path; refresh planner statistics
    // before measuring the representative read workload.
    await prisma.$executeRawUnsafe('ANALYZE companies, client_services, client_service_fee_lines, billing_occurrences, billing_coverage_issues');
  }, 180_000);

  afterAll(async () => {
    if (!prisma || !tenantId) return;
    const failures: unknown[] = [];
    const attempt = async (operation: () => Promise<unknown>) => {
      try {
        await operation();
      } catch (error) {
        failures.push(error);
      }
    };
    await attempt(() => prisma.auditLog.deleteMany({ where: { tenantId } }));
    await attempt(() => prisma.billingCoverageIssue.deleteMany({ where: { tenantId } }));
    await attempt(() => prisma.billingOccurrence.deleteMany({ where: { tenantId } }));
    await attempt(() => prisma.clientServiceFeeLine.deleteMany({ where: { tenantId } }));
    await attempt(() => prisma.clientService.deleteMany({ where: { tenantId } }));
    await attempt(() => prisma.serviceVariant.deleteMany({ where: { tenantId } }));
    await attempt(() => prisma.serviceFamily.deleteMany({ where: { tenantId } }));
    await attempt(() => prisma.templatePartial.deleteMany({ where: { tenantId } }));
    await attempt(() => prisma.user.deleteMany({ where: { tenantId } }));
    await attempt(() => prisma.company.deleteMany({ where: { tenantId } }));
    await attempt(() => prisma.workspace.deleteMany({ where: { id: tenantId } }));
    await prisma.$disconnect();
    if (failures.length > 0) throw new Error(`Billing performance cleanup failed in ${failures.length} step(s)`);
  }, 120_000);

  it('uses tenant/date/status and unresolved-coverage indexes for representative queries', async () => {
    expect(await prisma.company.count({ where: { tenantId } })).toBe(1_000);
    expect(await prisma.clientService.count({ where: { tenantId } })).toBe(10_000);
    expect(await prisma.billingOccurrence.count({ where: { tenantId } })).toBe(100_000);
    expect(await prisma.billingCoverageIssue.count({ where: { tenantId, resolvedAt: null } })).toBe(1_000);

    const occurrencePlan = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL enable_seqscan = off');
      return explainJsonWithClient(tx, `
        EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
        SELECT id
        FROM billing_occurrences
        WHERE tenant_id = $1
          AND operative_expected_date >= $2::date
          AND operative_expected_date <= $3::date
          AND status = 'OPEN'
        ORDER BY operative_expected_date ASC
        LIMIT 100
      `, tenantId, '2026-08-01', '2026-09-30');
    });
    // Keep the EXPLAIN predicate selective enough to demonstrate the
    // tenant/company/severity/resolution index; the API acceptance below
    // still exercises the full tenant coverage summary.
    const coverageCompanyIds = companyIds.slice(0, 1);
    const coveragePlan = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL enable_seqscan = off');
      return explainJsonWithClient(tx, `
        EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
        SELECT id
        FROM billing_coverage_issues
        WHERE tenant_id = $1
          AND company_id = ANY($2::text[])
          AND resolved_at IS NULL
        ORDER BY company_id ASC, severity ASC
        LIMIT 100
      `, tenantId, coverageCompanyIds);
    });

    const occurrenceNodes = flattenExplainNodes(occurrencePlan);
    const coverageNodes = flattenExplainNodes(coveragePlan);
    const occurrenceIndex = occurrenceNodes.find((node) => node['Index Name']?.startsWith('billing_occurrences_tenant_id_operative_expected_date_status'));
    const coverageIndex = coverageNodes.find((node) => node['Index Name']?.startsWith('billing_coverage_issues_tenant_id_company_id_severity_resolved'));
    expect(occurrenceIndex).toBeDefined();
    expect(`${occurrenceIndex?.['Index Cond'] ?? ''} ${occurrenceIndex?.Filter ?? ''}`).toContain('tenant_id');
    expect(`${occurrenceIndex?.['Index Cond'] ?? ''} ${occurrenceIndex?.Filter ?? ''}`).toContain('operative_expected_date');
    expect(`${occurrenceIndex?.['Index Cond'] ?? ''} ${occurrenceIndex?.Filter ?? ''}`).toContain('status');
    expect(coverageIndex).toBeDefined();
    expect(`${coverageIndex?.['Index Cond'] ?? ''} ${coverageIndex?.Filter ?? ''}`).toContain('tenant_id');
    expect(`${coverageIndex?.['Index Cond'] ?? ''} ${coverageIndex?.Filter ?? ''}`).toContain('company_id');
    expect(`${coverageIndex?.['Index Cond'] ?? ''} ${coverageIndex?.Filter ?? ''}`).toContain('resolved_at');
  }, 60_000);

  it('keeps paginated billing and coverage summaries bounded under the acceptance target', async () => {
    const { listBillingOccurrences, listBillingCoverage } = await import('@/services/billing');
    const search = {
      from: '2026-01-01' as const,
      to: '2026-12-31' as const,
      statuses: ['OPEN'] as const,
      page: 1,
      limit: 100,
      sortBy: 'expectedDate' as const,
      sortOrder: 'asc' as const,
    };
    const listStartedAt = performance.now();
    const occurrenceResult = await listBillingOccurrences(search, { tenantId }, prisma, { today: '2026-08-18' });
    const listDurationMs = performance.now() - listStartedAt;

    const coverageStartedAt = performance.now();
    const coverageResult = await listBillingCoverage({ tenantId }, prisma);
    const coverageDurationMs = performance.now() - coverageStartedAt;

    expect(occurrenceResult.total).toBe(100_000);
    expect(occurrenceResult.items).toHaveLength(100);
    expect(coverageResult.openIssueCount).toBe(1_000);
    expect(coverageResult.affectedServiceCount).toBe(1_000);
    expect(coverageResult.healthyActiveServiceCount).toBe(9_000);
    expect(listDurationMs).toBeLessThanOrEqual(1_500);
    expect(coverageDurationMs).toBeLessThanOrEqual(1_500);
  }, 60_000);
});

async function createManyInBatches<Row>(
  model: { createMany: (args: { data: Row[] }) => Promise<unknown> },
  rows: Row[],
): Promise<void> {
  for (let offset = 0; offset < rows.length; offset += INSERT_BATCH_SIZE) {
    await model.createMany({ data: rows.slice(offset, offset + INSERT_BATCH_SIZE) });
  }
}

async function explainJsonWithClient(
  client: Pick<PrismaClient, '$queryRawUnsafe'>,
  sql: string,
  ...parameters: unknown[]
): Promise<unknown> {
  const rows = await client.$queryRawUnsafe<Array<{ 'QUERY PLAN': unknown }>>(sql, ...parameters);
  return rows[0]?.['QUERY PLAN'] ?? rows;
}

type ExplainNode = {
  'Node Type'?: string;
  'Relation Name'?: string;
  'Index Name'?: string;
  'Index Cond'?: string;
  Filter?: string;
  Plans?: ExplainNode[];
};

function flattenExplainNodes(value: unknown): ExplainNode[] {
  let parsed = value;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed) as unknown;
    } catch {
      return [];
    }
  }
  if (Array.isArray(parsed)) return parsed.flatMap((entry) => flattenExplainNodes(entry));
  if (!parsed || typeof parsed !== 'object') return [];
  const record = parsed as { Plan?: ExplainNode } & ExplainNode;
  const node = record.Plan ?? record;
  return [node, ...(node.Plans ?? []).flatMap((child) => flattenExplainNodes(child))];
}
