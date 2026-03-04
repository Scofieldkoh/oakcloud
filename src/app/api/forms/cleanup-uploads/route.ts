import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createErrorResponse } from '@/lib/api-helpers';
import { cleanupOrphanedUploads } from '@/services/form-builder.service';

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    if (!session.isSuperAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const maxAgeHours = typeof body?.maxAgeHours === 'number' ? body.maxAgeHours : 24;

    const deleted = await cleanupOrphanedUploads(maxAgeHours);

    return NextResponse.json({ deleted });
  } catch (error) {
    return createErrorResponse(error);
  }
}
