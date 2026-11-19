// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { OAKDOC_MIME_TYPE } from '@/lib/document-editor/oakdoc-template';
import { ForbiddenError } from '@/lib/errors';

const state = vi.hoisted(() => ({
  session: {} as Record<string, unknown>,
  allowed: new Set<string>(),
}));
vi.mock('@/lib/auth', () => ({ requireAuth: async () => state.session }));
vi.mock('@/lib/rbac', () => ({
  requirePermission: async (_session: unknown, resource: string, action: string) => {
    if (!state.allowed.has(`${resource}:${action}`)) throw new ForbiddenError(`Permission denied: ${resource}:${action}`);
  },
}));

const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
type Database = ReturnType<typeof import('@/lib/prisma')['getPrisma']>;
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

// Word (OakDoc) templates only need their metadata; presets never read the file.
const wordJson = (tag: string) => ({
  oakDoc: {
    schemaVersion: 1,
    storageKey: `integration/${tag}.docx`,
    fileName: `${tag}.docx`,
    fileSize: 1,
    sha256: '0'.repeat(64),
    mimeType: OAKDOC_MIME_TYPE,
    fieldTags: [],
  },
});

const AGM_NAMES = [
  'Board Resolution - Convening of AGM',
  'Notice of Annual General Meeting',
  'Minutes of Annual General Meeting',
  'AGM Attendance List',
];

