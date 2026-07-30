import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { resolveWorkspaceId } from '@/lib/api-helpers';
import { getPartialUsage } from '@/services/template-partial.service';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// ============================================================================
// GET /api/template-partials/[id]/usage
// Get templates that use this partial
// ============================================================================

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    await requirePermission(session, 'document', 'read');

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const tenantId = resolveWorkspaceId(session, searchParams.get('tenantId'));

    const usage = await getPartialUsage(id, {
      tenantId,
      userId: session.id,
    });

    return NextResponse.json({
      partialId: id,
      usageCount: usage.templates.length,
      serviceVariantCount: usage.serviceVariants.length,
      templates: usage.templates,
      serviceVariants: usage.serviceVariants,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden' || error.message.startsWith('Permission denied')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }
    console.error('Get partial usage error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
