import { NextRequest, NextResponse } from 'next/server';
import {
  getShareByToken,
  verifySharePassword,
  recordShareView,
} from '@/services/document-generator.service';
import { exportToPDF } from '@/services/document-export.service';

interface RouteParams {
  params: Promise<{ token: string }>;
}

/**
 * GET /api/share/[token]/pdf
 * Download PDF of shared document (public access with permission check)
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { token } = await params;

    const share = await getShareByToken(token);

    if (!share) {
      return NextResponse.json(
        { error: 'Share link not found, expired, or revoked' },
        { status: 404 }
      );
    }

    // Check if download is allowed
    const allowedActions = share.allowedActions as string[];
    if (!allowedActions.includes('download')) {
      return NextResponse.json(
        { error: 'Download is not permitted for this share' },
        { status: 403 }
      );
    }

    // Check password if required
    if (share.passwordHash) {
      const { searchParams } = new URL(request.url);
      const password = searchParams.get('password');

      if (!password) {
        return NextResponse.json(
          { error: 'Password required', requiresPassword: true },
          { status: 401 }
        );
      }

      const valid = await verifySharePassword(share.id, password);
      if (!valid) {
        return NextResponse.json(
          { error: 'Invalid password', requiresPassword: true },
          { status: 401 }
        );
      }
    }

    // Record the view
    await recordShareView(share.id);

    const { searchParams } = new URL(request.url);

    // Generate PDF (without letterhead for shared documents - unbranded)
    const result = await exportToPDF({
      documentId: share.document.id,
      tenantId: share.document.tenantId,
      includeLetterhead: false, // Shared documents are unbranded
      format: (searchParams.get('format') as 'A4' | 'Letter') || 'A4',
      orientation: (searchParams.get('orientation') as 'portrait' | 'landscape') || 'portrait',
    });

    // Generate filename
    const filename = share.document.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50);

    return new NextResponse(result.pdf, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}.pdf"`,
        'Content-Length': String(result.pdf.length),
      },
    });
  } catch (error) {
    console.error('Share PDF export error:', error);

    if (error instanceof Error) {
      if (error.message.includes('Chrome') || error.message.includes('browser')) {
        return NextResponse.json(
          { error: 'PDF generation is not available. Please try again later.' },
          { status: 503 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
