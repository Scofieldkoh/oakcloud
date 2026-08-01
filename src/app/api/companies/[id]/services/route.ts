import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createErrorResponse, requireSessionWorkspaceId } from '@/lib/api-helpers';
import { hasPermission, requirePermission } from '@/lib/rbac';
import { searchClientServicesSchema } from '@/lib/validations/client-service';
import { listCompanyServices } from '@/services/client-service';
import { getServiceAgreementCompanyIds } from '@/services/service-agreement';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    await requirePermission(session, 'company', 'read', id);
    const search = request.nextUrl.searchParams;
    const input = searchClientServicesSchema.parse({ status: search.get('status') || undefined, query: search.get('query') || undefined, page: search.get('page') || undefined, limit: search.get('limit') || undefined });
    const tenantId = requireSessionWorkspaceId(session);
    const result = await listCompanyServices(id, input, { tenantId, userId: session.id });
    const canUpdateDocuments = session.isSuperAdmin || await hasPermission(session.id, 'document', 'update');
    const activations = await Promise.all((result.activations ?? []).map(async (activation) => {
      if (!canUpdateDocuments) return { ...activation, canRetry: false };
      const companyIds = await getServiceAgreementCompanyIds(activation.agreementId, tenantId);
      const permissions = await Promise.all(companyIds.map((companyId) => session.isSuperAdmin || hasPermission(session.id, 'company', 'update', companyId)));
      return { ...activation, canRetry: permissions.every(Boolean) };
    }));
    return NextResponse.json({ ...result, activations });
  } catch (error) {
    return createErrorResponse(error);
  }
}
