/**
 * GET /api/companies/:id/sentroweb-checks/:runId/results/:resultId/screenshot (company:read)
 *
 * Streams the PNG screenshot kept as evidence for one result and records a DOWNLOAD audit entry.
 * Sentroweb's PDF report is a normal company Document and is opened through Documents.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAuditLog } from '@/lib/audit';
import { getResultScreenshot } from '@/services/sentroweb/check.service';
import {
  authorizeCompanyRequest,
  isResponse,
  sentrowebRouteError,
} from '@/services/sentroweb/route-support';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; runId: string; resultId: string }> },
) {
  try {
    // The route's ids (runId, resultId, id) are validated as UUIDs by authorizeCompanyRequest.
    const context = await authorizeCompanyRequest(request, params, 'read');
    if (isResponse(context)) return context;
    const { runId, resultId } = await params;

    const screenshot = await getResultScreenshot(context.tenantId, context.companyId, runId, resultId);
    await createAuditLog({
      tenantId: context.tenantId,
      userId: context.session.id,
      companyId: context.companyId,
      action: 'DOWNLOAD',
      entityType: 'SentrowebCheckResult',
      entityId: resultId,
      entityName: screenshot.resultName,
      summary: 'Viewed a Sentroweb check screenshot',
      metadata: { runId },
    });

    return new NextResponse(new Uint8Array(screenshot.png), {
      status: 200,
      headers: {
        'content-type': 'image/png',
        'content-disposition': `inline; filename="${screenshot.fileName}"`,
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (error) {
    return sentrowebRouteError(error);
  }
}
