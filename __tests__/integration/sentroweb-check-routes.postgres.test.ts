// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { makeClient, type FakeClient } from '../helpers/fake-sentroweb-client';

/**
 * The Sentroweb check routes with real handlers, real RBAC and a real PostgreSQL (oakcloud_test).
 * Only the session (`requireAuth`), object storage and the browser client are replaced.
 */

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (process.env.CI === 'true' && !testDatabaseUrl) {
  describe('Sentroweb routes PostgreSQL configuration', () => {
    it('requires TEST_DATABASE_URL in CI', () => {
      throw new Error('TEST_DATABASE_URL must reference an isolated PostgreSQL test database in CI');
    });
  });
}

const current = vi.hoisted(() => ({ session: null as unknown }));
const memory = vi.hoisted(() => ({ files: new Map<string, Buffer>() }));
const gate = vi.hoisted(() => ({ client: null as unknown as { openSession: (...args: unknown[]) => Promise<unknown> } }));

vi.mock('@/lib/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth')>()),
  requireAuth: vi.fn(async () => {
    if (!current.session) throw new Error('Unauthorized');
    return current.session;
  }),
}));

vi.mock('@/lib/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/storage')>();
  return {
    ...actual,
    storage: {
      upload: async (key: string, data: Buffer) => {
        memory.files.set(key, Buffer.from(data));
        return { key, size: data.byteLength };
      },
      download: async (key: string) => {
        const data = memory.files.get(key);
        if (!data) throw new Error(`missing object ${key}`);
        return Buffer.from(data);
      },
      delete: async (key: string) => {
        memory.files.delete(key);
      },
      exists: async (key: string) => memory.files.has(key),
    },
  };
});

// The routes start runs in-process with the default client: that is the scripted one here.
vi.mock('@/services/sentroweb/client', () => ({
  sentrowebClient: { openSession: (...args: unknown[]) => gate.client.openSession(...args) },
}));

const describePostgres = testDatabaseUrl ? describe : describe.skip;

type Prisma = Awaited<ReturnType<typeof import('@/lib/prisma')['getPrisma']>>;
type Actor = 'updater' | 'reader' | 'nobody' | 'otherTenant';

const FAKE_SECRETS = {
  SENTROWEB_ENABLED: 'true',
  SENTROWEB_BASE_URL: 'https://sentroweb.invalid/Sentroweb',
  SENTROWEB_ACCOUNT_ID: 'ACCT-ROUTE-TEST-9911',
  SENTROWEB_USERNAME: 'route.test.user',
  SENTROWEB_PASSWORD: 'route-Test-Pa55w0rd',
  SENTROWEB_SEARCH_DELAY_MS: '0',
};

