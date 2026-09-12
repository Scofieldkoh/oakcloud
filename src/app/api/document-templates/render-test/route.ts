import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { requireSessionWorkspaceId } from '@/lib/api-helpers';
import {
  renderUnsavedTemplateSnapshot,
} from '@/services/document-template-preview.service';
import type { PlaceholderContext } from '@/lib/placeholder-resolver';

const renderTestSchema = z.object({
  content: z.string().min(1),
  contentJson: z.unknown().optional(),
  placeholders: z.array(z.record(z.unknown())).optional(),
  compositionType: z.enum(['STANDARD', 'SERVICE_AGREEMENT']).optional(),
  templateScopeId: z.string().optional(),
  name: z.string().optional(),
  category: z.string().optional(),
  companyId: z.string().uuid().optional().nullable(),
  contactIds: z.array(z.string().uuid()).optional(),
  customData: z.record(z.unknown()).optional(),
  context: z.record(z.unknown()).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    await requirePermission(session, 'document', 'read');

    const body = await request.json();
    const data = renderTestSchema.parse(body);
    const tenantId = requireSessionWorkspaceId(session);
    const result = await renderUnsavedTemplateSnapshot({
      tenantId,
      generatedBy: `${session.firstName} ${session.lastName}`.trim(),
      content: data.content,
      contentJson: data.contentJson,
      placeholders: data.placeholders,
      compositionType: data.compositionType,
      templateScopeId: data.templateScopeId,
      name: data.name,
      category: data.category,
      companyId: data.companyId,
      contactIds: data.contactIds,
      customData: data.customData,
      context: data.context as PlaceholderContext | undefined,
    });
    const rendered = result.rendered;

    return NextResponse.json({
      preview: {
        template: rendered.template,
        content: rendered.content,
        contentHtml: rendered.contentHtml,
        sections: rendered.sections,
        unresolvedPlaceholders: rendered.missingPlaceholders,
        missingPartials: rendered.missingPartials,
        blockingErrors: rendered.blockingErrors,
        contextSummary: rendered.contextSummary,
        snapshot: result.snapshot,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 },
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
