/**
 * Sentroweb checks of a company.
 *
 * GET  /api/companies/:id/sentroweb-checks   run history (company:read), `(createdAt, id)` cursor
 * POST /api/companies/:id/sentroweb-checks   queue a check (company:update) → 202 { runId }
 *
 * See docs/features/SENTROWEB_CHECK.md.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { listRuns, queueRun } from '@/services/sentroweb/check.service';
import {
  authorizeCompanyRequest,
  isResponse,
  sentrowebRouteError,
} from '@/services/sentroweb/route-support';

type RouteParams = { params: Promise<{ id: string }> };

// More than 10 keys is a 422 from the service (TOO_MANY_ENTITIES); this bound only stops abuse.
const startSchema = z.object({
  entityKeys: z.array(z.string().min(1).max(64)).max(100),
  force: z.boolean().optional(),
});

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
  cursor: z.string().min(1).max(200).optional(),
});

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const context = await authorizeCompanyRequest(request, params, 'read');
    if (isResponse(context)) return context;

    const { searchParams } = new URL(request.url);
    const query = listQuerySchema.parse({
      limit: searchParams.get('limit') ?? undefined,
      cursor: searchParams.get('cursor') ?? undefined,
    });
    return NextResponse.json(await listRuns(context.tenantId, context.companyId, query));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 });
    }
    return sentrowebRouteError(error);
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const context = await authorizeCompanyRequest(request, params, 'update');
    if (isResponse(context)) return context;

    const body = startSchema.parse(await request.json());
    const { runId } = await queueRun({
      tenantId: context.tenantId,
      companyId: context.companyId,
      userId: context.session.id,
      entityKeys: body.entityKeys,
      force: body.force,
    });
    return NextResponse.json({ runId }, { status: 202 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 });
    }
    return sentrowebRouteError(error);
  }
}
