import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import {
  getLetterheadWithMargins,
  upsertLetterhead,
  deleteLetterhead,
  toggleLetterhead,
} from '@/services/letterhead.service';
import type { LetterheadInput, PageMargins } from '@/services/letterhead.service';

// ============================================================================
// GET /api/letterhead
// Get tenant letterhead configuration
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();

    // Check permission
    await requirePermission(session, 'tenant', 'read');

    const { searchParams } = new URL(request.url);

    // Determine tenant ID
    const tenantIdParam = searchParams.get('tenantId');
    const tenantId = session.isSuperAdmin && tenantIdParam ? tenantIdParam : session.tenantId;

    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context required' }, { status: 400 });
    }

    const letterhead = await getLetterheadWithMargins(tenantId);

    if (!letterhead) {
      return NextResponse.json({
        exists: false,
        letterhead: null,
        defaults: {
          pageMargins: { top: 25, right: 20, bottom: 25, left: 20 },
        },
      });
    }

    return NextResponse.json({
      exists: true,
      letterhead: {
        id: letterhead.id,
        headerHtml: letterhead.headerHtml,
        footerHtml: letterhead.footerHtml,
        headerImageUrl: letterhead.headerImageUrl,
        footerImageUrl: letterhead.footerImageUrl,
        logoUrl: letterhead.logoUrl,
        pageMargins: letterhead.parsedMargins,
        isEnabled: letterhead.isEnabled,
        createdAt: letterhead.createdAt,
        updatedAt: letterhead.updatedAt,
      },
    });
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

// ============================================================================
// PUT /api/letterhead
// Create or update tenant letterhead configuration
// ============================================================================

export async function PUT(request: NextRequest) {
  try {
    const session = await requireAuth();

    // Check permission (tenant admin required)
    await requirePermission(session, 'tenant', 'update');

    const { searchParams } = new URL(request.url);

    // Determine tenant ID
    const tenantIdParam = searchParams.get('tenantId');
    const tenantId = session.isSuperAdmin && tenantIdParam ? tenantIdParam : session.tenantId;

    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context required' }, { status: 400 });
    }

    const body = await request.json();

    // Validate input
    const input: LetterheadInput = {};

    if (body.headerHtml !== undefined) {
      if (body.headerHtml !== null && typeof body.headerHtml !== 'string') {
        return NextResponse.json({ error: 'headerHtml must be a string or null' }, { status: 400 });
      }
      input.headerHtml = body.headerHtml;
    }

    if (body.footerHtml !== undefined) {
      if (body.footerHtml !== null && typeof body.footerHtml !== 'string') {
        return NextResponse.json({ error: 'footerHtml must be a string or null' }, { status: 400 });
      }
      input.footerHtml = body.footerHtml;
    }

    if (body.headerImageUrl !== undefined) {
      if (body.headerImageUrl !== null && typeof body.headerImageUrl !== 'string') {
        return NextResponse.json({ error: 'headerImageUrl must be a string or null' }, { status: 400 });
      }
      input.headerImageUrl = body.headerImageUrl;
    }

    if (body.footerImageUrl !== undefined) {
      if (body.footerImageUrl !== null && typeof body.footerImageUrl !== 'string') {
        return NextResponse.json({ error: 'footerImageUrl must be a string or null' }, { status: 400 });
      }
      input.footerImageUrl = body.footerImageUrl;
    }

    if (body.logoUrl !== undefined) {
      if (body.logoUrl !== null && typeof body.logoUrl !== 'string') {
        return NextResponse.json({ error: 'logoUrl must be a string or null' }, { status: 400 });
      }
      input.logoUrl = body.logoUrl;
    }

    if (body.pageMargins !== undefined) {
      if (!isValidPageMargins(body.pageMargins)) {
        return NextResponse.json(
          { error: 'pageMargins must have top, right, bottom, left as numbers' },
          { status: 400 }
        );
      }
      input.pageMargins = body.pageMargins;
    }

    if (body.isEnabled !== undefined) {
      if (typeof body.isEnabled !== 'boolean') {
        return NextResponse.json({ error: 'isEnabled must be a boolean' }, { status: 400 });
      }
      input.isEnabled = body.isEnabled;
    }

    const letterhead = await upsertLetterhead(input, {
      tenantId,
      userId: session.id,
    });

    return NextResponse.json({
      success: true,
      letterhead: {
        id: letterhead.id,
        headerHtml: letterhead.headerHtml,
        footerHtml: letterhead.footerHtml,
        headerImageUrl: letterhead.headerImageUrl,
        footerImageUrl: letterhead.footerImageUrl,
        logoUrl: letterhead.logoUrl,
        pageMargins: letterhead.pageMargins,
        isEnabled: letterhead.isEnabled,
        createdAt: letterhead.createdAt,
        updatedAt: letterhead.updatedAt,
      },
    });
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

// ============================================================================
// PATCH /api/letterhead
// Toggle letterhead enabled status
// ============================================================================

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireAuth();

    // Check permission
    await requirePermission(session, 'tenant', 'update');

    const { searchParams } = new URL(request.url);

    // Determine tenant ID
    const tenantIdParam = searchParams.get('tenantId');
    const tenantId = session.isSuperAdmin && tenantIdParam ? tenantIdParam : session.tenantId;

    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context required' }, { status: 400 });
    }

    const body = await request.json();

    if (typeof body.isEnabled !== 'boolean') {
      return NextResponse.json({ error: 'isEnabled is required and must be a boolean' }, { status: 400 });
    }

    const letterhead = await toggleLetterhead(body.isEnabled, {
      tenantId,
      userId: session.id,
    });

    return NextResponse.json({
      success: true,
      letterhead: {
        id: letterhead.id,
        isEnabled: letterhead.isEnabled,
        updatedAt: letterhead.updatedAt,
      },
    });
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

// ============================================================================
// DELETE /api/letterhead
// Delete tenant letterhead configuration
// ============================================================================

export async function DELETE(request: NextRequest) {
  try {
    const session = await requireAuth();

    // Check permission
    await requirePermission(session, 'tenant', 'delete');

    const { searchParams } = new URL(request.url);

    // Determine tenant ID
    const tenantIdParam = searchParams.get('tenantId');
    const tenantId = session.isSuperAdmin && tenantIdParam ? tenantIdParam : session.tenantId;

    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context required' }, { status: 400 });
    }

    await deleteLetterhead({
      tenantId,
      userId: session.id,
    });

    return NextResponse.json({ success: true });
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

// ============================================================================
// Helpers
// ============================================================================

function isValidPageMargins(margins: unknown): margins is PageMargins {
  if (!margins || typeof margins !== 'object') return false;
  const m = margins as Record<string, unknown>;
  return (
    typeof m.top === 'number' &&
    typeof m.right === 'number' &&
    typeof m.bottom === 'number' &&
    typeof m.left === 'number' &&
    m.top >= 0 &&
    m.right >= 0 &&
    m.bottom >= 0 &&
    m.left >= 0
  );
}
