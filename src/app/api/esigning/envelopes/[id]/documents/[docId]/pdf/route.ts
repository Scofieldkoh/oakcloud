import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import {
  buildContentDispositionHeader,
  createErrorResponse,
  resolveTenantId,
} from '@/lib/api-helpers';
import { storage } from '@/lib/storage';
import { getEsigningEnvelopeDetail } from '@/services/esigning-envelope.service';
import { prisma } from '@/lib/prisma';

interface RouteParams {
  params: Promise<{ id: string; docId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id, docId } = await params;
    const session = await requireAuth();
    await requirePermission(session, 'esigning', 'read');

    const { searchParams } = new URL(request.url);
    const tenantId = resolveTenantId(session, searchParams.get('tenantId'));
    const detail = await getEsigningEnvelopeDetail(session, tenantId, id);
    const document = detail.documents.find((entry) => entry.id === docId);

    if (!document) {
      throw new Error('Document not found');
    }

    const stored = await prisma.esigningEnvelopeDocument.findFirst({
      where: {
        id: docId,
        envelopeId: id,
        tenantId,
      },
      select: {
        storagePath: true,
        fileName: true,
      },
    });

    if (!stored) {
      throw new Error('Document not found');
    }

    const buffer = await storage.download(stored.storagePath);
    const disposition = searchParams.get('download') === 'true' ? 'attachment' : 'inline';

    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': buildContentDispositionHeader(disposition, stored.fileName),
      },
    });
  } catch (error) {
    return createErrorResponse(error);
  }
}
