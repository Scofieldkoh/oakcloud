/**
 * Available Tags API
 *
 * GET /api/tags/available - Get all available tags for the current context
 * Returns tenant tags + company tags (if companyId is provided)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, canAccessCompany } from '@/lib/auth';
import { getAvailableTags, searchTags, getRecentTags } from '@/services/document-tag.service';

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();
    const { searchParams } = new URL(request.url);

    if (!session.tenantId) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 400 });
    }

    const companyId = searchParams.get('companyId');
    const query = searchParams.get('query');
    const recent = searchParams.get('recent') === 'true';
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    // If companyId provided, verify access
    if (companyId && !(await canAccessCompany(session, companyId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    let tags;
    if (recent) {
      // Get recently used tags
      tags = await getRecentTags(session.tenantId, companyId || undefined, 5);
    } else if (query !== null) {
      // Search tags by name
      tags = await searchTags(session.tenantId, companyId || undefined, query, Math.min(limit, 100));
    } else {
      // Get all available tags
      tags = await getAvailableTags(session.tenantId, companyId || undefined);
    }

    return NextResponse.json({ tags });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }
    console.error('Error fetching available tags:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
