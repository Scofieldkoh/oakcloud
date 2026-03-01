import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { aiAssistantRespondSchema } from '@/lib/validations/ai-helpbot';
import { respondAssistant } from '@/services/ai-helpbot.service';

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();

    if (!session.tenantId) {
      return NextResponse.json({ error: 'Tenant context required' }, { status: 400 });
    }

    const body = await request.json();
    const parsed = aiAssistantRespondSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const result = await respondAssistant(session, session.tenantId, {
      sessionId: parsed.data.sessionId,
      message: parsed.data.message,
      contextSnapshot: parsed.data.contextSnapshot,
      model: parsed.data.model,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      if (error.message === 'Forbidden' || error.message.startsWith('Permission denied')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      if (error.message === 'Session not found' || error.message === 'Company not found') {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }

      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}