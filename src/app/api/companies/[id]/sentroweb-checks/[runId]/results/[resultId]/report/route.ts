/**
 * GET /api/companies/:id/sentroweb-checks/:runId/results/:resultId/report (company:read)
 *
 * Streams the Sentroweb PDF report filed for one result (a company Document of type
 * SENTROWEB_REPORT) and records a DOWNLOAD audit entry. The Document is reachable only through
 * its result, scoped by tenant, company and run.
 */
import { NextRequest, NextResponse } from 'next/server';
import { buildContentDispositionHeader } from '@/lib/api-helpers';
import { createAuditLog } from '@/lib/audit';
import { getResultReport } from '@/services/sentroweb/check.service';
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

    const report = await getResultReport(context.tenantId, context.companyId, runId, resultId);
    await createAuditLog({
      tenantId: context.tenantId,
      userId: context.session.id,
      companyId: context.companyId,
      action: 'DOWNLOAD',
      entityType: 'Document',
      entityId: report.documentId,
      entityName: report.fileName,
      summary: `Viewed Sentroweb report "${report.fileName}"`,
      metadata: { sentrowebRunId: runId, sentrowebResultId: resultId },
    });

    return new NextResponse(new Uint8Array(report.pdf), {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-length': String(report.pdf.length),
        'content-disposition': buildContentDispositionHeader('inline', report.fileName),
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (error) {
    return sentrowebRouteError(error);
  }
}
