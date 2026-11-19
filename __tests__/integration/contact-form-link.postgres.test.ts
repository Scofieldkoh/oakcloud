// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as listLinks, POST as createLink } from '@/app/api/contacts/[id]/form-links/route';
import { GET as candidates } from '@/app/api/contacts/[id]/form-links/candidates/route';
import { DELETE as deleteLink } from '@/app/api/contacts/[id]/form-links/[linkId]/route';
import { POST as acceptSuggestion } from '@/app/api/contacts/[id]/form-links/[linkId]/suggestions/accept/route';
import { POST as dismissSuggestion } from '@/app/api/contacts/[id]/form-links/[linkId]/suggestions/dismiss/route';

const state = vi.hoisted(() => ({
  session: {} as Record<string, unknown>,
  allowed: new Set<string>(),
}));
vi.mock('@/lib/auth', () => ({ requireAuth: async () => state.session }));
vi.mock('@/lib/rbac', () => ({
  requirePermission: async (_session: unknown, resource: string, action: string) => {
    if (!state.allowed.has(`${resource}:${action}`)) throw new Error(`Permission denied: ${resource}:${action}`);
  },
}));

const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
type Database = ReturnType<typeof import('@/lib/prisma')['getPrisma']>;
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

suite('Contact KYC/CDD form links (PostgreSQL, public route boundary)', () => {
  let db: Database;
  let tenantId: string;
  let otherTenantId: string;
  let userId: string;
  const originalUrl = process.env.DATABASE_URL;

  beforeAll(async () => {
    const target = new URL(url!);
    if (!/(?:^|[_-])test(?:[_-]|$)/i.test(target.pathname.slice(1))) throw new Error('Test database required');
    process.env.DATABASE_URL = url;
    db = (await import('@/lib/prisma')).getPrisma();
    const suffix = randomUUID();
    tenantId = (await db.workspace.create({ data: { name: 'Form link test', slug: `form-link-${suffix}`, status: 'ACTIVE' } })).id;
    otherTenantId = (await db.workspace.create({ data: { name: 'Form link other', slug: `form-link-o-${suffix}`, status: 'ACTIVE' } })).id;
    userId = (await db.user.create({ data: { tenantId, email: `form-link-${suffix}@example.test`, passwordHash: 'unused', firstName: 'Test', lastName: 'Reviewer' } })).id;
  });

  afterAll(() => {
    if (originalUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalUrl;
  });

  beforeEach(() => {
    state.session = { id: userId, tenantId, isSuperAdmin: false, isWorkspaceAdmin: false };
    state.allowed = new Set(['contact:read', 'contact:update', 'document:read']);
  });

  // --- fixtures ------------------------------------------------------------------------------

  const field = (key: string, type: string, position: number, extra: Record<string, unknown> = {}) => ({ key, type, position, ...extra });
  const FIELDS = [
    field('company_name', 'SHORT_TEXT', 1),
    field('people_section', 'PAGE_BREAK', 2, { inputType: 'repeat_start' }),
    field('person_kind', 'SINGLE_CHOICE', 3),
    field('person_roles', 'MULTIPLE_CHOICE', 4),
    field('person_name', 'SHORT_TEXT', 5),
    field('person_id', 'SHORT_TEXT', 6),
    field('person_nationality', 'DROPDOWN', 7),
    field('person_birth_date', 'SHORT_TEXT', 8, { inputType: 'date' }),
    field('person_address', 'SHORT_TEXT', 9),
    field('person_pep', 'SINGLE_CHOICE', 10),
    field('person_identity_document', 'FILE_UPLOAD', 11, { label: 'Identity document' }),
    field('people_section_end', 'PAGE_BREAK', 12, { inputType: 'repeat_end' }),
    field('company_documents', 'FILE_UPLOAD', 13, { label: 'Company documents' }),
  ];

  async function makeContact(overrides: Record<string, unknown> = {}) {
    const tag = randomUUID().replace(/-/g, '').slice(0, 10);
    return db.contact.create({
      data: {
        tenantId,
        contactType: 'INDIVIDUAL',
        firstName: 'Dina',
        lastName: `Tan${tag}`,
        fullName: `Dina Tan${tag}`,
        canonicalName: `dinatan${tag}`.toLowerCase(),
        identificationType: 'NRIC',
        identificationNumber: `S${tag.toUpperCase()}A`,
        nationality: 'Singaporean',
        ...overrides,
      },
    });
  }

  /** A CDD form with two people: row 0 an individual, row 1 an organisation, plus uploads for each row and the response. */
  async function makeResponse(options: { tenant?: string; tags?: string[]; people?: Array<Record<string, string>> } = {}) {
    const tenant = options.tenant ?? tenantId;
    const tag = randomUUID().replace(/-/g, '').slice(0, 10);
    const form = await db.form.create({
      data: { tenantId: tenant, title: `CDD ${tag}`, slug: `cdd-${tag}`, status: 'PUBLISHED', tags: options.tags ?? ['CDD'] },
    });
    await db.formField.createMany({ data: FIELDS.map((f) => ({ ...f, formId: form.id, tenantId: tenant, type: f.type as never })) });
    const people = options.people ?? [
      { kind: 'individual', name: 'Dina Tan', id: 'S1234567D', nationality: 'Malaysian', birth: '1980-01-01', address: '1 Test Road', pep: 'yes' },
      { kind: 'organisation', name: 'Acme Holdings Pte Ltd', id: '201900001A', nationality: '', birth: '', address: '2 Test Road', pep: '' },
    ];
    const sub = await db.formSubmission.create({
      data: {
        formId: form.id,
        tenantId: tenant,
        answers: {},
      },
    });
    const upload = (name: string) =>
      db.formUpload.create({
        data: { tenantId: tenant, formId: form.id, submissionId: sub.id, storageKey: `test/${randomUUID()}`, fileName: name, mimeType: 'application/pdf', sizeBytes: 10 },
      });
    const rowUploads = [] as string[];
    for (const person of people) rowUploads.push((await upload(`${person.name} id.pdf`)).id);
    const companyDoc = await upload('constitution.pdf');
    const answers = {
      company_name: 'Acme',
      person_kind: people.map((p) => p.kind),
      person_roles: people.map(() => ['director']),
      person_name: people.map((p) => p.name),
      person_id: people.map((p) => p.id),
      person_nationality: people.map((p) => p.nationality),
      person_birth_date: people.map((p) => p.birth),
      person_address: people.map((p) => p.address),
      person_pep: people.map((p) => p.pep),
      person_identity_document: rowUploads,
      company_documents: [companyDoc.id],
    };
    await db.formSubmission.update({ where: { id: sub.id }, data: { answers } });
    return { form, submission: sub, answers, rowUploads, companyDocId: companyDoc.id };
  }

  const request = (path: string, method = 'GET', body?: unknown) =>
    new NextRequest(`http://localhost${path}`, {
      method,
      ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
    });
  function ids(contactId: string): { params: Promise<{ id: string }> };
  function ids(contactId: string, linkId: string): { params: Promise<{ id: string; linkId: string }> };
  function ids(contactId: string, linkId?: string) {
    return { params: Promise.resolve(linkId ? { id: contactId, linkId } : { id: contactId }) };
  }
  const json = async (response: Response): Promise<Json> => response.json();

  async function link(contactId: string, formId: string, submissionId: string, personRowIndex: number | null) {
    return createLink(request(`/api/contacts/${contactId}/form-links`, 'POST', { formId, submissionId, personRowIndex }), ids(contactId));
  }
  async function list(contactId: string): Promise<Json[]> {
    const response = await listLinks(request(`/api/contacts/${contactId}/form-links`), ids(contactId));
    expect(response.status).toBe(200);
    return (await json(response)).links;
  }
  const accept = (contactId: string, linkId: string, body: Json) =>
    acceptSuggestion(request(`/api/contacts/${contactId}/form-links/${linkId}/suggestions/accept`, 'POST', body), ids(contactId, linkId));
  const dismiss = (contactId: string, linkId: string, body: Json) =>
    dismissSuggestion(request(`/api/contacts/${contactId}/form-links/${linkId}/suggestions/dismiss`, 'POST', body), ids(contactId, linkId));
  const suggestionFor = (links: Json[], field: string) => links[0].suggestions.find((s: Json) => s.field === field);

  // --- 1 ---------------------------------------------------------------------------------------

  it('links row 1 of a two-person response and lists that row\'s own attachments only', async () => {
    const fixture = await makeResponse();
    const company = await makeContact({ contactType: 'CORPORATE', firstName: null, lastName: null, fullName: 'Acme Holdings Pte Ltd', canonicalName: `acme${randomUUID()}`, corporateName: 'Acme Holdings Pte Ltd', identificationType: null, identificationNumber: null, nationality: null, corporateUen: null });
    const response = await link(company.id, fixture.form.id, fixture.submission.id, 1);
    expect(response.status).toBe(201);
    const [entry] = await list(company.id);
    expect(entry).toMatchObject({ state: 'ACTIVE', personRowIndex: 1, personName: 'Acme Holdings Pte Ltd' });
    expect(entry.attachments.map((a: Json) => a.id).sort()).toEqual([fixture.rowUploads[1], fixture.companyDocId].sort());
    expect(entry.attachments.map((a: Json) => a.id)).not.toContain(fixture.rowUploads[0]);
    expect(entry.pdfUrl).toBe(`/api/forms/${fixture.form.id}/responses/${fixture.submission.id}/export/pdf`);
    expect(entry.attachments[0].url).toContain(`/api/forms/${fixture.form.id}/responses/${fixture.submission.id}/uploads/`);
    // The company UEN and name suggestions come from the row; nothing is written without an accept.
    expect(entry.suggestions.map((s: Json) => s.field).sort()).toEqual(['corporateUen']);
    const unchanged = await db.contact.findUniqueOrThrow({ where: { id: company.id } });
    expect(unchanged.corporateUen).toBeNull();
  });

  // --- 2 ---------------------------------------------------------------------------------------

  it('refuses a duplicate link (same contact, or another contact for the same row); unlink then relink works', async () => {
    const fixture = await makeResponse();
    const first = await makeContact();
    const second = await makeContact();
    expect((await link(first.id, fixture.form.id, fixture.submission.id, 0)).status).toBe(201);
    const same = await link(first.id, fixture.form.id, fixture.submission.id, 0);
    expect(same.status).toBe(409);
    expect((await json(same)).details).toMatchObject({ reason: 'ALREADY_LINKED' });
    expect((await link(second.id, fixture.form.id, fixture.submission.id, 0)).status).toBe(409);

    const [entry] = await list(first.id);
    const removed = await deleteLink(request(`/api/contacts/${first.id}/form-links/${entry.id}`, 'DELETE'), ids(first.id, entry.id));
    expect(removed.status).toBe(200);
    expect(await list(first.id)).toEqual([]);
    expect((await link(second.id, fixture.form.id, fixture.submission.id, 0)).status).toBe(201);
    // Soft unlink: the old row is kept, with who and when.
    const old = await db.contactFormLink.findUniqueOrThrow({ where: { id: entry.id } });
    expect(old.unlinkedAt).not.toBeNull();
    expect(old.unlinkedById).toBe(userId);
  });

  // --- 3 ---------------------------------------------------------------------------------------

  it('a row whose name or ID no longer matches goes to ROW_CHANGED: no suggestions, accept 409, never re-bound to another row', async () => {
    const fixture = await makeResponse({
      people: [
        { kind: 'individual', name: 'Dina Tan', id: 'S1234567D', nationality: 'Malaysian', birth: '1980-01-01', address: '1 Test Road', pep: 'no' },
        { kind: 'individual', name: 'Eli Lim', id: 'S7654321Z', nationality: 'Indian', birth: '1975-05-05', address: '3 Test Road', pep: 'no' },
      ],
    });
    const contact = await makeContact();
    await link(contact.id, fixture.form.id, fixture.submission.id, 0);
    const [before] = await list(contact.id);
    const suggestion = before.suggestions.find((s: Json) => s.field === 'nationality');
    expect(suggestion).toBeDefined();

    // Swap the two rows in the stored answers (the linked person is now at index 1).
    const swapped = Object.fromEntries(
      Object.entries(fixture.answers).map(([key, value]) => [key, Array.isArray(value) && key.startsWith('person_') ? [...value].reverse() : value]),
    );
    await db.formSubmission.update({ where: { id: fixture.submission.id }, data: { answers: swapped } });

    const [after] = await list(contact.id);
    expect(after.state).toBe('ROW_CHANGED');
    expect(after).toMatchObject({ suggestions: [], attachments: [], personName: null, pdfUrl: null, responseUrl: null, readOnlyAnswers: [] });
    const refused = await accept(contact.id, before.id, { field: 'nationality', expectedCurrentValue: suggestion.current, proposedValue: suggestion.proposed });
    expect(refused.status).toBe(409);
    expect((await json(refused)).details).toMatchObject({ reason: 'ROW_CHANGED' });
    expect((await db.contact.findUniqueOrThrow({ where: { id: contact.id } })).nationality).toBe('Singaporean');
    // Still bound to index 0 (now another person): nothing was re-pointed.
    const stored = await db.contactFormLink.findUniqueOrThrow({ where: { id: before.id } });
    expect(stored.personRowIndex).toBe(0);
  });

  // --- 4 ---------------------------------------------------------------------------------------

  it('accepts the date of birth as UTC midnight with an audit row, without ID numbers or the date in the summary', async () => {
    const fixture = await makeResponse();
    const contact = await makeContact();
    await link(contact.id, fixture.form.id, fixture.submission.id, 0);
    const [entry] = await list(contact.id);
    const dob = suggestionFor([entry], 'dateOfBirth');
    expect(dob).toMatchObject({ current: null, proposed: '1980-01-01', canApply: true });
    const response = await accept(contact.id, entry.id, { field: 'dateOfBirth', expectedCurrentValue: null, proposedValue: '1980-01-01' });
    expect(response.status).toBe(200);
    const [stored] = await db.$queryRaw<Array<{ dob: string }>>`SELECT to_char("dateOfBirth", 'YYYY-MM-DD"T"HH24:MI:SS') AS dob FROM contacts WHERE id = ${contact.id}`;
    expect(stored.dob).toBe('1980-01-01T00:00:00');
    // Only that one field was written.
    expect((await db.contact.findUniqueOrThrow({ where: { id: contact.id } })).nationality).toBe('Singaporean');

    const audits = await db.auditLog.findMany({ where: { tenantId, entityId: contact.id, action: 'UPDATE' } });
    expect(audits).toHaveLength(1);
    expect(audits[0].metadata).toMatchObject({ source: 'CONTACT_FORM_LINK', linkId: entry.id, field: 'dateOfBirth' });
    expect(audits[0].changes).toMatchObject({ dateOfBirth: { old: null, new: '1980-01-01' } });
    expect(audits[0].summary ?? '').not.toMatch(/1980|S1234567D/);
    // It no longer shows as a suggestion.
    expect(suggestionFor(await list(contact.id), 'dateOfBirth')).toBeUndefined();
  });

  it('accepts a name (first word first name, the rest last name, canonical name refreshed) and an ID, one request each', async () => {
    const fixture = await makeResponse({
      people: [
        { kind: 'individual', name: 'Dina Anne Tan', id: 's7654321z', nationality: 'Singaporean', birth: '', address: '', pep: '' },
        { kind: 'individual', name: 'Eli Lim', id: 'S1111111A', nationality: '', birth: '', address: '', pep: '' },
      ],
    });
    const contact = await makeContact({ nationality: 'Singaporean' });
    await link(contact.id, fixture.form.id, fixture.submission.id, 0);
    const [entry] = await list(contact.id);
    expect(entry.suggestions.map((s: Json) => s.field).sort()).toEqual(['fullName', 'identificationNumber']);
    const name = suggestionFor([entry], 'fullName');
    const id = suggestionFor([entry], 'identificationNumber');
    expect(id.proposed).toBe('S7654321Z');
    expect((await accept(contact.id, entry.id, { field: 'fullName', expectedCurrentValue: name.current, proposedValue: name.proposed })).status).toBe(200);
    const afterName = await db.contact.findUniqueOrThrow({ where: { id: contact.id } });
    expect(afterName).toMatchObject({ firstName: 'Dina', lastName: 'Anne Tan', fullName: 'Dina Anne Tan', canonicalName: 'dinaannetan' });
    expect(afterName.identificationNumber).toBe(contact.identificationNumber);
    expect((await accept(contact.id, entry.id, { field: 'identificationNumber', expectedCurrentValue: id.current, proposedValue: id.proposed })).status).toBe(200);
    const afterId = await db.contact.findUniqueOrThrow({ where: { id: contact.id } });
    expect(afterId).toMatchObject({ identificationNumber: 'S7654321Z', identificationType: 'NRIC' });
    // The audit rows carry no ID number or name in their summaries.
    const audits = await db.auditLog.findMany({ where: { tenantId, entityId: contact.id, action: 'UPDATE' } });
    expect(audits).toHaveLength(2);
    for (const audit of audits) expect(audit.summary ?? '').not.toMatch(/S7654321Z|Dina|Tan/);
    expect(await list(contact.id).then((rows) => rows[0].suggestions)).toEqual([]);
  });

  // --- 5 ---------------------------------------------------------------------------------------

  it('a stale expected value or a changed proposal answers 409 and writes nothing', async () => {
    const fixture = await makeResponse();
    const contact = await makeContact();
    await link(contact.id, fixture.form.id, fixture.submission.id, 0);
    const [entry] = await list(contact.id);
    const nationality = suggestionFor([entry], 'nationality');
    expect(nationality).toMatchObject({ current: 'Singaporean', proposed: 'Malaysian' });

    // The contact was edited after the page was opened.
    await db.contact.update({ where: { id: contact.id }, data: { nationality: 'Indian' } });
    const stale = await accept(contact.id, entry.id, { field: 'nationality', expectedCurrentValue: 'Singaporean', proposedValue: 'Malaysian' });
    expect(stale.status).toBe(409);
    expect((await json(stale)).details).toMatchObject({ reason: 'STALE_SUGGESTION' });
    expect((await db.contact.findUniqueOrThrow({ where: { id: contact.id } })).nationality).toBe('Indian');

    // The form answer was changed after the page was opened (proposal differs from what the user saw).
    const edited = { ...fixture.answers, person_nationality: ['Thai', 'x'] };
    await db.formSubmission.update({ where: { id: fixture.submission.id }, data: { answers: edited } });
    const changed = await accept(contact.id, entry.id, { field: 'nationality', expectedCurrentValue: 'Indian', proposedValue: 'Malaysian' });
    expect(changed.status).toBe(409);
    expect((await db.contact.findUniqueOrThrow({ where: { id: contact.id } })).nationality).toBe('Indian');
    expect(await db.auditLog.count({ where: { tenantId, entityId: contact.id, action: 'UPDATE' } })).toBe(0);
  });

  // --- 6 ---------------------------------------------------------------------------------------

  it('a dismissed suggestion stays hidden until the form answer changes', async () => {
    const fixture = await makeResponse();
    const contact = await makeContact();
    await link(contact.id, fixture.form.id, fixture.submission.id, 0);
    const [entry] = await list(contact.id);
    expect(suggestionFor([entry], 'fullAddress')).toMatchObject({ proposed: '1 Test Road' });

    const dismissed = await dismiss(contact.id, entry.id, { field: 'fullAddress', proposedValue: '1 Test Road' });
    expect(dismissed.status).toBe(200);
    expect(suggestionFor(await list(contact.id), 'fullAddress')).toBeUndefined();
    // Dismissing something that is not on offer is refused.
    expect((await dismiss(contact.id, entry.id, { field: 'fullAddress', proposedValue: 'Nowhere' })).status).toBe(409);

    await db.formSubmission.update({
      where: { id: fixture.submission.id },
      data: { answers: { ...fixture.answers, person_address: ['9 New Road', '2 Test Road'] } },
    });
    expect(suggestionFor(await list(contact.id), 'fullAddress')).toMatchObject({ proposed: '9 New Road' });
  });

  // --- 7 ---------------------------------------------------------------------------------------

  it('enforces permissions and tenant isolation', async () => {
    const fixture = await makeResponse();
    const contact = await makeContact();
    await link(contact.id, fixture.form.id, fixture.submission.id, 0);
    const [entry] = await list(contact.id);

    // No document:read: the list, the candidates and the link are all refused.
    state.allowed = new Set(['contact:read', 'contact:update']);
    expect((await listLinks(request(`/api/contacts/${contact.id}/form-links`), ids(contact.id))).status).toBe(403);
    expect((await candidates(request(`/api/contacts/${contact.id}/form-links/candidates`), ids(contact.id))).status).toBe(403);
    expect((await link(contact.id, fixture.form.id, fixture.submission.id, 1)).status).toBe(403);

    // No contact:update: reading works, accepting does not.
    state.allowed = new Set(['contact:read', 'document:read']);
    expect((await listLinks(request(`/api/contacts/${contact.id}/form-links`), ids(contact.id))).status).toBe(200);
    const denied = await accept(contact.id, entry.id, { field: 'nationality', expectedCurrentValue: 'Singaporean', proposedValue: 'Malaysian' });
    expect(denied.status).toBe(403);
    expect((await deleteLink(request(`/api/contacts/${contact.id}/form-links/${entry.id}`, 'DELETE'), ids(contact.id, entry.id))).status).toBe(403);
    expect((await db.contact.findUniqueOrThrow({ where: { id: contact.id } })).nationality).toBe('Singaporean');

    // Another tenant: its contact, or a response of its own, is simply not found.
    state.allowed = new Set(['contact:read', 'contact:update', 'document:read']);
    state.session = { id: userId, tenantId: otherTenantId, isSuperAdmin: false, isWorkspaceAdmin: false };
    expect((await listLinks(request(`/api/contacts/${contact.id}/form-links`), ids(contact.id))).status).toBe(404);
    expect((await accept(contact.id, entry.id, { field: 'nationality', expectedCurrentValue: 'Singaporean', proposedValue: 'Malaysian' })).status).toBe(404);
    state.session = { id: userId, tenantId, isSuperAdmin: false, isWorkspaceAdmin: false };
    const foreign = await makeResponse({ tenant: otherTenantId });
    expect((await link(contact.id, foreign.form.id, foreign.submission.id, 0)).status).toBe(404);
    // A response of this tenant linked under another contact id (not in the tenant) is not found either.
    expect((await link(randomUUID(), fixture.form.id, fixture.submission.id, 1)).status).toBe(404);
    // A form that is not tagged cdd or kyc cannot be linked.
    const untagged = await makeResponse({ tags: ['survey'] });
    expect((await link(contact.id, untagged.form.id, untagged.submission.id, 0)).status).toBe(422);
  });

  // --- 8 ---------------------------------------------------------------------------------------

  it('a deleted response shows RESPONSE_DELETED with no suggestions or files, and can still be unlinked', async () => {
    const fixture = await makeResponse();
    const contact = await makeContact();
    await link(contact.id, fixture.form.id, fixture.submission.id, 0);
    await db.formSubmission.update({ where: { id: fixture.submission.id }, data: { deletedAt: new Date() } });
    const [entry] = await list(contact.id);
    expect(entry).toMatchObject({ state: 'RESPONSE_DELETED', suggestions: [], attachments: [], pdfUrl: null, responseUrl: null, personName: null });
    const refused = await accept(contact.id, entry.id, { field: 'nationality', expectedCurrentValue: 'Singaporean', proposedValue: 'Malaysian' });
    expect(refused.status).toBe(409);
    expect((await json(refused)).details).toMatchObject({ reason: 'RESPONSE_DELETED' });
    expect((await deleteLink(request(`/api/contacts/${contact.id}/form-links/${entry.id}`, 'DELETE'), ids(contact.id, entry.id))).status).toBe(200);
    expect(await list(contact.id)).toEqual([]);
  });

  // --- 9 ---------------------------------------------------------------------------------------

  it('an organisation row cannot be linked to an individual contact (422), nor an individual row to a company', async () => {
    const fixture = await makeResponse();
    const individual = await makeContact();
    const company = await makeContact({ contactType: 'CORPORATE', firstName: null, lastName: null, fullName: `Acme ${randomUUID()}`, canonicalName: `acme${randomUUID()}`, corporateName: 'Acme', identificationType: null, identificationNumber: null, nationality: null });
    expect((await link(individual.id, fixture.form.id, fixture.submission.id, 1)).status).toBe(422);
    expect((await link(company.id, fixture.form.id, fixture.submission.id, 0)).status).toBe(422);
    // The picker says so too, and marks a row taken once it is linked.
    const picked = await candidates(
      request(`/api/contacts/${individual.id}/form-links/candidates?formId=${fixture.form.id}&submissionId=${fixture.submission.id}`),
      ids(individual.id),
    );
    const { persons } = await json(picked);
    expect(persons.map((p: Json) => [p.rowNumber, p.eligible])).toEqual([[1, true], [2, false]]);
    await link(individual.id, fixture.form.id, fixture.submission.id, 0);
    const again = await json(
      await candidates(request(`/api/contacts/${individual.id}/form-links/candidates?formId=${fixture.form.id}&submissionId=${fixture.submission.id}`), ids(individual.id)),
    );
    expect(again.persons[0]).toMatchObject({ eligible: false, reason: 'Already linked to a contact' });
  });

  // --- extra: what is shown only, and what cannot apply ---------------------------------------------

  it('shows the PEP answer without a way to save it, and refuses an ID another contact holds or an invalid date', async () => {
    const holderTag = randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
    const fixture = await makeResponse({
      people: [
        { kind: 'individual', name: 'Dina Tan', id: `T${holderTag}Z`, nationality: 'Singaporean', birth: '2999-01-01', address: '1 Test Road', pep: 'yes' },
        { kind: 'individual', name: 'Eli Lim', id: 'S7654321Z', nationality: 'Indian', birth: '', address: '', pep: 'no' },
      ],
    });
    await makeContact({ identificationNumber: `T${holderTag}Z` });
    const contact = await makeContact();
    await link(contact.id, fixture.form.id, fixture.submission.id, 0);
    const [entry] = await list(contact.id);
    expect(entry.readOnlyAnswers).toEqual([{ label: 'Politically exposed person (as answered)', value: 'yes' }]);
    expect(entry.suggestions.map((s: Json) => s.field)).not.toContain('pep');
    expect(suggestionFor([entry], 'identificationNumber')).toMatchObject({ canApply: false, reason: "Can't apply: another contact already has this ID" });
    expect(suggestionFor([entry], 'dateOfBirth')).toMatchObject({ canApply: false });
    const refused = await accept(contact.id, entry.id, { field: 'dateOfBirth', expectedCurrentValue: null, proposedValue: '2999-01-01' });
    expect(refused.status).toBe(422);
    expect((await db.contact.findUniqueOrThrow({ where: { id: contact.id } })).dateOfBirth).toBeNull();
  });
});
