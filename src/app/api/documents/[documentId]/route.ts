import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { storage } from '@/lib/storage';

const CANCELLABLE_STATUSES = ['PENDING', 'PROCESSING', 'EXTRACTED', 'FAILED'];

/**
 * DELETE /api/documents/:documentId
 *
 * Cancel/clean up a pending document that has not yet been confirmed.
 * Deletes the storage file and the document record.
 * Only allowed for documents in PENDING, PROCESSING, EXTRACTED, or FAILED status.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  try {
    const session = await requireAuth();
    const { documentId } = await params;

    const document = await prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Check tenant access
    if (!session.isSuperAdmin && document.tenantId !== session.tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Only allow uploader or admin to cancel
    if (
      document.uploadedById !== session.id &&
      !session.isSuperAdmin &&
      !session.isTenantAdmin
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Only allow cancellation for pre-confirm statuses
    if (!CANCELLABLE_STATUSES.includes(document.extractionStatus || '')) {
      return NextResponse.json(
        { error: 'Document cannot be cancelled in its current status' },
        { status: 409 }
      );
    }

    // Delete storage file (best-effort)
    if (document.storageKey) {
      try {
        await storage.delete(document.storageKey);
      } catch {
        // Log but don't fail — record cleanup is more important
      }
    }

    // Delete the document record
    await prisma.document.delete({ where: { id: documentId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Document delete error:', error);
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
