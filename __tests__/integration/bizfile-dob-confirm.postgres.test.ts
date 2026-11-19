// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { bizFileReviewSchema, normalizeBizFileReviewDraft } from '@/lib/validations/bizfile-review';
import { prepareBizFileImportCommand } from '@/services/bizfile/application/prepare-import';
import { issueBizFilePreparationToken } from '@/services/bizfile/application/preparation-token';
import { hashBizFileValue } from '@/services/bizfile/change-plan';
import { POST } from '@/app/api/documents/[documentId]/confirm/route';

const auth = vi.hoisted(() => ({ session: {} as Record<string, unknown> }));
vi.mock('@/lib/auth', () => ({ requireAuth: async () => auth.session }));
// No file side effects or real site calls: canonical confirm records its required effects in PG.
vi.mock('@/services/sentroweb/client', () => ({ sentrowebClient: { openSession: () => { throw new Error('No live calls'); } } }));

const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
type Database = ReturnType<typeof import('@/lib/prisma')['getPrisma']>;

suite('Public BizFile confirm DOB replacement boundary (PostgreSQL)', () => {
  let db: Database;
  let tenantId: string;
  let userId: string;
  const originalUrl = process.env.DATABASE_URL;
  const previousSecret = process.env.BUSINESS_ASSISTANT_PREPARATION_SECRET;

  beforeAll(async () => {
    const target = new URL(url!);
    if (!/(?:^|[_-])test(?:[_-]|$)/i.test(target.pathname.slice(1))) throw new Error('Test database required');
    process.env.DATABASE_URL = url;
    process.env.BUSINESS_ASSISTANT_PREPARATION_SECRET = 'test-only-dob-preparation-secret-at-least-32-characters';
    db = (await import('@/lib/prisma')).getPrisma();
    const suffix = randomUUID();
    tenantId = (await db.workspace.create({ data: { name: 'DOB confirm test', slug: `dob-confirm-${suffix}`, status: 'ACTIVE' } })).id;
    userId = (await db.user.create({ data: { tenantId, email: `dob-${suffix}@example.test`, passwordHash: 'unused', firstName: 'Test', lastName: 'Reviewer' } })).id;
    const role = await db.role.create({ data: { name: `DOB reviewer ${suffix}`, tenantId, systemRoleType: 'ADMIN' } });
    await db.userRoleAssignment.create({ data: { userId, roleId: role.id } });
    auth.session = { id: userId, tenantId, isSuperAdmin: false, isWorkspaceAdmin: true };
  });

  afterAll(() => {
    if (originalUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalUrl;
    if (previousSecret === undefined) delete process.env.BUSINESS_ASSISTANT_PREPARATION_SECRET;
    else process.env.BUSINESS_ASSISTANT_PREPARATION_SECRET = previousSecret;
  });

  async function prepare(replaces?: string, alsoShareholder = false) {
    const suffix = randomUUID().replace(/-/g, '');
    const contact = await db.contact.create({ data: {
      tenantId, contactType: 'INDIVIDUAL', firstName: 'Dana', lastName: `Date${suffix}`, fullName: `Dana Date${suffix}`,
      canonicalName: `danadate${suffix}`, identificationType: 'NRIC', identificationNumber: `S${suffix.slice(0, 7)}A`,
      dateOfBirth: new Date('1981-01-01T00:00:00Z'),
    } });
    const reviewedData = normalizeBizFileReviewDraft(bizFileReviewSchema.parse({
      entityDetails: { uen: `D${suffix.slice(0, 8)}`, name: 'DOB Synthetic Pte Ltd', entityType: 'PRIVATE_LIMITED', status: 'LIVE' },
      officers: [{ name: contact.fullName, role: 'DIRECTOR', identificationType: 'NRIC', identificationNumber: contact.identificationNumber,
        dateOfBirth: '1980-01-01', ...(replaces ? { dateOfBirthReplaces: replaces } : {}),
        contactResolution: { action: 'REUSE', contactId: contact.id } }],
      ...(alsoShareholder ? { shareholders: [{ name: contact.fullName, type: 'INDIVIDUAL', identificationType: 'NRIC',
        identificationNumber: contact.identificationNumber, shareClass: 'ORDINARY', numberOfShares: 1,
        dateOfBirth: '1980-01-01', dateOfBirthReplaces: replaces, contactResolution: { action: 'REUSE', contactId: contact.id } }] } : {}),
    }));
    const document = await db.document.create({ data: {
      tenantId, uploadedById: userId, fileName: 'synthetic.pdf', originalFileName: 'synthetic.pdf',
      storageKey: `test/${suffix}.pdf`, mimeType: 'application/pdf', documentType: 'BIZFILE', fileSize: 0,
      extractionStatus: 'EXTRACTED', extractedData: reviewedData as object,
    } });
    const prepared = await prepareBizFileImportCommand({ documentId: document.id, tenantId, reviewedData });
    const { token } = issueBizFilePreparationToken({ actorId: userId, tenantId, documentId: document.id,
      planHash: prepared.plan.canonicalHash, contextHash: hashBizFileValue(null) });
    const confirm = () => POST(new Request(`http://localhost/api/documents/${document.id}/confirm`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ extractedData: reviewedData, plan: prepared.plan, preparationToken: token, operationId: `dob-${suffix}` }),
    }) as never, { params: Promise.resolve({ documentId: document.id }) });
    return { contact, document, reviewedData, confirm };
  }

  it('rejects an unseen replacement without the exact saved-date approval and rolls back the whole import', async () => {
    const test = await prepare();
    const response = await test.confirm();
    expect(response.status, JSON.stringify(await response.clone().json())).toBe(409);
    expect((await db.contact.findUniqueOrThrow({ where: { id: test.contact.id } })).dateOfBirth?.toISOString()).toBe('1981-01-01T00:00:00.000Z');
    expect(await db.company.count({ where: { tenantId, uen: test.reviewedData.entityDetails.uen } })).toBe(0);
    expect((await db.document.findUniqueOrThrow({ where: { id: test.document.id } })).extractionStatus).toBe('EXTRACTED');
    expect(await db.auditLog.count({ where: { tenantId, entityId: test.contact.id } })).toBe(0);
  });

  it.each([null, '1982-02-02', '1980-01-01'])('rejects a prepared approval after the contact date changed to %s', async (current) => {
    const test = await prepare('1981-01-01');
    await db.contact.update({ where: { id: test.contact.id }, data: { dateOfBirth: current ? new Date(`${current}T00:00:00Z`) : null } });
    const response = await test.confirm();
    expect(response.status, JSON.stringify(await response.clone().json())).toBe(409);
    const stored = await db.contact.findUniqueOrThrow({ where: { id: test.contact.id } });
    expect(stored.dateOfBirth?.toISOString().slice(0, 10) ?? null).toBe(current);
    expect(await db.company.count({ where: { tenantId, uen: test.reviewedData.entityDetails.uen } })).toBe(0);
    expect(await db.auditLog.count({ where: { tenantId, entityId: test.contact.id } })).toBe(0);
  });

  it('applies an agreeing replacement once when the same person is both officer and shareholder', async () => {
    const test = await prepare('1981-01-01', true);
    const response = await test.confirm();
    expect(response.status, JSON.stringify(await response.clone().json())).toBe(200);
    const audits = await db.auditLog.findMany({ where: { tenantId, entityId: test.contact.id } });
    expect(audits.map((entry) => entry.changes).filter(Boolean)).toEqual([{ dateOfBirth: { old: '1981-01-01', new: '1980-01-01' } }]);
  });

  it('applies the reviewed replacement and old/new audit atomically through the public confirm route', async () => {
    const test = await prepare('1981-01-01');
    const response = await test.confirm();
    expect(response.status, JSON.stringify(await response.clone().json())).toBe(200);
    expect((await db.contact.findUniqueOrThrow({ where: { id: test.contact.id } })).dateOfBirth?.toISOString()).toBe('1980-01-01T00:00:00.000Z');
    const audits = await db.auditLog.findMany({ where: { tenantId, entityId: test.contact.id } });
    expect(audits.map((entry) => entry.changes).filter(Boolean)).toEqual([{ dateOfBirth: { old: '1981-01-01', new: '1980-01-01' } }]);
    expect(await db.company.count({ where: { tenantId, uen: test.reviewedData.entityDetails.uen } })).toBe(1);
  });
});
