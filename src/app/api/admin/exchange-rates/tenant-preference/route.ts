/**
 * Tenant Exchange Rate Preference API Route
 *
 * GET  /api/admin/exchange-rates/tenant-preference - Get current tenant's rate preference
 * PATCH /api/admin/exchange-rates/tenant-preference - Update rate preference
 *
 * Access: TENANT_ADMIN or SUPER_ADMIN
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import * as exchangeRateService from '@/services/exchange-rate.service';
import { tenantRatePreferenceSchema } from '@/lib/validations/exchange-rate';
import { ZodError } from 'zod';

// ============================================================================
// GET - Get tenant's rate preference
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Must be admin
    if (!session.isSuperAdmin && !session.isTenantAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Must have a tenant context
    if (!session.tenantId) {
      return NextResponse.json(
        { error: 'Tenant context required' },
        { status: 400 }
      );
    }

    const preference = await exchangeRateService.getTenantRatePreference(session.tenantId);

    return NextResponse.json({
      preferredRateType: preference,
    });
  } catch (error) {
    console.error('Failed to get tenant rate preference:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

// ============================================================================
// PATCH - Update tenant's rate preference
// ============================================================================

export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only TENANT_ADMIN or SUPER_ADMIN can update preferences
    if (!session.isSuperAdmin && !session.isTenantAdmin) {
      return NextResponse.json(
        { error: 'Only tenant admins can update rate preferences' },
        { status: 403 }
      );
    }

    // Must have a tenant context
    if (!session.tenantId) {
      return NextResponse.json(
        { error: 'Tenant context required' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const data = tenantRatePreferenceSchema.parse(body);

    await exchangeRateService.updateTenantRatePreference(
      session.tenantId,
      data.preferredRateType
    );

    return NextResponse.json({
      success: true,
      preferredRateType: data.preferredRateType,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Failed to update tenant rate preference:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
