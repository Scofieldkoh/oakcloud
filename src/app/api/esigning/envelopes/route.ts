import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { createErrorResponse, resolveTenantId } from '@/lib/api-helpers';
import { parseQueryParams } from '@/lib/validations/query-params';
import {
  createEsigningEnvelopeSchema,
  esigningListQuerySchema,
} from '@/lib/validations/esigning';
import {
  createEsigningEnvelope,
  listEsigningEnvelopes,
} from '@/services/esigning-envelope.service';

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();
    await requirePermission(session, 'esigning', 'read');

    const { searchParams } = new URL(request.url);
    const tenantId = resolveTenantId(session, searchParams.get('tenantId'));
    const query = parseQueryParams(searchParams, esigningListQuerySchema);

    const result = await listEsigningEnvelopes(session, tenantId, query);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid query', details: error.errors }, { status: 400 });
    }

    return createErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    await requirePermission(session, 'esigning', 'create');

    const body = await request.json();
    const tenantId = resolveTenantId(session, body.tenantId);
    const payload = createEsigningEnvelopeSchema.parse(body);

    const result = await createEsigningEnvelope(session, tenantId, payload);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid payload', details: error.errors }, { status: 400 });
    }

    return createErrorResponse(error);
  }
}