suite('Document template presets (PostgreSQL, route boundary)', () => {
  let db: Database;
  let routes: typeof import('@/app/api/document-template-presets/route');
  let itemRoutes: typeof import('@/app/api/document-template-presets/[id]/route');
  let tenantId: string;
  let otherTenantId: string;
  let userId: string;
  let otherUserId: string;
  const originalUrl = process.env.DATABASE_URL;

  beforeAll(async () => {
    const target = new URL(url!);
    if (!/(?:^|[_-])test(?:[_-]|$)/i.test(target.pathname.slice(1))) throw new Error('Test database required');
    process.env.DATABASE_URL = url;
    db = (await import('@/lib/prisma')).getPrisma();
    routes = await import('@/app/api/document-template-presets/route');
    itemRoutes = await import('@/app/api/document-template-presets/[id]/route');
    const suffix = randomUUID();
    tenantId = (await db.workspace.create({ data: { name: 'Preset test', slug: `preset-${suffix}`, status: 'ACTIVE' } })).id;
    otherTenantId = (await db.workspace.create({ data: { name: 'Preset other', slug: `preset-o-${suffix}`, status: 'ACTIVE' } })).id;
    userId = (await db.user.create({ data: { tenantId, email: `preset-${suffix}@example.test`, passwordHash: 'unused', firstName: 'Pat', lastName: 'Preset' } })).id;
    otherUserId = (await db.user.create({ data: { tenantId: otherTenantId, email: `preset-o-${suffix}@example.test`, passwordHash: 'unused', firstName: 'Olly', lastName: 'Other' } })).id;
  });

  afterAll(async () => {
    for (const id of [tenantId, otherTenantId]) {
      if (!id) continue;
      await db.auditLog.deleteMany({ where: { tenantId: id } });
      await db.documentTemplatePreset.deleteMany({ where: { tenantId: id } });
      await db.documentTemplate.deleteMany({ where: { tenantId: id } });
      await db.user.deleteMany({ where: { tenantId: id } });
      await db.workspace.delete({ where: { id } });
    }
    if (originalUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalUrl;
  });

  beforeEach(async () => {
    asTenantA();
    // Each test starts with no presets; templates are created per test as needed.
    await db.documentTemplatePreset.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
    await db.auditLog.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] }, entityType: 'DocumentTemplatePreset' } });
  });

  function asTenantA(allowed = ['document:read', 'document:create', 'document:update', 'document:delete']) {
    state.session = { id: userId, tenantId, isSuperAdmin: false, isWorkspaceAdmin: false };
    state.allowed = new Set(allowed);
  }

  function asTenantB() {
    state.session = { id: otherUserId, tenantId: otherTenantId, isSuperAdmin: false, isWorkspaceAdmin: false };
    state.allowed = new Set(['document:read', 'document:create', 'document:update', 'document:delete']);
  }

  async function makeTemplate(name: string, overrides: Record<string, unknown> = {}, owner = { tenantId, userId }) {
    return db.documentTemplate.create({
      data: {
        tenantId: owner.tenantId,
        createdById: owner.userId,
        name: `${name} ${randomUUID().slice(0, 8)}`,
        category: 'OTHER',
        content: '',
        contentJson: wordJson(randomUUID()),
        ...overrides,
      },
    });
  }

  const post = (body: unknown) => routes.POST(new NextRequest('http://localhost/api/document-template-presets', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }));
  const list = () => routes.GET();
  const patch = (id: string, body: unknown) => itemRoutes.PATCH(new NextRequest(`http://localhost/api/document-template-presets/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }), { params: Promise.resolve({ id }) });
  const remove = (id: string) => itemRoutes.DELETE(new NextRequest(`http://localhost/api/document-template-presets/${id}`, { method: 'DELETE' }), { params: Promise.resolve({ id }) });

  async function presets(): Promise<Json[]> {
    const response = await list();
    expect(response.status).toBe(200);
    return (await response.json()).presets;
  }

  it('saves the AGM pack of four templates and lists it in order, loadable without tenant-specific code', async () => {
    const created = [];
    for (const name of AGM_NAMES) created.push(await makeTemplate(name));
    const response = await post({ name: 'AGM pack', templateIds: created.map((template) => template.id) });
    expect(response.status).toBe(201);

    const [preset] = await presets();
    expect(preset.name).toBe('AGM pack');
    expect(preset.items.map((item: Json) => item.templateId)).toEqual(created.map((template) => template.id));
    expect(preset.items.map((item: Json) => item.templateName)).toEqual(created.map((template) => template.name));
    expect(preset.items.every((item: Json) => item.available === true && item.resolvedTemplateId === item.templateId)).toBe(true);
    expect(preset).not.toHaveProperty('tenantId');
  });

  it('keeps repeats and their exact order, up to 20, and rejects 21', async () => {
    const notice = await makeTemplate('Notice');
    const minutes = await makeTemplate('Minutes');
    const ids = [notice.id, minutes.id, notice.id, notice.id];
    expect((await post({ name: 'Repeats', templateIds: ids })).status).toBe(201);
    const [preset] = await presets();
    expect(preset.items.map((item: Json) => item.templateId)).toEqual(ids);

    const twenty = Array.from({ length: 20 }, (_, index) => (index % 2 ? minutes.id : notice.id));
    expect((await post({ name: 'Twenty', templateIds: twenty })).status).toBe(201);
    const rows = await db.documentTemplatePresetItem.findMany({
      where: { preset: { tenantId, name: 'Twenty' } }, orderBy: { displayOrder: 'asc' },
    });
    expect(rows.map((row) => row.templateId)).toEqual(twenty);
    expect(rows.map((row) => row.displayOrder)).toEqual(Array.from({ length: 20 }, (_, index) => index));

    const before = await db.documentTemplatePreset.count({ where: { tenantId } });
    expect((await post({ name: 'Too many', templateIds: [...twenty, notice.id] })).status).toBe(400);
    expect(await db.documentTemplatePreset.count({ where: { tenantId } })).toBe(before);
  });

  it('enforces membership limits at the service boundary too', async () => {
    const service = await import('@/services/document-template-preset.service');
    const a = await makeTemplate('Service validation');
    for (const templateIds of [[], Array.from({ length: 21 }, () => a.id)]) {
      await expect(service.createDocumentTemplatePreset({ name: 'Invalid', templateIds }, { tenantId, userId })).rejects.toBeDefined();
    }
    const created = await (await post({ name: 'Valid', templateIds: [a.id] })).json();
    await expect(service.updateDocumentTemplatePreset(created.id, { templateIds: [], expectedVersion: 1 }, { tenantId, userId })).rejects.toBeDefined();
    expect(await db.documentTemplatePresetItem.count({ where: { presetId: created.id } })).toBe(1);
  });

  it('is shared by the workspace: another user of the same workspace sees and can load it', async () => {
    const template = await makeTemplate('Shared');
    await post({ name: 'Shared pack', templateIds: [template.id] });
    const colleague = (await db.user.create({
      data: { tenantId, email: `colleague-${randomUUID()}@example.test`, passwordHash: 'unused', firstName: 'Col', lastName: 'League' },
    })).id;
    state.session = { id: colleague, tenantId, isSuperAdmin: false, isWorkspaceAdmin: false };
    expect((await presets()).map((preset) => preset.name)).toEqual(['Shared pack']);
  });

  it('rejects a duplicate name in the workspace (case and spacing ignored) but allows it in another workspace', async () => {
    const template = await makeTemplate('Dup');
    expect((await post({ name: 'AGM Pack', templateIds: [template.id] })).status).toBe(201);
    expect((await post({ name: '  agm   pack ', templateIds: [template.id] })).status).toBe(409);
    expect(await db.documentTemplatePreset.count({ where: { tenantId } })).toBe(1);

    asTenantB();
    const otherTemplate = await makeTemplate('Dup', {}, { tenantId: otherTenantId, userId: otherUserId });
    expect((await post({ name: 'AGM Pack', templateIds: [otherTemplate.id] })).status).toBe(201);
  });

  it('keeps presets private to their workspace: another workspace cannot list, rename, replace or delete them', async () => {
    const template = await makeTemplate('Private');
    const created = await (await post({ name: 'Mine', templateIds: [template.id] })).json();
    await db.auditLog.deleteMany({ where: { tenantId } });

    asTenantB();
    expect(await presets()).toEqual([]);
    expect((await patch(created.id, { expectedVersion: 1, name: 'Hijacked' })).status).toBe(404);
    expect((await patch(created.id, { expectedVersion: 1, templateIds: [template.id, template.id] })).status).toBe(404);
    expect((await remove(created.id)).status).toBe(404);

    const row = await db.documentTemplatePreset.findUnique({ where: { id: created.id }, include: { items: true } });
    expect(row?.name).toBe('Mine');
    expect(row?.items).toHaveLength(1);
    expect(await db.auditLog.count({ where: { entityId: created.id } })).toBe(0);
  });

  it('rejects templates from another workspace, deleted, inactive or A4 ones with a generic 400 and saves nothing', async () => {
    const foreign = await makeTemplate('Foreign', {}, { tenantId: otherTenantId, userId: otherUserId });
    const removed = await makeTemplate('Removed', { deletedAt: new Date() });
    const inactive = await makeTemplate('Inactive', { isActive: false });
    const a4 = await makeTemplate('A4', { contentJson: null });
    const good = await makeTemplate('Good');

    for (const bad of [foreign, removed, inactive, a4]) {
      const response = await post({ name: `Bad ${bad.name}`, templateIds: [good.id, bad.id] });
      expect(response.status).toBe(400);
      const text = JSON.stringify(await response.json());
      expect(text).not.toContain(bad.id);
      expect(text).not.toContain(bad.name);
    }
    expect(await db.documentTemplatePreset.count({ where: { tenantId } })).toBe(0);
    expect(await db.auditLog.count({ where: { tenantId, entityType: 'DocumentTemplatePreset' } })).toBe(0);

    // The same rule applies when replacing the items of an existing preset.
    const created = await (await post({ name: 'Keep', templateIds: [good.id] })).json();
    expect((await patch(created.id, { expectedVersion: 1, templateIds: [foreign.id] })).status).toBe(400);
    const row = await db.documentTemplatePresetItem.findMany({ where: { presetId: created.id } });
    expect(row.map((item) => item.templateId)).toEqual([good.id]);
  });

  it('marks members that later become unavailable without changing the stored preset', async () => {
    const kept = await makeTemplate('Kept');
    const turnedOff = await makeTemplate('Turned off');
    const removed = await makeTemplate('Removed later');
    const reverted = await makeTemplate('Reverted to A4');
    await post({ name: 'Stale', templateIds: [kept.id, turnedOff.id, removed.id, reverted.id] });

    await db.documentTemplate.update({ where: { id: turnedOff.id }, data: { isActive: false } });
    await db.documentTemplate.update({ where: { id: removed.id }, data: { deletedAt: new Date() } });
    await db.documentTemplate.update({ where: { id: reverted.id }, data: { contentJson: {} } });

    const [preset] = await presets();
    expect(preset.items.map((item: Json) => [item.available, item.unavailableReason])).toEqual([
      [true, undefined],
      [false, 'inactive'],
      [false, 'deleted'],
      [false, 'not-word'],
    ]);
    expect(preset.items.map((item: Json) => item.templateName)).toEqual([kept.name, turnedOff.name, removed.name, reverted.name]);
    expect(await db.documentTemplatePresetItem.count({ where: { presetId: preset.id } })).toBe(4);
  });

  it('points a removed A4 member at its linked Word replacement', async () => {
    const legacy = await makeTemplate('Legacy notice', { contentJson: null, deletedAt: new Date() });
    const word = await makeTemplate('Word notice', {
      contentJson: {
        ...wordJson(randomUUID()),
        oakDocMigration: {
          schemaVersion: 1,
          legacyTemplateId: legacy.id,
          legacyTemplateVersion: 1,
          linkedAt: new Date().toISOString(),
          preference: 'OAKDOC',
        },
      },
    });
    // A preset saved before the A4 template was retired.
    const preset = await db.documentTemplatePreset.create({
      data: {
        tenantId,
        name: 'Old pack',
        normalizedName: 'old pack',
        createdById: userId,
        updatedById: userId,
        items: { create: [{ templateId: legacy.id, displayOrder: 0 }] },
      },
    });
    const [listed] = await presets();
    expect(listed.id).toBe(preset.id);
    expect(listed.items[0]).toMatchObject({
      templateId: legacy.id,
      resolvedTemplateId: word.id,
      available: true,
      templateName: word.name,
    });
  });

  it('renames and replaces items in order, and refuses a stale update or a clashing name', async () => {
    const a = await makeTemplate('A');
    const b = await makeTemplate('B');
    const created = await (await post({ name: 'Pack', templateIds: [a.id, b.id] })).json();
    await post({ name: 'Other pack', templateIds: [a.id] });

    expect((await patch(created.id, { expectedVersion: 1, name: 'other PACK' })).status).toBe(409);

    const response = await patch(created.id, { expectedVersion: 1, name: 'Pack v2', templateIds: [b.id, a.id, b.id] });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: created.id });
    const updated = (await presets()).find((preset) => preset.id === created.id)!;
    expect(updated.version).toBe(2);
    expect(updated.name).toBe('Pack v2');
    expect(updated.items.map((item: Json) => item.templateId)).toEqual([b.id, a.id, b.id]);

    // A second save using the first read is a stale write.
    const stale = await patch(created.id, { expectedVersion: 1, templateIds: [a.id] });
    expect(stale.status).toBe(409);
    const rows = await db.documentTemplatePresetItem.findMany({ where: { presetId: created.id }, orderBy: { displayOrder: 'asc' } });
    expect(rows.map((row) => row.templateId)).toEqual([b.id, a.id, b.id]);
  });

  it('allows only one of two saves based on the same read', async () => {
    const a = await makeTemplate('Concurrent A');
    const b = await makeTemplate('Concurrent B');
    const created = await (await post({ name: 'Concurrent', templateIds: [a.id] })).json();
    const responses = await Promise.all([
      patch(created.id, { expectedVersion: 1, templateIds: [a.id, a.id] }),
      patch(created.id, { expectedVersion: 1, templateIds: [b.id] }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    const winner = responses.findIndex((response) => response.status === 200);
    const winningIds = winner === 0 ? [a.id, a.id] : [b.id];
    const row = await db.documentTemplatePreset.findUniqueOrThrow({ where: { id: created.id }, include: { items: { orderBy: { displayOrder: 'asc' } } } });
    expect(row.version).toBe(2);
    expect(row.items.map((item) => item.templateId)).toEqual(winningIds);
    const audits = await db.auditLog.findMany({ where: { entityId: created.id, action: 'DOCUMENT_TEMPLATE_PRESET_UPDATED' } });
    expect(audits).toHaveLength(1);
    expect((audits[0].changes as Json).templateIds).toEqual({ old: [a.id], new: winningIds });
  });

  it('deletes a preset and its items; the templates are untouched', async () => {
    const template = await makeTemplate('Gone');
    const created = await (await post({ name: 'Disposable', templateIds: [template.id, template.id] })).json();
    expect((await remove(created.id)).status).toBe(200);
    expect(await db.documentTemplatePreset.count({ where: { id: created.id } })).toBe(0);
    expect(await db.documentTemplatePresetItem.count({ where: { presetId: created.id } })).toBe(0);
    expect(await db.documentTemplate.count({ where: { id: template.id } })).toBe(1);
    expect(await presets()).toEqual([]);
    expect((await remove(created.id)).status).toBe(404);
  });

  it('refuses writes without the matching permission and leaves data unchanged', async () => {
    const template = await makeTemplate('Perm');
    const created = await (await post({ name: 'Guarded', templateIds: [template.id] })).json();

    asTenantA(['document:read']);
    expect((await list()).status).toBe(200);
    expect((await post({ name: 'Nope', templateIds: [template.id] })).status).toBe(403);
    expect((await patch(created.id, { expectedVersion: 1, name: 'Nope' })).status).toBe(403);
    expect((await remove(created.id)).status).toBe(403);

    asTenantA(['document:create']);
    expect((await list()).status).toBe(403);
    const createOnly = await post({ name: 'Created only', templateIds: [template.id] });
    expect(createOnly.status).toBe(201);
    expect(Object.keys(await createOnly.json())).toEqual(['id']);
    const replaceOnly = await patch(created.id, { expectedVersion: 1, templateIds: [template.id, template.id] });
    expect(replaceOnly.status).toBe(200);
    expect(await replaceOnly.json()).toEqual({ id: created.id });
    expect((await patch(created.id, { expectedVersion: 1, name: 'Nope' })).status).toBe(403);
    expect((await remove(created.id)).status).toBe(403);

    asTenantA();
    expect((await presets()).map((preset) => preset.name).sort()).toEqual(['Created only', 'Guarded']);
  });

  it('ignores client-owned fields by rejecting them', async () => {
    const template = await makeTemplate('Owned');
    expect((await post({ name: 'Evil', templateIds: [template.id], tenantId: otherTenantId })).status).toBe(400);
    expect((await post({ name: 'Evil', templateIds: [template.id], createdById: otherUserId })).status).toBe(400);
    expect(await db.documentTemplatePreset.count({ where: { name: 'Evil' } })).toBe(0);
  });

  it('records an audit entry for create, update and delete with the workspace and actor', async () => {
    const a = await makeTemplate('Audit A');
    const b = await makeTemplate('Audit B');
    const created = await (await post({ name: 'Audited', templateIds: [a.id] })).json();
    await patch(created.id, { expectedVersion: 1, name: 'Audited v2', templateIds: [a.id, b.id] });
    await remove(created.id);

    const entries = await db.auditLog.findMany({
      where: { tenantId, entityType: 'DocumentTemplatePreset', entityId: created.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(entries.map((entry) => entry.action)).toEqual([
      'DOCUMENT_TEMPLATE_PRESET_CREATED',
      'DOCUMENT_TEMPLATE_PRESET_UPDATED',
      'DOCUMENT_TEMPLATE_PRESET_DELETED',
    ]);
    expect(entries.every((entry) => entry.userId === userId && entry.tenantId === tenantId)).toBe(true);
    expect(entries[0].entityName).toBe('Audited');
    expect((entries[0].metadata as Json).itemCount).toBe(1);
    expect((entries[1].changes as Json).name).toEqual({ old: 'Audited', new: 'Audited v2' });
    expect((entries[1].metadata as Json).itemCount).toBe(2);
    expect(entries[2].entityName).toBe('Audited v2');
  });
});
