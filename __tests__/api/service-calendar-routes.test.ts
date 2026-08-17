import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictError, ForbiddenError, NotFoundError } from '@/lib/errors';

const session = {
  id: 'user-1',
  tenantId: 'tenant-1',
  isSuperAdmin: false,
  isWorkspaceAdmin: true,
};

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  requireServiceAdministrator: vi.fn(),
  resolveWorkspaceId: vi.fn(),
  listBusinessCalendars: vi.fn(),
  getBusinessCalendarSnapshot: vi.fn(),
  createBusinessCalendar: vi.fn(),
  updateBusinessCalendar: vi.fn(),
  previewBusinessCalendarImpact: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/service-administration-auth', () => ({ requireServiceAdministrator: mocks.requireServiceAdministrator }));
vi.mock('@/lib/api-helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-helpers')>()),
  resolveWorkspaceId: mocks.resolveWorkspaceId,
}));
vi.mock('@/services/business-calendar', () => ({
  listBusinessCalendars: mocks.listBusinessCalendars,
  getBusinessCalendarSnapshot: mocks.getBusinessCalendarSnapshot,
  createBusinessCalendar: mocks.createBusinessCalendar,
  updateBusinessCalendar: mocks.updateBusinessCalendar,
  previewBusinessCalendarImpact: mocks.previewBusinessCalendarImpact,
}));

import { GET as listCalendars, POST as createCalendar } from '@/app/api/service-calendars/route';
import {
  GET as getCalendar,
  PATCH as updateCalendar,
} from '@/app/api/service-calendars/[id]/route';
import { POST as previewCalendar } from '@/app/api/service-calendars/[id]/impact/route';

const validInput = {
  name: 'Singapore Business Calendar',
  jurisdictionCode: 'SG',
  timeZone: 'Asia/Singapore',
  weekendDays: [0, 6],
  holidays: [{ date: '2026-08-09', name: 'National Day', description: null }],
  isActive: true,
};

describe('service calendar routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue(session);
    mocks.resolveWorkspaceId.mockReturnValue(session.tenantId);
    mocks.listBusinessCalendars.mockResolvedValue({ calendars: [] });
    mocks.getBusinessCalendarSnapshot.mockResolvedValue({
      id: 'calendar-1',
      timeZone: 'Asia/Singapore',
      revision: 1,
      weekendDays: new Set([0, 6]),
      holidays: new Set(['2026-08-09']),
    });
    mocks.createBusinessCalendar.mockResolvedValue({ id: 'calendar-1', ...validInput, revision: 1 });
    mocks.updateBusinessCalendar.mockResolvedValue({ id: 'calendar-1', ...validInput, revision: 2 });
    mocks.previewBusinessCalendarImpact.mockResolvedValue({
      calendarId: 'calendar-1',
      expectedRevision: 1,
      proposedHash: 'a'.repeat(64),
      previewFingerprint: 'b'.repeat(64),
      counts: { recalculated: 0, preserved: 0, warnings: 0 },
      samples: [],
    });
  });

  it('requires auth/admin and resolves the workspace for list reads', async () => {
    const response = await listCalendars(new NextRequest('http://localhost/api/service-calendars?tenantId=tenant-2'));

    expect(mocks.requireAuth).toHaveBeenCalledOnce();
    expect(mocks.requireServiceAdministrator).toHaveBeenCalledWith(session);
    expect(mocks.resolveWorkspaceId).toHaveBeenCalledWith(session, 'tenant-2');
    expect(mocks.listBusinessCalendars).toHaveBeenCalledWith({ tenantId: session.tenantId, userId: session.id });
    expect(response.status).toBe(200);
  });

  it('creates a validated calendar and strips caller tenant ids from the service input', async () => {
    const response = await createCalendar(new NextRequest('http://localhost/api/service-calendars', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...validInput, tenantId: 'tenant-2' }),
    }));

    expect(mocks.requireServiceAdministrator).toHaveBeenCalledWith(session);
    expect(mocks.resolveWorkspaceId).toHaveBeenCalledWith(session, 'tenant-2');
    expect(mocks.createBusinessCalendar).toHaveBeenCalledWith(validInput, { tenantId: session.tenantId, userId: session.id });
    expect(response.status).toBe(201);
  });

  it('returns 400 and never calls the service for strict invalid payloads', async () => {
    const response = await createCalendar(new NextRequest('http://localhost/api/service-calendars', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...validInput, timeZone: 'UTC', extra: true }),
    }));

    expect(mocks.createBusinessCalendar).not.toHaveBeenCalled();
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });
  });

  it('reads and updates a calendar using tenant-scoped service calls', async () => {
    const getResponse = await getCalendar(
      new NextRequest('http://localhost/api/service-calendars/calendar-1?tenantId=tenant-2'),
      { params: Promise.resolve({ id: 'calendar-1' }) },
    );
    const patchResponse = await updateCalendar(
      new NextRequest('http://localhost/api/service-calendars/calendar-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...validInput,
          expectedRevision: 1,
          proposedHash: 'a'.repeat(64),
          previewFingerprint: 'b'.repeat(64),
          tenantId: 'tenant-2',
        }),
      }),
      { params: Promise.resolve({ id: 'calendar-1' }) },
    );

    expect(mocks.getBusinessCalendarSnapshot).toHaveBeenCalledWith('calendar-1', { tenantId: session.tenantId, userId: session.id });
    expect(mocks.updateBusinessCalendar).toHaveBeenCalledWith(
      'calendar-1',
      expect.objectContaining({ expectedRevision: 1, proposedHash: 'a'.repeat(64) }),
      { tenantId: session.tenantId, userId: session.id },
    );
    expect(getResponse.status).toBe(200);
    expect(patchResponse.status).toBe(200);
  });

  it('returns impact previews with stable samples and typed conflicts', async () => {
    const response = await previewCalendar(
      new NextRequest('http://localhost/api/service-calendars/calendar-1/impact?tenantId=tenant-2', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...validInput, tenantId: 'tenant-2' }),
      }),
      { params: Promise.resolve({ id: 'calendar-1' }) },
    );

    expect(mocks.previewBusinessCalendarImpact).toHaveBeenCalledWith(
      'calendar-1',
      validInput,
      { tenantId: session.tenantId, userId: session.id },
    );
    expect(response.status).toBe(200);

    mocks.updateBusinessCalendar.mockRejectedValueOnce(new ConflictError('Preview changed'));
    const conflictResponse = await updateCalendar(
      new NextRequest('http://localhost/api/service-calendars/calendar-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...validInput, expectedRevision: 1, proposedHash: 'a'.repeat(64), previewFingerprint: 'b'.repeat(64) }),
      }),
      { params: Promise.resolve({ id: 'calendar-1' }) },
    );
    expect(conflictResponse.status).toBe(409);
  });

  it('serializes authorization and not-found errors without leaking raw exceptions', async () => {
    mocks.requireServiceAdministrator.mockImplementationOnce(() => {
      throw new ForbiddenError('Service administration requires Tenant Admin access');
    });
    const forbidden = await listCalendars(new NextRequest('http://localhost/api/service-calendars'));
    expect(forbidden.status).toBe(403);

    mocks.requireServiceAdministrator.mockReset();
    mocks.requireServiceAdministrator.mockImplementation(() => undefined);
    mocks.getBusinessCalendarSnapshot.mockRejectedValueOnce(new NotFoundError('Business calendar not found'));
    const missing = await getCalendar(
      new NextRequest('http://localhost/api/service-calendars/calendar-1'),
      { params: Promise.resolve({ id: 'calendar-1' }) },
    );
    expect(missing.status).toBe(404);
  });
});
