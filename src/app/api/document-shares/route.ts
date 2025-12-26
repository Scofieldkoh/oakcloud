import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/document-shares
 * List all document shares for the tenant
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();

    // Check read permission for documents
    await requirePermission(session, 'document', 'read');

    const { searchParams } = new URL(request.url);

    // For SUPER_ADMIN, allow specifying tenantId via query param or viewing all shares
    const tenantIdParam = searchParams.get('tenantId');
    let effectiveTenantId: string | null = session.tenantId;

    if (session.isSuperAdmin && tenantIdParam) {
      effectiveTenantId = tenantIdParam;
    } else if (session.isSuperAdmin && !session.tenantId) {
      // SUPER_ADMIN without tenant context - will show all shares across tenants
      effectiveTenantId = null;
    }

    const skipTenantFilter = session.isSuperAdmin && !effectiveTenantId;

    // Pagination
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const skip = (page - 1) * limit;

    // Filters
    const status = searchParams.get('status'); // active, expired, revoked, all
    const query = searchParams.get('query');
    const documentId = searchParams.get('documentId');

    // Build where clause
    const documentFilter: Record<string, unknown> = {
      deletedAt: null,
    };

    // Tenant scope (skip for SUPER_ADMIN cross-tenant operations)
    if (effectiveTenantId && !skipTenantFilter) {
      documentFilter.tenantId = effectiveTenantId;
    }

    const where: Record<string, unknown> = {
      document: documentFilter,
    };

    // Status filter
    if (status === 'active') {
      where.isActive = true;
      where.OR = [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ];
    } else if (status === 'expired') {
      where.expiresAt = { lt: new Date() };
      where.isActive = true; // Was active but now expired
    } else if (status === 'revoked') {
      where.isActive = false;
    }
    // 'all' or no status - show everything

    // Document filter
    if (documentId) {
      where.documentId = documentId;
    }

    // Search query (search in document title)
    if (query) {
      where.document = {
        ...where.document as object,
        title: { contains: query, mode: 'insensitive' },
      };
    }

    // Get shares with related data
    const [shares, total] = await Promise.all([
      prisma.documentShare.findMany({
        where,
        include: {
          document: {
            select: {
              id: true,
              title: true,
              status: true,
              company: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          _count: {
            select: {
              comments: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.documentShare.count({ where }),
    ]);

    // Calculate effective status for each share
    const sharesWithStatus = shares.map((share) => {
      let effectiveStatus: 'active' | 'expired' | 'revoked' = 'active';

      if (!share.isActive) {
        effectiveStatus = 'revoked';
      } else if (share.expiresAt && new Date(share.expiresAt) < new Date()) {
        effectiveStatus = 'expired';
      }

      return {
        ...share,
        effectiveStatus,
      };
    });

    return NextResponse.json({
      shares: sharesWithStatus,
      total,
      page,
      limit,
    });
  } catch (error) {
    console.error('List document shares error:', error);

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
