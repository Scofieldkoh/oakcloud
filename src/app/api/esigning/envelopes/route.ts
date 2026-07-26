import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { createErrorResponse, resolveWorkspaceId } from '@/lib/api-helpers';
import { parseQueryParams } from '@/lib/validations/query-params';
import {
  createEsigningEnvelopeSchema,
  esigningListQuerySchema,
} from '@/lib/validations/esigning';
import {
  createEsigningEnvelope,
  deleteDraftEsigningEnvelope,
  listEsigningEnvelopes,
  uploadGeneratedDocumentToEsigningEnvelope,
} from '@/services/esigning-envelope.service';
import {
  parseTaskLaunchContext,
  resolveEsigningGeneratedDocument,
  safelyLinkEsigningEnvelopeTaskOutcome,
} from '@/services/tasks/integration.service';

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();
    await requirePermission(session, 'esigning', 'read');

    const { searchParams } = new URL(request.url);
    const tenantId = resolveWorkspaceId(session, searchParams.get('tenantId'));
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
    const tenantId = resolveWorkspaceId(session, body.tenantId);
    const payload = createEsigningEnvelopeSchema.parse(body);
    const taskContext = parseTaskLaunchContext(body.taskContext);
    const selectedGeneratedDocumentId = z.string().uuid().optional().parse(
      body.generatedDocumentId,
    );
    if (selectedGeneratedDocumentId && !taskContext) {
      throw new Error('Task context is required to select a generated document');
    }
    if (taskContext) {
      await requirePermission(session, 'document', 'read');
    }
    const generatedDocument = taskContext
      ? await resolveEsigningGeneratedDocument(
        tenantId,
        taskContext,
        selectedGeneratedDocumentId,
      )
      : null;

    let result = await createEsigningEnvelope(
      session,
      tenantId,
      payload,
      taskContext,
    );
    try {
      if (generatedDocument) {
        result = await uploadGeneratedDocumentToEsigningEnvelope(
          session,
          tenantId,
          result.id,
          generatedDocument.id,
        );
      }
    } catch (error) {
      await deleteDraftEsigningEnvelope(session, tenantId, result.id);
      throw error;
    }
    if (taskContext) {
      await safelyLinkEsigningEnvelopeTaskOutcome({
        tenantId,
        context: taskContext,
        authoritativeId: result.id,
        userId: session.id,
      });
    }
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid payload', details: error.errors }, { status: 400 });
    }

    return createErrorResponse(error);
  }
}
