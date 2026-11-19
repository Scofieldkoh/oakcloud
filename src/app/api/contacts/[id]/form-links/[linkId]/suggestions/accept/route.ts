import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { parseIdParams } from '@/lib/validations/params';
import { routeErrorResponse } from '@/lib/api-route-errors';
import { FORM_LINK_NOT_FOUND, invalidBodyResponse, requireFormLinkPermissions, requireFormLinkTenantId } from '@/lib/contact-form-link-access';
import { SUGGESTION_FIELDS } from '@/lib/contact-form-mapping';
import { acceptFormSuggestion } from '@/services/contact-form-link.service';

type RouteParams = { params: Promise<{ id: string; linkId: string }> };

const bodySchema = z.object({
  field: z.enum(SUGGESTION_FIELDS),
  /** The contact's value as the page showed it (null when it was blank). */
  expectedCurrentValue: z.string().max(600).nullable(),
  proposedValue: z.string().min(1).max(600),
  tenantId: z.string().uuid().optional(),
});

/**
 * POST /api/contacts/:id/form-links/:linkId/suggestions/accept: apply ONE suggested field. In one
 * transaction the contact is locked and the link, the row and both values are re-checked; any change
 * since the page was opened answers 409 and writes nothing.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id, linkId } = await parseIdParams(params);
    await requireFormLinkPermissions(session, 'write');
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) return invalidBodyResponse(parsed.error);
    const { searchParams } = new URL(request.url);
    const tenantId = await requireFormLinkTenantId(session, parsed.data.tenantId ?? searchParams.get('tenantId'));

    await acceptFormSuggestion(
      id,
      linkId,
      { field: parsed.data.field, expectedCurrentValue: parsed.data.expectedCurrentValue, proposedValue: parsed.data.proposedValue },
      { tenantId, userId: session.id },
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    return routeErrorResponse(error, { notFound: FORM_LINK_NOT_FOUND });
  }
}
