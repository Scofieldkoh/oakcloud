import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { resolveTenantId, createErrorResponse } from '@/lib/api-helpers';
import { storage } from '@/lib/storage';
import { getSubmissionUploadById } from '@/services/form-builder.service';

interface RouteParams {
  params: Promise<{
    id: string;
    submissionId: string;
    uploadId: string;
  }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id, submissionId, uploadId } = await params;
    const session = await requireAuth();
    await requirePermission(session, 'document', 'read');

    const { searchParams } = new URL(request.url);
    const tenantId = resolveTenantId(session, searchParams.get('tenantId'));

    const upload = await getSubmissionUploadById(id, submissionId, uploadId, tenantId);
    if (!upload) {
      return NextResponse.json({ error: 'Upload not found' }, { status: 404 });
    }

    const content = await storage.download(upload.storageKey);

    return new NextResponse(new Uint8Array(content), {
      status: 200,
      headers: {
        'Content-Type': upload.mimeType,
        'Content-Disposition': `attachment; filename="${upload.fileName.replace(/"/g, '')}"`,
        'Content-Length': String(content.length),
      },
    });
  } catch (error) {
    return createErrorResponse(error);
  }
}
