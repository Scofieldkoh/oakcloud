import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@/generated/prisma';
import { requireAuth } from '@/lib/auth';
import {
  ESIGNING_SIGNATURE_SPECIMEN_PREFERENCE_KEY,
  parseSignatureSpecimen,
} from '@/lib/esigning-signature-specimen';
import { prisma } from '@/lib/prisma';

function errorResponse(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET() {
  try {
    const session = await requireAuth();
    const preference = await prisma.userPreference.findUnique({
      where: {
        userId_key: {
          userId: session.id,
          key: ESIGNING_SIGNATURE_SPECIMEN_PREFERENCE_KEY,
        },
      },
      select: { value: true, updatedAt: true },
    });

    return NextResponse.json({
      dataUrl: parseSignatureSpecimen(preference?.value),
      updatedAt: preference?.updatedAt.toISOString() ?? null,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return errorResponse(401, 'Unauthorized');
    }
    return errorResponse(500, 'Failed to load signature specimen');
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await requireAuth();
    const body = (await request.json().catch(() => null)) as { dataUrl?: unknown } | null;
    const dataUrl = parseSignatureSpecimen(body?.dataUrl);
    if (!dataUrl) {
      return errorResponse(400, 'Provide a valid signature image under 1 MB');
    }

    const preference = await prisma.userPreference.upsert({
      where: {
        userId_key: {
          userId: session.id,
          key: ESIGNING_SIGNATURE_SPECIMEN_PREFERENCE_KEY,
        },
      },
      create: {
        userId: session.id,
        key: ESIGNING_SIGNATURE_SPECIMEN_PREFERENCE_KEY,
        value: { dataUrl } satisfies Prisma.InputJsonValue,
      },
      update: {
        value: { dataUrl } satisfies Prisma.InputJsonValue,
      },
      select: { updatedAt: true },
    });

    return NextResponse.json({ dataUrl, updatedAt: preference.updatedAt.toISOString() });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return errorResponse(401, 'Unauthorized');
    }
    return errorResponse(500, 'Failed to save signature specimen');
  }
}

export async function DELETE() {
  try {
    const session = await requireAuth();
    await prisma.userPreference.deleteMany({
      where: {
        userId: session.id,
        key: ESIGNING_SIGNATURE_SPECIMEN_PREFERENCE_KEY,
      },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return errorResponse(401, 'Unauthorized');
    }
    return errorResponse(500, 'Failed to remove signature specimen');
  }
}
