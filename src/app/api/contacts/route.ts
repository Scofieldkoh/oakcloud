import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { createContactSchema, contactSearchSchema } from '@/lib/validations/contact';
import { createContact, searchContactsWithCounts } from '@/services/contact.service';

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();

    // Check read permission
    await requirePermission(session, 'contact', 'read');

    const { searchParams } = new URL(request.url);

    const params = contactSearchSchema.parse({
      query: searchParams.get('query') || undefined,
      contactType: searchParams.get('contactType') || undefined,
      companyId: searchParams.get('companyId') || undefined,
      page: searchParams.get('page') ? Number(searchParams.get('page')) : undefined,
      limit: searchParams.get('limit') ? Number(searchParams.get('limit')) : undefined,
      sortBy: searchParams.get('sortBy') || undefined,
      sortOrder: searchParams.get('sortOrder') || undefined,
    });

    // For SUPER_ADMIN, allow specifying tenantId via query param
    const tenantIdParam = searchParams.get('tenantId');
    const effectiveTenantId = session.isSuperAdmin && tenantIdParam
      ? tenantIdParam
      : session.tenantId;

    const result = await searchContactsWithCounts(params, effectiveTenantId || undefined);

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden' || error.message.startsWith('Permission denied')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();

    // Check create permission
    await requirePermission(session, 'contact', 'create');

    const body = await request.json();
    const { tenantId: bodyTenantId, ...contactData } = body;
    const data = createContactSchema.parse(contactData);

    // Determine tenant ID: SUPER_ADMIN can specify tenantId, others use session
    let tenantId = session.tenantId;
    if (session.isSuperAdmin && bodyTenantId) {
      tenantId = bodyTenantId;
    }

    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context required' }, { status: 400 });
    }

    const contact = await createContact(data, { tenantId, userId: session.id });

    return NextResponse.json(contact, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden' || error.message.startsWith('Permission denied')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
