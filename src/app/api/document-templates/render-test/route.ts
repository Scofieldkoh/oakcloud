import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { requireSessionWorkspaceId } from '@/lib/api-helpers';
import { placeholderDefinitionSchema } from '@/lib/validations/document-template';
import { renderTemplateForWorkflow } from '@/services/document-workflow-renderer.service';
import {
  renderUnsavedTemplateSnapshot,
} from '@/services/document-template-preview.service';
import type { PlaceholderContext } from '@/lib/placeholder-resolver';

const SUPERDOC_POC_WORKERS = {
  document: 'https://cdn.jsdelivr.net/npm/@superdoc/docx-engine@0.15.0/dist/assets/browser-worker-entry-CsWhwFNb.js',
  collaboration: 'https://cdn.jsdelivr.net/npm/@superdoc/docx-engine@0.15.0/dist/assets/collaboration-worker-entry-BFoMg_Zo.js',
  reviewIndex: 'https://cdn.jsdelivr.net/npm/@superdoc/docx-engine@0.15.0/dist/assets/review-index-worker-entry-B-MDAFnP.js',
} as const;

type SuperDocPocWorker = keyof typeof SUPERDOC_POC_WORKERS;

function isSuperDocPocWorker(value: string | null): value is SuperDocPocWorker {
  return value === 'document' || value === 'collaboration' || value === 'reviewIndex';
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();
    await requirePermission(session, 'document', 'read');

    const worker = new URL(request.url).searchParams.get('superdocPocWorker');
    if (!isSuperDocPocWorker(worker)) {
      return NextResponse.json({ error: 'Unknown SuperDoc POC worker' }, { status: 404 });
    }

    const upstream = await fetch(SUPERDOC_POC_WORKERS[worker], {
      headers: { Accept: 'application/javascript' },
      cache: 'force-cache',
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { error: 'SuperDoc POC worker is unavailable' },
        { status: 502 },
      );
    }

    return new NextResponse(await upstream.arrayBuffer(), {
      status: 200,
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'private, max-age=86400, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden' || error.message.startsWith('Permission denied')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }
    return NextResponse.json({ error: 'SuperDoc POC worker proxy failed' }, { status: 500 });
  }
}

const renderTestSchema = z.object({
  templateId: z.string().uuid().optional(),
  content: z.string().min(1).optional(),
  contentJson: z.unknown().optional(),
  placeholders: z.array(placeholderDefinitionSchema).optional(),
  compositionType: z.enum(['STANDARD', 'SERVICE_AGREEMENT']).optional(),
  templateScopeId: z.string().optional(),
  name: z.string().optional(),
  category: z.string().optional(),
  companyId: z.string().uuid().optional().nullable(),
  contactIds: z.array(z.string().uuid()).optional(),
  customData: z.record(z.unknown()).optional(),
  context: z.record(z.unknown()).optional(),
}).refine((value) => Boolean(value.content || value.templateId), {
  message: 'Template content or templateId is required',
});

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    await requirePermission(session, 'document', 'read');

    const body = await request.json();
    const data = renderTestSchema.parse(body);
    const tenantId = requireSessionWorkspaceId(session);
    const generatedBy = `${session.firstName} ${session.lastName}`.trim();
    const context = data.context as PlaceholderContext | undefined;

    if (!data.content && data.templateId) {
      const rendered = await renderTemplateForWorkflow({
        templateId: data.templateId,
        tenantId,
        companyId: data.companyId,
        contactIds: data.contactIds,
        customData: data.customData,
        contextOverride: context,
        generatedBy,
        mode: 'test',
      });
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
        },
      });
    }

    const result = await renderUnsavedTemplateSnapshot({
      tenantId,
      generatedBy,
      content: data.content!,
      contentJson: data.contentJson,
      placeholders: data.placeholders,
      compositionType: data.compositionType,
      templateScopeId: data.templateScopeId,
      name: data.name,
      category: data.category,
      companyId: data.companyId,
      contactIds: data.contactIds,
      customData: data.customData,
      context,
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
