/**
 * Exchange Rate Sync API Route
 *
 * POST /api/admin/exchange-rates/sync - Trigger manual sync from MAS
 *
 * Access: SUPER_ADMIN only
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import * as exchangeRateService from '@/services/exchange-rate.service';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only SUPER_ADMIN can trigger sync
    if (!session.isSuperAdmin) {
      return NextResponse.json(
        { error: 'Only super admins can trigger exchange rate sync' },
        { status: 403 }
      );
    }

    const result = await exchangeRateService.syncFromMAS();

    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to sync exchange rates:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
