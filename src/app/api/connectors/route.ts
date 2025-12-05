/**
 * Connectors API Routes
 *
 * GET  /api/connectors - List connectors
 * POST /api/connectors - Create connector
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createConnectorSchema, connectorSearchSchema } from '@/lib/validations/connector';
import { createConnector, searchConnectors } from '@/services/connector.service';

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();

    // Only admins can access connectors
    if (!session.isSuperAdmin && !session.isTenantAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const params = connectorSearchSchema.parse({
      tenantId: searchParams.get('tenantId') || undefined,
      type: searchParams.get('type') || undefined,
      provider: searchParams.get('provider') || undefined,
      isEnabled: searchParams.get('isEnabled') || undefined,
      includeSystem: searchParams.get('includeSystem') ?? 'true',
      page: searchParams.get('page') || 1,
      limit: searchParams.get('limit') || 20,
    });

    const result = await searchConnectors(params, {
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
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();

    if (!session.isSuperAdmin && !session.isTenantAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const data = createConnectorSchema.parse(body);

    // TENANT_ADMIN can only create for their tenant
    if (!session.isSuperAdmin) {
      if (data.tenantId === null) {
        return NextResponse.json(
          { error: 'Only super admins can create system connectors' },
          { status: 403 }
        );
      }
      if (data.tenantId && data.tenantId !== session.tenantId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      // Default to session tenant if not specified
      if (!data.tenantId) {
        data.tenantId = session.tenantId;
      }
    }

    const connector = await createConnector(data, {
      tenantId: session.tenantId,
      userId: session.id,
      isSuperAdmin: session.isSuperAdmin,
    });

    return NextResponse.json(connector, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message.includes('already exists')) {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
