import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { parseIdParams } from '@/lib/validations/params';
import { aiAssistantPatchSessionSchema } from '@/lib/validations/ai-helpbot';
import { updateAssistantSession } from '@/services/ai-helpbot.service';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();

    if (!session.tenantId) {
      return NextResponse.json({ error: 'Tenant context required' }, { status: 400 });
    }

    const { id } = await parseIdParams(params);
    const body = await request.json();
    const parsed = aiAssistantPatchSessionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const updated = await updateAssistantSession(session.tenantId, session.id, id, parsed.data);
    return NextResponse.json({ session: updated });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      if (error.message === 'Session not found') {
        return NextResponse.json({ error: 'Session not found' }, { status: 404 });
      }

      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}