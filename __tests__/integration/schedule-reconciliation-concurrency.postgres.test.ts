import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { scheduleReconciliationDedupeKey } from '@/services/schedule-reconciliation';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describePostgres = testDatabaseUrl ? describe : describe.skip;

describePostgres('schedule reconciliation PostgreSQL concurrency', () => {
  let prisma: Awaited<ReturnType<typeof import('@/lib/prisma')['getPrisma']>>;
  let tenantId: string;
  let enqueueScheduleReconciliation: typeof import('@/services/schedule-reconciliation')['enqueueScheduleReconciliation'];

  beforeAll(async () => {
    process.env.DATABASE_URL = testDatabaseUrl;
    prisma = (await import('@/lib/prisma')).getPrisma();
    ({ enqueueScheduleReconciliation } = await import('@/services/schedule-reconciliation'));
    tenantId = randomUUID();
    await prisma.workspace.create({ data: { id: tenantId, name: `Queue concurrency ${tenantId}`, slug: `queue-${tenantId}` } });
  });

  afterAll(async () => {
    await prisma.serviceScheduleReconciliationRequest.deleteMany({ where: { tenantId } });
    await prisma.workspace.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  it('preserves the true earliest timestamp under concurrent source transactions', async () => {
    const scopeId = randomUUID();
    const inputs = [
      new Date('2026-08-18T01:02:59.000Z'),
      new Date('2026-08-18T01:02:03.000Z'),
    ];
    await Promise.all(inputs.map((notBefore, index) => prisma.$transaction((tx) => enqueueScheduleReconciliation(tx, {
      tenantId,
      scopeType: 'RULE',
      scopeId,
      triggerType: 'RULE_PUBLISHED',
      correlationId: `concurrent-${index}`,
      requestedById: null,
      notBefore,
    }))));
    const row = await prisma.serviceScheduleReconciliationRequest.findFirst({ where: { tenantId, scopeId } });
    expect(row?.nextAttemptAt.toISOString()).toBe(inputs[1]!.toISOString());
  });

  it('does not revoke a processing lease and leaves durable follow-up work', async () => {
    const scopeId = randomUUID();
    const notBefore = new Date('2026-08-18T01:02:59.000Z');
    const dedupeInput = {
      tenantId,
      scopeType: 'RULE' as const,
      scopeId,
      triggerType: 'RULE_PUBLISHED',
    };
    const canonical = await prisma.serviceScheduleReconciliationRequest.create({
      data: {
        tenantId,
        scopeType: 'RULE',
        scopeId,
        triggerType: 'RULE_PUBLISHED',
        correlationId: 'processing-source',
        dedupeKey: scheduleReconciliationDedupeKey(dedupeInput, notBefore),
        status: 'PROCESSING',
        leaseOwner: 'worker-1',
        leaseExpiresAt: new Date('2026-08-18T02:00:00.000Z'),
        nextAttemptAt: new Date('2026-08-18T01:02:03.000Z'),
        requestedById: null,
      },
    });
    await enqueueScheduleReconciliation(prisma, {
      tenantId,
      scopeType: 'RULE',
      scopeId,
      triggerType: 'RULE_PUBLISHED',
      correlationId: 'processing-follow-up',
      requestedById: null,
      notBefore,
    });
    const rows = await prisma.serviceScheduleReconciliationRequest.findMany({ where: { tenantId, scopeId } });
    expect(rows.find((row) => row.id === canonical.id)).toMatchObject({ status: 'PROCESSING', leaseOwner: 'worker-1' });
    expect(rows.filter((row) => row.status === 'PENDING')).toHaveLength(1);
  });
});
