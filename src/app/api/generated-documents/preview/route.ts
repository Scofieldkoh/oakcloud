import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { requireSessionWorkspaceId } from '@/lib/api-helpers';
import { renderTemplateForGeneration } from '@/services/document-generator.service';

// Validation schema for preview request
const previewSchema = z.object({
  templateId: z.string().uuid(),
  companyId: z.string().uuid().optional(),
  contactIds: z.array(z.string().uuid()).optional(),
  selectedDirectorId: z.string().uuid().optional(),
  selectedShareholderId: z.string().uuid().optional(),
  selectedContactId: z.string().uuid().optional(),
  customData: z.record(z.unknown()).optional(),
});

/**
 * POST /api/generated-documents/preview
 * Preview a document without saving
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();

    // Check read permission (preview only requires read)
    await requirePermission(session, 'document', 'read');

    const body = await request.json();
    const data = previewSchema.parse(body);

    const tenantId = requireSessionWorkspaceId(session);
    const rendered = await renderTemplateForGeneration({
      templateId: data.templateId,
      tenantId,
      companyId: data.companyId,
      contactIds: data.contactIds,
      selectedDirectorId: data.selectedDirectorId,
      selectedShareholderId: data.selectedShareholderId,
      selectedContactId: data.selectedContactId,
      customData: data.customData,
      generatedBy: `${session.firstName} ${session.lastName}`.trim(),
      mode: 'preview',
    });

    return NextResponse.json({
      preview: {
        content: rendered.content,
        contentHtml: rendered.contentHtml,
        sections: rendered.sections,
        unresolvedPlaceholders: rendered.missingPlaceholders,
        missingPartials: rendered.missingPartials,
        blockingErrors: rendered.blockingErrors,
      },
      template: rendered.template,
      context: rendered.contextSummary,
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
