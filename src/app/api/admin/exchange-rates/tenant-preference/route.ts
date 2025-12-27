/**
 * Tenant Exchange Rate Preference API Route
 *
 * GET  /api/admin/exchange-rates/tenant-preference - Get current tenant's rate preference
 * PATCH /api/admin/exchange-rates/tenant-preference - Update rate preference
 *
 * Query params:
 *   tenantId - Optional tenant ID (SUPER_ADMIN only, for managing other tenants)
 *
 * Access: TENANT_ADMIN or SUPER_ADMIN
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import * as exchangeRateService from '@/services/exchange-rate.service';
import { tenantRatePreferenceSchema } from '@/lib/validations/exchange-rate';
import { ZodError } from 'zod';
import { z } from 'zod';

// Extended schema that allows tenantId for SUPER_ADMINs
const updatePreferenceSchema = tenantRatePreferenceSchema.extend({
  tenantId: z.string().uuid().optional(),
});

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

    // Get tenantId from query params (for SUPER_ADMIN) or session
    const { searchParams } = new URL(request.url);
    const queryTenantId = searchParams.get('tenantId');

    // Determine the target tenant
    let targetTenantId: string | null = null;

    if (queryTenantId && session.isSuperAdmin) {
      // SUPER_ADMIN can specify a tenant
      targetTenantId = queryTenantId;
    } else if (session.tenantId) {
      // Use session tenant for tenant admins
      targetTenantId = session.tenantId;
    }

    if (!targetTenantId) {
      return NextResponse.json(
        { error: 'Tenant context required. Please select a tenant.' },
        { status: 400 }
      );
    }

    const preference = await exchangeRateService.getTenantRatePreference(targetTenantId);

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

    const body = await request.json();
    const data = updatePreferenceSchema.parse(body);

    // Determine the target tenant
    let targetTenantId: string | null = null;

    if (data.tenantId && session.isSuperAdmin) {
      // SUPER_ADMIN can specify a tenant
      targetTenantId = data.tenantId;
    } else if (session.tenantId) {
      // Use session tenant for tenant admins
      targetTenantId = session.tenantId;
    }

    if (!targetTenantId) {
      return NextResponse.json(
        { error: 'Tenant context required. Please select a tenant.' },
        { status: 400 }
      );
    }

    await exchangeRateService.updateTenantRatePreference(
      targetTenantId,
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
