/**
 * Connector Test API Route
 *
 * POST /api/connectors/[id]/test - Test connector connection
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { testConnector } from '@/services/connector.service';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    if (!session.isSuperAdmin && !session.isTenantAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const result = await testConnector(id, {
      tenantId: session.tenantId,
      userId: session.id,
      isSuperAdmin: session.isSuperAdmin,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Access denied' || error.message.includes('Access denied')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (error.message === 'Connector not found') {
        return NextResponse.json({ error: 'Connector not found' }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
