import { NextRequest, NextResponse } from 'next/server';
import { getShareByToken, recordShareView } from '@/services/document-generator.service';
import { verifyShareVerificationToken } from '@/lib/share-verification-token';
import { jsonWithServerTiming } from '@/lib/api/company-query';

interface RouteParams {
  params: Promise<{ token: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const startedAt = performance.now();

  try {
    const { token } = await params;
    const share = await getShareByToken(token);

    if (!share) {
      return NextResponse.json(
        { error: 'Share link not found, expired, or revoked' },
        { status: 404 }
      );
    }

    if (share.passwordHash) {
      const verificationToken = request.headers.get('X-Verification-Token');

      if (!verificationToken) {
        return NextResponse.json(
          { error: 'Password required', requiresPassword: true },
          { status: 401 }
        );
      }

      if (!(await verifyShareVerificationToken(verificationToken, share.id))) {
        return NextResponse.json(
          { error: 'Invalid or expired verification', requiresPassword: true },
          { status: 401 }
        );
      }
    }

    await recordShareView(share.id);

    return jsonWithServerTiming(
      {
        shareId: share.id,
        allowedActions: share.allowedActions,
        allowComments: share.allowComments,
        document: {
          id: share.document.id,
          title: share.document.title,
          content: share.document.content,
          contentJson: share.document.contentJson,
          status: share.document.status,
          useLetterhead: share.document.useLetterhead,
          createdAt: share.document.createdAt,
          updatedAt: share.document.updatedAt,
        },
      },
      startedAt
    );
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
