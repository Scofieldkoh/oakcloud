import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { resolveWorkspaceId } from '@/lib/api-helpers';
import { requireServiceAdministrator } from '@/lib/service-administration-auth';
import { ValidationError } from '@/lib/errors';
import { businessCalendarInputSchema } from '@/lib/validations/business-calendar';
import {
  createBusinessCalendar,
  listBusinessCalendars,
} from '@/services/business-calendar';
import { businessCalendarErrorResponse } from './route-utils';

type JsonRecord = Record<string, unknown>;

function bodyRecord(value: unknown): JsonRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ValidationError('Request body must be an object');
  }
  return value as JsonRecord;
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();
    requireServiceAdministrator(session);
    const { searchParams } = new URL(request.url);
    const query = z.object({ tenantId: z.string().trim().min(1).optional() }).strict().parse(
      Object.fromEntries(searchParams.entries()),
    );
    const tenantId = resolveWorkspaceId(session, query.tenantId ?? null);
    const calendars = await listBusinessCalendars({ tenantId, userId: session.id });
    return NextResponse.json(calendars);
  } catch (error) {
    return businessCalendarErrorResponse(error, 'GET /api/service-calendars');
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    requireServiceAdministrator(session);
    const rawBody = bodyRecord(await request.json());
    const tenantId = resolveWorkspaceId(
      session,
      typeof rawBody.tenantId === 'string' ? rawBody.tenantId : null,
    );
    const { tenantId: _tenantId, ...payload } = rawBody;
    const input = businessCalendarInputSchema.parse(payload);
    const calendar = await createBusinessCalendar(input, { tenantId, userId: session.id });
    return NextResponse.json(calendar, { status: 201 });
  } catch (error) {
    return businessCalendarErrorResponse(error, 'POST /api/service-calendars');
  }
}
