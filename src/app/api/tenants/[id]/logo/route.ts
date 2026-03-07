import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { storage, StorageKeys } from '@/lib/storage';

const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
};
const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    if (!session.isSuperAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;

    const tenant = await prisma.tenant.findUnique({
      where: { id, deletedAt: null },
      select: { id: true, logoUrl: true },
    });
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get('file');
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const mimeType = file.type;
    const extension = ALLOWED_TYPES[mimeType];
    if (!extension) {
      return NextResponse.json(
        { error: 'Invalid file type. Allowed: JPEG, PNG, WebP, SVG' },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.byteLength > MAX_SIZE_BYTES) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 2 MB' },
        { status: 400 }
      );
    }

    // Delete any existing logo files (all extensions) before uploading
    for (const ext of Object.values(ALLOWED_TYPES)) {
      const oldKey = StorageKeys.tenantLogo(id, ext);
      const exists = await storage.exists(oldKey);
      if (exists) {
        await storage.delete(oldKey);
      }
    }

    const key = StorageKeys.tenantLogo(id, extension);
    const result = await storage.upload(key, buffer, {
      contentType: mimeType,
      cacheControl: 'public, max-age=31536000',
    });

    await prisma.tenant.update({
      where: { id },
      data: { logoUrl: result.url },
    });

    return NextResponse.json({ logoUrl: result.url });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    if (!session.isSuperAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;

    const tenant = await prisma.tenant.findUnique({
      where: { id, deletedAt: null },
      select: { id: true, logoUrl: true },
    });
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    for (const ext of Object.values(ALLOWED_TYPES)) {
      const key = StorageKeys.tenantLogo(id, ext);
      const exists = await storage.exists(key);
      if (exists) {
        await storage.delete(key);
      }
    }

    await prisma.tenant.update({
      where: { id },
      data: { logoUrl: null },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
