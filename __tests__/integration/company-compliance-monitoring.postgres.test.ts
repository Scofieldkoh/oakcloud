import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DateOnly } from '@/services/service-schedule';
import { SG_ECI_PRESET, SG_FORM_C_PRESET, type DeadlineRulePreset } from '@/services/deadline-rule/presets';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describePostgres = testDatabaseUrl ? describe : describe.skip;

type PrismaClient = Awaited<ReturnType<typeof import('@/lib/prisma')['getPrisma']>>;

const TODAY = '2026-09-27' as const;
const AGREEMENT_DATE = new Date('2026-03-15T00:00:00.000Z');

describePostgres('company compliance monitoring on PostgreSQL', () => {
  let prisma: PrismaClient;
  let fixture: Awaited<ReturnType<typeof seedFixture>>;

  beforeAll(async () => {
    process.env.DATABASE_URL = testDatabaseUrl;
    prisma = (await import('@/lib/prisma')).getPrisma();
    fixture = await seedFixture(prisma);
  });

  afterAll(async () => {
    if (!prisma || !fixture) return;
    const tenantId = fixture.tenantId;
    await prisma.deadlineOccurrenceCoverageLink.deleteMany({ where: { tenantId } });
    await prisma.deadlineResponsibilityChange.deleteMany({ where: { tenantId } });
    await prisma.companyComplianceIssue.deleteMany({ where: { tenantId } });
    await prisma.deadlineOccurrence.deleteMany({ where: { tenantId } });
    await prisma.serviceCycle.deleteMany({ where: { tenantId } });
    await prisma.clientServiceObligationScope.deleteMany({ where: { tenantId } });
    await prisma.companyMonitoringCoverage.deleteMany({ where: { tenantId } });
    await prisma.companyFinancialPeriod.deleteMany({ where: { tenantId } });
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.billingCoverageIssue.deleteMany({ where: { tenantId } });
    await prisma.billingOccurrence.deleteMany({ where: { tenantId } });
    await prisma.serviceScheduleReconciliationRequest.deleteMany({ where: { tenantId } });
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
    await prisma.workspace.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  it('creates coverage from the agreement date and a confirmed filing scope', async () => {
    const { createMonitoringForActivatedService } = await import('@/services/compliance-monitoring/coverage');
    const result = await prisma.$transaction((tx) => createMonitoringForActivatedService(tx, {
      tenantId: fixture.tenantId,
      companyId: fixture.companyId,
      clientServiceId: fixture.serviceId,
      serviceVariantId: fixture.variantId,
      agreementId: null,
      agreementDate: AGREEMENT_DATE,
      serviceStartDate: new Date('2026-04-01T00:00:00.000Z'),
      serviceEndDate: null,
      fieldValues: { filingScope: [{ obligationCode: 'SG_FORM_C', periodKey: 'YA2026' }] },
      actorId: fixture.userId,
    }));

    expect(result.coverageIds).toHaveLength(1);
    expect(result.deliveryScopeCount).toBe(1);
    const coverage = await prisma.companyMonitoringCoverage.findUniqueOrThrow({ where: { id: result.coverageIds[0] } });
    expect(coverage).toMatchObject({ profile: 'CORPORATE_TAX', startSource: 'AGREEMENT_DATE', status: 'ACTIVE' });
    expect(coverage.monitoringStart.toISOString().slice(0, 10)).toBe('2026-03-15');
  });

  it('writes company-owned obligations once, with reasons and responsibility, and no billing', async () => {
    const { reconcileCompanyObligations } = await import('@/services/compliance-monitoring/writer');
    const billingBefore = await prisma.billingOccurrence.count({ where: { tenantId: fixture.tenantId } });

    const first = await prisma.$transaction((tx) => reconcileCompanyObligations({
      tenantId: fixture.tenantId, companyId: fixture.companyId, today: TODAY, writeMode: 'APPLY',
    }, tx));
    expect(first.counts.created).toBeGreaterThan(0);

    const rows = await prisma.deadlineOccurrence.findMany({
      where: { tenantId: fixture.tenantId, companyId: fixture.companyId },
      include: { coverageLinks: true },
      orderBy: { operativeDueDate: 'asc' },
    });
    expect(rows.every((row) => row.ownershipScope === 'COMPANY' && row.clientServiceId === null)).toBe(true);
    const byKey = new Map(rows.map((row) => [`${row.obligationCode}|${row.obligationPeriodKey}`, row]));

    // The March 2026 engagement shows the November 2026 and November 2027 returns immediately.
    const ya2026 = byKey.get('SG_FORM_C|YA2026');
    expect(ya2026?.operativeDueDate.toISOString().slice(0, 10)).toBe('2026-11-30');
    expect(ya2026).toMatchObject({ yearOfAssessment: 2026, filingResponsibility: 'OAKCLOUD', deliveryClientServiceId: fixture.serviceId, coverageTiming: 'DURING' });
    expect(ya2026?.coverageLinks.map((link) => link.reason).sort()).toEqual(['CONTRACTED_DELIVERY', 'MONITORING_INTERVAL']);
    expect(byKey.get('SG_FORM_C|YA2027')?.operativeDueDate.toISOString().slice(0, 10)).toBe('2027-11-30');
    expect(byKey.get('SG_ECI|FY2026-12-31')?.operativeDueDate.toISOString().slice(0, 10)).toBe('2027-03-31');

    // Tax returns due in the year before monitoring started go to takeover
    // review; an earlier ECI does not.
    expect(byKey.has('SG_ECI|FY2024-12-31')).toBe(false);
    const takeover = byKey.get('SG_FORM_C|YA2025');
    expect(takeover).toMatchObject({ coverageTiming: 'BEFORE_START', filingStatusUnconfirmed: true, status: 'OPEN' });
    expect(takeover?.coverageLinks.map((link) => link.reason)).toEqual(['TAKEOVER_REVIEW']);

    const second = await prisma.$transaction((tx) => reconcileCompanyObligations({
      tenantId: fixture.tenantId, companyId: fixture.companyId, today: TODAY, writeMode: 'APPLY',
    }, tx));
    expect(second.counts.created).toBe(0);
    expect(second.links.attached).toBe(0);
    expect(await prisma.deadlineOccurrence.count({ where: { tenantId: fixture.tenantId } })).toBe(rows.length);
    expect(await prisma.billingOccurrence.count({ where: { tenantId: fixture.tenantId } })).toBe(billingBefore);
    expect(await prisma.deadlineResponsibilityChange.count({ where: { tenantId: fixture.tenantId } })).toBe(rows.length);
  });

  it('leaves statutory preset rules on a monitored company to the company writer', async () => {
    const { reconcileClientServiceDeadlines } = await import('@/services/schedule-reconciliation/deadline-reconciler');
    const result = await prisma.$transaction((tx) => reconcileClientServiceDeadlines({
      tenantId: fixture.tenantId,
      clientServiceId: fixture.serviceId,
      today: TODAY,
      horizonEnd: '2027-09-27',
      writeMode: 'APPLY',
      reconciliationRequestId: 'company-monitoring-test',
      companyMonitoringEnabled: true,
    }, tx));

    expect(result.warnings.map((warning) => warning.code)).toContain('COMPANY_MONITORING_OWNS_RULE');
    expect(await prisma.deadlineOccurrence.count({ where: { tenantId: fixture.tenantId, ownershipScope: 'SERVICE' } })).toBe(0);
  });

  it('previews company obligations for a service being added without writing anything', async () => {
    const { previewCompanyObligations } = await import('@/services/compliance-monitoring/writer');
    const before = await prisma.serviceCycle.count({ where: { tenantId: fixture.tenantId } });
    const preview = await previewCompanyObligations({
      tenantId: fixture.tenantId,
      companyId: fixture.companyId,
      today: '2026-09-27' as DateOnly,
      proposedCoverage: { profiles: ['CORPORATE_TAX'], monitoringStart: '2026-01-01' as DateOnly, monitoringEnd: null },
    }, prisma);
    const codes = new Set(preview.items.map((item) => item.obligationCode));
    expect(codes).toEqual(new Set(['SG_ECI', 'SG_FORM_C']));
    expect(preview.items.every((item) => /^\d{4}-\d{2}-\d{2}$/.test(item.dueDate))).toBe(true);
    expect(preview.items.map((item) => item.dueDate)).toEqual([...preview.items.map((item) => item.dueDate)].sort());
    expect(await prisma.serviceCycle.count({ where: { tenantId: fixture.tenantId } })).toBe(before);
  });

  it('stages an IRAS preset on the existing rule and creates a missing one as a draft', async () => {
    const { applyDeadlineRulePreset } = await import('@/services/deadline-rule');
    const actor = { tenantId: fixture.tenantId, userId: fixture.userId };
    const staged = await applyDeadlineRulePreset('SG_ECI', actor);
    expect(staged.code).toBe('SG_ECI');
    expect(staged.draft?.state).toBe('DRAFT');
    expect(staged.currentVersion).not.toBeNull();

    const archived = await prisma.deadlineRule.findFirstOrThrow({ where: { tenantId: fixture.tenantId, code: 'SG_FORM_C' } });
    await prisma.deadlineRule.update({ where: { id: archived.id }, data: { code: 'SG_FORM_C_OLD' } });
    try {
      const created = await applyDeadlineRulePreset('SG_FORM_C', actor);
      expect(created.code).toBe('SG_FORM_C');
      expect(created.currentVersion).toBeNull();
      expect(created.draft?.milestones.length).toBeGreaterThan(0);
      await prisma.deadlineMilestoneTemplate.deleteMany({ where: { ruleVersion: { ruleId: created.id } } });
      await prisma.deadlineRuleVersion.deleteMany({ where: { ruleId: created.id } });
      await prisma.deadlineRule.delete({ where: { id: created.id } });
    } finally {
      await prisma.deadlineRule.update({ where: { id: archived.id }, data: { code: 'SG_FORM_C' } });
    }
  });

  it('rejects a second company cycle for the same obligation period and rows that break ownership', async () => {
    const cycle = await prisma.serviceCycle.findFirstOrThrow({
      where: { tenantId: fixture.tenantId, ownershipScope: 'COMPANY', obligationCode: 'SG_FORM_C', obligationPeriodKey: 'YA2026' },
    });
    const duplicate = {
      tenantId: cycle.tenantId,
      companyId: cycle.companyId,
      ownershipScope: 'COMPANY' as const,
      obligationCode: cycle.obligationCode,
      obligationPeriodKey: cycle.obligationPeriodKey,
      ruleId: cycle.ruleId,
      ruleVersionId: cycle.ruleVersionId,
      periodKey: `${cycle.periodKey}-copy`,
      periodStart: cycle.periodStart,
      periodEnd: cycle.periodEnd,
      generationKey: 'another-generation',
      origin: 'RULE' as const,
      evaluationHash: 'b'.repeat(64),
    };
    await expect(prisma.serviceCycle.create({ data: duplicate })).rejects.toMatchObject({ code: 'P2002' });

    await expect(prisma.$executeRawUnsafe(
      `UPDATE service_cycles SET obligation_code = NULL WHERE id = $1`,
      cycle.id,
    )).rejects.toThrow(/service_cycles_ownership_scope_check/);
    await expect(prisma.$executeRawUnsafe(
      `UPDATE deadline_occurrences SET ownership_scope = 'SERVICE' WHERE cycle_id = $1`,
      cycle.id,
    )).rejects.toThrow(/deadline_occurrences_ownership_scope_check/);
  });

  it('ending the service keeps every obligation and raises handover review instead', async () => {
    const { endMonitoringForService } = await import('@/services/compliance-monitoring/coverage');
    const { reconcileCompanyObligations } = await import('@/services/compliance-monitoring/writer');
    const openBefore = await prisma.deadlineOccurrence.count({ where: { tenantId: fixture.tenantId, status: 'OPEN' } });

    await prisma.$transaction(async (tx) => {
      await tx.clientService.update({ where: { id: fixture.serviceId }, data: { status: 'ENDED', endDate: new Date('2026-09-30T00:00:00.000Z') } });
      await endMonitoringForService(tx, {
        tenantId: fixture.tenantId,
        clientServiceId: fixture.serviceId,
        endDate: new Date('2026-09-30T00:00:00.000Z'),
        actorId: fixture.userId,
        reason: 'Engagement ended',
      });
    });
    const result = await prisma.$transaction((tx) => reconcileCompanyObligations({
      tenantId: fixture.tenantId, companyId: fixture.companyId, today: TODAY, writeMode: 'APPLY',
    }, tx));

    expect(result.counts.cancelled).toBe(0);
    expect(await prisma.deadlineOccurrence.count({ where: { tenantId: fixture.tenantId, status: 'OPEN' } })).toBe(openBefore);
    const issues = await prisma.companyComplianceIssue.findMany({ where: { tenantId: fixture.tenantId, resolvedAt: null } });
    expect(issues.some((issue) => issue.type === 'HANDOVER_REVIEW' && issue.obligationCode === 'SG_FORM_C' && issue.periodKey === 'YA2027')).toBe(true);
    expect(issues.some((issue) => issue.type === 'DELIVERY_ENDED' || issue.type === 'HANDOVER_REVIEW')).toBe(true);
    const ya2027 = await prisma.deadlineOccurrence.findFirstOrThrow({
      where: { tenantId: fixture.tenantId, obligationCode: 'SG_FORM_C', obligationPeriodKey: 'YA2027' },
      include: { coverageLinks: true },
    });
    expect(ya2027.coverageLinks.every((link) => link.releasedAt !== null)).toBe(true);
  });

  it('records staff filing statuses that later company reconciliation keeps', async () => {
    const { setCompanyObligationStatus } = await import('@/services/compliance-monitoring/obligation-status');
    const { reconcileCompanyObligations } = await import('@/services/compliance-monitoring/writer');
    const target = await prisma.deadlineOccurrence.findFirstOrThrow({
      where: { tenantId: fixture.tenantId, companyId: fixture.companyId, ownershipScope: 'COMPANY', obligationCode: 'SG_ECI', status: 'OPEN' },
      orderBy: { operativeDueDate: 'desc' },
    });
    const key = { tenantId: fixture.tenantId, companyId: fixture.companyId, obligationCode: 'SG_ECI', periodKey: target.obligationPeriodKey!, actorId: fixture.userId };

    await prisma.$transaction((tx) => setCompanyObligationStatus({ ...key, status: 'FILED' }, tx));
    expect(await prisma.deadlineOccurrence.findUniqueOrThrow({ where: { id: target.id } })).toMatchObject({ status: 'COMPLETED', completedById: fixture.userId });

    await prisma.$transaction((tx) => setCompanyObligationStatus({ ...key, status: 'MANAGED_EXTERNALLY' }, tx));
    await prisma.$transaction((tx) => reconcileCompanyObligations({
      tenantId: fixture.tenantId, companyId: fixture.companyId, today: TODAY, writeMode: 'APPLY',
    }, tx));
    const external = await prisma.deadlineOccurrence.findUniqueOrThrow({ where: { id: target.id } });
    expect(external).toMatchObject({ status: 'OPEN', filingResponsibility: 'EXTERNAL_PROVIDER', responsibilitySource: 'STAFF', completedAt: null });
    expect(await prisma.deadlineResponsibilityChange.count({
      where: { occurrenceId: target.id, newResponsibility: 'EXTERNAL_PROVIDER', source: 'STAFF' },
    })).toBe(1);
  });

  it('records filing statuses chosen while adding a service, writing the company obligations on save', async () => {
    const { createManualClientService } = await import('@/services/client-service/manual-create');
    const target = await prisma.deadlineOccurrence.findFirstOrThrow({
      where: { tenantId: fixture.tenantId, companyId: fixture.companyId, ownershipScope: 'COMPANY', obligationCode: 'SG_FORM_C', status: 'OPEN' },
      orderBy: { operativeDueDate: 'asc' },
    });
    const request = {
      serviceVariantId: fixture.variantId,
      serviceCadence: 'ANNUALLY' as const,
      startDate: '2026-04-01',
      billingDisposition: 'NOT_REQUIRED' as const,
      billingNotRequiredReason: 'Included in retainer',
      feeLines: [],
      confirmDuplicate: true,
      companyObligationStatuses: [{ obligationCode: 'SG_FORM_C', periodKey: target.obligationPeriodKey!, status: 'NOT_REQUIRED' as const }],
    };
    const params = { tenantId: fixture.tenantId, userId: fixture.userId };
    const setWrites = (companyMonitoringWritesEnabled: boolean) => prisma.workspace.update({
      where: { id: fixture.tenantId },
      data: { settings: { servicesWorkspace: { enabled: true, deadlineWritesEnabled: true, companyMonitoringWritesEnabled } } },
    });
    const previous = process.env.COMPANY_MONITORING_WRITES_ENABLED;
    try {
      delete process.env.COMPANY_MONITORING_WRITES_ENABLED;
      await setWrites(false);
      await expect(createManualClientService(fixture.companyId, request, params)).rejects.toThrow(/Turn on company monitoring/);
      expect(await prisma.deadlineOccurrence.findUniqueOrThrow({ where: { id: target.id } })).toMatchObject({ status: 'OPEN' });

      await setWrites(true);
      await createManualClientService(fixture.companyId, request, params);
      expect(await prisma.deadlineOccurrence.findUniqueOrThrow({ where: { id: target.id } })).toMatchObject({ status: 'WAIVED', waivedById: fixture.userId });
    } finally {
      await setWrites(true);
      if (previous !== undefined) process.env.COMPANY_MONITORING_WRITES_ENABLED = previous;
    }
  });

  it('projects Pending filing from the engagement start YA and hands staff choices back to it', async () => {
    const { setEngagementStartYearOfAssessment } = await import('@/services/compliance-monitoring/engagement-start');
    const { setCompanyObligationStatus } = await import('@/services/compliance-monitoring/obligation-status');
    const { previewCompanyObligations, reconcileCompanyObligations } = await import('@/services/compliance-monitoring/writer');
    const openRows = () => prisma.deadlineOccurrence.findMany({
      where: { tenantId: fixture.tenantId, companyId: fixture.companyId, ownershipScope: 'COMPANY', status: 'OPEN', yearOfAssessment: { not: null } },
      orderBy: [{ yearOfAssessment: 'asc' }, { obligationCode: 'asc' }],
    });
    // The fixture service has ended; the service added by hand is still active.
    const { clientServiceId: serviceId } = await prisma.companyMonitoringCoverage.findFirstOrThrow({
      where: { tenantId: fixture.tenantId, companyId: fixture.companyId, monitoringEnd: null },
      select: { clientServiceId: true },
    }) as { clientServiceId: string };
    const rows = await openRows();
    const years = [...new Set(rows.map((row) => row.yearOfAssessment!))];
    expect(years.length).toBeGreaterThan(1);
    const start = years[1]!;
    const later = rows.find((row) => row.yearOfAssessment === start && row.responsibilitySource !== 'STAFF')!;
    const external = rows.find((row) => row.filingResponsibility === 'EXTERNAL_PROVIDER');

    // A staff "To be confirmed" on a row from the start YA is handed back.
    await prisma.$transaction((tx) => setCompanyObligationStatus({
      tenantId: fixture.tenantId, companyId: fixture.companyId, obligationCode: later.obligationCode!,
      periodKey: later.obligationPeriodKey!, status: 'TO_BE_CONFIRMED', actorId: fixture.userId,
    }, tx));

    const serviceBefore = await prisma.clientService.findUniqueOrThrow({ where: { id: serviceId } });
    await setEngagementStartYearOfAssessment({
      tenantId: fixture.tenantId, companyId: fixture.companyId, clientServiceId: serviceId,
      yearOfAssessment: start, actorId: fixture.userId,
    });
    const serviceAfter = await prisma.clientService.findUniqueOrThrow({ where: { id: serviceId } });
    expect(serviceAfter.engagementStartYearOfAssessment).toBe(start);
    expect(serviceAfter.updatedAt.toISOString()).toBe(serviceBefore.updatedAt.toISOString());

    const preview = await previewCompanyObligations({
      tenantId: fixture.tenantId, companyId: fixture.companyId, today: TODAY as DateOnly, serviceId: serviceId,
    }, prisma);
    expect(preview.engagementStartYearOfAssessment).toBe(start);
    for (const item of preview.items) {
      if (item.yearOfAssessment !== null && item.yearOfAssessment >= start) expect(item.projectedStatus).toBe('PENDING_FILING');
    }

    await prisma.$transaction((tx) => reconcileCompanyObligations({
      tenantId: fixture.tenantId, companyId: fixture.companyId, today: TODAY, writeMode: 'APPLY',
    }, tx));
    const after = new Map((await openRows()).map((row) => [row.id, row]));
    expect(after.get(later.id)).toMatchObject({ filingResponsibility: 'OAKCLOUD', responsibilitySource: 'PROJECTED' });
    for (const row of after.values()) {
      if (row.responsibilitySource === 'STAFF') continue;
      if (row.yearOfAssessment! >= start) expect(row.filingResponsibility).toBe('OAKCLOUD');
    }
    if (external) {
      expect(after.get(external.id)).toMatchObject({ filingResponsibility: 'EXTERNAL_PROVIDER', responsibilitySource: 'STAFF' });
    }

    await setEngagementStartYearOfAssessment({
      tenantId: fixture.tenantId, companyId: fixture.companyId, clientServiceId: serviceId,
      yearOfAssessment: null, actorId: fixture.userId,
    });
  });

  it('confirms a first FYE more than 12 months after incorporation and replaces the provisional periods', async () => {
    const { confirmFirstFinancialYearEnd } = await import('@/services/compliance-monitoring/financial-periods');
    const { previewCompanyObligations } = await import('@/services/compliance-monitoring/writer');
    const original = await prisma.company.findUniqueOrThrow({ where: { id: fixture.companyId }, select: { incorporationDate: true } });
    await prisma.company.update({ where: { id: fixture.companyId }, data: { incorporationDate: new Date('2024-09-01T00:00:00.000Z') } });
    const preview = () => previewCompanyObligations({
      tenantId: fixture.tenantId,
      companyId: fixture.companyId,
      today: TODAY as DateOnly,
      proposedCoverage: { profiles: ['CORPORATE_TAX'], monitoringStart: '2024-09-01' as DateOnly, monitoringEnd: null },
    }, prisma);
    try {
      const before = await preview();
      expect(before.firstPeriodUnconfirmed).toBe(true);
      expect(before.firstPeriodSuggestion).toEqual({ periodStart: '2024-09-01', periodEnd: '2024-12-31', yearOfAssessment: 2025 });
      expect(before.items.some((item) => item.periodKey === 'FY2024-12-31' && item.periodProvisional)).toBe(true);

      await expect(confirmFirstFinancialYearEnd(
        { tenantId: fixture.tenantId, companyId: fixture.companyId, userId: fixture.userId },
        '2026-06-30' as DateOnly,
      )).rejects.toThrow(/18 months/);
      await expect(confirmFirstFinancialYearEnd(
        { tenantId: fixture.tenantId, companyId: fixture.companyId, userId: fixture.userId },
        '2025-12-31' as DateOnly,
      )).resolves.toEqual({ firstFinancialYearEnd: '2025-12-31', yearOfAssessment: 2026 });

      const after = await preview();
      expect(after.firstPeriodUnconfirmed).toBe(false);
      expect(after.items.some((item) => item.periodKey === 'FY2024-12-31')).toBe(false);
      const firstEci = after.items.find((item) => item.obligationCode === 'SG_ECI' && item.periodKey === 'FY2025-12-31');
      expect(firstEci).toMatchObject({ yearOfAssessment: 2026, periodProvisional: false });
    } finally {
      await prisma.companyFinancialPeriod.deleteMany({ where: { tenantId: fixture.tenantId, companyId: fixture.companyId } });
      await prisma.company.update({ where: { id: fixture.companyId }, data: { incorporationDate: original.incorporationDate } });
    }
  });
});

async function createPresetRule(prisma: PrismaClient, tenantId: string, preset: DeadlineRulePreset): Promise<string> {
  const ruleId = randomUUID();
  const versionId = randomUUID();
  const definition = preset.definition;
  await prisma.deadlineRule.create({ data: { id: ruleId, tenantId, code: definition.code, name: definition.name } });
  await prisma.deadlineRuleVersion.create({
    data: {
      id: versionId,
      tenantId,
      ruleId,
      version: 1,
      state: 'PUBLISHED',
      schemaVersion: 1,
      configHash: 'c'.repeat(64),
      recurrence: definition.recurrence as never,
      applicability: definition.applicability as never,
      milestoneTemplates: {
        create: definition.milestones.map((milestone, index) => ({
          tenantId,
          milestoneKey: milestone.key,
          name: milestone.name,
          type: milestone.type,
          generationMode: milestone.generationMode,
          dateExpression: milestone.expression as never,
          businessDayAdjustment: milestone.businessDayAdjustment,
          displayOrder: index,
        })),
      },
    },
  });
  await prisma.deadlineRule.update({ where: { id: ruleId }, data: { currentVersionId: versionId } });
  return ruleId;
}

async function seedFixture(prisma: PrismaClient) {
  const tenantId = randomUUID();
  const userId = randomUUID();
  const companyId = randomUUID();
  const partialId = randomUUID();
  const familyId = randomUUID();
  const variantId = randomUUID();
  const serviceId = randomUUID();
  const suffix = tenantId.replaceAll('-', '').slice(0, 12);

  await prisma.workspace.create({
    data: {
      id: tenantId,
      name: 'Company monitoring workspace',
      slug: `company-monitoring-${suffix}`,
      status: 'ACTIVE',
      settings: { servicesWorkspace: { enabled: true, deadlineWritesEnabled: true, companyMonitoringWritesEnabled: true } },
    },
  });
  await prisma.user.create({
    data: { id: userId, tenantId, email: `${suffix}@example.test`, passwordHash: 'integration-only', firstName: 'Monitor', lastName: 'Test' },
  });
  await prisma.templatePartial.create({
    data: { id: partialId, tenantId, name: `Monitoring partial ${suffix}`, content: '<p>Tax</p>', createdById: userId },
  });
  await prisma.serviceFamily.create({
    data: { id: familyId, tenantId, code: `TAX_${suffix}`, name: 'Tax', displayColor: '#2F6F5E' },
  });
  await prisma.serviceVariant.create({
    data: {
      id: variantId,
      tenantId,
      familyId,
      sowPartialId: partialId,
      code: `CORP_TAX_${suffix}`,
      name: 'Corporate tax filing',
      serviceCadence: 'ANNUALLY',
      monitoringProfiles: ['CORPORATE_TAX'],
    },
  });
  await prisma.company.create({
    data: {
      id: companyId,
      tenantId,
      uen: `C${suffix.toUpperCase()}`,
      name: 'Monitored company',
      entityType: 'PRIVATE_LIMITED',
      status: 'LIVE',
      incorporationDate: new Date('2018-02-01T00:00:00.000Z'),
      financialYearEndMonth: 12,
      financialYearEndDay: 31,
    },
  });
  const eciRuleId = await createPresetRule(prisma, tenantId, SG_ECI_PRESET);
  await createPresetRule(prisma, tenantId, SG_FORM_C_PRESET);
  await prisma.clientService.create({
    data: {
      id: serviceId,
      tenantId,
      companyId,
      source: 'MANUAL',
      serviceVariantId: variantId,
      familyName: 'Tax',
      serviceName: 'Corporate tax filing',
      status: 'ACTIVE',
      serviceCadence: 'ANNUALLY',
      startDate: new Date('2026-04-01T00:00:00.000Z'),
      billingDisposition: 'UNREVIEWED',
      deadlineRules: {
        create: { tenantId, ruleId: eciRuleId, enabled: true, scheduleEntries: [], parameterValues: {} },
      },
    },
  });

  return { tenantId, userId, companyId, variantId, serviceId };
}
