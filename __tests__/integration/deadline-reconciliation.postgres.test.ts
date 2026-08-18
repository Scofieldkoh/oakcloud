import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describePostgres = testDatabaseUrl ? describe : describe.skip;

describePostgres('deadline reconciliation PostgreSQL integration', () => {
  let prisma: Awaited<ReturnType<typeof import('@/lib/prisma')['getPrisma']>>;
  let tenantId: string;
  let companyId: string;
  let variantId: string;
  let ruleId: string;
  let versionId: string;
  let draftVersionId: string;
  let clientServiceId: string;
  let userId: string;
  let sowPartialId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = testDatabaseUrl;
    prisma = (await import('@/lib/prisma')).getPrisma();
    tenantId = randomUUID();
    companyId = randomUUID();
    variantId = randomUUID();
    ruleId = randomUUID();
    versionId = randomUUID();
    draftVersionId = randomUUID();
    clientServiceId = randomUUID();
    userId = randomUUID();
    sowPartialId = randomUUID();

    // Create workspace
    await prisma.workspace.create({
      data: {
        id: tenantId,
        name: `Reconciliation Tenant ${tenantId}`,
        slug: `recon-${tenantId}`,
        settings: {
          servicesWorkspace: {
            enabled: true,
            deadlineWritesEnabled: true,
          },
        },
      },
    });

    await prisma.user.create({
      data: {
        id: userId,
        tenantId,
        email: `${userId}@example.test`,
        passwordHash: 'integration-only',
        firstName: 'Integration',
        lastName: 'Worker',
      },
    });

    await prisma.templatePartial.create({
      data: {
        id: sowPartialId,
        tenantId,
        name: `reconcile-sow-${tenantId}`,
        content: 'Integration SOW',
        createdById: userId,
      },
    });

    // Create company
    await prisma.company.create({
      data: {
        id: companyId,
        tenantId,
        uen: `T${randomUUID().slice(0, 8).toUpperCase()}`,
        name: `Integration Reconcile Co ${tenantId}`,
        entityType: 'PRIVATE_LIMITED',
        status: 'LIVE',
        financialYearEndDay: 31,
        financialYearEndMonth: 12,
        incorporationDate: new Date('2022-01-01T00:00:00.000Z'),
      },
    });

    // Create family and variant
    const family = await prisma.serviceFamily.create({
      data: {
        tenantId,
        code: `FAM_${tenantId.slice(0, 6)}`,
        name: 'Corporate Secretarial',
        displayColor: '#0F766E',
        displayOrder: 1,
      },
    });

    await prisma.serviceVariant.create({
      data: {
        id: variantId,
        tenantId,
        familyId: family.id,
        sowPartialId,
        code: `ANNUAL_${tenantId.slice(0, 6)}`,
        name: 'Annual Compliance',
        serviceCadence: 'ANNUALLY',
      },
    });

    // Create published rule
    await prisma.deadlineRule.create({
      data: {
        id: ruleId,
        tenantId,
        code: `RULE_${tenantId.slice(0, 6)}`,
        name: 'AGM and Annual Return',
        currentVersionId: versionId,
        versions: {
          create: {
            id: versionId,
            tenantId,
            version: 1,
            state: 'PUBLISHED',
            schemaVersion: 1,
            configHash: 'a'.repeat(64),
            draftRevision: 1,
            recurrence: { schemaVersion: 1, kind: 'ANNUALLY', interval: 1 },
            applicability: { schemaVersion: 1, kind: 'ALL', conditions: [] },
            milestoneTemplates: {
              create: [
                {
                  tenantId,
                  milestoneKey: 'agm-due',
                  name: 'AGM Due',
                  type: 'STATUTORY',
                  generationMode: 'ONCE_PER_CYCLE',
                  dateExpression: {
                    kind: 'RELATIVE_TO_SOURCE',
                    source: { kind: 'COMPANY_FIELD', field: 'financialYearEnd' },
                    offset: 6,
                    unit: 'CALENDAR_DAY',
                  },
                  businessDayAdjustment: 'NONE',
                  displayOrder: 1,
                },
              ],
            },
          },
        },
      },
    });

    await prisma.deadlineRuleVersion.create({
      data: {
        id: draftVersionId,
        tenantId,
        ruleId,
        version: 0,
        state: 'DRAFT',
        schemaVersion: 1,
        configHash: 'b'.repeat(64),
        draftRevision: 2,
        recurrence: { schemaVersion: 1, kind: 'ANNUALLY', interval: 1 },
        applicability: { schemaVersion: 1, kind: 'ALL', conditions: [] },
        milestoneTemplates: {
          create: {
            tenantId,
            milestoneKey: 'agm-due',
            name: 'AGM Due',
            type: 'STATUTORY',
            generationMode: 'ONCE_PER_CYCLE',
            dateExpression: {
              kind: 'RELATIVE_TO_SOURCE',
              source: { kind: 'COMPANY_FIELD', field: 'financialYearEnd' },
              offset: 6,
              unit: 'CALENDAR_DAY',
            },
            businessDayAdjustment: 'NONE',
            displayOrder: 1,
          },
        },
      },
    });

    // Create client service with attached rule
    await prisma.clientService.create({
      data: {
        id: clientServiceId,
        tenantId,
        companyId,
        serviceVariantId: variantId,
        familyName: 'Corporate Secretarial',
        serviceName: 'Annual Compliance',
        status: 'ACTIVE',
        serviceCadence: 'ANNUALLY',
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        deadlineRules: {
          create: {
            tenantId,
            ruleId,
            enabled: true,
          },
        },
      },
    });
  });

  afterAll(async () => {
    await prisma.deadlineOccurrence.deleteMany({ where: { tenantId } });
    await prisma.serviceCycle.deleteMany({ where: { tenantId } });
    await prisma.clientServiceDeadlineRule.deleteMany({ where: { tenantId } });
    await prisma.clientService.deleteMany({ where: { tenantId } });
    await prisma.deadlineMilestoneTemplate.deleteMany({ where: { ruleVersion: { rule: { tenantId } } } });
    await prisma.deadlineRule.updateMany({ where: { tenantId }, data: { currentVersionId: null } });
    await prisma.deadlineRuleVersion.deleteMany({ where: { rule: { tenantId } } });
    await prisma.deadlineRule.deleteMany({ where: { tenantId } });
    await prisma.serviceVariant.deleteMany({ where: { tenantId } });
    await prisma.serviceFamily.deleteMany({ where: { tenantId } });
    await prisma.serviceScheduleReconciliationRequest.deleteMany({ where: { tenantId } });
    await prisma.templatePartial.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.company.deleteMany({ where: { tenantId } });
    await prisma.workspace.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  it('claims, materializes occurrences, and completes reconciliation request', async () => {
    const { enqueueScheduleReconciliation, processScheduleReconciliationBatch } =
      await import('@/services/schedule-reconciliation');
    const { previewDeadlineRuleImpact } = await import('@/services/deadline-rule');

    const preview = await previewDeadlineRuleImpact(ruleId, {
      operation: 'PUBLISH',
      expectedCurrentVersion: 1,
      expectedDraftRevision: 2,
      draftConfigHash: 'b'.repeat(64),
    }, { tenantId, userId }, { now: () => '2026-08-18' });
    expect(preview.counts.created).toBeGreaterThan(0);

    await enqueueScheduleReconciliation(prisma, {
      tenantId,
      scopeType: 'CLIENT_SERVICE',
      scopeId: clientServiceId,
      triggerType: 'CLIENT_SERVICE_CREATED',
      correlationId: 'test-req-1',
      requestedById: null,
    });

    const batchResult = await processScheduleReconciliationBatch({ limit: 10, concurrency: 2 });
    expect(batchResult.claimed).toBeGreaterThanOrEqual(1);

    const occurrences = await prisma.deadlineOccurrence.findMany({
      where: { tenantId, clientServiceId },
    });
    expect(occurrences.length).toBeGreaterThanOrEqual(1);
    expect(occurrences[0]).toMatchObject({
      milestoneKey: 'agm-due',
      status: 'OPEN',
      origin: 'RULE',
    });
    const previewDates = preview.samples
      .filter((sample) => sample.action === 'CREATE')
      .map((sample) => sample.newDate)
      .filter((date) => date !== null)
      .sort();
    const reconciledDates = occurrences
      .map((occurrence) => occurrence.calculatedDueDate.toISOString().slice(0, 10))
      .sort();
    expect(reconciledDates).toEqual(previewDates);

    const requests = await prisma.serviceScheduleReconciliationRequest.findMany({
      where: { tenantId, scopeId: clientServiceId },
    });
    expect(requests.every((r) => r.status === 'COMPLETED')).toBe(true);
  });

  it('survives concurrent reconciliation and reclaimed processing with one stable occurrence', async () => {
    const { reconcileClientServiceDeadlines, enqueueScheduleReconciliation, processScheduleReconciliationBatch } =
      await import('@/services/schedule-reconciliation');

    await prisma.deadlineOccurrence.deleteMany({ where: { tenantId, clientServiceId } });
    await prisma.serviceCycle.deleteMany({ where: { tenantId, clientServiceId } });
    await prisma.serviceScheduleReconciliationRequest.deleteMany({ where: { tenantId, scopeId: clientServiceId } });

    const reconciliationInput = {
      tenantId,
      clientServiceId,
      today: '2026-08-18' as const,
      horizonEnd: '2027-08-18' as const,
      writeMode: 'APPLY' as const,
      reconciliationRequestId: randomUUID(),
    };
    const attempts = await Promise.all([
      prisma.$transaction((tx) => reconcileClientServiceDeadlines(reconciliationInput, tx)),
      prisma.$transaction((tx) => reconcileClientServiceDeadlines({
        ...reconciliationInput,
        reconciliationRequestId: randomUUID(),
      }, tx)),
    ]);
    expect(attempts).toHaveLength(2);

    const occurrences = await prisma.deadlineOccurrence.findMany({ where: { tenantId, clientServiceId } });
    expect(occurrences).toHaveLength(1);

    await enqueueScheduleReconciliation(prisma, {
      tenantId,
      scopeType: 'CLIENT_SERVICE',
      scopeId: clientServiceId,
      triggerType: 'CLIENT_SERVICE_CONFIGURATION_CHANGED',
      correlationId: 'reclaimed-worker-request',
      requestedById: null,
      notBefore: new Date('2026-08-18T01:00:00.000Z'),
    });
    const request = await prisma.serviceScheduleReconciliationRequest.findFirst({
      where: { tenantId, scopeId: clientServiceId, triggerType: 'CLIENT_SERVICE_CONFIGURATION_CHANGED' },
    });
    expect(request).not.toBeNull();
    await prisma.serviceScheduleReconciliationRequest.update({
      where: { id: request!.id },
      data: {
        status: 'PROCESSING',
        leaseOwner: 'expired-worker',
        leaseExpiresAt: new Date('2026-08-18T00:59:00.000Z'),
      },
    });

    const reclaimed = await processScheduleReconciliationBatch({
      limit: 1,
      concurrency: 1,
      now: new Date('2026-08-18T01:00:00.000Z'),
    });
    expect(reclaimed).toMatchObject({ claimed: 1, completed: 1, failed: 0 });
    expect(await prisma.serviceScheduleReconciliationRequest.findUnique({ where: { id: request!.id } }))
      .toMatchObject({ status: 'COMPLETED', leaseOwner: null, leaseExpiresAt: null });
    expect(await prisma.deadlineOccurrence.count({ where: { tenantId, clientServiceId } })).toBe(1);
  });
});
