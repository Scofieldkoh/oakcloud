/**
 * Company Tags API
 *
 * GET /api/companies/:id/tags - List/search tags for a company
 * POST /api/companies/:id/tags - Create a new tag
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, canAccessCompany } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { parseIdParams } from '@/lib/validations/params';
import {
  getCompanyTags,
  searchTags,
  getRecentTags,
  createTag,
} from '@/services/document-tag.service';
import { createTagSchema } from '@/lib/validations/document-tag';
import { createAuditLog } from '@/lib/audit';

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id: companyId } = await parseIdParams(params);
    const { searchParams } = new URL(request.url);

    // Verify company access
    if (!(await canAccessCompany(session, companyId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get company to verify tenant
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { tenantId: true },
    });

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    // Check query params
    const query = searchParams.get('query');
    const recent = searchParams.get('recent') === 'true';
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    let tags;
    if (recent) {
      // Get last 5 recently used tags (company tags only)
      tags = await getRecentTags(company.tenantId, companyId, 5);
    } else if (query !== null) {
      // Search tags by name (company tags only)
      tags = await searchTags(company.tenantId, companyId, query, Math.min(limit, 100));
    } else {
      // Get all company-specific tags (excludes tenant tags)
      tags = await getCompanyTags(companyId, company.tenantId);
    }

    return NextResponse.json({ tags });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }
    console.error('Error fetching company tags:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id: companyId } = await parseIdParams(params);

    // Verify company access
    if (!(await canAccessCompany(session, companyId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get company to verify tenant
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { tenantId: true },
    });

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    const body = await request.json();
    const input = createTagSchema.parse(body);

    const tag = await createTag(input, {
      tenantId: company.tenantId,
      companyId,
      userId: session.id,
    });

    // Audit log
    await createAuditLog({
      tenantId: company.tenantId,
      userId: session.id,
      companyId,
      action: 'CREATE',
      entityType: 'DocumentTag',
      entityId: tag.id,
      entityName: tag.name,
      summary: `Created tag "${tag.name}"`,
      changeSource: 'MANUAL',
    });

    return NextResponse.json({ tag }, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (error.message === 'A tag with this name already exists') {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
      // Zod validation error
      if (error.name === 'ZodError') {
        return NextResponse.json({ error: 'Invalid input', details: error }, { status: 400 });
      }
    }
    console.error('Error creating tag:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
