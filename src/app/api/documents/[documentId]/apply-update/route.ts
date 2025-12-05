import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { processBizFileExtractionSelective, type ExtractedBizFileData, type OfficerAction } from '@/services/bizfile.service';

/**
 * POST /api/documents/:documentId/apply-update
 *
 * Apply selective BizFile update to an existing company.
 * Only updates fields that have differences.
 *
 * Request body:
 * - companyId: string - The existing company ID to update
 * - extractedData: ExtractedBizFileData - The extracted data from preview
 * - officerActions?: OfficerAction[] - Actions for potentially ceased officers
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
    const { companyId, extractedData, officerActions, expectedUpdatedAt } = body as {
      companyId: string;
      extractedData: ExtractedBizFileData;
      officerActions?: OfficerAction[];
      expectedUpdatedAt?: string; // ISO string from preview-diff for concurrent update detection
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
      select: { id: true, tenantId: true, name: true, uen: true, updatedAt: true },
    });

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    // Check for concurrent updates (optimistic locking)
    let concurrentUpdateWarning: string | null = null;
    if (expectedUpdatedAt) {
      const expectedTime = new Date(expectedUpdatedAt).getTime();
      const actualTime = company.updatedAt.getTime();
      if (actualTime > expectedTime) {
        concurrentUpdateWarning = `This company was modified by another user at ${company.updatedAt.toISOString()}. Your changes may overwrite their updates.`;
      }
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
      companyId,
      officerActions
    );

    // Build detailed message
    const messageParts: string[] = [];
    if (result.updatedFields.length > 0) {
      messageParts.push(`${result.updatedFields.length} company field(s)`);
    }
    if (result.officerChanges.added > 0 || result.officerChanges.updated > 0 || result.officerChanges.ceased > 0) {
      const officerParts = [];
      if (result.officerChanges.added > 0) officerParts.push(`${result.officerChanges.added} added`);
      if (result.officerChanges.updated > 0) officerParts.push(`${result.officerChanges.updated} updated`);
      if (result.officerChanges.ceased > 0) officerParts.push(`${result.officerChanges.ceased} ceased`);
      messageParts.push(`Officers: ${officerParts.join(', ')}`);
    }
    if (result.shareholderChanges.added > 0 || result.shareholderChanges.updated > 0 || result.shareholderChanges.removed > 0) {
      const shareholderParts = [];
      if (result.shareholderChanges.added > 0) shareholderParts.push(`${result.shareholderChanges.added} added`);
      if (result.shareholderChanges.updated > 0) shareholderParts.push(`${result.shareholderChanges.updated} updated`);
      if (result.shareholderChanges.removed > 0) shareholderParts.push(`${result.shareholderChanges.removed} removed`);
      messageParts.push(`Shareholders: ${shareholderParts.join(', ')}`);
    }

    const message = messageParts.length > 0
      ? `Updated: ${messageParts.join('; ')}`
      : 'No changes were needed - company data is already up to date';

    return NextResponse.json({
      success: true,
      companyId: result.companyId,
      created: result.created,
      updatedFields: result.updatedFields,
      officerChanges: result.officerChanges,
      shareholderChanges: result.shareholderChanges,
      message,
      // Include warning if concurrent update was detected
      ...(concurrentUpdateWarning && { concurrentUpdateWarning }),
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