describePostgres('Sentroweb check routes (PostgreSQL)', () => {
  let prisma: Prisma;
  let tenantId: string;
  let otherTenantId: string;
  let suffix: string;
  const sessions = {} as Record<Actor, unknown>;
  const users = {} as Record<Actor, string>;
  let routes: {
    collection: typeof import('@/app/api/companies/[id]/sentroweb-checks/route');
    candidates: typeof import('@/app/api/companies/[id]/sentroweb-checks/candidates/route');
    run: typeof import('@/app/api/companies/[id]/sentroweb-checks/[runId]/route');
    screenshot: typeof import('@/app/api/companies/[id]/sentroweb-checks/[runId]/results/[resultId]/screenshot/route');
    report: typeof import('@/app/api/companies/[id]/sentroweb-checks/[runId]/results/[resultId]/report/route');
  };
  const savedEnv: Record<string, string | undefined> = {};
  const bodies: string[] = [];
  let client: FakeClient;
  let release: () => void = () => undefined;

  const as = (actor: Actor | null) => {
    current.session = actor ? sessions[actor] : null;
  };

  const url = (companyId: string, path = '', query = '') =>
    `http://localhost/api/companies/${companyId}/sentroweb-checks${path}${query}`;

  async function read(response: Response) {
    const text = await response.clone().text();
    bodies.push(text);
    return response.headers.get('content-type')?.includes('json') ? JSON.parse(text) : text;
  }

  /** A company with two directors and a corporate shareholder (four candidates with the company). */
  async function makeCompany(tenant = tenantId) {
    const company = await prisma.company.create({
      data: { tenantId: tenant, uen: `R${randomUUID().slice(0, 8)}`, name: 'Route Test Pte Ltd' },
    });
    await prisma.companyOfficer.createMany({
      data: [
        { companyId: company.id, role: 'DIRECTOR', name: 'Dora Director', isCurrent: true },
        { companyId: company.id, role: 'DIRECTOR', name: 'Dan Director', isCurrent: true },
      ],
    });
    await prisma.companyShareholder.create({
      data: { companyId: company.id, name: 'Holder Corp Pte Ltd', shareholderType: 'CORPORATE', numberOfShares: 5, isCurrent: true },
    });
    return company.id;
  }

  async function candidateKeys(companyId: string): Promise<string[]> {
    as('reader');
    const response = await routes.candidates.GET(new NextRequest(url(companyId, '/candidates')), {
      params: Promise.resolve({ id: companyId }),
    });
    return (await read(response)).candidates.map((c: { key: string }) => c.key);
  }

  const post = (companyId: string, body: unknown) =>
    routes.collection.POST(
      new NextRequest(url(companyId), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: typeof body === 'string' ? body : JSON.stringify(body),
      }),
      { params: Promise.resolve({ id: companyId }) },
    );

  const list = (companyId: string, query = '') =>
    routes.collection.GET(new NextRequest(url(companyId, '', query)), { params: Promise.resolve({ id: companyId }) });

  const detail = (companyId: string, runId: string) =>
    routes.run.GET(new NextRequest(url(companyId, `/${runId}`)), { params: Promise.resolve({ id: companyId, runId }) });

  const screenshot = (companyId: string, runId: string, resultId: string) =>
    routes.screenshot.GET(new NextRequest(url(companyId, `/${runId}/results/${resultId}/screenshot`)), {
      params: Promise.resolve({ id: companyId, runId, resultId }),
    });

  const report = (companyId: string, runId: string, resultId: string) =>
    routes.report.GET(new NextRequest(url(companyId, `/${runId}/results/${resultId}/report`)), {
      params: Promise.resolve({ id: companyId, runId, resultId }),
    });

  async function waitForRun(runId: string, status: 'COMPLETED' | 'FAILED') {
    for (let i = 0; i < 200; i += 1) {
      const run = await prisma.sentrowebCheckRun.findUniqueOrThrow({ where: { id: runId } });
      if (run.status === status) return run;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`run ${runId} did not reach ${status}`);
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.LOG_LEVEL = 'silent';
    for (const [key, value] of Object.entries(FAKE_SECRETS)) {
      savedEnv[key] = process.env[key];
      process.env[key] = value;
    }
    prisma = (await import('@/lib/prisma')).getPrisma();
    routes = {
      collection: await import('@/app/api/companies/[id]/sentroweb-checks/route'),
      candidates: await import('@/app/api/companies/[id]/sentroweb-checks/candidates/route'),
      run: await import('@/app/api/companies/[id]/sentroweb-checks/[runId]/route'),
      screenshot: await import('@/app/api/companies/[id]/sentroweb-checks/[runId]/results/[resultId]/screenshot/route'),
      report: await import('@/app/api/companies/[id]/sentroweb-checks/[runId]/results/[resultId]/report/route'),
    };

    suffix = randomUUID();
    tenantId = (await prisma.workspace.create({ data: { name: `Routes ${suffix}`, slug: `sw-routes-${suffix}` } })).id;
    otherTenantId = (await prisma.workspace.create({ data: { name: `Routes other ${suffix}`, slug: `sw-routes-o-${suffix}` } })).id;

    const permission = async (resource: string, action: string) =>
      (await prisma.permission.upsert({
        where: { resource_action: { resource, action } },
        create: { resource, action },
        update: {},
      })).id;
    const canRead = await permission('company', 'read');
    const canUpdate = await permission('company', 'update');
    const other = await permission('esigning', 'read');

    async function role(tenant: string, name: string, permissionIds: string[]) {
      const created = await prisma.role.create({ data: { tenantId: tenant, name: `${name} ${suffix}` } });
      await prisma.rolePermission.createMany({ data: permissionIds.map((permissionId) => ({ roleId: created.id, permissionId })) });
      return created.id;
    }
    const roles = {
      updater: await role(tenantId, 'Company update', [canRead, canUpdate]),
      reader: await role(tenantId, 'Company read', [canRead]),
      nobody: await role(tenantId, 'No company access', [other]),
      otherTenant: await role(otherTenantId, 'Other tenant full', [canRead, canUpdate]),
    };

    for (const actor of ['updater', 'reader', 'nobody', 'otherTenant'] as Actor[]) {
      const tenant = actor === 'otherTenant' ? otherTenantId : tenantId;
      const user = await prisma.user.create({
        data: { tenantId: tenant, email: `${actor}-${suffix}@example.test`, passwordHash: 'not-used', firstName: actor, lastName: 'User' },
      });
      users[actor] = user.id;
      await prisma.userRoleAssignment.create({ data: { userId: user.id, roleId: roles[actor], companyId: null } });
      sessions[actor] = {
        id: user.id,
        email: user.email,
        firstName: actor,
        lastName: 'User',
        tenantId: tenant,
        workspaceId: tenant,
        internalRole: 'STAFF',
        isAdmin: false,
        isManager: false,
        isStaff: true,
        isSuperAdmin: false,
        isWorkspaceAdmin: false,
        hasAllCompaniesAccess: true,
        companyIds: [],
      };
    }
  });

  afterEach(async () => {
    release();
    // Let every background run finish so nothing leaks into the next test.
    for (let i = 0; i < 200; i += 1) {
      const active = await prisma.sentrowebCheckRun.count({ where: { status: { in: ['QUEUED', 'RUNNING'] }, tenantId } });
      if (active === 0) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  });

  afterAll(() => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  function useClient(configure: (c: FakeClient) => void = () => undefined) {
    client = makeClient();
    configure(client);
    gate.client = client as unknown as typeof gate.client;
  }

  // --- authentication and permissions -------------------------------------------------------------

  describe('authentication and permissions', () => {
    it('answers 401 on every route without a session', async () => {
      useClient();
      const companyId = await makeCompany();
      const id = randomUUID();
      as(null);
      const responses = await Promise.all([
        list(companyId),
        post(companyId, { entityKeys: ['x'] }),
        routes.candidates.GET(new NextRequest(url(companyId, '/candidates')), { params: Promise.resolve({ id: companyId }) }),
        detail(companyId, id),
        screenshot(companyId, id, id),
        report(companyId, id, id),
      ]);
      expect(responses.map((r) => r.status)).toEqual([401, 401, 401, 401, 401, 401]);
    });

    it('answers 403 without company:read on every read route and without company:update on POST', async () => {
      useClient();
      const companyId = await makeCompany();
      const id = randomUUID();

      as('nobody');
      const denied = await Promise.all([
        list(companyId),
        post(companyId, { entityKeys: ['x'] }),
        routes.candidates.GET(new NextRequest(url(companyId, '/candidates')), { params: Promise.resolve({ id: companyId }) }),
        detail(companyId, id),
        screenshot(companyId, id, id),
        report(companyId, id, id),
      ]);
      expect(denied.map((r) => r.status)).toEqual([403, 403, 403, 403, 403, 403]);

      // company:read alone may look but not run
      as('reader');
      expect((await post(companyId, { entityKeys: ['x'] })).status).toBe(403);
      expect((await list(companyId)).status).toBe(200);
      expect(await prisma.sentrowebCheckRun.count({ where: { companyId } })).toBe(0);
    });

    it('answers 404 for another workspace’s company on every route', async () => {
      useClient();
      const foreign = await makeCompany(otherTenantId);
      const id = randomUUID();
      as('updater'); // has company:update, but in a different workspace
      const responses = await Promise.all([
        list(foreign),
        post(foreign, { entityKeys: ['x'] }),
        routes.candidates.GET(new NextRequest(url(foreign, '/candidates')), { params: Promise.resolve({ id: foreign }) }),
        detail(foreign, id),
        screenshot(foreign, id, id),
        report(foreign, id, id),
      ]);
      expect(responses.map((r) => r.status)).toEqual([404, 404, 404, 404, 404, 404]);
      expect(await prisma.sentrowebCheckRun.count({ where: { companyId: foreign } })).toBe(0);
    });

    it('answers 404 for a company that does not exist and 400 for a malformed id', async () => {
      useClient();
      as('updater');
      expect((await list(randomUUID())).status).toBe(404);
      expect((await list('not-a-uuid')).status).toBe(400);
    });
  });

  // --- candidates -------------------------------------------------------------------------------

  describe('GET candidates', () => {
    it('returns who can be screened, the limits and whether Sentroweb is configured', async () => {
      useClient();
      const companyId = await makeCompany();
      as('reader');
      const response = await routes.candidates.GET(new NextRequest(url(companyId, '/candidates')), {
        params: Promise.resolve({ id: companyId }),
      });
      expect(response.status).toBe(200);
      const body = await read(response);
      expect(body).toMatchObject({ configured: true, maxEntities: 10, creditsPerSearch: 1, activeRunId: null, cooldownUntil: null });
      expect(body.candidates.map((c: { name: string }) => c.name)).toEqual([
        'Route Test Pte Ltd',
        'Dan Director',
        'Dora Director',
        'Holder Corp Pte Ltd',
      ]);
    });

    it('says not configured when the feature switch is off', async () => {
      useClient();
      const companyId = await makeCompany();
      process.env.SENTROWEB_ENABLED = 'false';
      try {
        as('reader');
        const response = await routes.candidates.GET(new NextRequest(url(companyId, '/candidates')), {
          params: Promise.resolve({ id: companyId }),
        });
        expect((await read(response)).configured).toBe(false);
      } finally {
        process.env.SENTROWEB_ENABLED = 'true';
      }
    });
  });

  // --- starting a check ---------------------------------------------------------------------------

  describe('POST (start a check)', () => {
    it('answers 202 with the run id, then the run completes and its detail is readable', async () => {
      useClient();
      const companyId = await makeCompany();
      const keys = await candidateKeys(companyId);
      as('updater');
      const response = await post(companyId, { entityKeys: keys });
      expect(response.status).toBe(202);
      const { runId } = await read(response);
      expect(runId).toMatch(/^[0-9a-f-]{36}$/);

      await waitForRun(runId, 'COMPLETED');
      as('reader');
      const body = await read(await detail(companyId, runId));
      expect(body.run).toMatchObject({
        id: runId,
        companyId,
        status: 'COMPLETED',
        overallResult: 'CLEAR',
        entityCount: 4,
        creditsUsed: 4,
        requestedBy: { id: users.updater, name: 'updater User' },
      });
      expect(body.run.results).toHaveLength(4);
      expect(body.run.results.every((r: { status: string; documentId: string | null }) => r.status === 'CLEAR' && r.documentId)).toBe(true);
      expect(client.searches).toHaveLength(4);
    });

    it('starts a fuzzy run only when the body says so, and shows it in the run detail', async () => {
      useClient();
      const companyId = await makeCompany();
      const keys = await candidateKeys(companyId);
      as('updater');
      const plain = await post(companyId, { entityKeys: keys.slice(0, 1) });
      const plainId = (await read(plain)).runId;
      await waitForRun(plainId, 'COMPLETED');
      const fuzzy = await post(companyId, { entityKeys: keys.slice(0, 1), fuzzy: true, force: true });
      expect(fuzzy.status).toBe(202);
      const fuzzyId = (await read(fuzzy)).runId;
      await waitForRun(fuzzyId, 'COMPLETED');
      as('reader');
      expect((await read(await detail(companyId, plainId))).run.fuzzy).toBe(false);
      expect((await read(await detail(companyId, fuzzyId))).run.fuzzy).toBe(true);
      expect(client.searches.map((search) => search.fuzzy)).toEqual([false, true]);
    });

    it('rejects a body that is not valid with 400 and creates nothing', async () => {
      useClient();
      const companyId = await makeCompany();
      as('updater');
      for (const bad of [
        {},
        { entityKeys: 'abc' },
        { entityKeys: [1, 2] },
        { entityKeys: [''] },
        { entityKeys: ['x'], force: 'yes' },
        { entityKeys: ['x'], fuzzy: 'yes' },
        { entityKeys: Array.from({ length: 101 }, (_, i) => `k${i}`) },
        '{ not json',
      ]) {
        const response = await post(companyId, bad);
        expect(response.status, JSON.stringify(bad).slice(0, 40)).toBe(400);
        await read(response);
      }
      expect(await prisma.sentrowebCheckRun.count({ where: { companyId } })).toBe(0);
    });

    it('answers 422 TOO_MANY_ENTITIES for 11 keys and NO_ENTITIES_SELECTED for none', async () => {
      useClient();
      const companyId = await makeCompany();
      as('updater');
      const tooMany = await post(companyId, { entityKeys: Array.from({ length: 11 }, (_, i) => `key${i}`) });
      expect(tooMany.status).toBe(422);
      expect(await read(tooMany)).toMatchObject({ code: 'TOO_MANY_ENTITIES', details: { max: 10 } });
      const none = await post(companyId, { entityKeys: [] });
      expect(none.status).toBe(422);
      expect(await read(none)).toMatchObject({ code: 'NO_ENTITIES_SELECTED' });
      expect(await prisma.sentrowebCheckRun.count({ where: { companyId } })).toBe(0);
    });

    it('answers 400 for keys that are no longer current', async () => {
      useClient();
      const companyId = await makeCompany();
      as('updater');
      const response = await post(companyId, { entityKeys: ['0'.repeat(24)] });
      expect(response.status).toBe(400);
    });

    it('answers 503 SENTROWEB_NOT_CONFIGURED when the settings are missing', async () => {
      useClient();
      const companyId = await makeCompany();
      const keys = await candidateKeys(companyId);
      delete process.env.SENTROWEB_PASSWORD;
      try {
        as('updater');
        const response = await post(companyId, { entityKeys: keys });
        expect(response.status).toBe(503);
        expect(await read(response)).toMatchObject({ code: 'SENTROWEB_NOT_CONFIGURED' });
      } finally {
        process.env.SENTROWEB_PASSWORD = FAKE_SECRETS.SENTROWEB_PASSWORD;
      }
      expect(await prisma.sentrowebCheckRun.count({ where: { companyId } })).toBe(0);
    });

    it('answers 409 ALREADY_RUNNING while a run is active, then 409 COOLDOWN, then lets force through', async () => {
      let open!: () => void;
      useClient((c) => {
        c.hold = new Promise<void>((resolve) => {
          open = resolve;
        });
      });
      release = () => open();
      const companyId = await makeCompany();
      const keys = await candidateKeys(companyId);
      as('updater');

      const first = await post(companyId, { entityKeys: keys });
      expect(first.status).toBe(202);
      const { runId } = await read(first);

      const second = await post(companyId, { entityKeys: keys });
      expect(second.status).toBe(409);
      expect(await read(second)).toMatchObject({ code: 'ALREADY_RUNNING', details: { runId } });
      const info = await read(
        await routes.candidates.GET(new NextRequest(url(companyId, '/candidates')), { params: Promise.resolve({ id: companyId }) }),
      );
      expect(info.activeRunId).toBe(runId);

      open();
      await waitForRun(runId, 'COMPLETED');

      const cooling = await post(companyId, { entityKeys: keys });
      expect(cooling.status).toBe(409);
      const cooldown = await read(cooling);
      expect(cooldown).toMatchObject({ code: 'COOLDOWN' });
      expect(new Date(cooldown.details.cooldownUntil).getTime()).toBeGreaterThan(Date.now());

      const forced = await post(companyId, { entityKeys: keys, force: true });
      expect(forced.status).toBe(202);
      await waitForRun((await read(forced)).runId, 'COMPLETED');
    });
  });

  // --- history and detail --------------------------------------------------------------------------

  describe('GET history and detail', () => {
    it('lists runs newest first with a cursor, and rejects bad paging with 400', async () => {
      useClient();
      const companyId = await makeCompany();
      const sameInstant = new Date('2026-11-01T00:00:00.000Z');
      for (let i = 0; i < 3; i += 1) {
        await prisma.sentrowebCheckRun.create({
          data: { tenantId, companyId, requestedById: users.updater, entityCount: 1, status: 'COMPLETED', overallResult: 'CLEAR', createdAt: sameInstant },
        });
      }
      as('reader');
      const page1 = await read(await list(companyId, '?limit=2'));
      expect(page1.runs).toHaveLength(2);
      expect(page1.nextCursor).toEqual(expect.any(String));
      expect(page1.runs[0]).not.toHaveProperty('results');
      const page2 = await read(await list(companyId, `?limit=2&cursor=${encodeURIComponent(page1.nextCursor)}`));
      expect(page2.runs).toHaveLength(1);
      expect(page2.nextCursor).toBeNull();
      expect(new Set([...page1.runs, ...page2.runs].map((r: { id: string }) => r.id)).size).toBe(3);

      for (const query of ['?limit=0', '?limit=51', '?limit=abc', '?cursor=%20', '?cursor=bad-cursor']) {
        const response = await list(companyId, query);
        expect(response.status, query).toBe(400);
        await read(response);
      }
    });

    it('does not show another company’s run, even inside the same workspace', async () => {
      useClient();
      const companyA = await makeCompany();
      const companyB = await makeCompany();
      const run = await prisma.sentrowebCheckRun.create({
        data: { tenantId, companyId: companyA, requestedById: users.updater, entityCount: 1, status: 'COMPLETED' },
      });
      as('reader');
      expect((await detail(companyA, run.id)).status).toBe(200);
      expect((await detail(companyB, run.id)).status).toBe(404);
      expect((await detail(companyA, randomUUID())).status).toBe(404);
      expect((await detail(companyA, 'not-a-uuid')).status).toBe(400);
    });

    it('returns fixed messages for errors and never internals, credentials or raw text', async () => {
      useClient((c) => {
        c.openError = new (class extends Error {})('Sentroweb said: secret page text 123') as never;
      });
      const companyId = await makeCompany();
      const keys = await candidateKeys(companyId);
      as('updater');
      const { runId } = await read(await post(companyId, { entityKeys: keys }));
      await waitForRun(runId, 'FAILED');

      as('reader');
      const body = await read(await detail(companyId, runId));
      expect(body.run).toMatchObject({ status: 'FAILED', errorCode: 'UNEXPECTED_ERROR', overallResult: 'INCOMPLETE' });
      expect(body.run.errorMessage).toBe('The check failed unexpectedly.');
      expect(JSON.stringify(body)).not.toContain('secret page text');
      expect(body.run.results.every((r: { status: string }) => r.status === 'NOT_RUN')).toBe(true);
    });
  });

  // --- screenshots ---------------------------------------------------------------------------------

  describe('GET screenshot', () => {
    it('streams the PNG with safe headers and writes a DOWNLOAD audit row', async () => {
      useClient();
      const companyId = await makeCompany();
      const keys = await candidateKeys(companyId);
      as('updater');
      const { runId } = await read(await post(companyId, { entityKeys: keys.slice(0, 1) }));
      await waitForRun(runId, 'COMPLETED');
      const result = await prisma.sentrowebCheckResult.findFirstOrThrow({ where: { runId } });

      as('reader');
      const response = await screenshot(companyId, runId, result.id);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('image/png');
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      expect(Buffer.from(await response.arrayBuffer()).subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');

      const audit = await prisma.auditLog.findMany({ where: { entityType: 'SentrowebCheckResult', entityId: result.id } });
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({ action: 'DOWNLOAD', userId: users.reader, companyId, tenantId });
    });

    it('answers 404 for a result without a screenshot, from another run or from another company', async () => {
      useClient((c) => {
        c.scripts.set('Route Test Pte Ltd', { fixture: 'entity-clear', png: false });
      });
      const companyId = await makeCompany();
      const otherCompany = await makeCompany();
      const keys = await candidateKeys(companyId);
      as('updater');
      const { runId } = await read(await post(companyId, { entityKeys: keys.slice(0, 1) }));
      await waitForRun(runId, 'COMPLETED');
      const result = await prisma.sentrowebCheckResult.findFirstOrThrow({ where: { runId } });
      expect(result.evidencePngKey).toBeNull();

      as('reader');
      expect((await screenshot(companyId, runId, result.id)).status).toBe(404);
      expect((await screenshot(otherCompany, runId, result.id)).status).toBe(404);
      expect((await screenshot(companyId, randomUUID(), result.id)).status).toBe(404);
      expect((await screenshot(companyId, runId, 'nope')).status).toBe(400);
    });
  });

  // --- PDF reports ---------------------------------------------------------------------------------

  describe('GET report', () => {
    it('streams the filed PDF with safe headers and writes a DOWNLOAD audit row', async () => {
      useClient();
      const companyId = await makeCompany();
      const keys = await candidateKeys(companyId);
      as('updater');
      const { runId } = await read(await post(companyId, { entityKeys: keys.slice(0, 1) }));
      await waitForRun(runId, 'COMPLETED');
      const result = await prisma.sentrowebCheckResult.findFirstOrThrow({ where: { runId } });
      expect(result.documentId).not.toBeNull();

      as('reader');
      const response = await report(companyId, runId, result.id);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('application/pdf');
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(response.headers.get('content-disposition')).toMatch(/^inline;/);
      expect(Buffer.from(await response.arrayBuffer()).subarray(0, 4).toString('latin1')).toBe('%PDF');

      const audit = await prisma.auditLog.findMany({ where: { entityType: 'Document', entityId: result.documentId!, action: 'DOWNLOAD' } });
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({ userId: users.reader, companyId, tenantId });
    });

    it('answers 404 without a filed report, for a deleted Document and across runs and companies', async () => {
      useClient((c) => {
        c.scripts.set('Route Test Pte Ltd', { fixture: 'entity-clear', pdf: false });
        c.scripts.set('Dan Director', { fixture: 'individual-clear' });
      });
      const companyId = await makeCompany();
      const otherCompany = await makeCompany();
      const keys = await candidateKeys(companyId);
      as('updater');
      const { runId } = await read(await post(companyId, { entityKeys: keys.slice(0, 2) }));
      await waitForRun(runId, 'COMPLETED');
      const results = await prisma.sentrowebCheckResult.findMany({ where: { runId }, orderBy: { position: 'asc' } });
      const [withoutPdf, withPdf] = results;
      expect(withoutPdf.documentId).toBeNull();
      expect(withPdf.documentId).not.toBeNull();

      as('reader');
      expect((await report(companyId, runId, withoutPdf.id)).status).toBe(404);
      expect((await report(otherCompany, runId, withPdf.id)).status).toBe(404);
      expect((await report(companyId, randomUUID(), withPdf.id)).status).toBe(404);
      expect((await report(companyId, runId, 'nope')).status).toBe(400);
      expect((await report(companyId, runId, withPdf.id)).status).toBe(200);

      await prisma.document.update({ where: { id: withPdf.documentId! }, data: { deletedAt: new Date() } });
      expect((await report(companyId, runId, withPdf.id)).status).toBe(404);
    });
  });

  it('no response body carried a credential, a token or an internal field', () => {
    const everything = bodies.join('\n');
    expect(bodies.length).toBeGreaterThan(10);
    for (const secret of [
      FAKE_SECRETS.SENTROWEB_PASSWORD,
      FAKE_SECRETS.SENTROWEB_ACCOUNT_ID,
      FAKE_SECRETS.SENTROWEB_USERNAME,
      'claimToken',
      'leaseExpiresAt',
      'evidencePngKey',
      'storageKey',
      'sourceRefs',
      'balanceBefore',
      'authorization',
    ]) {
      expect(everything.includes(secret), secret).toBe(false);
    }
  });
});
