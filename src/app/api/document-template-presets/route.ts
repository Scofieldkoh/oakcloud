import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { createErrorResponse, requireSessionWorkspaceId } from '@/lib/api-helpers';
import { createDocumentTemplatePresetSchema } from '@/lib/validations/document-template-preset';
import {
  createDocumentTemplatePreset,
  listDocumentTemplatePresets,
} from '@/services/document-template-preset.service';

/**
 * GET /api/document-template-presets
 * The workspace's template presets, each member flagged when it can't be
 * added to a batch right now.
 */
export async function GET() {
  try {
    const session = await requireAuth();
    await requirePermission(session, 'document', 'read');
    const tenantId = requireSessionWorkspaceId(session);
    const presets = await listDocumentTemplatePresets({ tenantId, userId: session.id });
    return NextResponse.json({ presets });
  } catch (error) {
    return createErrorResponse(error);
  }
}

/**
 * POST /api/document-template-presets
 * Save an ordered selection of Word templates under a name. The workspace and
 * author come from the session; client-owned fields are rejected.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    await requirePermission(session, 'document', 'create');
    const input = createDocumentTemplatePresetSchema.parse(await request.json());
    const tenantId = requireSessionWorkspaceId(session);
    const preset = await createDocumentTemplatePreset(input, { tenantId, userId: session.id });
    return NextResponse.json(preset, { status: 201 });
  } catch (error) {
    return createErrorResponse(error);
  }
}
