import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { parseIdParams } from '@/lib/validations/params';
import { routeErrorResponse } from '@/lib/api-route-errors';
import { FORM_LINK_NOT_FOUND, requireFormLinkPermissions, requireFormLinkTenantId } from '@/lib/contact-form-link-access';
import { unlinkContactFormLink } from '@/services/contact-form-link.service';

type RouteParams = { params: Promise<{ id: string; linkId: string }> };

/** DELETE /api/contacts/:id/form-links/:linkId: unlink (soft). Allowed even when the response was deleted. */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id, linkId } = await parseIdParams(params);
    await requireFormLinkPermissions(session, 'write');
    const { searchParams } = new URL(request.url);
    const tenantId = await requireFormLinkTenantId(session, searchParams.get('tenantId'));

    await unlinkContactFormLink(id, linkId, { tenantId, userId: session.id });
    return NextResponse.json({ success: true });
  } catch (error) {
    return routeErrorResponse(error, { notFound: FORM_LINK_NOT_FOUND });
  }
}
