import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { createErrorResponse, requireSessionWorkspaceId } from '@/lib/api-helpers';
import { readOakDocPlainText } from '@/lib/document-editor/oakdoc-resolutions';
import { downloadOakDocPartial } from '@/services/oakdoc-partial.service';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** GET /api/template-partials/[id]/text: the Word partial's current wording as plain text. */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    await requirePermission(session, 'document', 'read');
    const tenantId = requireSessionWorkspaceId(session);
    const { id } = await params;

    const { buffer, version } = await downloadOakDocPartial(id, tenantId);
    return NextResponse.json(
      { text: readOakDocPlainText(new Uint8Array(buffer)), revision: version },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    return createErrorResponse(error);
  }
}
