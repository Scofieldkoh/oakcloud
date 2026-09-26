import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { createErrorResponse, requireSessionWorkspaceId } from '@/lib/api-helpers';
import {
  convertA4DraftToOakDoc,
  reviewA4DraftConversion,
} from '@/services/oakdoc-draft-conversion.service';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const revision = z.number().int().min(0);

const conversionActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('convert'), expectedRevision: revision }),
  z.object({
    action: z.literal('accept'),
    expectedRevision: revision,
    acknowledgedCodes: z.array(z.string().min(1).max(100)).max(50).optional(),
  }),
  z.object({ action: z.literal('reject'), expectedRevision: revision }),
]);

/**
 * POST /api/generated-documents/[id]/oakdoc-conversion
 *
 * `convert` makes a new OakDoc draft from the A4 draft `[id]` (the original
 * is kept). `accept` / `reject` review the converted copy `[id]`.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = conversionActionSchema.parse(await request.json());
    await requirePermission(session, 'document', body.action === 'convert' ? 'create' : 'update');
    const tenantId = requireSessionWorkspaceId(session);
    const context = { tenantId, userId: session.id };

    if (body.action === 'convert') {
      const result = await convertA4DraftToOakDoc(
        { documentId: id, expectedRevision: body.expectedRevision },
        context,
      );
      return NextResponse.json(result, { status: result.reused ? 200 : 201 });
    }

    const result = await reviewA4DraftConversion(
      {
        documentId: id,
        expectedRevision: body.expectedRevision,
        decision: body.action,
        acknowledgedCodes: body.action === 'accept' ? body.acknowledgedCodes : undefined,
      },
      context,
    );
    return NextResponse.json(result);
  } catch (error) {
    return createErrorResponse(error);
  }
}
