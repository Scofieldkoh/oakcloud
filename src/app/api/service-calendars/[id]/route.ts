import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { resolveWorkspaceId } from '@/lib/api-helpers';
import { requireServiceAdministrator } from '@/lib/service-administration-auth';
import { ValidationError } from '@/lib/errors';
import { businessCalendarUpdateSchema } from '@/lib/validations/business-calendar';
import {
  getBusinessCalendarSnapshot,
  updateBusinessCalendar,
} from '@/services/business-calendar';
import { businessCalendarErrorResponse } from '../route-utils';

type RouteParams = { params: Promise<{ id: string }> };
type JsonRecord = Record<string, unknown>;

function bodyRecord(value: unknown): JsonRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ValidationError('Request body must be an object');
  }
  return value as JsonRecord;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    requireServiceAdministrator(session);
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const query = z.object({ tenantId: z.string().trim().min(1).optional() }).strict().parse(
      Object.fromEntries(searchParams.entries()),
    );
    const tenantId = resolveWorkspaceId(session, query.tenantId ?? null);
    const snapshot = await getBusinessCalendarSnapshot(id, { tenantId, userId: session.id });
    return NextResponse.json({
      ...snapshot,
      weekendDays: [...snapshot.weekendDays].sort((left, right) => left - right),
      holidays: [...snapshot.holidays].sort(),
    });
  } catch (error) {
    return businessCalendarErrorResponse(error, 'GET /api/service-calendars/[id]');
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    requireServiceAdministrator(session);
    const { id } = await params;
    const rawBody = bodyRecord(await request.json());
    const tenantId = resolveWorkspaceId(
      session,
      typeof rawBody.tenantId === 'string' ? rawBody.tenantId : null,
    );
    const { tenantId: _tenantId, ...payload } = rawBody;
    const input = businessCalendarUpdateSchema.parse(payload);
    const calendar = await updateBusinessCalendar(id, input, { tenantId, userId: session.id });
    return NextResponse.json(calendar);
  } catch (error) {
    return businessCalendarErrorResponse(error, 'PATCH /api/service-calendars/[id]');
  }
}
