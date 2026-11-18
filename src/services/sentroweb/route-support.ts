/**
 * Shared request handling for the Sentroweb check routes: who may call, which tenant and company
 * the call is scoped to, and how errors become responses. Response bodies never carry
 * credentials, page text or stack details: errors are the fixed messages of their code.
 */
import { NextRequest, NextResponse } from 'next/server';
import { canAccessCompany, requireAuth } from '@/lib/auth';
import { requireWorkspaceContext } from '@/lib/api-helpers';
import { routeErrorResponse } from '@/lib/api-route-errors';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/rbac';
import { parseIdParams } from '@/lib/validations/params';
import type { SessionUser } from '@/lib/auth';
import { SentrowebRequestError } from './errors';

export interface CompanyRequestContext {
  session: SessionUser;
  tenantId: string;
  companyId: string;
}

/**
 * 401 without a session, 400 for a malformed id, 404 for a company that is not in the caller's
 * workspace (the same answer for another tenant's company and for one that does not exist),
 * 403 without the permission or company access. Throws errors the route maps with
 * `sentrowebRouteError`.
 *
 * Running a check needs `company:update`; everything else needs `company:read` (decision D14).
 */
export async function authorizeCompanyRequest(
  request: NextRequest,
  params: Promise<{ id: string }>,
  action: 'read' | 'update',
): Promise<CompanyRequestContext | NextResponse> {
  const session = await requireAuth();
  const { id: companyId } = await parseIdParams(params);
  const { searchParams } = new URL(request.url);
  const tenantResult = await requireWorkspaceContext(session, searchParams.get('tenantId'));
  if (tenantResult.error) return tenantResult.error;
  const tenantId = tenantResult.tenantId;

  const company = await prisma.company.findFirst({
    where: { id: companyId, tenantId, deletedAt: null },
    select: { id: true },
  });
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

  await requirePermission(session, 'company', action, companyId);
  if (!(await canAccessCompany(session, companyId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return { session, tenantId, companyId };
}

export function isResponse(value: CompanyRequestContext | NextResponse): value is NextResponse {
  return value instanceof NextResponse;
}

/** Sentroweb request errors keep their code; everything else uses the shared mapping. */
export function sentrowebRouteError(error: unknown): NextResponse {
  if (error instanceof SentrowebRequestError) {
    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
        ...(error.details === undefined ? {} : { details: error.details }),
      },
      { status: error.httpStatus },
    );
  }
  // A malformed id raises a plain Error from parseIdParams: that is a 400, not a 500.
  return routeErrorResponse(error, { fallback: 'bad-request', logLabel: 'Sentroweb check request failed:' });
}
