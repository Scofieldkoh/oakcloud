import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, canAccessCompany } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { resolveWorkspaceId, createErrorResponse } from '@/lib/api-helpers';
import { getCompanyFullDetails } from '@/services/company.service';
import { buildAnnualReturnPrefill } from '@/lib/forms/annual-return-prefill';
import { createPrefilledFormDraft } from '@/services/form-draft.service';

const requestSchema = z.object({
  companyId: z.string().uuid(),
  tenantId: z.string().uuid().optional(),
});
interface RouteParams { params: Promise<{ id: string }> }

/** Staff-only company-prefilled Annual Return draft. No public company-data endpoint. */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    await requirePermission(session, 'document', 'update');
    const { id: formId } = await params;
    if (!z.string().uuid().safeParse(formId).success) {
      return NextResponse.json({ error: 'Invalid form ID' }, { status: 400 });
    }
    const input = requestSchema.parse(await request.json());
    const tenantId = resolveWorkspaceId(session, input.tenantId);
    await requirePermission(session, 'company', 'read', input.companyId);
    if (!(await canAccessCompany(session, input.companyId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const company = await getCompanyFullDetails(input.companyId, tenantId);
    if (!company || company.tenantId !== tenantId) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }
    const { answers, repeatSectionCounts } = buildAnnualReturnPrefill(company);
    const createdAt = new Date().toISOString();
    const draft = await createPrefilledFormDraft(formId, answers, {
      companyId: company.id,
      companyAggregateRevision: company.aggregateRevision,
      createdAt,
      createdById: session.id,
      baseline: answers,
      repeatSectionCounts,
    }, { tenantId, userId: session.id });
    const acraDataAsOf = company.acraRecord?.dataAsOf || null;
    const lastAcraSync = acraDataAsOf ? new Date(acraDataAsOf).getTime() : NaN;
    const stale = !Number.isFinite(lastAcraSync) || Date.now() - lastAcraSync > 90 * 86400000;
    // Never include a bearer token in a log; only the returned URL carries it.
    return NextResponse.json({
      ...draft,
      companyName: company.name,
      acraDataAsOf,
      sourceWarning: stale
        ? 'Company record may be out of date. Review the latest BizFile or ACRA record before sending.'
        : null,
    }, { status: 201 });
  } catch (error) {
    return createErrorResponse(error);
  }
}
