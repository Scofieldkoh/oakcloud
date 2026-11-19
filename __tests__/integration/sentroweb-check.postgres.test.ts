// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SentrowebConfig } from '@/lib/sentroweb/config';
import type { SentrowebSession } from '@/services/sentroweb/client';
import { SentrowebError } from '@/services/sentroweb/errors';
import { makeClient } from '../helpers/fake-sentroweb-client';
import { loadCase } from '../helpers/sentroweb-fixtures';

/**
 * Sentroweb check service against a real PostgreSQL (oakcloud_test) with the browser client
 * replaced by a scripted fake. Storage is in memory. No browser, no network.
 */

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (process.env.CI === 'true' && !testDatabaseUrl) {
  describe('Sentroweb check PostgreSQL configuration', () => {
    it('requires TEST_DATABASE_URL in CI', () => {
      throw new Error('TEST_DATABASE_URL must reference an isolated PostgreSQL test database in CI');
    });
  });
}

const memory = vi.hoisted(() => ({ files: new Map<string, { data: Buffer; contentType?: string }>() }));

vi.mock('@/lib/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/storage')>();
  return {
    ...actual,
    storage: {
      upload: async (key: string, data: Buffer, options?: { contentType?: string }) => {
        memory.files.set(key, { data: Buffer.from(data), contentType: options?.contentType });
        return { key, size: data.byteLength };
      },
      download: async (key: string) => {
        const entry = memory.files.get(key);
        if (!entry) throw new Error(`missing object ${key}`);
        return Buffer.from(entry.data);
      },
      delete: async (key: string) => {
        memory.files.delete(key);
      },
      exists: async (key: string) => memory.files.has(key),
    },
  };
});

// The real browser client must never run from this suite, whatever the environment says.
vi.mock('@/services/sentroweb/client', () => ({
  sentrowebClient: {
    openSession: vi.fn(async () => {
      throw new Error('the real Sentroweb client must not be used in tests');
    }),
  },
}));

const describePostgres = testDatabaseUrl ? describe : describe.skip;

type Service = typeof import('@/services/sentroweb/check.service');
type Prisma = Awaited<ReturnType<typeof import('@/lib/prisma')['getPrisma']>>;

const CONFIG: SentrowebConfig = {
  baseUrl: 'http://127.0.0.1:1',
  accountId: 'test-account',
  username: 'test-user',
  password: 'test-password',
  timeouts: { stepMs: 1_000, resultMs: 1_000, runMs: 60_000, searchDelayMs: 0 },
};

/** The ID number of the most recent `makeFullCompany` director (unique per tenant). */
let lastNric = '';

// --- fixtures ----------------------------------------------------------------------------------

