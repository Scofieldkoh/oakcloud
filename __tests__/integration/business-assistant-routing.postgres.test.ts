// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { acceptTurn } from '@/services/business-assistant/conversation.service';
import { runBusinessAssistantWorker } from '@/services/business-assistant/worker';

const connectionString = process.env.BUSINESS_ASSISTANT_TEST_DATABASE_URL;
if (connectionString && process.env.DATABASE_URL !== connectionString) {
  throw new Error('DATABASE_URL and BUSINESS_ASSISTANT_TEST_DATABASE_URL must be preconfigured to the same isolated disposable database.');
}
const suite = connectionString ? describe : describe.skip;

let tenantId: string | undefined;
let userId: string | undefined;
const previousEnabled = process.env.BUSINESS_ASSISTANT_ENABLED;
const previousProviderEnabled = process.env.BUSINESS_ASSISTANT_PROVIDER_ENABLED;

suite('Business Assistant routed-turn PostgreSQL durability', () => {
  beforeAll(async () => {
    const url = new URL(connectionString!);
    if (!/(?:^|[_-])test(?:[_-]|$)/i.test(url.pathname.slice(1)) || ['5433', '3000'].includes(url.port)) {
      throw new Error('Business Assistant integration tests require the isolated disposable test database.');
    }
    await prisma.$queryRaw`SELECT 1`;
  }, 15_000);

  beforeEach(async () => {
    process.env.BUSINESS_ASSISTANT_ENABLED = 'true';
    process.env.BUSINESS_ASSISTANT_PROVIDER_ENABLED = 'false';
    const suffix = randomUUID().replaceAll('-', '').slice(0, 20);
    const workspace = await prisma.workspace.create({
      data: { id: randomUUID(), name: `BA routing ${suffix}`, slug: `ba-routing-${suffix}`, status: 'ACTIVE' },
      select: { id: true },
    });
    tenantId = workspace.id;
    const user = await prisma.user.create({
      data: { tenantId, email: `ba-routing-${suffix}@example.test`, passwordHash: 'test-only', firstName: 'Routing', lastName: 'Tester', isActive: true },
      select: { id: true },
    });
    userId = user.id;
  });

  afterEach(async () => {
    if (tenantId) {
      await prisma.businessAssistantRunStep.deleteMany({ where: { tenantId } });
      await prisma.businessAssistantReview.deleteMany({ where: { tenantId } });
      await prisma.businessAssistantApproval.deleteMany({ where: { tenantId } });
      await prisma.businessAssistantProposal.deleteMany({ where: { tenantId } });
      await prisma.businessAssistantRunItem.deleteMany({ where: { tenantId } });
      await prisma.businessAssistantRun.deleteMany({ where: { tenantId } });
      await prisma.businessAssistantMessage.deleteMany({ where: { tenantId } });
      await prisma.businessAssistantConversation.deleteMany({ where: { tenantId } });
    }
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    if (tenantId) await prisma.workspace.deleteMany({ where: { id: tenantId } });
    tenantId = undefined;
    userId = undefined;
  });

  afterAll(async () => {
    if (previousEnabled === undefined) delete process.env.BUSINESS_ASSISTANT_ENABLED;
    else process.env.BUSINESS_ASSISTANT_ENABLED = previousEnabled;
    if (previousProviderEnabled === undefined) delete process.env.BUSINESS_ASSISTANT_PROVIDER_ENABLED;
    else process.env.BUSINESS_ASSISTANT_PROVIDER_ENABLED = previousProviderEnabled;
    await prisma.$disconnect();
  });

  it('routes one accepted lookup turn once and reuses the persisted run after message replay', async () => {
    const accepted = await acceptTurn(
      { tenantId: tenantId!, userId: userId!, requestId: randomUUID() },
      { clientRequestId: randomUUID(), workspaceId: tenantId!, message: 'Find companies' },
    );
    expect(accepted.runId).toBeNull();

    await expect(runBusinessAssistantWorker({ once: true })).resolves.toEqual({ messagesProcessed: 1, itemsProcessed: 1, errors: 0 });

    const source = await prisma.businessAssistantMessage.findUniqueOrThrow({
      where: { id: accepted.messageId },
      select: { payload: true, status: true },
    });
    expect(source.status).toBe('PROCESSED');
    expect(source.payload).toMatchObject({ routing: { kind: 'CAPABILITY', capabilityId: 'workspace.resource_lookup', capabilityVersion: '1.0' } });
    const payload = source.payload as Record<string, unknown>;
    expect(typeof payload.runId).toBe('string');
    expect(await prisma.businessAssistantRun.count({ where: { tenantId: tenantId!, conversationId: accepted.conversationId } })).toBe(1);
    expect(await prisma.businessAssistantMessage.count({ where: { tenantId: tenantId!, conversationId: accepted.conversationId, role: 'ASSISTANT', operationKind: 'RESULT' } })).toBe(1);

    // Simulate redelivery after a process crash/queue replay. The durable
    // routing payload must cause the existing run to be reused, not recreated.
    await prisma.businessAssistantMessage.update({
      where: { id: accepted.messageId },
      data: { status: 'ACCEPTED', availableAt: new Date(Date.now() - 1_000), claimToken: null, leaseExpiresAt: null },
    });
    await expect(runBusinessAssistantWorker({ once: true })).resolves.toEqual({ messagesProcessed: 1, itemsProcessed: 0, errors: 0 });
    expect(await prisma.businessAssistantRun.count({ where: { tenantId: tenantId!, conversationId: accepted.conversationId } })).toBe(1);
    expect(await prisma.businessAssistantMessage.count({ where: { tenantId: tenantId!, conversationId: accepted.conversationId, role: 'ASSISTANT', operationKind: 'RESULT' } })).toBe(1);
  });
});
