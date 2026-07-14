import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { requireAuth } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { rejectContactDuplicatePairSchema } from '@/lib/validations/contact-duplicate';
import { rejectContactDuplicatePair } from '@/services/contact-duplicate.service';

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    await requirePermission(session, 'contact', 'update');
    if (!session.tenantId) {
      return NextResponse.json({ error: 'Tenant context required' }, { status: 400 });
    }
    if (!session.hasAllCompaniesAccess && !session.isWorkspaceAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const input = rejectContactDuplicatePairSchema.parse(await request.json());
    return NextResponse.json(await rejectContactDuplicatePair(input, {
      tenantId: session.tenantId,
      userId: session.id,
    }));
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return NextResponse.json({
        error: 'Invalid duplicate rejection',
        ...(error instanceof ZodError ? { issues: error.issues } : {}),
      }, { status: 400 });
    }
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      if (error.message === 'Forbidden' || error.message.startsWith('Permission denied')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (error.message.includes('stale')) {
        return NextResponse.json({ error: 'Duplicate recommendation is stale' }, { status: 409 });
      }
      if (error.message.includes('not found')) {
        return NextResponse.json({ error: 'Duplicate contact pair not found' }, { status: 404 });
      }
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
