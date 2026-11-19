import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { createErrorResponse, requireSessionWorkspaceId } from '@/lib/api-helpers';
import {
  documentTemplatePresetIdSchema,
  updateDocumentTemplatePresetSchema,
} from '@/lib/validations/document-template-preset';
import {
  deleteDocumentTemplatePreset,
  updateDocumentTemplatePreset,
} from '@/services/document-template-preset.service';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/document-template-presets/[id]
 * Rename a preset and/or replace its templates (keeping the order sent).
 * Required `expectedVersion` makes a stale save fail with 409.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const id = documentTemplatePresetIdSchema.parse((await params).id);
    const input = updateDocumentTemplatePresetSchema.parse(await request.json());
    if (input.templateIds !== undefined) await requirePermission(session, 'document', 'create');
    if (input.name !== undefined) await requirePermission(session, 'document', 'update');
    const tenantId = requireSessionWorkspaceId(session);
    const preset = await updateDocumentTemplatePreset(id, input, { tenantId, userId: session.id });
    return NextResponse.json({ id: preset.id });
  } catch (error) {
    return createErrorResponse(error);
  }
}

/**
 * DELETE /api/document-template-presets/[id]
 * Delete a preset. The templates in it are not touched.
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    await requirePermission(session, 'document', 'delete');
    const id = documentTemplatePresetIdSchema.parse((await params).id);
    const tenantId = requireSessionWorkspaceId(session);
    const result = await deleteDocumentTemplatePreset(id, { tenantId, userId: session.id });
    return NextResponse.json(result);
  } catch (error) {
    return createErrorResponse(error);
  }
}
