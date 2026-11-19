import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { parseIdParams } from '@/lib/validations/params';
import { routeErrorResponse } from '@/lib/api-route-errors';
import { FORM_LINK_NOT_FOUND, invalidBodyResponse, requireFormLinkPermissions, requireFormLinkTenantId } from '@/lib/contact-form-link-access';
import { listLinkCandidates } from '@/services/contact-form-link.service';

type RouteParams = { params: Promise<{ id: string }> };

const querySchema = z.object({
  formId: z.string().uuid().optional(),
  submissionId: z.string().uuid().optional(),
});

/**
 * GET /api/contacts/:id/form-links/candidates: the linkable forms (no query), the responses of a form
 * (`formId`), or the people of one response (`formId` and `submissionId`), each marked eligible or not.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await parseIdParams(params);
    await requireFormLinkPermissions(session, 'read');
    const { searchParams } = new URL(request.url);
    const query = querySchema.safeParse({
      formId: searchParams.get('formId') ?? undefined,
      submissionId: searchParams.get('submissionId') ?? undefined,
    });
    if (!query.success) return invalidBodyResponse(query.error);
    if (query.data.submissionId && !query.data.formId) {
      return NextResponse.json({ error: 'formId is required with submissionId' }, { status: 400 });
    }
    const tenantId = await requireFormLinkTenantId(session, searchParams.get('tenantId'));

    return NextResponse.json(await listLinkCandidates(id, { tenantId }, query.data));
  } catch (error) {
    return routeErrorResponse(error, { notFound: FORM_LINK_NOT_FOUND });
  }
}
