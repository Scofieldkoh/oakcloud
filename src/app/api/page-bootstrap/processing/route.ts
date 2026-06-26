import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, canAccessCompany } from '@/lib/auth';
import { getUserPreferenceMap } from '@/lib/api/preferences';
import { getProcessingDocumentSummary } from '@/services/document-processing.service';
import { jsonWithServerTiming } from '@/lib/api/company-query';

function parsePreferenceKeys(request: NextRequest) {
  const keys = new URL(request.url).searchParams.get('preferenceKeys');
  return keys?.split(',').map((key) => key.trim()).filter(Boolean) ?? [];
}

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

    const [summary, preferences] = await Promise.all([
      getProcessingDocumentSummary({
        tenantId: session.tenantId,
        companyIds,
        skipTenantFilter: session.isSuperAdmin && !session.tenantId,
      }),
      getUserPreferenceMap(session.id, parsePreferenceKeys(request)),
    ]);

    return jsonWithServerTiming({ summary, preferences }, startedAt);
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
