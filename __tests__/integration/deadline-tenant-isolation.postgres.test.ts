import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describePostgres = testDatabaseUrl ? describe : describe.skip;

type PrismaClient = Awaited<ReturnType<typeof import('@/lib/prisma')['getPrisma']>>;

describePostgres('deadline tenant isolation and idempotency PostgreSQL integration', () => {
  let prisma: PrismaClient;
  const tenantIds: string[] = [];

  beforeAll(async () => {
    process.env.DATABASE_URL = testDatabaseUrl;
    prisma = (await import('@/lib/prisma')).getPrisma();
  });

  afterAll(async () => {
    for (const tenantId of tenantIds.splice(0)) {
      await prisma.deadlineOccurrence.deleteMany({ where: { tenantId } });
      await prisma.serviceCycle.deleteMany({ where: { tenantId } });
      await prisma.clientServiceDeadlineRule.deleteMany({ where: { tenantId } });
      await prisma.clientService.deleteMany({ where: { tenantId } });
      await prisma.deadlineMilestoneTemplate.deleteMany({ where: { tenantId } });
      await prisma.deadlineRule.updateMany({ where: { tenantId }, data: { currentVersionId: null } });
      await prisma.deadlineRuleVersion.deleteMany({ where: { tenantId } });
      await prisma.deadlineRule.deleteMany({ where: { tenantId } });
      await prisma.serviceVariant.deleteMany({ where: { tenantId } });
      await prisma.serviceFamily.deleteMany({ where: { tenantId } });
      await prisma.templatePartial.deleteMany({ where: { tenantId } });
      await prisma.user.deleteMany({ where: { tenantId } });
      await prisma.company.deleteMany({ where: { tenantId } });
      await prisma.workspace.delete({ where: { id: tenantId } });
    }
    await prisma.$disconnect();
  });

  async function seedTenant(label: string) {
    const tenantId = randomUUID();
    tenantIds.push(tenantId);
    const userId = randomUUID();
    const companyId = randomUUID();
    const partialId = randomUUID();
    const familyId = randomUUID();
    const variantId = randomUUID();
    const ruleId = randomUUID();
    const versionId = randomUUID();
    const clientServiceId = randomUUID();

    await prisma.workspace.create({
      data: {
        id: tenantId,
        name: `${label} workspace`,
        slug: `${label.toLowerCase()}-${tenantId}`,
        settings: { servicesWorkspace: { enabled: true, deadlineWritesEnabled: true } },
      },
    });
    await prisma.user.create({
      data: {
        id: userId,
        tenantId,
        email: `${userId}@example.test`,
        passwordHash: 'integration-only',
        firstName: 'Isolation',
        lastName: 'Test',
      },
    });
    await prisma.company.create({
      data: {
        id: companyId,
        tenantId,
        uen: `T${tenantId.replaceAll('-', '').slice(0, 8).toUpperCase()}`,
        name: `${label} company`,
        entityType: 'PRIVATE_LIMITED',
        status: 'LIVE',
        nextAgmDueDate: new Date('2026-09-30T00:00:00.000Z'),
        financialYearEndDay: 31,
        financialYearEndMonth: 12,
      },
    });
    await prisma.templatePartial.create({
      data: {
        id: partialId,
        tenantId,
        name: `${label}-partial`,
        content: '<p>Integration service</p>',
        createdById: userId,
      },
    });
    await prisma.serviceFamily.create({
      data: {
        id: familyId,
        tenantId,
        code: `${label.toUpperCase()}_FAMILY`,
        name: `${label} family`,
        displayColor: '#2F6F5E',
      },
    });
    await prisma.serviceVariant.create({
      data: {
        id: variantId,
        tenantId,
        familyId,
        sowPartialId: partialId,
        code: `${label.toUpperCase()}_SERVICE`,
        name: `${label} service`,
        serviceCadence: 'ONE_TIME',
      },
    });
    await prisma.deadlineRule.create({
      data: {
        id: ruleId,
        tenantId,
        code: `${label.toUpperCase()}_RULE`,
        name: `${label} deadline rule`,
      },
    });
    await prisma.deadlineRuleVersion.create({
      data: {
        id: versionId,
        tenantId,
        ruleId,
        version: 1,
        state: 'PUBLISHED',
        schemaVersion: 1,
        configHash: 'a'.repeat(64),
        recurrence: { schemaVersion: 1, kind: 'ONE_TIME' },
        applicability: { schemaVersion: 1, kind: 'ALL', conditions: [] },
        milestoneTemplates: {
          create: {
            tenantId,
            milestoneKey: 'annual-return',
            name: 'Annual return',
            type: 'STATUTORY',
            generationMode: 'ONCE_PER_CYCLE',
            dateExpression: { kind: 'SOURCE', source: { kind: 'COMPANY_FIELD', field: 'nextAgmDueDate' } },
            businessDayAdjustment: 'NONE',
            displayOrder: 0,
          },
        },
      },
    });
    await prisma.deadlineRule.update({ where: { id: ruleId }, data: { currentVersionId: versionId } });
    await prisma.clientService.create({
      data: {
        id: clientServiceId,
        tenantId,
        companyId,
        source: 'MANUAL',
        serviceVariantId: variantId,
        familyName: `${label} family`,
        serviceName: `${label} service`,
        status: 'ACTIVE',
        serviceCadence: 'ONE_TIME',
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        deadlineRules: { create: { tenantId, ruleId, enabled: true } },
      },
    });

    return { tenantId, companyId, clientServiceId, ruleId, userId };
  }

  it('cannot list or mutate another tenant deadline', async () => {
    const tenantOne = await seedTenant('TenantOne');
    const tenantTwo = await seedTenant('TenantTwo');
    const { reconcileClientServiceDeadlines } = await import('@/services/schedule-reconciliation');
    const { listDeadlines, getDeadlineOccurrence, updateDeadlineOccurrence } = await import('@/services/deadline');

    const input = {
      tenantId: tenantTwo.tenantId,
      clientServiceId: tenantTwo.clientServiceId,
      today: '2026-08-18' as const,
      horizonEnd: '2027-08-18' as const,
      writeMode: 'APPLY' as const,
      reconciliationRequestId: randomUUID(),
    };
    await prisma.$transaction((tx) => reconcileClientServiceDeadlines(input, tx));
    const otherTenantOccurrence = await prisma.deadlineOccurrence.findFirstOrThrow({ where: { tenantId: tenantTwo.tenantId } });

    const search = {
      from: '2026-08-01' as const,
      to: '2026-10-31' as const,
      mode: 'TABLE' as const,
      types: ['STATUTORY', 'CLIENT', 'INTERNAL'] as const,
      familyIds: [],
      companyIds: [],
      statuses: [],
      timing: [],
      openOnly: true,
      companyQuery: '',
      serviceQuery: '',
      milestoneQuery: '',
      page: 1,
      limit: 50,
      sortBy: 'dueDate' as const,
      sortOrder: 'asc' as const,
    };
    const visibleToTenantOne = await listDeadlines(search, { tenantId: tenantOne.tenantId });
    expect(visibleToTenantOne.items).not.toContainEqual(expect.objectContaining({ tenantId: tenantTwo.tenantId }));

    await expect(getDeadlineOccurrence(otherTenantOccurrence.id, {
      tenantId: tenantOne.tenantId,
      userId: tenantOne.userId,
    })).rejects.toMatchObject({ statusCode: 404 });
    await expect(updateDeadlineOccurrence(otherTenantOccurrence.id, {
      expectedUpdatedAt: otherTenantOccurrence.updatedAt.toISOString(),
      notes: 'cross-tenant mutation must be rejected',
    }, {
      tenantId: tenantOne.tenantId,
      userId: tenantOne.userId,
    })).rejects.toMatchObject({ statusCode: 404 });
  });

  it('produces one occurrence identity after three concurrent retries', async () => {
    const tenant = await seedTenant('RetryTenant');
    const { reconcileClientServiceDeadlines } = await import('@/services/schedule-reconciliation');
    const input = {
      tenantId: tenant.tenantId,
      clientServiceId: tenant.clientServiceId,
      today: '2026-08-18' as const,
      horizonEnd: '2027-08-18' as const,
      writeMode: 'APPLY' as const,
    };

    await Promise.all([
      prisma.$transaction((tx) => reconcileClientServiceDeadlines({ ...input, reconciliationRequestId: randomUUID() }, tx)),
      prisma.$transaction((tx) => reconcileClientServiceDeadlines({ ...input, reconciliationRequestId: randomUUID() }, tx)),
      prisma.$transaction((tx) => reconcileClientServiceDeadlines({ ...input, reconciliationRequestId: randomUUID() }, tx)),
    ]);

    const occurrences = await prisma.deadlineOccurrence.findMany({ where: { tenantId: tenant.tenantId } });
    expect(occurrences).toHaveLength(1);
    expect(new Set(occurrences.map((occurrence) => `${occurrence.cycleId}|${occurrence.milestoneKey}|${occurrence.scheduleEntryKey}`)).size).toBe(1);
  });
});
