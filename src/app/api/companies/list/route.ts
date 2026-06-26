import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { parseCompanySearchParams, getCompanyReadScope, emptyCompanySearchResult, jsonWithServerTiming } from '@/lib/api/company-query';
import { searchCompanies } from '@/services/company.service';
import { createLogger, sanitizeError } from '@/lib/logger';

const log = createLogger('api:companies:list');

export async function GET(request: NextRequest) {
  const startedAt = performance.now();

  try {
    const session = await requireAuth();
    await requirePermission(session, 'company', 'read');

    const params = parseCompanySearchParams(request);
    const scope = getCompanyReadScope(session);

    if ('empty' in scope) {
      return jsonWithServerTiming(emptyCompanySearchResult(params.limit), startedAt);
    }

    const result = await searchCompanies(params, scope.tenantId, scope.options);
    return jsonWithServerTiming(result, startedAt);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden' || error.message.startsWith('Permission denied')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if ('code' in error) {
        log.error('GET /companies/list database error:', sanitizeError(error));
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    log.error('GET /companies/list failed with unexpected error:', sanitizeError(error));
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
