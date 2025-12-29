/**
 * Tenant Tags API
 *
 * GET /api/tags - List all tenant (shared) tags
 * POST /api/tags - Create a new tenant tag (admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getTenantTags, createTenantTag } from '@/services/document-tag.service';
import { createTagSchema } from '@/lib/validations/document-tag';
import { createAuditLog } from '@/lib/audit';

export async function GET() {
  try {
    const session = await requireAuth();

    if (!session.tenantId) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 400 });
    }

    const tags = await getTenantTags(session.tenantId);

    return NextResponse.json({ tags });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }
    console.error('Error fetching tenant tags:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();

    if (!session.tenantId) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 400 });
    }

    // Only SUPER_ADMIN or TENANT_ADMIN can create tenant tags
    if (!session.isSuperAdmin && !session.isTenantAdmin) {
      return NextResponse.json(
        { error: 'Only administrators can create shared tags' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const input = createTagSchema.parse(body);

    const tag = await createTenantTag(input, {
      tenantId: session.tenantId,
      userId: session.id,
    });

    // Audit log
    await createAuditLog({
      tenantId: session.tenantId,
      userId: session.id,
      action: 'CREATE',
      entityType: 'DocumentTag',
      entityId: tag.id,
      entityName: tag.name,
      summary: `Created shared tag "${tag.name}"`,
      changeSource: 'MANUAL',
    });

    return NextResponse.json({ tag }, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'A shared tag with this name already exists') {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
      // Zod validation error
      if (error.name === 'ZodError') {
        return NextResponse.json({ error: 'Invalid input', details: error }, { status: 400 });
      }
    }
    console.error('Error creating tenant tag:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
