import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { parseIdParams } from '@/lib/validations/params';
import { aiAssistantMessagesQuerySchema } from '@/lib/validations/ai-helpbot';
import { getAssistantMessages } from '@/services/ai-helpbot.service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();

    if (!session.tenantId) {
      return NextResponse.json({ error: 'Tenant context required' }, { status: 400 });
    }

    const { id } = await parseIdParams(params);
    const { searchParams } = new URL(request.url);

    const parsed = aiAssistantMessagesQuerySchema.safeParse({
      limit: searchParams.get('limit') || undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const payload = await getAssistantMessages(session.tenantId, session.id, id, parsed.data.limit);
    return NextResponse.json(payload);
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