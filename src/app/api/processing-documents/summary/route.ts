import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, canAccessCompany } from '@/lib/auth';
import { getProcessingDocumentSummary } from '@/services/document-processing.service';
import { jsonWithServerTiming } from '@/lib/api/company-query';

export async function GET(request: NextRequest) {
  const startedAt = performance.now();

  try {
    const session = await requireAuth();
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');

    let companyIds: string[] | undefined;

    if (companyId) {
      if (!(await canAccessCompany(session, companyId))) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      companyIds = [companyId];
    } else if (!session.isSuperAdmin && !session.isWorkspaceAdmin && !session.hasAllCompaniesAccess) {
      companyIds = session.companyIds;
    }

    const summary = await getProcessingDocumentSummary({
      tenantId: session.tenantId,
      companyIds,
      skipTenantFilter: session.isSuperAdmin && !session.tenantId,
    });

    return jsonWithServerTiming(summary, startedAt);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
