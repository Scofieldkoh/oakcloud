import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { resolveTenantId, createErrorResponse } from '@/lib/api-helpers';
import { exportFormResponsesCsv } from '@/services/form-builder.service';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const session = await requireAuth();
    await requirePermission(session, 'document', 'read');

    const { searchParams } = new URL(request.url);
    const tenantId = resolveTenantId(session, searchParams.get('tenantId'));

    const { csv, fileName } = await exportFormResponsesCsv(id, tenantId);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    return createErrorResponse(error);
  }
}
