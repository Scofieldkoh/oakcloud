import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { resolveWorkspaceId } from '@/lib/api-helpers';
import { requireServiceAdministrator } from '@/lib/service-administration-auth';
import { ValidationError } from '@/lib/errors';
import { businessCalendarInputSchema } from '@/lib/validations/business-calendar';
import { previewBusinessCalendarImpact } from '@/services/business-calendar';
import { businessCalendarErrorResponse } from '../../route-utils';

type RouteParams = { params: Promise<{ id: string }> };

function bodyRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ValidationError('Request body must be an object');
  }
  return value as Record<string, unknown>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    requireServiceAdministrator(session);
    const { id } = await params;
    const rawBody = bodyRecord(await request.json());
    const { searchParams } = new URL(request.url);
    const query = z.object({ tenantId: z.string().trim().min(1).optional() }).strict().parse(
      Object.fromEntries(searchParams.entries()),
    );
    const tenantId = resolveWorkspaceId(
      session,
      query.tenantId ?? (typeof rawBody.tenantId === 'string' ? rawBody.tenantId : null),
    );
    const { tenantId: _tenantId, ...payload } = rawBody;
    const input = businessCalendarInputSchema.parse(payload);
    const impact = await previewBusinessCalendarImpact(id, input, { tenantId, userId: session.id });
    return NextResponse.json(impact);
  } catch (error) {
    return businessCalendarErrorResponse(error, 'POST /api/service-calendars/[id]/impact');
  }
}
