import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, canAccessCompany } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { requireTenantContext } from '@/lib/api-helpers';
import { toggleContactPoc } from '@/services/contact-detail.service';

type RouteParams = {
  params: Promise<{ id: string }>;
};

/**
 * POST /api/companies/[id]/contact-details/toggle-poc
 * Toggle POC status for a contact linked to a company
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id: companyId } = await params;

    // Check company access
    if (!(await canAccessCompany(session, companyId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Check update permission
    await requirePermission(session, 'company', 'update', companyId);

    // Resolve tenant context
    const body = await request.json();
    const { contactId, isPoc, tenantId: bodyTenantId } = body;
    const tenantResult = await requireTenantContext(session, bodyTenantId);
    if (tenantResult.error) return tenantResult.error;
    const tenantId = tenantResult.tenantId;

    if (!contactId) {
      return NextResponse.json(
        { error: 'Contact ID is required' },
        { status: 400 }
      );
    }

    if (typeof isPoc !== 'boolean') {
      return NextResponse.json(
        { error: 'isPoc must be a boolean' },
        { status: 400 }
      );
    }

    await toggleContactPoc(companyId, contactId, isPoc, {
      tenantId,
      userId: session.id,
    });

    return NextResponse.json({
      message: isPoc ? 'Set as Point of Contact' : 'Removed as Point of Contact',
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden' || error.message.startsWith('Permission denied')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (error.message === 'Company not found' || error.message === 'Contact not found') {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
    }
    console.error('Error toggling POC:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to toggle POC' },
      { status: 500 }
    );
  }
}
