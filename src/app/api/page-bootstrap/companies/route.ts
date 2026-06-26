import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import {
  parseCompanySearchParams,
  getCompanyReadScope,
  emptyCompanySearchResult,
  jsonWithServerTiming,
} from '@/lib/api/company-query';
import { getUserPreferenceMap } from '@/lib/api/preferences';
import { searchCompanies, getCompanyStats } from '@/services/company.service';
import { createLogger, sanitizeError } from '@/lib/logger';

const log = createLogger('api:page-bootstrap:companies');

function parsePreferenceKeys(request: NextRequest) {
  const keys = new URL(request.url).searchParams.get('preferenceKeys');
  return keys?.split(',').map((key) => key.trim()).filter(Boolean) ?? [];
}

export async function GET(request: NextRequest) {
  const startedAt = performance.now();

  try {
    const session = await requireAuth();
    await requirePermission(session, 'company', 'read');

    const params = parseCompanySearchParams(request);
    const scope = getCompanyReadScope(session);
    const preferencesPromise = getUserPreferenceMap(session.id, parsePreferenceKeys(request));

    if ('empty' in scope) {
      const preferences = await preferencesPromise;
      return jsonWithServerTiming(
        {
          companies: emptyCompanySearchResult(params.limit),
          stats: null,
          preferences,
        },
        startedAt
      );
    }

    const statsPromise = session.isSuperAdmin || session.isWorkspaceAdmin
      ? getCompanyStats(scope.tenantId, scope.options)
      : Promise.resolve(null);

    const [companies, stats, preferences] = await Promise.all([
      searchCompanies(params, scope.tenantId, scope.options),
      statsPromise,
      preferencesPromise,
    ]);

    return jsonWithServerTiming({ companies, stats, preferences }, startedAt);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden' || error.message.startsWith('Permission denied')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if ('code' in error) {
        log.error('GET /page-bootstrap/companies database error:', sanitizeError(error));
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    log.error('GET /page-bootstrap/companies failed with unexpected error:', sanitizeError(error));
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
