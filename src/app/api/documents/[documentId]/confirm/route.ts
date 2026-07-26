import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { processBizFileExtraction } from '@/services/bizfile';
import {
  bizFileReviewSchema,
  issuesFromZodError,
  normalizeBizFileReviewDraft,
} from '@/lib/validations/bizfile-review';
import {
  parseTaskLaunchContext,
  preflightTaskLaunchContext,
  safelyLinkCompanyTaskOutcome,
} from '@/services/tasks/integration.service';

/**
 * POST /api/documents/:documentId/confirm
 *
 * Save the previously extracted BizFile data.
 * Creates/updates the company and all related records.
 * Document must be in EXTRACTED status (set by the extract endpoint).
 */
export async function POST(
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

    if (!session.isSuperAdmin && document.tenantId !== session.tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (
      document.uploadedById !== session.id &&
      !session.isSuperAdmin &&
      !session.isWorkspaceAdmin
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (document.extractionStatus !== 'EXTRACTED') {
      // Backwards compatibility: accept already-confirmed documents
      if (document.extractionStatus === 'COMPLETED' && document.companyId) {
        const completedBody = await request.json().catch(() => undefined);
        const taskContext = parseTaskLaunchContext(
          typeof completedBody === 'object'
            && completedBody !== null
            && 'taskContext' in completedBody
            ? (completedBody as { taskContext: unknown }).taskContext
            : undefined,
        );
        if (taskContext) {
          await preflightTaskLaunchContext(
            document.tenantId,
            taskContext,
            'COMPANY_PROFILE',
          );
          await safelyLinkCompanyTaskOutcome({
            tenantId: document.tenantId,
            context: taskContext,
            authoritativeId: document.companyId,
            userId: session.id,
          });
        }
        return NextResponse.json({
          success: true,
          companyId: document.companyId,
        });
      }
      return NextResponse.json(
        { error: 'Document extraction not ready for confirmation' },
        { status: 400 }
      );
    }

    if (!document.extractedData) {
      return NextResponse.json(
        { error: 'No extracted data found on document' },
        { status: 400 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          error: 'Please correct the highlighted fields',
          issues: [{
            path: 'request',
            message: 'Enter a valid request body',
            section: 'entity',
          }],
        },
        { status: 400 }
      );
    }
    const candidate = typeof body === 'object' && body !== null && 'extractedData' in body
      ? (body as { extractedData: unknown }).extractedData
      : undefined;
    const taskContext = parseTaskLaunchContext(
      typeof body === 'object' && body !== null && 'taskContext' in body
        ? (body as { taskContext: unknown }).taskContext
        : undefined,
    );
    const parsed = bizFileReviewSchema.safeParse(candidate);

    if (!parsed.success) {
      const validation = issuesFromZodError(parsed.error);
      return NextResponse.json(
        { error: 'Please correct the highlighted fields', issues: validation.issues },
        { status: 400 }
      );
    }
    if (taskContext) {
      await preflightTaskLaunchContext(
        document.tenantId,
        taskContext,
        'COMPANY_PROFILE',
      );
    }

    const correctedData = normalizeBizFileReviewDraft(parsed.data);
    const result = taskContext
      ? await processBizFileExtraction(
        documentId,
        correctedData,
        session.id,
        document.tenantId,
        document.storageKey || undefined,
        document.mimeType,
        taskContext,
      )
      : await processBizFileExtraction(
        documentId,
        correctedData,
        session.id,
        document.tenantId,
        document.storageKey || undefined,
        document.mimeType,
      );
    if (taskContext) {
      await safelyLinkCompanyTaskOutcome({
        tenantId: document.tenantId,
        context: taskContext,
        authoritativeId: result.companyId,
        userId: session.id,
      });
    }

    return NextResponse.json({
      success: true,
      companyId: result.companyId,
      created: result.created,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid task context', details: error.errors },
        { status: 400 },
      );
    }
    console.error('Document confirm error:', error);
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
