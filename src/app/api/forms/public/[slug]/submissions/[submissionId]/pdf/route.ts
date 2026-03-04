import { NextResponse } from 'next/server';
import { verifyPublicFormResponseToken } from '@/lib/form-response-token';
import { checkRateLimit, getClientIp, getRateLimitKey, RATE_LIMIT_CONFIGS } from '@/lib/rate-limit';
import { exportPublicFormResponsePdf } from '@/services/form-builder.service';

interface RouteParams {
  params: Promise<{
    slug: string;
    submissionId: string;
  }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { slug, submissionId } = await params;
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json({ error: 'Download token required' }, { status: 401 });
    }

    const isValidToken = await verifyPublicFormResponseToken(token, {
      slug,
      submissionId,
      scope: 'public_form_pdf_download',
    });

    if (!isValidToken) {
      return NextResponse.json({ error: 'Invalid or expired download token' }, { status: 403 });
    }

    const ip = getClientIp(request);
    const rl = checkRateLimit(getRateLimitKey('form-view', `${ip}:${slug}:pdf`), RATE_LIMIT_CONFIGS.FORM_VIEW);
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const { buffer, fileName } = await exportPublicFormResponsePdf(slug, submissionId);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName.replace(/"/g, '')}"`,
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Form not found' || error.message === 'Submission not found') {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
