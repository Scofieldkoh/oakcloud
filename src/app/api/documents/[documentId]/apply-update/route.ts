import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { processBizFileExtractionSelective, type ExtractedBizFileData } from '@/services/bizfile.service';

/**
 * POST /api/documents/:documentId/apply-update
 *
 * Apply selective BizFile update to an existing company.
 * Only updates fields that have differences.
 *
 * Request body:
 * - companyId: string - The existing company ID to update
 * - extractedData: ExtractedBizFileData - The extracted data from preview
 *
 * Permissions:
 * - TENANT_ADMIN or COMPANY_ADMIN with update permission
 * - SUPER_ADMIN for any company
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  try {
    const session = await requireAuth();
    const { documentId } = await params;

    // Parse request body
    const body = await request.json();
    const { companyId, extractedData } = body as {
      companyId: string;
      extractedData: ExtractedBizFileData;
    };

    if (!companyId) {
      return NextResponse.json(
        { error: 'companyId is required' },
        { status: 400 }
      );
    }

    if (!extractedData?.entityDetails?.uen) {
      return NextResponse.json(
        { error: 'extractedData is required with valid UEN' },
        { status: 400 }
      );
    }

    // Get document
    const document = await prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Get company for permission check
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, tenantId: true, name: true, uen: true },
    });

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    // Verify UEN matches
    if (company.uen !== extractedData.entityDetails.uen) {
      return NextResponse.json(
        { error: `UEN mismatch: expected ${company.uen}, got ${extractedData.entityDetails.uen}` },
        { status: 400 }
      );
    }

    // Check tenant access
    if (!session.isSuperAdmin) {
      if (document.tenantId !== session.tenantId || company.tenantId !== session.tenantId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    // Verify user can update this company
    if (!session.isSuperAdmin && !session.isTenantAdmin) {
      const canUpdate = session.companyIds?.includes(companyId);
      if (!canUpdate) {
        return NextResponse.json(
          { error: 'You do not have permission to update this company' },
          { status: 403 }
        );
      }
    }

    // Apply selective update
    const result = await processBizFileExtractionSelective(
      documentId,
      extractedData,
      session.id,
      company.tenantId,
      companyId
    );

    return NextResponse.json({
      success: true,
      companyId: result.companyId,
      created: result.created,
      updatedFields: result.updatedFields,
      message: result.updatedFields.length > 0
        ? `Updated ${result.updatedFields.length} field(s): ${result.updatedFields.join(', ')}`
        : 'No changes were needed - company data is already up to date',
    });
  } catch (error) {
    console.error('BizFile apply-update error:', error);
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
