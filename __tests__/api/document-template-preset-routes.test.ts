import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const attackerTenant = '22222222-2222-4222-8222-222222222222';
const presetId = '33333333-3333-4333-8333-333333333333';
const templateA = '55555555-5555-4555-8555-555555555555';
const templateB = '66666666-6666-4666-8666-666666666666';

const mockSession = {
  id: 'user-1',
  email: 'user@example.com',
  firstName: 'Test',
  lastName: 'User',
  tenantId: workspaceId,
  isSuperAdmin: false,
  isWorkspaceAdmin: false,
  hasAllCompaniesAccess: true,
  companyIds: [],
};

vi.mock('@/lib/auth', () => ({
  requireAuth: vi.fn(),
}));

vi.mock('@/lib/rbac', () => ({
  requirePermission: vi.fn(),
}));

vi.mock('@/services/document-template-preset.service', () => ({
  listDocumentTemplatePresets: vi.fn(),
  createDocumentTemplatePreset: vi.fn(),
  updateDocumentTemplatePreset: vi.fn(),
  deleteDocumentTemplatePreset: vi.fn(),
}));

import { requireAuth } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import * as presetService from '@/services/document-template-preset.service';
import { ConflictError, ForbiddenError, NotFoundError, UnauthorizedError } from '@/lib/errors';
import { GET as listPresets, POST as createPreset } from '@/app/api/document-template-presets/route';
import { PATCH as updatePreset, DELETE as deletePreset } from '@/app/api/document-template-presets/[id]/route';

function request(url: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(url, init);
}

