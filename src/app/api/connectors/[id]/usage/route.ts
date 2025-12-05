/**
 * Connector Usage Logs API
 *
 * GET /api/connectors/[id]/usage - List usage logs with filtering
 * GET /api/connectors/[id]/usage?export=csv - Export as CSV
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { searchUsageLogs, getUsageStats, exportUsageLogs } from '@/services/connector-usage.service';
import { prisma } from '@/lib/prisma';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/connectors/[id]/usage
 * List usage logs with filtering, or export as CSV
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireAuth();
    const { id: connectorId } = await context.params;
    const { searchParams } = new URL(request.url);

    // Get connector to verify access
    const connector = await prisma.connector.findUnique({
      where: { id: connectorId, deletedAt: null },
      select: { id: true, tenantId: true, name: true },
    });

    if (!connector) {
      return NextResponse.json({ error: 'Connector not found' }, { status: 404 });
    }

    // Access control: SUPER_ADMIN can see all, TENANT_ADMIN can only see their tenant's connectors
    const isSystem = connector.tenantId === null;
    if (!session.isSuperAdmin) {
      if (isSystem) {
        // TENANT_ADMIN can view usage of system connectors used by their tenant
        // But can't see global usage
      } else if (connector.tenantId !== session.tenantId) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }
    }

    // Parse query parameters
    const exportFormat = searchParams.get('export');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
    const startDate = searchParams.get('startDate')
      ? new Date(searchParams.get('startDate')!)
      : undefined;
    // Set end date to end of day (23:59:59.999) to include all records from that day
    const endDate = searchParams.get('endDate')
      ? (() => {
          const d = new Date(searchParams.get('endDate')!);
          d.setUTCHours(23, 59, 59, 999);
          return d;
        })()
      : undefined;
    const model = searchParams.get('model') || undefined;
    const operation = searchParams.get('operation') || undefined;
    const success = searchParams.get('success')
      ? searchParams.get('success') === 'true'
      : undefined;
    const sortBy = (searchParams.get('sortBy') as 'createdAt' | 'costCents' | 'totalTokens' | 'latencyMs') || 'createdAt';
    const sortOrder = (searchParams.get('sortOrder') as 'asc' | 'desc') || 'desc';

    // For TENANT_ADMIN viewing system connector, filter to their tenant's usage
    const filterTenantId = !session.isSuperAdmin && isSystem ? session.tenantId : undefined;

    const searchParams_parsed = {
      connectorId,
      tenantId: filterTenantId || undefined,
      model,
      operation,
      success,
      startDate,
      endDate,
      page,
      limit,
      sortBy,
      sortOrder,
    };

    // Handle CSV export
    if (exportFormat === 'csv') {
      const csv = await exportUsageLogs(searchParams_parsed);

      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="connector-usage-${connectorId}-${new Date().toISOString().split('T')[0]}.csv"`,
        },
      });
    }

    // Get usage logs
    const { logs, total } = await searchUsageLogs(searchParams_parsed);

    // Also get stats summary for this connector
    const stats = await getUsageStats(connectorId, startDate, endDate);

    return NextResponse.json({
      logs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      stats: {
        totalCalls: stats.totalCalls,
        successfulCalls: stats.successfulCalls,
        failedCalls: stats.failedCalls,
        totalTokens: stats.totalTokens,
        totalCostUsd: stats.totalCostUsd,
        avgLatencyMs: stats.avgLatencyMs,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[Connector Usage API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
