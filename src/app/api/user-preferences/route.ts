/**
 * User Preferences API
 *
 * GET /api/user-preferences?key=...  - Get a single preference value
 * PUT /api/user-preferences         - Upsert a preference value
 *
 * Preferences are per-user and are intended for UI persistence (e.g., table column widths).
 */

import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { Prisma } from '@prisma/client';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ success: false, error: { code, message } }, { status });
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');

    if (!key) {
      return jsonError(400, 'VALIDATION_ERROR', 'key is required');
    }

    const pref = await prisma.userPreference.findUnique({
      where: { userId_key: { userId: session.id, key } },
      select: { key: true, value: true, updatedAt: true },
    });

    return NextResponse.json({
      success: true,
      data: {
        key,
        value: pref?.value ?? null,
        updatedAt: pref?.updatedAt?.toISOString() ?? null,
      },
      meta: { requestId: uuidv4(), timestamp: new Date().toISOString() },
    });
  } catch (error) {
    console.error('User preferences GET error:', error);
    if (error instanceof Error && error.message === 'Unauthorized') {
      return jsonError(401, 'AUTHENTICATION_REQUIRED', 'Unauthorized');
    }
    return jsonError(500, 'INTERNAL_ERROR', 'Internal server error');
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await requireAuth();
    const body = await request.json().catch(() => null) as { key?: unknown; value?: unknown } | null;

    const key = typeof body?.key === 'string' ? body.key.trim() : '';
    if (!key) {
      return jsonError(400, 'VALIDATION_ERROR', 'key is required');
    }

    // `value` is stored as JSON. We intentionally allow any JSON-serializable structure.
    const value = body?.value ?? {};

    const pref = await prisma.userPreference.upsert({
      where: { userId_key: { userId: session.id, key } },
      create: { userId: session.id, key, value: value as Prisma.InputJsonValue },
      update: { value: value as Prisma.InputJsonValue },
      select: { key: true, value: true, updatedAt: true },
    });

    return NextResponse.json({
      success: true,
      data: {
        key: pref.key,
        value: pref.value,
        updatedAt: pref.updatedAt.toISOString(),
      },
      meta: { requestId: uuidv4(), timestamp: new Date().toISOString() },
    });
  } catch (error) {
    console.error('User preferences PUT error:', error);
    if (error instanceof Error && error.message === 'Unauthorized') {
      return jsonError(401, 'AUTHENTICATION_REQUIRED', 'Unauthorized');
    }
    return jsonError(500, 'INTERNAL_ERROR', 'Internal server error');
  }
}