function json(method: string, body: unknown) {
  return request('http://localhost/api/document-template-presets', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function routeParams(id = presetId) {
  return { params: Promise.resolve({ id }) };
}

describe('document template preset routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue(mockSession);
    vi.mocked(requirePermission).mockResolvedValue(undefined);
    vi.mocked(presetService.listDocumentTemplatePresets).mockResolvedValue([]);
    vi.mocked(presetService.createDocumentTemplatePreset).mockResolvedValue({ id: presetId, name: 'AGM', items: [] } as never);
    vi.mocked(presetService.updateDocumentTemplatePreset).mockResolvedValue({ id: presetId, name: 'AGM', items: [] } as never);
    vi.mocked(presetService.deleteDocumentTemplatePreset).mockResolvedValue({ success: true });
  });

  describe('authentication and permissions', () => {
    it('returns 401 for every method when signed out', async () => {
      vi.mocked(requireAuth).mockRejectedValue(new UnauthorizedError('Authentication required'));
      const responses = await Promise.all([
        listPresets(),
        createPreset(json('POST', { name: 'AGM', templateIds: [templateA] })),
        updatePreset(json('PATCH', { expectedVersion: 1, name: 'AGM 2' }), routeParams()),
        deletePreset(request('http://localhost/api/document-template-presets/x', { method: 'DELETE' }), routeParams()),
      ]);
      expect(responses.map((response) => response.status)).toEqual([401, 401, 401, 401]);
      expect(presetService.listDocumentTemplatePresets).not.toHaveBeenCalled();
      expect(presetService.createDocumentTemplatePreset).not.toHaveBeenCalled();
      expect(presetService.updateDocumentTemplatePreset).not.toHaveBeenCalled();
      expect(presetService.deleteDocumentTemplatePreset).not.toHaveBeenCalled();
    });

    it('returns 403 and never reaches the service without the document permission', async () => {
      vi.mocked(requirePermission).mockRejectedValue(new ForbiddenError('Permission denied'));
      const responses = await Promise.all([
        listPresets(),
        createPreset(json('POST', { name: 'AGM', templateIds: [templateA] })),
        updatePreset(json('PATCH', { expectedVersion: 1, name: 'AGM 2' }), routeParams()),
        deletePreset(request('http://localhost/api/document-template-presets/x', { method: 'DELETE' }), routeParams()),
      ]);
      expect(responses.map((response) => response.status)).toEqual([403, 403, 403, 403]);
      expect(presetService.listDocumentTemplatePresets).not.toHaveBeenCalled();
      expect(presetService.createDocumentTemplatePreset).not.toHaveBeenCalled();
      expect(presetService.updateDocumentTemplatePreset).not.toHaveBeenCalled();
      expect(presetService.deleteDocumentTemplatePreset).not.toHaveBeenCalled();
    });

    it('asks for read, create, update and delete on the document resource', async () => {
      await listPresets();
      await createPreset(json('POST', { name: 'AGM', templateIds: [templateA] }));
      await updatePreset(json('PATCH', { expectedVersion: 1, name: 'AGM 2' }), routeParams());
      await deletePreset(request('http://localhost/api/document-template-presets/x', { method: 'DELETE' }), routeParams());
      expect(vi.mocked(requirePermission).mock.calls.map((call) => call.slice(1))).toEqual([
        ['document', 'read'],
        ['document', 'create'],
        ['document', 'update'],
        ['document', 'delete'],
      ]);
    });

    it('requires create for replacing items, and update as well if renaming', async () => {
      await updatePreset(json('PATCH', { expectedVersion: 1, templateIds: [templateA] }), routeParams());
      expect(requirePermission).toHaveBeenCalledWith(mockSession, 'document', 'create');
      expect(requirePermission).not.toHaveBeenCalledWith(mockSession, 'document', 'update');
      vi.mocked(requirePermission).mockClear();
      await updatePreset(json('PATCH', { expectedVersion: 1, name: 'New', templateIds: [templateA] }), routeParams());
      expect(requirePermission).toHaveBeenCalledWith(mockSession, 'document', 'create');
      expect(requirePermission).toHaveBeenCalledWith(mockSession, 'document', 'update');
    });
  });

  describe('GET', () => {
    it('lists the session workspace presets', async () => {
      vi.mocked(presetService.listDocumentTemplatePresets).mockResolvedValue([{ id: presetId, name: 'AGM', items: [] }] as never);
      const response = await listPresets();
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ presets: [{ id: presetId, name: 'AGM', items: [] }] });
      expect(presetService.listDocumentTemplatePresets).toHaveBeenCalledWith({ tenantId: workspaceId, userId: mockSession.id });
    });
  });

  it.each(['POST', 'PATCH'] as const)('%s returns only mutation metadata even without document:read', async (method) => {
    vi.mocked(requirePermission).mockImplementation(async (_session, _resource, action) => {
      if (action === 'read') throw new ForbiddenError('Permission denied');
    });
    const hydrated = {
      id: presetId, version: 1, name: 'AGM',
      items: [{ template: { content: 'private template contents', contentJson: { secret: true } } }],
    };
    vi.mocked(presetService.createDocumentTemplatePreset).mockResolvedValue(hydrated as never);
    vi.mocked(presetService.updateDocumentTemplatePreset).mockResolvedValue(hydrated as never);
    const response = method === 'POST'
      ? await createPreset(json('POST', { name: 'AGM', templateIds: [templateA] }))
      : await updatePreset(json('PATCH', { expectedVersion: 1, name: 'AGM' }), routeParams());
    expect(response.status).toBe(method === 'POST' ? 201 : 200);
    expect(await response.json()).toEqual({ id: presetId });
    expect(requirePermission).not.toHaveBeenCalledWith(mockSession, 'document', 'read');
  });

  describe('POST', () => {
    it('creates with the session workspace and user, in the order sent, repeats kept', async () => {
      const response = await createPreset(json('POST', { name: '  AGM  ', templateIds: [templateB, templateA, templateB] }));
      expect(response.status).toBe(201);
      expect(presetService.createDocumentTemplatePreset).toHaveBeenCalledWith(
        { name: 'AGM', templateIds: [templateB, templateA, templateB] },
        { tenantId: workspaceId, userId: mockSession.id },
      );
    });

    it.each([
      ['a client-owned tenantId', { name: 'AGM', templateIds: [templateA], tenantId: attackerTenant }],
      ['a client-owned createdById', { name: 'AGM', templateIds: [templateA], createdById: 'someone' }],
      ['a blank name', { name: '   ', templateIds: [templateA] }],
      ['a name over 100 characters', { name: 'x'.repeat(101), templateIds: [templateA] }],
      ['no templates', { name: 'AGM', templateIds: [] }],
      ['more than 20 templates', { name: 'AGM', templateIds: Array.from({ length: 21 }, () => templateA) }],
      ['a template id that is not a uuid', { name: 'AGM', templateIds: ['nope'] }],
      ['a missing name', { templateIds: [templateA] }],
    ])('rejects %s with 400 and never calls the service', async (_label, body) => {
      const response = await createPreset(json('POST', body));
      expect(response.status).toBe(400);
      expect(presetService.createDocumentTemplatePreset).not.toHaveBeenCalled();
    });

    it('accepts exactly 20 templates', async () => {
      const response = await createPreset(json('POST', { name: 'Max', templateIds: Array.from({ length: 20 }, () => templateA) }));
      expect(response.status).toBe(201);
    });

    it('returns the service 409 for a duplicate name', async () => {
      vi.mocked(presetService.createDocumentTemplatePreset).mockRejectedValue(new ConflictError('A preset with this name already exists'));
      const response = await createPreset(json('POST', { name: 'AGM', templateIds: [templateA] }));
      expect(response.status).toBe(409);
    });
  });

  describe('PATCH', () => {
    it('renames or replaces the items for the session workspace', async () => {
      const response = await updatePreset(
        json('PATCH', { expectedVersion: 1, name: 'AGM v2', templateIds: [templateA] }),
        routeParams(),
      );
      expect(response.status).toBe(200);
      expect(presetService.updateDocumentTemplatePreset).toHaveBeenCalledWith(
        presetId,
        { name: 'AGM v2', templateIds: [templateA], expectedVersion: 1 },
        { tenantId: workspaceId, userId: mockSession.id },
      );
    });

    it.each([
      ['an empty body', {}],
      ['a missing version', { name: 'AGM' }],
      ['a timestamp instead of a version', { name: 'AGM', expectedUpdatedAt: '2026-11-19T00:00:00.000Z' }],
      ['a zero version', { name: 'AGM', expectedVersion: 0 }],
      ['a fractional version', { name: 'AGM', expectedVersion: 1.5 }],
      ['a string version', { name: 'AGM', expectedVersion: '1' }],
      ['a client-owned tenantId', { name: 'AGM', tenantId: attackerTenant }],
      ['more than 20 templates', { templateIds: Array.from({ length: 21 }, () => templateA) }],
    ])('rejects %s with 400', async (_label, body) => {
      const response = await updatePreset(json('PATCH', body), routeParams());
      expect(response.status).toBe(400);
      expect(presetService.updateDocumentTemplatePreset).not.toHaveBeenCalled();
    });

    it('rejects an id that is not a uuid with 400', async () => {
      const response = await updatePreset(json('PATCH', { expectedVersion: 1, name: 'AGM' }), routeParams('not-a-uuid'));
      expect(response.status).toBe(400);
      expect(presetService.updateDocumentTemplatePreset).not.toHaveBeenCalled();
    });

    it('returns 404 for a preset that is not in the workspace and 409 for a clash', async () => {
      vi.mocked(presetService.updateDocumentTemplatePreset).mockRejectedValueOnce(new NotFoundError('Template preset not found'));
      expect((await updatePreset(json('PATCH', { expectedVersion: 1, name: 'AGM' }), routeParams())).status).toBe(404);
      vi.mocked(presetService.updateDocumentTemplatePreset).mockRejectedValueOnce(new ConflictError('changed'));
      expect((await updatePreset(json('PATCH', { expectedVersion: 1, name: 'AGM' }), routeParams())).status).toBe(409);
    });
  });

  describe('DELETE', () => {
    it('deletes within the session workspace', async () => {
      const response = await deletePreset(request('http://localhost/api/document-template-presets/x', { method: 'DELETE' }), routeParams());
      expect(response.status).toBe(200);
      expect(presetService.deleteDocumentTemplatePreset).toHaveBeenCalledWith(presetId, { tenantId: workspaceId, userId: mockSession.id });
    });

    it('returns 404 for a preset in another workspace', async () => {
      vi.mocked(presetService.deleteDocumentTemplatePreset).mockRejectedValue(new NotFoundError('Template preset not found'));
      const response = await deletePreset(request('http://localhost/api/document-template-presets/x', { method: 'DELETE' }), routeParams());
      expect(response.status).toBe(404);
    });
  });
});
