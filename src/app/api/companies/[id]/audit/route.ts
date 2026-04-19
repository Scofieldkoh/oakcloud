import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, canAccessCompany } from '@/lib/auth';
import { getCompanyAuditHistory } from '@/lib/audit';
import { clampLimit, parseIntegerParam, parseNumericParam } from '@/lib/api-helpers';
import type { AuditAction } from '@/generated/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    if (!(await canAccessCompany(session, id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const limit = clampLimit(parseNumericParam(searchParams.get('limit')), { default: 50, max: 200 });
    const offset = Math.max(0, parseIntegerParam(searchParams.get('offset'), 0) ?? 0);
    const actions = searchParams.get('actions')?.split(',') as AuditAction[] | undefined;

    const auditLogs = await getCompanyAuditHistory(id, {
      limit,
      offset,
      actions,
    });

    return NextResponse.json(auditLogs);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
