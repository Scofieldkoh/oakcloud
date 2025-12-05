import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { validateForGeneration } from '@/services/document-validation.service';

// Validation schema for validation request
const validateSchema = z.object({
  templateId: z.string().uuid(),
  companyId: z.string().uuid().optional(),
  contactIds: z.array(z.string().uuid()).optional(),
  customData: z.record(z.unknown()).optional(),
  tenantId: z.string().uuid().optional(), // For SUPER_ADMIN
});

/**
 * POST /api/generated-documents/validate
 * Validate data before generating a document
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();

    // Check read permission (validation only requires read)
    await requirePermission(session, 'document', 'read');

    const body = await request.json();
    const data = validateSchema.parse(body);

    // Determine tenant ID
    let tenantId = session.tenantId;
    if (session.isSuperAdmin && data.tenantId) {
      tenantId = data.tenantId;
    }

    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context required' }, { status: 400 });
    }

    // Run validation
    const result = await validateForGeneration(tenantId, {
      templateId: data.templateId,
      companyId: data.companyId,
      contactIds: data.contactIds,
      customData: data.customData,
    });

    return NextResponse.json({
      isValid: result.isValid,
      errors: result.errors,
      warnings: result.warnings,
      summary: {
        errorCount: result.errors.length,
        warningCount: result.warnings.length,
        requiredPlaceholders: result.resolvedData.requiredPlaceholders.length,
        availablePlaceholders: result.resolvedData.availablePlaceholders.length,
        missingPlaceholders: result.resolvedData.missingPlaceholders.length,
      },
      resolvedData: {
        hasCompany: !!result.resolvedData.company,
        companyName: result.resolvedData.company?.name,
        directorCount: result.resolvedData.directors?.length || 0,
        shareholderCount: result.resolvedData.shareholders?.length || 0,
        missingPlaceholders: result.resolvedData.missingPlaceholders,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

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