describePostgres('Sentroweb check service (PostgreSQL)', () => {
  let prisma: Prisma;
  let service: Service;
  let tenantId: string;
  let otherTenantId: string;
  let userId: string;
  let suffix: string;
  let otherCompanyId: string;
  const previousLogLevel = process.env.LOG_LEVEL;
  const previousEnabled = process.env.SENTROWEB_ENABLED;

  async function makeCompany(name = 'Test Holdings Pte Ltd') {
    const company = await prisma.company.create({
      data: { tenantId, uen: `T${randomUUID().slice(0, 8)}`, name },
    });
    return company.id;
  }

  /** A company with directors, shareholders and people who must not be screened. */
  async function makeFullCompany() {
    const companyId = await makeCompany('Acme Screening Pte Ltd');
    lastNric = `S${Math.floor(1_000_000 + Math.random() * 8_999_999)}${randomUUID().slice(0, 1).replace(/[^a-z]/, 'Q').toUpperCase()}`;
    const jane = await prisma.contact.create({
      data: {
        tenantId,
        contactType: 'INDIVIDUAL',
        firstName: 'Jane',
        lastName: 'Director',
        fullName: 'Jane Director',
        identificationType: 'NRIC',
        identificationNumber: lastNric,
      },
    });
    const corp = await prisma.contact.create({
      data: {
        tenantId,
        contactType: 'CORPORATE',
        fullName: 'Holding Corp Pte Ltd',
        corporateName: 'Holding Corp Pte Ltd',
        corporateUen: `201${randomUUID().slice(0, 6)}Z`,
      },
    });
    await prisma.companyOfficer.createMany({
      data: [
        { companyId, contactId: jane.id, role: 'DIRECTOR', name: 'Jane Director', isCurrent: true },
        { companyId, role: 'MANAGING_DIRECTOR', name: 'Mike Managing', isCurrent: true },
        { companyId, role: 'SECRETARY', name: 'Sam Secretary', isCurrent: true },
        { companyId, role: 'CEO', name: 'Cathy Chief', isCurrent: true },
        { companyId, role: 'DIRECTOR', name: 'Former Director', isCurrent: false },
      ],
    });
    await prisma.companyShareholder.createMany({
      data: [
        {
          companyId,
          contactId: jane.id,
          name: 'Jane Director',
          shareholderType: 'INDIVIDUAL',
          numberOfShares: 60,
          isCurrent: true,
        },
        {
          companyId,
          contactId: corp.id,
          name: 'Holding Corp Pte Ltd',
          shareholderType: 'CORPORATE',
          numberOfShares: 30,
          isCurrent: true,
        },
        { companyId, name: 'Old Shareholder', shareholderType: 'INDIVIDUAL', numberOfShares: 10, isCurrent: false },
      ],
    });
    return companyId;
  }

  async function keysFor(companyId: string, names?: string[]) {
    const candidates = await service.getCandidatesInfo(tenantId, companyId);
    const chosen = names ? candidates.candidates.filter((c) => names.includes(c.name)) : candidates.candidates;
    return chosen.map((c) => c.key);
  }

  async function queue(companyId: string, names?: string[], extra: { force?: boolean; now?: () => Date } = {}) {
    return service.queueRun(
      { tenantId, companyId, userId, entityKeys: await keysFor(companyId, names), force: extra.force },
      { autoStart: false, config: CONFIG, now: extra.now },
    );
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.LOG_LEVEL = 'silent';
    process.env.SENTROWEB_ENABLED = 'false';
    prisma = (await import('@/lib/prisma')).getPrisma();
    service = await import('@/services/sentroweb/check.service');

    suffix = randomUUID();
    tenantId = (await prisma.workspace.create({ data: { name: `Sentroweb ${suffix}`, slug: `sentroweb-${suffix}` } })).id;
    otherTenantId = (
      await prisma.workspace.create({ data: { name: `Sentroweb other ${suffix}`, slug: `sentroweb-other-${suffix}` } })
    ).id;
    userId = (
      await prisma.user.create({
        data: { tenantId, email: `runner-${suffix}@example.test`, passwordHash: 'not-used', firstName: 'Ria', lastName: 'Runner' },
      })
    ).id;
    otherCompanyId = (
      await prisma.company.create({ data: { tenantId: otherTenantId, uen: `O${suffix.slice(0, 8)}`, name: 'Other Tenant Co' } })
    ).id;
  });

  afterAll(async () => {
    if (previousLogLevel === undefined) delete process.env.LOG_LEVEL;
    else process.env.LOG_LEVEL = previousLogLevel;
    if (previousEnabled === undefined) delete process.env.SENTROWEB_ENABLED;
    else process.env.SENTROWEB_ENABLED = previousEnabled;
  });

  beforeEach(() => {
    memory.files.clear();
  });

  // --- schema -----------------------------------------------------------------------------------

  it('the database allows only one QUEUED or RUNNING run per company', async () => {
    const companyId = await makeCompany();
    const data = { tenantId, companyId, requestedById: userId, entityCount: 1 };
    await prisma.sentrowebCheckRun.create({ data: { ...data, status: 'QUEUED' } });
    await expect(prisma.sentrowebCheckRun.create({ data: { ...data, status: 'QUEUED' } })).rejects.toThrow();
    await expect(prisma.sentrowebCheckRun.create({ data: { ...data, status: 'RUNNING' } })).rejects.toThrow();
    // Finished runs are not limited.
    await prisma.sentrowebCheckRun.create({ data: { ...data, status: 'COMPLETED' } });
    await prisma.sentrowebCheckRun.create({ data: { ...data, status: 'FAILED' } });
  });

  // --- entity selection -------------------------------------------------------------------------

  describe('candidate entities', () => {
    it('lists the company, current directors and current shareholders, once each, with merged roles', async () => {
      const companyId = await makeFullCompany();
      const { candidates } = await service.getCandidatesInfo(tenantId, companyId);

      expect(candidates.map((c) => c.name)).toEqual([
        'Acme Screening Pte Ltd',
        'Jane Director',
        'Mike Managing',
        'Holding Corp Pte Ltd',
      ]);
      const byName = Object.fromEntries(candidates.map((c) => [c.name, c]));
      expect(byName['Acme Screening Pte Ltd']).toMatchObject({ entityKind: 'COMPANY', searchType: 'ENTITY', roles: ['COMPANY'] });
      expect(byName['Jane Director']).toMatchObject({ entityKind: 'INDIVIDUAL', searchType: 'INDIVIDUAL' });
      expect(byName['Jane Director'].roles.sort()).toEqual(['DIRECTOR', 'SHAREHOLDER']);
      expect(byName['Mike Managing']).toMatchObject({ roles: ['MANAGING_DIRECTOR'], searchType: 'INDIVIDUAL' });
      expect(byName['Holding Corp Pte Ltd']).toMatchObject({ entityKind: 'CORPORATE', searchType: 'ENTITY', roles: ['SHAREHOLDER'] });
    });

    it('leaves out the secretary, the CEO, a former director and a former shareholder', async () => {
      const companyId = await makeFullCompany();
      const names = (await service.getCandidatesInfo(tenantId, companyId)).candidates.map((c) => c.name);
      for (const excluded of ['Sam Secretary', 'Cathy Chief', 'Former Director', 'Old Shareholder']) {
        expect(names).not.toContain(excluded);
      }
    });

    it('merges the same person without a contact by id number, then by name', async () => {
      const companyId = await makeCompany();
      await prisma.companyOfficer.create({
        data: { companyId, role: 'DIRECTOR', name: 'Dee Dup', identificationType: 'NRIC', identificationNumber: 's7654321b', isCurrent: true },
      });
      await prisma.companyShareholder.create({
        data: { companyId, name: 'Dee Dup', identificationType: 'NRIC', identificationNumber: 'S7654321B ', numberOfShares: 1, isCurrent: true },
      });
      await prisma.companyOfficer.create({ data: { companyId, role: 'DIRECTOR', name: 'Nora  Name', isCurrent: true } });
      await prisma.companyShareholder.create({ data: { companyId, name: 'nora name', numberOfShares: 1, isCurrent: true } });

      const { candidates } = await service.getCandidatesInfo(tenantId, companyId);
      expect(candidates.filter((c) => c.name === 'Dee Dup')).toHaveLength(1);
      expect(candidates.filter((c) => /nora/i.test(c.name))).toHaveLength(1);
      expect(candidates.find((c) => c.name === 'Dee Dup')?.roles.sort()).toEqual(['DIRECTOR', 'SHAREHOLDER']);
    });

    describe('one person, one search (mixed linked and unlinked records)', () => {
      async function contact(name: string, idNumber: string | null) {
        return prisma.contact.create({
          data: {
            tenantId,
            contactType: 'INDIVIDUAL',
            fullName: name,
            ...(idNumber ? { identificationType: 'NRIC' as const, identificationNumber: idNumber } : {}),
          },
        });
      }
      const nric = () => `S${Math.floor(1_000_000 + Math.random() * 8_999_999)}${'ABCDEFGHJK'[Math.floor(Math.random() * 10)]}`;
      const people = async (companyId: string) =>
        (await service.getCandidatesInfo(tenantId, companyId)).candidates.filter((c) => c.entityKind !== 'COMPANY');

      it('merges a contact-linked director with an unlinked shareholder that has the same NRIC', async () => {
        const companyId = await makeCompany();
        const id = nric();
        const linked = await contact('Lin Linked', id);
        await prisma.companyOfficer.create({ data: { companyId, contactId: linked.id, role: 'DIRECTOR', name: 'Lin Linked', isCurrent: true } });
        await prisma.companyShareholder.create({
          data: { companyId, name: 'L. Linked (as on share register)', identificationType: 'NRIC', identificationNumber: ` ${id.toLowerCase()} `, numberOfShares: 1, isCurrent: true },
        });
        const found = await people(companyId);
        expect(found).toHaveLength(1);
        expect(found[0].roles.sort()).toEqual(['DIRECTOR', 'SHAREHOLDER']);
      });

      it('merges in either order and with the contact on the shareholder side', async () => {
        const companyId = await makeCompany();
        const id = nric();
        const linked = await contact('Sue Shareholder', id);
        await prisma.companyShareholder.create({ data: { companyId, contactId: linked.id, name: 'Sue Shareholder', numberOfShares: 1, isCurrent: true } });
        await prisma.companyOfficer.create({
          data: { companyId, role: 'MANAGING_DIRECTOR', name: 'Sue S.', identificationType: 'NRIC', identificationNumber: id, isCurrent: true },
        });
        const found = await people(companyId);
        expect(found).toHaveLength(1);
        expect(found[0].roles.sort()).toEqual(['MANAGING_DIRECTOR', 'SHAREHOLDER']);
      });

      it('merges an unlinked record with a linked one by name when no id number conflicts', async () => {
        const companyId = await makeCompany();
        const linked = await contact('Nan Nameonly', nric());
        await prisma.companyOfficer.create({ data: { companyId, contactId: linked.id, role: 'DIRECTOR', name: 'Nan Nameonly', isCurrent: true } });
        await prisma.companyShareholder.create({ data: { companyId, name: 'nan  nameonly', numberOfShares: 1, isCurrent: true } });
        expect(await people(companyId)).toHaveLength(1);
      });

      it('keeps two people apart when their id numbers differ, even with the same name', async () => {
        const companyId = await makeCompany();
        await prisma.companyOfficer.create({
          data: { companyId, role: 'DIRECTOR', name: 'Tan Wei', identificationType: 'NRIC', identificationNumber: 'S1111111A', isCurrent: true },
        });
        await prisma.companyShareholder.create({
          data: { companyId, name: 'Tan Wei', identificationType: 'NRIC', identificationNumber: 'S2222222B', numberOfShares: 1, isCurrent: true },
        });
        expect(await people(companyId)).toHaveLength(2);
      });

      it('never chains two different people together through a name-only record', async () => {
        const companyId = await makeCompany();
        await prisma.companyOfficer.create({
          data: { companyId, role: 'DIRECTOR', name: 'Lee Chain', identificationType: 'NRIC', identificationNumber: 'S3333333C', isCurrent: true },
        });
        await prisma.companyShareholder.create({ data: { companyId, name: 'Lee Chain', numberOfShares: 1, isCurrent: true } });
        await prisma.companyOfficer.create({
          data: { companyId, role: 'ALTERNATE_DIRECTOR', name: 'Lee Chain', identificationType: 'NRIC', identificationNumber: 'S4444444D', isCurrent: true },
        });
        const found = await people(companyId);
        expect(found).toHaveLength(2);
        expect(found.flatMap((c) => c.roles).sort()).toEqual(['ALTERNATE_DIRECTOR', 'DIRECTOR', 'SHAREHOLDER']);
      });

      it('keeps two different contacts with the same name apart', async () => {
        const companyId = await makeCompany();
        const one = await contact('Sam Same', null);
        const two = await contact('Sam Same', null);
        await prisma.companyOfficer.create({ data: { companyId, contactId: one.id, role: 'DIRECTOR', name: 'Sam Same', isCurrent: true } });
        await prisma.companyShareholder.create({ data: { companyId, contactId: two.id, name: 'Sam Same', numberOfShares: 1, isCurrent: true } });
        expect(await people(companyId)).toHaveLength(2);
      });

      it.each([
        ['alias sorts before the name-only record', 'Aa Alias', 'Zee Name'],
        ['alias sorts after the name-only record', 'Zee Alias', 'Aa Name'],
      ])('a late record bridges two groups into one person (%s)', async (_label, aliasName, plainName) => {
        const companyId = await makeCompany();
        await prisma.companyOfficer.create({
          data: { companyId, role: 'DIRECTOR', name: aliasName, identificationType: 'NRIC', identificationNumber: 'S7654321B', isCurrent: true },
        });
        await prisma.companyOfficer.create({ data: { companyId, role: 'MANAGING_DIRECTOR', name: plainName, isCurrent: true } });
        await prisma.companyShareholder.create({
          data: { companyId, name: plainName, identificationType: 'NRIC', identificationNumber: 'S7654321B', numberOfShares: 1, isCurrent: true },
        });
        const found = await people(companyId);
        expect(found).toHaveLength(1);
        expect(found[0].roles.sort()).toEqual(['DIRECTOR', 'MANAGING_DIRECTOR', 'SHAREHOLDER']);

        const client = makeClient();
        const { runId } = await queue(companyId);
        await service.processRun(runId, { client, config: CONFIG });
        expect(client.searches).toHaveLength(2); // the company and the person, once
      });

      it('a late contact link bridges two groups that had no id number', async () => {
        const companyId = await makeCompany();
        const linked = await contact('Cora Contact', null);
        await prisma.companyOfficer.create({ data: { companyId, contactId: linked.id, role: 'DIRECTOR', name: 'Cora Contact', isCurrent: true } });
        await prisma.companyOfficer.create({ data: { companyId, role: 'NOMINEE_DIRECTOR', name: 'Cora C. Alias', isCurrent: true } });
        await prisma.companyShareholder.create({ data: { companyId, contactId: linked.id, name: 'Cora C. Alias', numberOfShares: 1, isCurrent: true } });
        const found = await people(companyId);
        expect(found).toHaveLength(1);
        expect(found[0].roles.sort()).toEqual(['DIRECTOR', 'NOMINEE_DIRECTOR', 'SHAREHOLDER']);
      });

      it('a bridge never joins groups whose id numbers differ: the name-only record joins exactly one', async () => {
        const companyId = await makeCompany();
        await prisma.companyOfficer.create({
          data: { companyId, role: 'DIRECTOR', name: 'Kim Both', identificationType: 'NRIC', identificationNumber: 'S5555555E', isCurrent: true },
        });
        await prisma.companyOfficer.create({
          data: { companyId, role: 'ALTERNATE_DIRECTOR', name: 'Kim Both', identificationType: 'NRIC', identificationNumber: 'S6666666F', isCurrent: true },
        });
        await prisma.companyShareholder.create({ data: { companyId, name: 'Kim Both', numberOfShares: 1, isCurrent: true } });
        const found = await people(companyId);
        expect(found).toHaveLength(2);
        expect(found.flatMap((c) => c.roles).sort()).toEqual(['ALTERNATE_DIRECTOR', 'DIRECTOR', 'SHAREHOLDER']);
        const keys = (await service.getCandidatesInfo(tenantId, companyId)).candidates.map((c) => c.key);
        expect(new Set(keys).size).toBe(keys.length);
      });

      it('does not merge an individual with a corporate holder of the same name', async () => {
        const companyId = await makeCompany();
        await prisma.companyOfficer.create({ data: { companyId, role: 'DIRECTOR', name: 'Alpha Beta', isCurrent: true } });
        await prisma.companyShareholder.create({
          data: { companyId, name: 'Alpha Beta', shareholderType: 'CORPORATE', numberOfShares: 1, isCurrent: true },
        });
        expect(await people(companyId)).toHaveLength(2);
      });

      it('gives the same keys for the same data, and a queue run searches the person once', async () => {
        const companyId = await makeCompany();
        const id = nric();
        const linked = await contact('Una Once', id);
        await prisma.companyOfficer.create({ data: { companyId, contactId: linked.id, role: 'DIRECTOR', name: 'Una Once', isCurrent: true } });
        await prisma.companyShareholder.create({
          data: { companyId, name: 'Una Once', identificationType: 'NRIC', identificationNumber: id, numberOfShares: 1, isCurrent: true },
        });
        const first = (await service.getCandidatesInfo(tenantId, companyId)).candidates.map((c) => c.key);
        const second = (await service.getCandidatesInfo(tenantId, companyId)).candidates.map((c) => c.key);
        expect(second).toEqual(first);
        expect(new Set(first).size).toBe(first.length);

        const client = makeClient();
        const { runId } = await queue(companyId);
        await service.processRun(runId, { client, config: CONFIG });
        expect(client.searches.filter((search) => search.name === 'Una Once')).toHaveLength(1);
        expect(client.searches).toHaveLength(2); // the company and Una
      });
    });

    describe('country and date of birth sent with an individual', () => {
      async function person(
        name: string,
        data: { nationality?: string; dateOfBirth?: Date; idNumber?: string } = {},
      ) {
        return prisma.contact.create({
          data: {
            tenantId,
            contactType: 'INDIVIDUAL',
            fullName: name,
            ...(data.nationality ? { nationality: data.nationality } : {}),
            ...(data.dateOfBirth ? { dateOfBirth: data.dateOfBirth } : {}),
            ...(data.idNumber ? { identificationType: 'NRIC' as const, identificationNumber: data.idNumber } : {}),
          },
        });
      }
      const detailsOf = async (companyId: string, name: string) => {
        const candidates = await service.getCandidatesInfo(tenantId, companyId);
        return candidates.candidates.find((c) => c.name === name)?.searchDetails;
      };
      const rowOf = async (runId: string, name: string) =>
        prisma.sentrowebCheckResult.findFirstOrThrow({ where: { runId, name } });

      it('takes the nationality and birth date of the linked contact, never returning the date itself', async () => {
        const companyId = await makeCompany();
        const contact = await person('Dana Details', { nationality: 'Singaporean', dateOfBirth: new Date('1980-02-29T00:00:00Z') });
        await prisma.companyOfficer.create({
          data: { companyId, contactId: contact.id, role: 'DIRECTOR', name: 'Dana Details', nationality: 'Malaysian', isCurrent: true },
        });
        // The contact wins over the officer row, like the identification number does.
        expect(await detailsOf(companyId, 'Dana Details')).toEqual({ country: 'Singapore', dateOfBirth: true, gender: null });
        const info = await service.getCandidatesInfo(tenantId, companyId);
        expect(JSON.stringify(info)).not.toContain('1980');
        expect(JSON.stringify(info)).not.toContain('requestedDateOfBirth');
      });

      it('falls back to the nationality on the record when there is no contact', async () => {
        const companyId = await makeCompany();
        await prisma.companyOfficer.create({
          data: { companyId, role: 'DIRECTOR', name: 'Rina Record', nationality: 'MY', isCurrent: true },
        });
        await prisma.companyShareholder.create({
          data: { companyId, name: 'Sam Sharer', shareholderType: 'INDIVIDUAL', nationality: 'Indian', numberOfShares: 1, isCurrent: true },
        });
        expect(await detailsOf(companyId, 'Rina Record')).toEqual({ country: 'Malaysia', dateOfBirth: false, gender: null });
        expect(await detailsOf(companyId, 'Sam Sharer')).toEqual({ country: 'India', dateOfBirth: false, gender: null });
      });

      it('leaves the country blank when it cannot be mapped with certainty, and never fails', async () => {
        const companyId = await makeCompany();
        for (const [name, nationality] of [['Una Unknown', 'Atlantean'], ['Dom Dominican', 'Dominican'], ['Eva Empty', '  ']]) {
          await prisma.companyOfficer.create({ data: { companyId, role: 'DIRECTOR', name, nationality, isCurrent: true } });
        }
        for (const name of ['Una Unknown', 'Dom Dominican', 'Eva Empty']) {
          expect(await detailsOf(companyId, name)).toEqual({ country: null, dateOfBirth: false, gender: null });
        }
      });

      it('leaves a field blank when the records of one person disagree', async () => {
        const companyId = await makeCompany();
        const id = `S${Math.floor(1_000_000 + Math.random() * 8_999_999)}K`;
        await prisma.companyOfficer.create({
          data: { companyId, role: 'DIRECTOR', name: 'Dee Disagree', identificationType: 'NRIC', identificationNumber: id, nationality: 'Singaporean', isCurrent: true },
        });
        await prisma.companyShareholder.create({
          data: { companyId, name: 'Dee Disagree', shareholderType: 'INDIVIDUAL', identificationType: 'NRIC', identificationNumber: id, nationality: 'Malaysian', numberOfShares: 1, isCurrent: true },
        });
        // Agreeing records keep the value; a stated but unmappable one counts as a disagreement.
        await prisma.companyOfficer.create({
          data: { companyId, role: 'DIRECTOR', name: 'Ann Agree', identificationType: 'NRIC', identificationNumber: `${id.slice(0, -1)}A`, nationality: 'Singaporean', isCurrent: true },
        });
        await prisma.companyShareholder.create({
          data: { companyId, name: 'Ann Agree', shareholderType: 'INDIVIDUAL', identificationType: 'NRIC', identificationNumber: `${id.slice(0, -1)}A`, nationality: 'SG', numberOfShares: 1, isCurrent: true },
        });
        await prisma.companyOfficer.create({
          data: { companyId, role: 'DIRECTOR', name: 'Una Partial', identificationType: 'NRIC', identificationNumber: `${id.slice(0, -1)}B`, nationality: 'Singaporean', isCurrent: true },
        });
        await prisma.companyShareholder.create({
          data: { companyId, name: 'Una Partial', shareholderType: 'INDIVIDUAL', identificationType: 'NRIC', identificationNumber: `${id.slice(0, -1)}B`, nationality: 'Atlantean', numberOfShares: 1, isCurrent: true },
        });
        expect((await detailsOf(companyId, 'Dee Disagree'))?.country).toBeNull();
        expect((await detailsOf(companyId, 'Ann Agree'))?.country).toBe('Singapore');
        expect((await detailsOf(companyId, 'Una Partial'))?.country).toBeNull();
      });

      it('never sends details for the company or a corporate shareholder, and ignores an implausible birth date', async () => {
        const companyId = await makeCompany();
        const corp = await prisma.contact.create({
          data: { tenantId, contactType: 'CORPORATE', fullName: 'Corp Holder Pte Ltd', corporateName: 'Corp Holder Pte Ltd', corporateUen: `201${randomUUID().slice(0, 6)}Z`, nationality: 'Singaporean' },
        });
        await prisma.companyShareholder.create({
          data: { companyId, contactId: corp.id, name: 'Corp Holder Pte Ltd', shareholderType: 'CORPORATE', numberOfShares: 1, isCurrent: true },
        });
        const future = await person('Fay Future', { nationality: 'Singaporean', dateOfBirth: new Date('2999-01-01T00:00:00Z') });
        const ancient = await person('Abe Ancient', { dateOfBirth: new Date('1850-01-01T00:00:00Z') });
        for (const [contact, name] of [[future, 'Fay Future'], [ancient, 'Abe Ancient']] as const) {
          await prisma.companyOfficer.create({ data: { companyId, contactId: contact.id, role: 'DIRECTOR', name, isCurrent: true } });
        }
        const none = { country: null, dateOfBirth: false, gender: null };
        expect(await detailsOf(companyId, 'Test Holdings Pte Ltd')).toEqual(none);
        expect(await detailsOf(companyId, 'Corp Holder Pte Ltd')).toEqual(none);
        expect(await detailsOf(companyId, 'Fay Future')).toEqual({ ...none, country: 'Singapore' });
        expect(await detailsOf(companyId, 'Abe Ancient')).toEqual(none);
      });

      it('stores what the run will send, passes exactly that to the client, and the API shows only yes/no for the date', async () => {
        const companyId = await makeCompany();
        const contact = await person('Gia Given', { nationality: 'Singaporean', dateOfBirth: new Date('1990-07-15T00:00:00Z') });
        await prisma.companyOfficer.create({ data: { companyId, contactId: contact.id, role: 'DIRECTOR', name: 'Gia Given', isCurrent: true } });
        await prisma.companyOfficer.create({ data: { companyId, role: 'DIRECTOR', name: 'Nora Nameonly', isCurrent: true } });
        const { runId } = await queue(companyId, ['Gia Given', 'Nora Nameonly']);
        expect(await rowOf(runId, 'Gia Given')).toMatchObject({ requestedCountry: 'Singapore', requestedDateOfBirth: '1990-07-15' });
        expect(await rowOf(runId, 'Nora Nameonly')).toMatchObject({ requestedCountry: null, requestedDateOfBirth: null });

        const client = makeClient();
        await service.processRun(runId, { client, config: CONFIG });
        expect(client.searches.find((s) => s.name === 'Gia Given')).toMatchObject({ country: 'Singapore', dateOfBirth: '1990-07-15' });
        expect(client.searches.find((s) => s.name === 'Nora Nameonly')).toMatchObject({ country: null, dateOfBirth: null });
        const run = await prisma.sentrowebCheckRun.findUniqueOrThrow({ where: { id: runId }, include: { results: true } });
        expect(run.overallResult).toBe('CLEAR');

        const detail = await service.getRun(tenantId, companyId, runId);
        const dto = detail.results?.find((r) => r.name === 'Gia Given');
        expect(dto?.searchDetails).toEqual({ country: 'Singapore', dateOfBirth: true, gender: null });
        expect(JSON.stringify(detail)).not.toContain('1990-07-15');
      });

      it('takes MALE or FEMALE from the contact, never OTHER, never from a record without a contact', async () => {
        const companyId = await makeCompany();
        const male = await prisma.contact.create({ data: { tenantId, contactType: 'INDIVIDUAL', fullName: 'Max Male', gender: 'MALE' } });
        const female = await prisma.contact.create({ data: { tenantId, contactType: 'INDIVIDUAL', fullName: 'Fay Female', gender: 'FEMALE' } });
        const other = await prisma.contact.create({ data: { tenantId, contactType: 'INDIVIDUAL', fullName: 'Oli Other', gender: 'OTHER' } });
        for (const [contact, name] of [[male, 'Max Male'], [female, 'Fay Female'], [other, 'Oli Other']] as const) {
          await prisma.companyOfficer.create({ data: { companyId, contactId: contact.id, role: 'DIRECTOR', name, isCurrent: true } });
        }
        await prisma.companyOfficer.create({ data: { companyId, role: 'DIRECTOR', name: 'Una Unlinked', isCurrent: true } });
        expect((await detailsOf(companyId, 'Max Male'))?.gender).toBe('MALE');
        expect((await detailsOf(companyId, 'Fay Female'))?.gender).toBe('FEMALE');
        expect((await detailsOf(companyId, 'Oli Other'))?.gender).toBeNull();
        expect((await detailsOf(companyId, 'Una Unlinked'))?.gender).toBeNull();
      });

      it('stores the gender and the fuzzy choice with the run and passes both to the client', async () => {
        const companyId = await makeCompany();
        const contact = await prisma.contact.create({
          data: { tenantId, contactType: 'INDIVIDUAL', fullName: 'Gus Gender', gender: 'FEMALE', nationality: 'Singaporean' },
        });
        await prisma.companyOfficer.create({ data: { companyId, contactId: contact.id, role: 'DIRECTOR', name: 'Gus Gender', isCurrent: true } });
        const keys = await keysFor(companyId, ['Gus Gender']);
        const { runId } = await service.queueRun({ tenantId, companyId, userId, entityKeys: keys, fuzzy: true }, { autoStart: false, config: CONFIG });
        expect(await rowOf(runId, 'Gus Gender')).toMatchObject({ requestedGender: 'FEMALE', requestedCountry: 'Singapore' });
        expect(await prisma.sentrowebCheckRun.findUniqueOrThrow({ where: { id: runId } })).toMatchObject({ fuzzy: true });

        const client = makeClient();
        await service.processRun(runId, { client, config: CONFIG });
        expect(client.searches[0]).toMatchObject({ name: 'Gus Gender', gender: 'FEMALE', fuzzy: true });
        const detail = await service.getRun(tenantId, companyId, runId);
        expect(detail.fuzzy).toBe(true);
        expect(detail.results?.[0].searchDetails).toEqual({ country: 'Singapore', dateOfBirth: false, gender: 'FEMALE' });
        expect(detail.results?.[0].searchDetailsSent).toBe(true);
      });

      it('is not fuzzy unless asked, and a fuzzy answer for a plain search (or the reverse) is never CLEAR', async () => {
        const companyId = await makeCompany();
        await prisma.companyOfficer.create({ data: { companyId, role: 'DIRECTOR', name: 'Pat Plain', isCurrent: true } });
        const { runId } = await queue(companyId, ['Pat Plain']);
        expect(await prisma.sentrowebCheckRun.findUniqueOrThrow({ where: { id: runId } })).toMatchObject({ fuzzy: false });
        const client = makeClient();
        const loaded = loadCase('individual-clear');
        loaded.json[0].name = 'Pat Plain';
        loaded.json[0].fuzzyValue = true; // the answer says fuzzy, the run did not ask for it
        client.scripts.set('Pat Plain', {
          outcome: { json: loaded.json, domTitles: loaded.titles, pdf: Buffer.from('%PDF-1.4 x'), png: Buffer.from('89504e470d0a1a0a', 'hex') },
        });
        await service.processRun(runId, { client, config: CONFIG });
        expect(client.searches[0].fuzzy).toBe(false);
        expect(await rowOf(runId, 'Pat Plain')).toMatchObject({ status: 'ERROR', errorCode: 'RESULT_MISMATCH' });
      });

      it('a possible match that echoes another country, birth date or search mode stays POSSIBLE_MATCH but its details are not shown as sent', async () => {
        const companyId = await makeCompany();
        const contact = await person('Vera Verify', { nationality: 'Singaporean', dateOfBirth: new Date('1980-01-01T00:00:00Z') });
        await prisma.companyOfficer.create({ data: { companyId, contactId: contact.id, role: 'DIRECTOR', name: 'Vera Verify', isCurrent: true } });
        const cases: Array<[string, Record<string, unknown>, boolean]> = [
          ['exact echo', {}, true],
          ['other country', { country: 'Malaysia' }, false],
          ['other birth date', { dateOfBirth: '1981-01-01' }, false],
          ['other search mode', { fuzzyValue: true }, false],
        ];
        for (const [label, change, verified] of cases) {
          const { runId } = await queue(companyId, ['Vera Verify'], { force: true });
          const client = makeClient();
          const loaded = loadCase('individual-match');
          Object.assign(loaded.json[0], { name: 'Vera Verify', country: 'Singapore', dateOfBirth: '1980-01-01', fuzzyValue: false }, change);
          client.scripts.set('Vera Verify', {
            outcome: { json: loaded.json, domTitles: loaded.titles, pdf: Buffer.from('%PDF-1.4 x'), png: Buffer.from('89504e470d0a1a0a', 'hex') },
          });
          await service.processRun(runId, { client, config: CONFIG });
          const dto = (await service.getRun(tenantId, companyId, runId)).results?.[0];
          expect(dto, label).toMatchObject({ status: 'POSSIBLE_MATCH', searchDetailsSent: verified });
          expect((await rowOf(runId, 'Vera Verify')).searchEchoVerified, label).toBe(verified);
        }
      });

      it('shows requested details as unconfirmed for a result that never ran or ended in an error', async () => {
        const companyId = await makeCompany();
        const contact = await person('Nia NotRun', { nationality: 'Singaporean', dateOfBirth: new Date('1985-05-05T00:00:00Z') });
        await prisma.companyOfficer.create({ data: { companyId, contactId: contact.id, role: 'DIRECTOR', name: 'Nia NotRun', isCurrent: true } });
        const { runId } = await queue(companyId, ['Nia NotRun']);
        const queued = await service.getRun(tenantId, companyId, runId);
        expect(queued.results?.[0]).toMatchObject({ status: 'NOT_RUN', searchDetailsSent: false });
        expect(queued.results?.[0].searchDetails).toMatchObject({ country: 'Singapore', dateOfBirth: true });

        // A search cancelled before SEARCH ran sends nothing: still unconfirmed.
        const client = makeClient();
        client.scripts.set('Nia NotRun', { throws: new SentrowebError('LAYOUT_CHANGED') });
        await service.processRun(runId, { client, config: CONFIG });
        const failed = await service.getRun(tenantId, companyId, runId);
        expect(failed.results?.[0]).toMatchObject({ status: 'ERROR', searchDetailsSent: false });
      });

      it('a response that echoes another country or birth date is ERROR RESULT_MISMATCH, never CLEAR', async () => {
        const companyId = await makeCompany();
        const contact = await person('Mia Mismatch', { nationality: 'Singaporean', dateOfBirth: new Date('1990-07-15T00:00:00Z') });
        await prisma.companyOfficer.create({ data: { companyId, contactId: contact.id, role: 'DIRECTOR', name: 'Mia Mismatch', isCurrent: true } });
        const { runId } = await queue(companyId, ['Mia Mismatch']);
        const client = makeClient();
        const loaded = loadCase('individual-clear');
        loaded.json[0].name = 'Mia Mismatch';
        loaded.json[0].country = 'Malaysia'; // not what was sent
        loaded.json[0].dateOfBirth = '1990-07-15';
        client.scripts.set('Mia Mismatch', {
          outcome: { json: loaded.json, domTitles: loaded.titles, pdf: Buffer.from('%PDF-1.4 x'), png: Buffer.from('89504e470d0a1a0a', 'hex') },
        });
        await service.processRun(runId, { client, config: CONFIG });
        expect(await rowOf(runId, 'Mia Mismatch')).toMatchObject({ status: 'ERROR', errorCode: 'RESULT_MISMATCH' });
      });
    });

    it('does not find another tenant’s company', async () => {
      await expect(service.getCandidatesInfo(tenantId, otherCompanyId)).rejects.toMatchObject({ statusCode: 404 });
      await expect(
        service.queueRun(
          { tenantId, companyId: otherCompanyId, userId, entityKeys: ['x'] },
          { autoStart: false, config: CONFIG },
        ),
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('reports configuration, the active run and the cooldown without exposing sources', async () => {
      const companyId = await makeFullCompany();
      const info = await service.getCandidatesInfo(tenantId, companyId);
      expect(info).toMatchObject({ maxEntities: 10, creditsPerSearch: 1, activeRunId: null, cooldownUntil: null });
      for (const candidate of info.candidates) {
        expect(candidate).not.toHaveProperty('sourceRefs');
        expect(candidate).not.toHaveProperty('contactId');
        expect(candidate.key).toMatch(/^[0-9a-f]{24}$/);
      }
    });
  });

  // --- queueing rules ---------------------------------------------------------------------------

  describe('queueing', () => {
    it('creates a QUEUED run with one NOT_RUN row per selected entity, in order, and audits it', async () => {
      const companyId = await makeFullCompany();
      const { runId } = await queue(companyId);
      const run = await prisma.sentrowebCheckRun.findUniqueOrThrow({ where: { id: runId }, include: { results: { orderBy: { position: 'asc' } } } });

      expect(run).toMatchObject({ status: 'QUEUED', tenantId, companyId, requestedById: userId, entityCount: 4, creditsUsed: 0 });
      expect(run.results.map((r) => [r.position, r.name, r.status])).toEqual([
        [0, 'Acme Screening Pte Ltd', 'NOT_RUN'],
        [1, 'Jane Director', 'NOT_RUN'],
        [2, 'Mike Managing', 'NOT_RUN'],
        [3, 'Holding Corp Pte Ltd', 'NOT_RUN'],
      ]);
      const audit = await prisma.auditLog.findMany({ where: { entityType: 'SentrowebCheckRun', entityId: runId } });
      expect(audit.map((row) => row.action)).toEqual(['CREATE']);
    });

    it('stores only the chosen entities', async () => {
      const companyId = await makeFullCompany();
      const { runId } = await queue(companyId, ['Jane Director']);
      const results = await prisma.sentrowebCheckResult.findMany({ where: { runId } });
      expect(results.map((r) => r.name)).toEqual(['Jane Director']);
    });

    it('rejects 11 selected entities with TOO_MANY_ENTITIES before touching anything', async () => {
      const companyId = await makeFullCompany();
      const before = await prisma.sentrowebCheckRun.count({ where: { companyId } });
      const attempt = service.queueRun(
        { tenantId, companyId, userId, entityKeys: Array.from({ length: 11 }, (_, i) => `key-${i}`) },
        { autoStart: false, config: CONFIG },
      );
      await expect(attempt).rejects.toMatchObject({ code: 'TOO_MANY_ENTITIES', httpStatus: 422 });
      expect(await prisma.sentrowebCheckRun.count({ where: { companyId } })).toBe(before);
    });

    it('accepts exactly 10 entities', async () => {
      const companyId = await makeCompany();
      for (let i = 0; i < 9; i += 1) {
        await prisma.companyShareholder.create({
          data: { companyId, name: `Holder Number${String.fromCharCode(65 + i)}`, numberOfShares: 1, isCurrent: true },
        });
      }
      const { runId } = await queue(companyId);
      expect(await prisma.sentrowebCheckResult.count({ where: { runId } })).toBe(10);
    });

    it('rejects an empty selection and keys that are not current candidates', async () => {
      const companyId = await makeFullCompany();
      await expect(
        service.queueRun({ tenantId, companyId, userId, entityKeys: [] }, { autoStart: false, config: CONFIG }),
      ).rejects.toMatchObject({ code: 'NO_ENTITIES_SELECTED', httpStatus: 422 });
      await expect(
        service.queueRun({ tenantId, companyId, userId, entityKeys: ['0'.repeat(24)] }, { autoStart: false, config: CONFIG }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('answers 503 SENTROWEB_NOT_CONFIGURED without a configuration', async () => {
      const companyId = await makeFullCompany();
      await expect(
        service.queueRun({ tenantId, companyId, userId, entityKeys: await keysFor(companyId) }, { autoStart: false, config: null }),
      ).rejects.toMatchObject({ code: 'SENTROWEB_NOT_CONFIGURED', httpStatus: 503 });
    });

    it('allows one active run per company: a second request is ALREADY_RUNNING (409)', async () => {
      const companyId = await makeFullCompany();
      const first = await queue(companyId);
      await expect(queue(companyId)).rejects.toMatchObject({ code: 'ALREADY_RUNNING', httpStatus: 409 });
      expect((await service.getCandidatesInfo(tenantId, companyId)).activeRunId).toBe(first.runId);
      // another company is unaffected
      await queue(await makeFullCompany());
    });

    it('two simultaneous requests create exactly one run', async () => {
      const companyId = await makeFullCompany();
      const keys = await keysFor(companyId);
      const attempts = await Promise.allSettled(
        [1, 2, 3].map(() =>
          service.queueRun({ tenantId, companyId, userId, entityKeys: keys }, { autoStart: false, config: CONFIG }),
        ),
      );
      expect(attempts.filter((a) => a.status === 'fulfilled')).toHaveLength(1);
      for (const rejected of attempts.filter((a): a is PromiseRejectedResult => a.status === 'rejected')) {
        expect(rejected.reason).toMatchObject({ code: 'ALREADY_RUNNING' });
      }
      expect(await prisma.sentrowebCheckRun.count({ where: { companyId } })).toBe(1);
    });

    it('enforces a 10-minute cooldown after a run that spent credits, unless forced', async () => {
      const companyId = await makeFullCompany();
      const client = makeClient();
      const { runId } = await queue(companyId, ['Jane Director']);
      await service.processRun(runId, { client, config: CONFIG });
      expect((await prisma.sentrowebCheckRun.findUniqueOrThrow({ where: { id: runId } })).creditsUsed).toBe(1);

      await expect(queue(companyId)).rejects.toMatchObject({ code: 'COOLDOWN', httpStatus: 409 });
      const info = await service.getCandidatesInfo(tenantId, companyId);
      expect(info.cooldownUntil).not.toBeNull();

      const forced = await queue(companyId, undefined, { force: true });
      expect(forced.runId).toBeTruthy();
    });

    it('lets a new run start once the cooldown has passed', async () => {
      const companyId = await makeFullCompany();
      const { runId } = await queue(companyId, ['Jane Director']);
      await service.processRun(runId, { client: makeClient(), config: CONFIG });
      const later = () => new Date(Date.now() + 11 * 60 * 1000);
      await expect(queue(companyId, undefined, { now: later })).resolves.toHaveProperty('runId');
    });

    it('keeps the cooldown after a run whose first search was interrupted in flight (credit uncertain)', async () => {
      const companyId = await makeFullCompany();
      const { runId } = await queue(companyId, ['Jane Director']);
      // The worker died after the search was marked submitted and before any credit was counted.
      await prisma.sentrowebCheckRun.update({
        where: { id: runId },
        data: {
          status: 'RUNNING',
          claimToken: randomUUID(),
          startedAt: new Date(Date.now() - 20 * 60 * 1000),
          leaseExpiresAt: new Date(Date.now() - 60 * 1000),
          creditsUsed: 0,
        },
      });
      await prisma.sentrowebCheckResult.updateMany({ where: { runId }, data: { searchSubmittedAt: new Date() } });
      await service.recoverStaleRuns();
      const run = await prisma.sentrowebCheckRun.findUniqueOrThrow({ where: { id: runId } });
      expect(run).toMatchObject({ status: 'FAILED', errorCode: 'INTERRUPTED', creditsUsed: 0 });

      await expect(queue(companyId)).rejects.toMatchObject({ code: 'COOLDOWN', httpStatus: 409 });
      expect((await service.getCandidatesInfo(tenantId, companyId)).cooldownUntil).not.toBeNull();
      await expect(queue(companyId, undefined, { force: true })).resolves.toHaveProperty('runId');
    });

    it('keeps the cooldown after a submitted search that timed out (credit spent, no result)', async () => {
      const companyId = await makeFullCompany();
      const client = makeClient();
      client.scripts.set('Jane Director', { throws: new SentrowebError('TIMEOUT', { searchSubmitted: true }) });
      const { runId } = await queue(companyId, ['Jane Director']);
      await service.processRun(runId, { client, config: CONFIG });
      await expect(queue(companyId)).rejects.toMatchObject({ code: 'COOLDOWN' });
    });

    it('does not apply the cooldown after a run that spent no credits', async () => {
      const companyId = await makeFullCompany();
      const client = makeClient();
      client.openError = new SentrowebError('LOGIN_FAILED');
      const { runId } = await queue(companyId);
      await service.processRun(runId, { client, config: CONFIG });
      expect((await prisma.sentrowebCheckRun.findUniqueOrThrow({ where: { id: runId } })).creditsUsed).toBe(0);
      await expect(queue(companyId)).resolves.toHaveProperty('runId');
    });
  });

  // --- processing -------------------------------------------------------------------------------

  describe('processing a run', () => {
    it('stores each result, files the PDFs and reports CLEAR when everything is clear', async () => {
      const companyId = await makeFullCompany();
      const client = makeClient();
      const { runId } = await queue(companyId);
      const outcome = await service.processRun(runId, { client, config: CONFIG });

      expect(outcome).toEqual({ status: 'completed', errorCode: null });
      const run = await prisma.sentrowebCheckRun.findUniqueOrThrow({ where: { id: runId }, include: { results: { orderBy: { position: 'asc' } } } });
      expect(run).toMatchObject({ status: 'COMPLETED', overallResult: 'CLEAR', creditsUsed: 4, balanceBefore: 100, claimToken: null, leaseExpiresAt: null });
      expect(run.finishedAt).not.toBeNull();
      expect(run.results.every((r) => r.status === 'CLEAR' && r.documentId && r.evidencePngKey && r.checkedAt)).toBe(true);
      expect(client.searches.map((s) => [s.name, s.searchType])).toEqual([
        ['Acme Screening Pte Ltd', 'ENTITY'],
        ['Jane Director', 'INDIVIDUAL'],
        ['Mike Managing', 'INDIVIDUAL'],
        ['Holding Corp Pte Ltd', 'ENTITY'],
      ]);
      expect(client.openSession).toHaveBeenCalledTimes(1);
      expect(client.openSession.mock.calls[0][1]).toMatchObject({ requiredCredits: 4 });
      expect(client.closeCalls).toBe(1);
    });

    it('files each PDF as a SENTROWEB_REPORT company Document with the evidence screenshot beside it', async () => {
      const companyId = await makeFullCompany();
      const { runId } = await queue(companyId, ['Jane Director']);
      await service.processRun(runId, { client: makeClient(), config: CONFIG });

      const result = await prisma.sentrowebCheckResult.findFirstOrThrow({ where: { runId } });
      const documents = await prisma.document.findMany({
        where: { companyId, documentType: 'SENTROWEB_REPORT', isLatest: true },
        orderBy: { createdAt: 'desc' },
      });
      expect(documents).toHaveLength(1);
      const [document] = documents;
      expect(document).toMatchObject({
        id: result.documentId,
        tenantId,
        uploadedById: userId,
        mimeType: 'application/pdf',
        extractionStatus: 'COMPLETED',
      });
      expect(document.originalFileName).toMatch(/^Sentroweb - Jane Director - \d{4}-\d{2}-\d{2}\.pdf$/);
      expect(memory.files.get(document.storageKey)?.data.subarray(0, 4).toString('latin1')).toBe('%PDF');
      expect(memory.files.get(document.storageKey)?.contentType).toBe('application/pdf');
      expect(memory.files.get(result.evidencePngKey!)?.contentType).toBe('image/png');
      expect(result.evidencePngKey).toContain(`/sentroweb/${runId}/${result.id}.png`);
      expect(await service.getResultScreenshot(tenantId, companyId, runId, result.id)).toMatchObject({ png: expect.any(Buffer) });
    });

    it('writes CREATE for the run, UPLOAD per filed PDF and UPDATE on completion, with no ID numbers', async () => {
      const companyId = await makeFullCompany();
      const nric = lastNric;
      const { runId } = await queue(companyId, ['Jane Director', 'Acme Screening Pte Ltd']);
      await service.processRun(runId, { client: makeClient(), config: CONFIG });

      const rows = await prisma.auditLog.findMany({ where: { companyId, tenantId } });
      const runRows = rows.filter((r) => r.entityType === 'SentrowebCheckRun' && r.entityId === runId);
      expect(runRows.map((r) => r.action).sort()).toEqual(['CREATE', 'UPDATE']);
      const uploads = rows.filter((r) => r.entityType === 'Document' && r.action === 'UPLOAD');
      expect(uploads).toHaveLength(2);
      expect(uploads.every((r) => r.changeSource === 'SYSTEM' && r.userId === userId)).toBe(true);
      expect(runRows.find((r) => r.action === 'UPDATE')?.metadata).toMatchObject({ overallResult: 'CLEAR', clear: 2 });

      const everything = JSON.stringify(rows.map((r) => [r.summary, r.metadata, r.changes, r.entityName]));
      expect(nric).toMatch(/^S\d{7}[A-Z]$/);
      expect(everything).not.toContain(nric);
    });

    it('reports POSSIBLE_MATCH with counts and match details, and a possible match anywhere wins', async () => {
      const companyId = await makeFullCompany();
      const client = makeClient();
      client.scripts.set('Jane Director', { fixture: 'individual-match' });
      const { runId } = await queue(companyId);
      await service.processRun(runId, { client, config: CONFIG });

      const run = await prisma.sentrowebCheckRun.findUniqueOrThrow({ where: { id: runId }, include: { results: { orderBy: { position: 'asc' } } } });
      expect(run).toMatchObject({ status: 'COMPLETED', overallResult: 'POSSIBLE_MATCH' });
      const jane = run.results.find((r) => r.name === 'Jane Director')!;
      expect(jane).toMatchObject({ status: 'POSSIBLE_MATCH', matchCount: 3, monitorEnabled: true });
      expect(jane.categoryCounts).toMatchObject({ PEP: 2, SIP: 1 });
      expect(jane.documentId).not.toBeNull();
      expect((jane.matches as unknown[]).length).toBe(3);
      expect(run.results.filter((r) => r.status === 'CLEAR')).toHaveLength(3);

      const dto = await service.getRun(tenantId, companyId, runId);
      expect(dto.overallResult).toBe('POSSIBLE_MATCH');
      expect(dto.results?.find((r) => r.name === 'Jane Director')?.matches[0]).toHaveProperty('name');
    });

    it('counts the credits the client reports: a repeated name that Sentroweb did not charge adds none', async () => {
      const companyId = await makeFullCompany();
      const client = makeClient();
      client.scripts.set('Jane Director', { fixture: 'individual-clear', creditsCharged: 0 });
      const { runId } = await queue(companyId, ['Jane Director', 'Mike Managing']);
      await service.processRun(runId, { client, config: CONFIG });
      const run = await prisma.sentrowebCheckRun.findUniqueOrThrow({ where: { id: runId }, include: { results: { orderBy: { position: 'asc' } } } });
      expect(run).toMatchObject({ status: 'COMPLETED', overallResult: 'CLEAR', creditsUsed: 1 });
      expect(run.results.map((r) => r.status)).toEqual(['CLEAR', 'CLEAR']);
      // Even a free search counts as submitted for the cooldown.
      await expect(queue(companyId)).rejects.toMatchObject({ code: 'COOLDOWN' });
    });

    it('a submitted failure counts the credit unless Sentroweb said the search was free, and both keep the cooldown', async () => {
      const companyId = await makeFullCompany();
      const client = makeClient();
      client.scripts.set('Jane Director', { throws: new SentrowebError('RESULT_MISMATCH', { searchSubmitted: true, creditsCharged: 0 }) });
      const { runId } = await queue(companyId, ['Jane Director']);
      await service.processRun(runId, { client, config: CONFIG });
      let run = await prisma.sentrowebCheckRun.findUniqueOrThrow({ where: { id: runId }, include: { results: true } });
      expect(run).toMatchObject({ status: 'FAILED', errorCode: 'RESULT_MISMATCH', creditsUsed: 0 });
      expect(run.results[0].searchSubmittedAt).not.toBeNull();
      await expect(queue(companyId)).rejects.toMatchObject({ code: 'COOLDOWN' });

      const otherCompany = await makeFullCompany();
      const paid = makeClient();
      paid.scripts.set('Jane Director', { throws: new SentrowebError('RESULT_MISMATCH', { searchSubmitted: true }) });
      const second = await queue(otherCompany, ['Jane Director']);
      await service.processRun(second.runId, { client: paid, config: CONFIG });
      run = await prisma.sentrowebCheckRun.findUniqueOrThrow({ where: { id: second.runId }, include: { results: true } });
      expect(run).toMatchObject({ status: 'FAILED', creditsUsed: 1 });
      await expect(queue(otherCompany)).rejects.toMatchObject({ code: 'COOLDOWN' });
    });

    it('turns a would-be CLEAR without the PDF into ERROR EVIDENCE_MISSING and carries on', async () => {
      const companyId = await makeFullCompany();
      const client = makeClient();
      client.scripts.set('Jane Director', { fixture: 'individual-clear', pdf: false });
      const { runId } = await queue(companyId);
      const outcome = await service.processRun(runId, { client, config: CONFIG });

      expect(outcome).toEqual({ status: 'completed', errorCode: null });
      const run = await prisma.sentrowebCheckRun.findUniqueOrThrow({ where: { id: runId }, include: { results: { orderBy: { position: 'asc' } } } });
      const jane = run.results.find((r) => r.name === 'Jane Director')!;
      expect(jane).toMatchObject({ status: 'ERROR', errorCode: 'EVIDENCE_MISSING', documentId: null });
      expect(run.results.filter((r) => r.status === 'CLEAR')).toHaveLength(3);
      expect(run.overallResult).toBe('INCOMPLETE');
      expect(run.creditsUsed).toBe(4);
    });

    it('keeps POSSIBLE_MATCH, noting the missing evidence, when only the PDF is missing', async () => {
      const companyId = await makeFullCompany();
      const client = makeClient();
      client.scripts.set('Jane Director', { fixture: 'individual-match', pdf: false });
      const { runId } = await queue(companyId, ['Jane Director']);
      await service.processRun(runId, { client, config: CONFIG });
      const jane = await prisma.sentrowebCheckResult.findFirstOrThrow({ where: { runId } });
      expect(jane).toMatchObject({ status: 'POSSIBLE_MATCH', errorCode: 'EVIDENCE_MISSING', documentId: null });
    });

    it('a response that does not fit the search is ERROR, stops the run and never CLEAR', async () => {
      const companyId = await makeFullCompany();
      const client = makeClient();
      const clear = loadCase('individual-clear');
      clear.json[0].searchEntity = true; // claims to be an entity search
      client.scripts.set('Jane Director', {
        outcome: { json: clear.json, domTitles: clear.titles, pdf: Buffer.from('%PDF-1.4 x'), png: null },
      });
      const { runId } = await queue(companyId);
      const outcome = await service.processRun(runId, { client, config: CONFIG });

      expect(outcome).toEqual({ status: 'failed', errorCode: 'RESULT_MISMATCH' });
      const results = await prisma.sentrowebCheckResult.findMany({ where: { runId }, orderBy: { position: 'asc' } });
      expect(results.map((r) => r.status)).toEqual(['CLEAR', 'ERROR', 'NOT_RUN', 'NOT_RUN']);
      expect(results[1].errorCode).toBe('RESULT_MISMATCH');
      expect(client.searches).toHaveLength(2);
    });

    it('keeps finished results, marks the rest NOT_RUN and fails the run when the client throws mid-run', async () => {
      const companyId = await makeFullCompany();
      const client = makeClient();
      client.scripts.set('Mike Managing', { throws: new SentrowebError('TIMEOUT', { searchSubmitted: true }) });
      const { runId } = await queue(companyId);
      const outcome = await service.processRun(runId, { client, config: CONFIG });

      expect(outcome).toEqual({ status: 'failed', errorCode: 'TIMEOUT' });
      const run = await prisma.sentrowebCheckRun.findUniqueOrThrow({ where: { id: runId }, include: { results: { orderBy: { position: 'asc' } } } });
      expect(run).toMatchObject({ status: 'FAILED', errorCode: 'TIMEOUT', overallResult: 'INCOMPLETE', creditsUsed: 3 });
      expect(run.results.map((r) => [r.name, r.status, r.errorCode])).toEqual([
        ['Acme Screening Pte Ltd', 'CLEAR', null],
        ['Jane Director', 'CLEAR', null],
        ['Mike Managing', 'ERROR', 'TIMEOUT'],
        ['Holding Corp Pte Ltd', 'NOT_RUN', null],
      ]);
      expect(run.results[2].searchSubmittedAt).not.toBeNull();
      expect(client.searches).toHaveLength(3);
      expect(client.closeCalls).toBe(1);
    });

    it('a search cancelled before CONFIRM costs nothing and is not marked as submitted', async () => {
      const companyId = await makeFullCompany();
      const client = makeClient();
      client.scripts.set('Acme Screening Pte Ltd', { throws: new SentrowebError('UNEXPECTED_CREDIT_COST') });
      const { runId } = await queue(companyId);
      const outcome = await service.processRun(runId, { client, config: CONFIG });

      expect(outcome).toEqual({ status: 'failed', errorCode: 'UNEXPECTED_CREDIT_COST' });
      const run = await prisma.sentrowebCheckRun.findUniqueOrThrow({ where: { id: runId }, include: { results: { orderBy: { position: 'asc' } } } });
      expect(run.creditsUsed).toBe(0);
      expect(run.results[0]).toMatchObject({ status: 'ERROR', errorCode: 'UNEXPECTED_CREDIT_COST', searchSubmittedAt: null });
      expect(run.results.slice(1).every((r) => r.status === 'NOT_RUN')).toBe(true);
      expect(client.searches).toHaveLength(1);
    });

    it('fails the run before any search when the session cannot open (credits, login)', async () => {
      const companyId = await makeFullCompany();
      for (const code of ['INSUFFICIENT_CREDITS', 'LOGIN_FAILED', 'MFA_OR_CAPTCHA_REQUIRED'] as const) {
        const client = makeClient();
        client.openError = new SentrowebError(code);
        const { runId } = await queue(companyId, undefined, { force: true });
        const outcome = await service.processRun(runId, { client, config: CONFIG });
        expect(outcome).toEqual({ status: 'failed', errorCode: code });
        const run = await prisma.sentrowebCheckRun.findUniqueOrThrow({ where: { id: runId }, include: { results: true } });
        expect(run).toMatchObject({ status: 'FAILED', errorCode: code, overallResult: 'INCOMPLETE', creditsUsed: 0 });
        expect(run.results.every((r) => r.status === 'NOT_RUN')).toBe(true);
        expect(client.searches).toHaveLength(0);
      }
    });

    it('fails INSUFFICIENT_CREDITS from the balance check with zero searches', async () => {
      const companyId = await makeFullCompany();
      const client = makeClient();
      client.balance = 3; // four names selected
      const { runId } = await queue(companyId);
      const outcome = await service.processRun(runId, { client, config: CONFIG });
      expect(outcome).toEqual({ status: 'failed', errorCode: 'INSUFFICIENT_CREDITS' });
      expect(client.searches).toHaveLength(0);
    });

    it('fails SENTROWEB_NOT_CONFIGURED when the settings vanished after queueing', async () => {
      const companyId = await makeFullCompany();
      const client = makeClient();
      const { runId } = await queue(companyId);
      const outcome = await service.processRun(runId, { client, config: null });
      expect(outcome).toEqual({ status: 'failed', errorCode: 'SENTROWEB_NOT_CONFIGURED' });
      expect(client.openSession).not.toHaveBeenCalled();
    });

    it('never processes a run twice: a finished or running run is not claimed again', async () => {
      const companyId = await makeFullCompany();
      const client = makeClient();
      const { runId } = await queue(companyId, ['Jane Director']);
      await service.processRun(runId, { client, config: CONFIG });
      expect(client.searches).toHaveLength(1);

      expect(await service.processRun(runId, { client, config: CONFIG })).toEqual({ status: 'not-claimed' });
      expect(client.searches).toHaveLength(1);
      expect(client.openSession).toHaveBeenCalledTimes(1);
    });

    it('two workers racing for one queued run search each name once', async () => {
      const companyId = await makeFullCompany();
      const client = makeClient();
      const { runId } = await queue(companyId, ['Jane Director', 'Mike Managing']);
      const outcomes = await Promise.all([
        service.processRun(runId, { client, config: CONFIG }),
        service.processRun(runId, { client, config: CONFIG }),
      ]);
      expect(outcomes.map((o) => o.status).sort()).toEqual(['completed', 'not-claimed']);
      expect(client.searches).toHaveLength(2);
    });

    it('runs one browser at a time across companies', async () => {
      const first = await makeFullCompany();
      const second = await makeFullCompany();
      const { runId: a } = await queue(first, ['Jane Director']);
      const { runId: b } = await queue(second, ['Jane Director']);
      let active = 0;
      let peak = 0;
      const client = makeClient();
      const open = client.openSession.getMockImplementation()!;
      client.openSession.mockImplementation(async (config, options) => {
        active += 1;
        peak = Math.max(peak, active);
        const session = await open(config, options);
        const originalClose = session.close.bind(session);
        session.close = async () => {
          await new Promise((resolve) => setTimeout(resolve, 30));
          await originalClose();
          active -= 1;
        };
        return session;
      });
      await Promise.all([service.processRun(a, { client, config: CONFIG }), service.processRun(b, { client, config: CONFIG })]);
      expect(peak).toBe(1);
      expect(client.searches).toHaveLength(2);
    });
  });

  // --- overall result ---------------------------------------------------------------------------

  describe('overall result (decision D15)', () => {
    it.each([
      [['CLEAR', 'CLEAR'], false, 'CLEAR'],
      [['CLEAR', 'POSSIBLE_MATCH', 'ERROR'], false, 'POSSIBLE_MATCH'],
      [['CLEAR', 'POSSIBLE_MATCH', 'NOT_RUN'], true, 'POSSIBLE_MATCH'],
      [['CLEAR', 'ERROR'], false, 'INCOMPLETE'],
      [['CLEAR', 'NOT_RUN'], false, 'INCOMPLETE'],
      [['ERROR'], false, 'INCOMPLETE'],
      [['NOT_RUN', 'NOT_RUN'], true, 'INCOMPLETE'],
      [['CLEAR', 'CLEAR'], true, 'INCOMPLETE'],
      [[], false, 'INCOMPLETE'],
    ] as const)('%j (failed=%s) is %s', (statuses, failed, expected) => {
      expect(service.computeOverallResult([...statuses], failed)).toBe(expected);
    });
  });

  // --- recovery ---------------------------------------------------------------------------------

  describe('recovery', () => {
    async function runningRunWithExpiredLease(companyId: string, markFirstInFlight: boolean) {
      const { runId } = await queue(companyId);
      await prisma.sentrowebCheckRun.update({
        where: { id: runId },
        data: {
          status: 'RUNNING',
          claimToken: randomUUID(),
          startedAt: new Date(Date.now() - 20 * 60 * 1000),
          leaseExpiresAt: new Date(Date.now() - 60 * 1000),
          creditsUsed: 1,
        },
      });
      const results = await prisma.sentrowebCheckResult.findMany({ where: { runId }, orderBy: { position: 'asc' } });
      await prisma.sentrowebCheckResult.update({
        where: { id: results[0].id },
        data: { status: 'CLEAR', checkedAt: new Date(), searchSubmittedAt: new Date() },
      });
      if (markFirstInFlight) {
        await prisma.sentrowebCheckResult.update({ where: { id: results[1].id }, data: { searchSubmittedAt: new Date() } });
      }
      return { runId, results };
    }

    it('marks an expired RUNNING run FAILED INTERRUPTED and never calls the client', async () => {
      const companyId = await makeFullCompany();
      const { runId } = await runningRunWithExpiredLease(companyId, true);
      const client = makeClient();

      const { recovered } = await service.recoverStaleRuns();
      expect(recovered).toContain(runId);

      const run = await prisma.sentrowebCheckRun.findUniqueOrThrow({ where: { id: runId }, include: { results: { orderBy: { position: 'asc' } } } });
      expect(run).toMatchObject({ status: 'FAILED', errorCode: 'INTERRUPTED', overallResult: 'INCOMPLETE', claimToken: null, leaseExpiresAt: null });
      expect(run.finishedAt).not.toBeNull();
      // finished stays finished; the in-flight name may have spent a credit; the rest never started
      expect(run.results.map((r) => [r.status, r.errorCode])).toEqual([
        ['CLEAR', null],
        ['ERROR', 'INTERRUPTED'],
        ['NOT_RUN', null],
        ['NOT_RUN', null],
      ]);
      // Nothing can resume it: the client is never reached, even if someone tries to process it.
      expect(await service.processRun(runId, { client, config: CONFIG })).toEqual({ status: 'not-claimed' });
      expect(client.openSession).not.toHaveBeenCalled();
      expect(client.searches).toHaveLength(0);

      const audit = await prisma.auditLog.findMany({ where: { entityType: 'SentrowebCheckRun', entityId: runId, action: 'UPDATE' } });
      expect(audit).toHaveLength(1);
    });

    describe('a worker that lost its run to recovery', () => {
      async function expireLease(runId: string) {
        await prisma.sentrowebCheckRun.update({ where: { id: runId }, data: { leaseExpiresAt: new Date(Date.now() - 60 * 1000) } });
        const { recovered } = await service.recoverStaleRuns();
        expect(recovered).toContain(runId);
      }

      it('cannot overwrite the recovered result or file a report once recovery has taken the run', async () => {
        const companyId = await makeFullCompany();
        const client = makeClient();
        const { runId } = await queue(companyId, ['Jane Director', 'Mike Managing']);
        let slow: Promise<unknown> | null = null;
        client.duringSearch = async (request) => {
          if (request.name !== 'Jane Director') return;
          client.duringSearch = null;
          await expireLease(runId); // the lease runs out while the search is still in flight
        };
        slow = service.processRun(runId, { client, config: CONFIG });
        const outcome = await slow;
        expect(outcome).toEqual({ status: 'stale-worker' });

        const run = await prisma.sentrowebCheckRun.findUniqueOrThrow({ where: { id: runId }, include: { results: { orderBy: { position: 'asc' } } } });
        expect(run).toMatchObject({ status: 'FAILED', errorCode: 'INTERRUPTED' });
        expect(run.results.map((r) => [r.status, r.errorCode, r.documentId])).toEqual([
          ['ERROR', 'INTERRUPTED', null],
          ['NOT_RUN', null, null],
        ]);
        expect(client.searches.map((search) => search.name)).toEqual(['Jane Director']);
        // No report row, no stored files, no run-completion audit from the stale worker.
        expect(await prisma.document.count({ where: { companyId, documentType: 'SENTROWEB_REPORT' } })).toBe(0);
        expect([...memory.files.keys()]).toEqual([]);
        const audit = await prisma.auditLog.findMany({ where: { entityType: 'SentrowebCheckRun', entityId: runId, action: 'UPDATE' } });
        expect(audit).toHaveLength(1);
        expect(await prisma.sentrowebCheckRun.findUniqueOrThrow({ where: { id: runId } })).toMatchObject({ creditsUsed: 0 });
      });

      it('a worker that lost the run starts no further search', async () => {
        const companyId = await makeFullCompany();
        const client = makeClient();
        client.scripts.set('Jane Director', { throws: new SentrowebError('RESULT_MISMATCH', { searchSubmitted: true }) });
        const { runId } = await queue(companyId, ['Jane Director', 'Mike Managing']);
        client.duringSearch = async () => {
          client.duringSearch = null;
          await expireLease(runId);
        };
        expect(await service.processRun(runId, { client, config: CONFIG })).toEqual({ status: 'stale-worker' });
        expect(client.searches).toHaveLength(1);
        const run = await prisma.sentrowebCheckRun.findUniqueOrThrow({ where: { id: runId } });
        expect(run).toMatchObject({ status: 'FAILED', errorCode: 'INTERRUPTED', creditsUsed: 0 });
      });
    });

    it('leaves a RUNNING run with a live lease alone', async () => {
      const companyId = await makeFullCompany();
      const { runId } = await queue(companyId);
      await prisma.sentrowebCheckRun.update({
        where: { id: runId },
        data: { status: 'RUNNING', claimToken: randomUUID(), leaseExpiresAt: new Date(Date.now() + 5 * 60 * 1000) },
      });
      const { recovered } = await service.recoverStaleRuns();
      expect(recovered).not.toContain(runId);
      expect((await prisma.sentrowebCheckRun.findUniqueOrThrow({ where: { id: runId } })).status).toBe('RUNNING');
    });

    it('is idempotent', async () => {
      const companyId = await makeFullCompany();
      const { runId } = await runningRunWithExpiredLease(companyId, false);
      expect((await service.recoverStaleRuns()).recovered).toContain(runId);
      expect((await service.recoverStaleRuns()).recovered).not.toContain(runId);
    });

    it('starts a QUEUED run that was missed, but only after 2 minutes', async () => {
      const companyId = await makeFullCompany();
      const client = makeClient();
      const { runId } = await queue(companyId, ['Jane Director']);
      // Other tests (and earlier runs of this suite) leave QUEUED rows behind; only look at ours.
      await prisma.sentrowebCheckRun.updateMany({
        where: { status: 'QUEUED', id: { not: runId } },
        data: { status: 'FAILED', errorCode: 'INTERRUPTED', finishedAt: new Date() },
      });

      expect((await service.startStaleQueuedRuns(new Date(), { client, config: CONFIG })).started).not.toContain(runId);
      const later = new Date(Date.now() + 3 * 60 * 1000);
      expect((await service.startStaleQueuedRuns(later, { client, config: CONFIG })).started).toContain(runId);

      for (let i = 0; i < 100; i += 1) {
        const run = await prisma.sentrowebCheckRun.findUniqueOrThrow({ where: { id: runId } });
        if (run.status === 'COMPLETED') break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      expect((await prisma.sentrowebCheckRun.findUniqueOrThrow({ where: { id: runId } })).status).toBe('COMPLETED');
      expect(client.searches).toHaveLength(1);
    });

    it('the scheduler task recovers expired runs', async () => {
      const companyId = await makeFullCompany();
      const { runId } = await runningRunWithExpiredLease(companyId, false);
      const { sentrowebCheckTask } = await import('@/lib/scheduler/tasks/sentroweb-check.task');
      const result = await sentrowebCheckTask.execute();
      expect(result.success).toBe(true);
      expect((await prisma.sentrowebCheckRun.findUniqueOrThrow({ where: { id: runId } })).status).toBe('FAILED');
    });
  });

  // --- reading ----------------------------------------------------------------------------------

  describe('reading runs', () => {
    it('keeps tenants apart', async () => {
      const companyId = await makeFullCompany();
      const { runId } = await queue(companyId, ['Jane Director']);
      await service.processRun(runId, { client: makeClient(), config: CONFIG });
      const result = await prisma.sentrowebCheckResult.findFirstOrThrow({ where: { runId } });

      expect((await service.getRun(tenantId, companyId, runId)).id).toBe(runId);
      await expect(service.getRun(otherTenantId, companyId, runId)).rejects.toMatchObject({ statusCode: 404 });
      await expect(service.getRun(tenantId, otherCompanyId, runId)).rejects.toMatchObject({ statusCode: 404 });
      expect((await service.listRuns(otherTenantId, companyId)).runs).toEqual([]);
      await expect(service.getResultScreenshot(otherTenantId, companyId, runId, result.id)).rejects.toMatchObject({ statusCode: 404 });
      await expect(service.getResultScreenshot(tenantId, otherCompanyId, runId, result.id)).rejects.toMatchObject({ statusCode: 404 });
      await expect(service.getResultScreenshot(tenantId, companyId, randomUUID(), result.id)).rejects.toMatchObject({ statusCode: 404 });
    });

    it('returns fixed error messages and never raw text or internals', async () => {
      const companyId = await makeFullCompany();
      const client = makeClient();
      client.scripts.set('Jane Director', { throws: new SentrowebError('LAYOUT_CHANGED', { searchSubmitted: true }) });
      const { runId } = await queue(companyId, ['Jane Director']);
      await service.processRun(runId, { client, config: CONFIG });

      const dto = await service.getRun(tenantId, companyId, runId);
      expect(dto).toMatchObject({ status: 'FAILED', errorCode: 'LAYOUT_CHANGED', requestedBy: { id: userId, name: 'Ria Runner' } });
      expect(dto.errorMessage).toContain('did not look as expected');
      const serialised = JSON.stringify(dto);
      for (const internal of ['claimToken', 'leaseExpiresAt', 'evidencePngKey', 'storageKey', 'sourceRefs', 'balanceBefore']) {
        expect(serialised).not.toContain(internal);
      }
      expect(dto.results?.[0]).toMatchObject({ status: 'ERROR', errorMessage: dto.errorMessage });
    });

    it('pages the history by (createdAt, id) without gaps or repeats, even with equal timestamps', async () => {
      const companyId = await makeCompany();
      const sameInstant = new Date('2026-11-01T00:00:00.000Z');
      const ids: string[] = [];
      for (let i = 0; i < 5; i += 1) {
        const run = await prisma.sentrowebCheckRun.create({
          data: { tenantId, companyId, requestedById: userId, entityCount: 1, status: 'COMPLETED', createdAt: sameInstant },
        });
        ids.push(run.id);
      }
      const newer = await prisma.sentrowebCheckRun.create({
        data: { tenantId, companyId, requestedById: userId, entityCount: 1, status: 'COMPLETED', createdAt: new Date('2026-11-02T00:00:00.000Z') },
      });

      const seen: string[] = [];
      let cursor: string | null = null;
      for (let page = 0; page < 10; page += 1) {
        const result: Awaited<ReturnType<Service['listRuns']>> = await service.listRuns(tenantId, companyId, { limit: 2, cursor });
        seen.push(...result.runs.map((r) => r.id));
        cursor = result.nextCursor;
        if (!cursor) break;
      }
      expect(seen[0]).toBe(newer.id);
      expect(new Set(seen).size).toBe(6);
      expect([...seen].sort()).toEqual([...ids, newer.id].sort());
      expect(seen.slice(1)).toEqual([...ids].sort().reverse());
      await expect(service.listRuns(tenantId, companyId, { cursor: 'not-a-cursor' })).rejects.toMatchObject({ statusCode: 400 });
    });
  });
});
