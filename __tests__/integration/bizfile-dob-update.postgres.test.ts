// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { bizFileReviewSchema, normalizeBizFileReviewDraft } from '@/lib/validations/bizfile-review';
import { prepareBizFileImportCommand } from '@/services/bizfile/application/prepare-import';
import { issueBizFilePreparationToken } from '@/services/bizfile/application/preparation-token';
import { hashBizFileValue } from '@/services/bizfile/change-plan';
import { POST } from '@/app/api/documents/[documentId]/apply-update/route';

const auth = vi.hoisted(() => ({ session: {} as Record<string, unknown> }));
vi.mock('@/lib/auth', () => ({ requireAuth: async () => auth.session }));
vi.mock('@/services/sentroweb/client', () => ({ sentrowebClient: { openSession: () => { throw new Error('No live calls'); } } }));

const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
type Database = ReturnType<typeof import('@/lib/prisma')['getPrisma']>;

suite('Update-from-BizFile DOB replacement through the public apply-update route (PostgreSQL)', () => {
  let db: Database;
  let tenantId: string;
  let userId: string;
  const originalUrl = process.env.DATABASE_URL;
  const previousSecret = process.env.BUSINESS_ASSISTANT_PREPARATION_SECRET;

  beforeAll(async () => {
    const target = new URL(url!);
    if (!/(?:^|[_-])test(?:[_-]|$)/i.test(target.pathname.slice(1))) throw new Error('Test database required');
    process.env.DATABASE_URL = url;
    process.env.BUSINESS_ASSISTANT_PREPARATION_SECRET = 'test-only-dob-update-secret-at-least-32-characters';
    db = (await import('@/lib/prisma')).getPrisma();
    const suffix = randomUUID();
    tenantId = (await db.workspace.create({ data: { name: 'DOB update test', slug: `dob-update-${suffix}`, status: 'ACTIVE' } })).id;
    userId = (await db.user.create({ data: { tenantId, email: `dob-update-${suffix}@example.test`, passwordHash: 'unused', firstName: 'Test', lastName: 'Reviewer' } })).id;
    const role = await db.role.create({ data: { name: `DOB update reviewer ${suffix}`, tenantId, systemRoleType: 'ADMIN' } });
    await db.userRoleAssignment.create({ data: { userId, roleId: role.id } });
    auth.session = { id: userId, tenantId, isSuperAdmin: false, isWorkspaceAdmin: true };
  });

  afterAll(() => {
    if (originalUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalUrl;
    if (previousSecret === undefined) delete process.env.BUSINESS_ASSISTANT_PREPARATION_SECRET;
    else process.env.BUSINESS_ASSISTANT_PREPARATION_SECRET = previousSecret;
  });

  type Decision = { replaces?: string; send: boolean };

  /** An existing company with a director and a shareholder (two different contacts, each saved 1981-01-01). */
  async function prepare(officer: Decision, shareholder: Decision) {
    const suffix = randomUUID().replace(/-/g, '');
    const uen = `U${suffix.slice(0, 8)}`;
    const company = await db.company.create({ data: { tenantId, uen, name: 'Existing DOB Pte Ltd', entityType: 'PRIVATE_LIMITED', status: 'LIVE' } });
    const makeContact = (label: string, index: number) => db.contact.create({ data: {
      tenantId, contactType: 'INDIVIDUAL', firstName: label, lastName: `Update${suffix}`, fullName: `${label} Update${suffix}`,
      canonicalName: `${label.toLowerCase()}update${suffix}`, identificationType: 'NRIC', identificationNumber: `S${suffix.slice(index, index + 7)}A`,
      dateOfBirth: new Date('1981-01-01T00:00:00Z'),
    } });
    const [director, holder] = [await makeContact('Dina', 0), await makeContact('Hal', 8)];
    await db.companyOfficer.create({ data: { companyId: company.id, contactId: director.id, role: 'DIRECTOR', name: director.fullName,
      identificationType: 'NRIC', identificationNumber: director.identificationNumber, nationality: 'Singaporean', isCurrent: true } });
    await db.companyShareholder.create({ data: { companyId: company.id, contactId: holder.id, name: holder.fullName, shareholderType: 'INDIVIDUAL',
      identificationType: 'NRIC', identificationNumber: holder.identificationNumber, nationality: 'Singaporean', shareClass: 'ORDINARY',
      numberOfShares: 1, isCurrent: true } });
    const extra = (decision: Decision) => decision.send
      ? { dateOfBirth: '1980-01-01', ...(decision.replaces ? { dateOfBirthReplaces: decision.replaces } : {}) }
      : {};
    const reviewedData = normalizeBizFileReviewDraft(bizFileReviewSchema.parse({
      entityDetails: { uen, name: 'Existing DOB Pte Ltd', entityType: 'PRIVATE_LIMITED', status: 'LIVE' },
      officers: [{ name: director.fullName, role: 'DIRECTOR', identificationType: 'NRIC', identificationNumber: director.identificationNumber,
        nationality: 'Malaysian', ...extra(officer), contactResolution: { action: 'REUSE', contactId: director.id } }],
      shareholders: [{ name: holder.fullName, type: 'INDIVIDUAL', identificationType: 'NRIC', identificationNumber: holder.identificationNumber,
        nationality: 'Malaysian', shareClass: 'ORDINARY', numberOfShares: 1, ...extra(shareholder),
        contactResolution: { action: 'REUSE', contactId: holder.id } }],
    }));
    const document = await db.document.create({ data: {
      tenantId, uploadedById: userId, companyId: company.id, fileName: 'synthetic.pdf', originalFileName: 'synthetic.pdf',
      storageKey: `test/${suffix}.pdf`, mimeType: 'application/pdf', documentType: 'BIZFILE', fileSize: 0,
      extractionStatus: 'EXTRACTED', extractedData: reviewedData as object,
    } });
    // Deliberately not a whole second: a company's updatedAt normally carries milliseconds.
    await db.$executeRaw`UPDATE companies SET "updatedAt" = date_trunc('second', "updatedAt") + interval '123 milliseconds' WHERE id = ${company.id}`;
    const stamp = await db.company.findUniqueOrThrow({ where: { id: company.id }, select: { updatedAt: true } });
    expect(stamp.updatedAt.getUTCMilliseconds()).not.toBe(0);
    const prepared = await prepareBizFileImportCommand({ documentId: document.id, tenantId, reviewedData, targetCompanyId: company.id });
    const { token } = issueBizFilePreparationToken({ actorId: userId, tenantId, documentId: document.id,
      planHash: prepared.plan.canonicalHash, contextHash: hashBizFileValue(null) });
    const apply = () => POST(new Request(`http://localhost/api/documents/${document.id}/apply-update`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId: company.id, extractedData: reviewedData, plan: prepared.plan, preparationToken: token, operationId: `dob-update-${suffix}` }),
    }) as never, { params: Promise.resolve({ documentId: document.id }) });
    const dobOf = async (contactId: string) => (await db.contact.findUniqueOrThrow({ where: { id: contactId } })).dateOfBirth?.toISOString().slice(0, 10) ?? null;
    const nationalities = async () => ({
      officer: (await db.companyOfficer.findFirstOrThrow({ where: { companyId: company.id } })).nationality,
      shareholder: (await db.companyShareholder.findFirstOrThrow({ where: { companyId: company.id } })).nationality,
    });
    return { director, holder, apply, dobOf, nationalities, document, company };
  }

  it('replaces both saved dates when each is approved for its exact saved date, with an old/new audit each', async () => {
    const test = await prepare({ send: true, replaces: '1981-01-01' }, { send: true, replaces: '1981-01-01' });
    const response = await test.apply();
    expect(response.status, JSON.stringify(await response.clone().json())).toBe(200);
    expect(await test.dobOf(test.director.id)).toBe('1980-01-01');
    expect(await test.dobOf(test.holder.id)).toBe('1980-01-01');
    expect(await test.nationalities()).toEqual({ officer: 'Malaysian', shareholder: 'Malaysian' });
    for (const contact of [test.director, test.holder]) {
      const audits = await db.auditLog.findMany({ where: { tenantId, entityId: contact.id } });
      expect(audits.map((entry) => entry.changes).filter(Boolean)).toEqual([{ dateOfBirth: { old: '1981-01-01', new: '1980-01-01' } }]);
    }
  });

  it('keeps the saved dates but still applies the unrelated updates when the replacements are not sent', async () => {
    const test = await prepare({ send: false }, { send: false });
    const response = await test.apply();
    expect(response.status, JSON.stringify(await response.clone().json())).toBe(200);
    expect(await test.dobOf(test.director.id)).toBe('1981-01-01');
    expect(await test.dobOf(test.holder.id)).toBe('1981-01-01');
    expect(await test.nationalities()).toEqual({ officer: 'Malaysian', shareholder: 'Malaysian' });
  });

  it('applies one approved replacement and keeps the other saved date', async () => {
    const test = await prepare({ send: true, replaces: '1981-01-01' }, { send: false });
    const response = await test.apply();
    expect(response.status, JSON.stringify(await response.clone().json())).toBe(200);
    expect(await test.dobOf(test.director.id)).toBe('1980-01-01');
    expect(await test.dobOf(test.holder.id)).toBe('1981-01-01');
  });

  it.each([
    ['no approval is sent', { send: true }],
    ['the approval names a date the contact no longer has', { send: true, replaces: '1979-09-09' }],
  ] as const)('rejects the whole update, unrelated changes included, when %s', async (_name, shareholder) => {
    const test = await prepare({ send: true, replaces: '1981-01-01' }, shareholder);
    const response = await test.apply();
    expect(response.status, JSON.stringify(await response.clone().json())).toBe(409);
    expect(await test.dobOf(test.director.id)).toBe('1981-01-01');
    expect(await test.dobOf(test.holder.id)).toBe('1981-01-01');
    expect(await test.nationalities()).toEqual({ officer: 'Singaporean', shareholder: 'Singaporean' });
  });

  it('refuses to apply when the saved date changed after approval, and applies nothing', async () => {
    const test = await prepare({ send: true, replaces: '1981-01-01' }, { send: false });
    await db.contact.update({ where: { id: test.director.id }, data: { dateOfBirth: new Date('1982-02-02T00:00:00Z') } });
    const response = await test.apply();
    // The contact edit also moves the company's aggregate revision, so the prepared plan is refused
    // as stale before the resolver's own saved-date check (covered by the case above).
    expect(response.status, JSON.stringify(await response.clone().json())).not.toBe(200);
    expect(await test.dobOf(test.director.id)).toBe('1982-02-02');
    expect(await test.nationalities()).toEqual({ officer: 'Singaporean', shareholder: 'Singaporean' });
  });
});
