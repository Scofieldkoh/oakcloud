import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { parseIdParams } from '@/lib/validations/params';
import { routeErrorResponse } from '@/lib/api-route-errors';
import { FORM_LINK_NOT_FOUND, invalidBodyResponse, requireFormLinkPermissions, requireFormLinkTenantId } from '@/lib/contact-form-link-access';
import { linkContactToFormPerson, listContactFormLinks } from '@/services/contact-form-link.service';

type RouteParams = { params: Promise<{ id: string }> };

const linkBodySchema = z.object({
  formId: z.string().uuid(),
  submissionId: z.string().uuid(),
  personRowIndex: z.number().int().min(0).max(1000).nullable(),
  /** The fingerprint the candidates endpoint gave for the chosen person. */
  expectedFingerprint: z.string().length(64),
  tenantId: z.string().uuid().optional(),
});

/** GET /api/contacts/:id/form-links: the KYC/CDD form people linked to a contact, with state, files and suggestions. */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await parseIdParams(params);
    await requireFormLinkPermissions(session, 'read');
    const { searchParams } = new URL(request.url);
    const tenantId = await requireFormLinkTenantId(session, searchParams.get('tenantId'));

    const links = await listContactFormLinks(id, { tenantId });
    return NextResponse.json({ links });
  } catch (error) {
    return routeErrorResponse(error, { notFound: FORM_LINK_NOT_FOUND });
  }
}

/** POST /api/contacts/:id/form-links: link one person of a form response to the contact. */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await parseIdParams(params);
    await requireFormLinkPermissions(session, 'write');
    const parsed = linkBodySchema.safeParse(await request.json());
    if (!parsed.success) return invalidBodyResponse(parsed.error);
    const { searchParams } = new URL(request.url);
    const tenantId = await requireFormLinkTenantId(session, parsed.data.tenantId ?? searchParams.get('tenantId'));

    const link = await linkContactToFormPerson(id, parsed.data, { tenantId, userId: session.id });
    return NextResponse.json({ id: link.id }, { status: 201 });
  } catch (error) {
    return routeErrorResponse(error, { notFound: FORM_LINK_NOT_FOUND });
  }
}
