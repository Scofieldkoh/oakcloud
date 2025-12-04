import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { getAuditHistory } from '@/lib/audit';
import type { AuditAction } from '@prisma/client';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    // Check audit log read permission (or contact read permission as fallback)
    try {
      await requirePermission(session, 'audit_log', 'read');
    } catch {
      // Fall back to contact read permission
      await requirePermission(session, 'contact', 'read');
    }

    const { searchParams } = new URL(request.url);
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 50;
    const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : 0;
    const actions = searchParams.get('actions')?.split(',') as AuditAction[] | undefined;

    const auditLogs = await getAuditHistory('Contact', id, {
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
      if (error.message === 'Forbidden' || error.message.startsWith('Permission denied')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
