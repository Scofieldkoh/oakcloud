import { NextRequest, NextResponse } from 'next/server';
import {
  getShareByToken,
  recordShareView,
} from '@/services/document-generator.service';
import { exportToPDF } from '@/services/document-export.service';

interface RouteParams {
  params: Promise<{ token: string }>;
}

/**
 * Helper function to verify the verification token from POST /api/share/[token]/verify
 */
function verifyVerificationToken(
  verificationToken: string,
  shareId: string
): boolean {
  try {
    const decoded = JSON.parse(
      Buffer.from(verificationToken, 'base64url').toString('utf-8')
    );
    return (
      decoded.shareId === shareId &&
      decoded.verified === true &&
      decoded.exp > Date.now()
    );
  } catch {
    return false;
  }
}

/**
 * GET /api/share/[token]/pdf
 * Download PDF of shared document (public access with permission check)
 *
 * For password-protected shares, first call POST /api/share/[token]/verify
 * with the password, then include the verification token in the
 * X-Verification-Token header.
 *
 * Security: Password is no longer accepted via query string to prevent
 * exposure in server logs, browser history, and referrer headers.
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
      // Get verification token from header (secure method)
      const verificationToken = request.headers.get('X-Verification-Token');

      if (!verificationToken) {
        return NextResponse.json(
          { error: 'Password required', requiresPassword: true },
          { status: 401 }
        );
      }

      // Verify the token
      if (!verifyVerificationToken(verificationToken, share.id)) {
        return NextResponse.json(
          { error: 'Invalid or expired verification', requiresPassword: true },
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

    // Convert Buffer to Uint8Array for NextResponse compatibility
    const pdfData = new Uint8Array(result.buffer);
    return new NextResponse(pdfData, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}.pdf"`,
        'Content-Length': String(result.buffer.length),
      },
    });
  } catch (error) {
    console.error('Share PDF export error:', error instanceof Error ? error.message : 'Unknown error');

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
