import { NextRequest, NextResponse } from 'next/server';
import { canAccessCompany, requireAuth } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import {
  aiAssistantCreateSessionSchema,
  aiAssistantListSessionsSchema,
} from '@/lib/validations/ai-helpbot';
import {
  createAssistantSession,
  listAssistantSessions,
} from '@/services/ai-helpbot.service';

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();

    if (!session.tenantId) {
      return NextResponse.json({ error: 'Tenant context required' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const parsed = aiAssistantListSessionsSchema.safeParse({
      contextId: searchParams.get('contextId') || undefined,
      includeArchived: searchParams.get('includeArchived') || undefined,
      limit: searchParams.get('limit') || undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const sessions = await listAssistantSessions(session.tenantId, session.id, parsed.data);

    return NextResponse.json({ sessions });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();

    if (!session.tenantId) {
      return NextResponse.json({ error: 'Tenant context required' }, { status: 400 });
    }

    const body = await request.json();
    const parsed = aiAssistantCreateSessionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { contextId, title } = parsed.data;

    if (contextId) {
      await requirePermission(session, 'company', 'read', contextId);
      const canAccess = await canAccessCompany(session, contextId);
      if (!canAccess) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const created = await createAssistantSession(session.tenantId, session.id, contextId, title);

    return NextResponse.json({ session: created }, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      if (error.message === 'Forbidden' || error.message.startsWith('Permission denied')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}