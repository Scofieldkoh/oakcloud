/**
 * Letterhead Service
 *
 * Manages tenant letterhead configuration for PDF export.
 * Includes header, footer, logo, and page margin settings.
 */

import { prisma } from '@/lib/prisma';
import { createAuditLog } from '@/lib/audit';
import type { TenantLetterhead, Prisma } from '@prisma/client';

// ============================================================================
// Types
// ============================================================================

export interface PageMargins {
  top: number;    // mm
  right: number;
  bottom: number;
  left: number;
}

export interface LetterheadInput {
  headerHtml?: string | null;
  footerHtml?: string | null;
  headerImageUrl?: string | null;
  footerImageUrl?: string | null;
  logoUrl?: string | null;
  pageMargins?: PageMargins;
  isEnabled?: boolean;
}

export interface TenantAwareParams {
  tenantId: string;
  userId: string;
}

// Default page margins in mm
const DEFAULT_MARGINS: PageMargins = {
  top: 25,
  right: 20,
  bottom: 25,
  left: 20,
};

// ============================================================================
// Read Operations
// ============================================================================

/**
 * Get letterhead configuration for a tenant
 */
export async function getLetterhead(tenantId: string): Promise<TenantLetterhead | null> {
  return prisma.tenantLetterhead.findUnique({
    where: { tenantId },
  });
}

/**
 * Get letterhead with parsed page margins
 */
export async function getLetterheadWithMargins(
  tenantId: string
): Promise<(TenantLetterhead & { parsedMargins: PageMargins }) | null> {
  const letterhead = await prisma.tenantLetterhead.findUnique({
    where: { tenantId },
  });

  if (!letterhead) return null;

  return {
    ...letterhead,
    parsedMargins: parsePageMargins(letterhead.pageMargins),
  };
}

// ============================================================================
// Write Operations
// ============================================================================

/**
 * Create or update letterhead configuration
 */
export async function upsertLetterhead(
  input: LetterheadInput,
  params: TenantAwareParams
): Promise<TenantLetterhead> {
  const { tenantId, userId } = params;

  const existing = await prisma.tenantLetterhead.findUnique({
    where: { tenantId },
  });

  const data: Prisma.TenantLetterheadUpdateInput = {
    headerHtml: input.headerHtml,
    footerHtml: input.footerHtml,
    headerImageUrl: input.headerImageUrl,
    footerImageUrl: input.footerImageUrl,
    logoUrl: input.logoUrl,
    isEnabled: input.isEnabled,
  };

  if (input.pageMargins) {
    data.pageMargins = input.pageMargins as Prisma.InputJsonValue;
  }

  let letterhead: TenantLetterhead;

  if (existing) {
    letterhead = await prisma.tenantLetterhead.update({
      where: { tenantId },
      data,
    });

    await createAuditLog({
      action: 'UPDATE',
      entityType: 'TenantLetterhead',
      entityId: letterhead.id,
      changes: {
        before: existing,
        after: letterhead,
      },
      userId,
      tenantId,
    });
  } else {
    letterhead = await prisma.tenantLetterhead.create({
      data: {
        tenantId,
        headerHtml: input.headerHtml,
        footerHtml: input.footerHtml,
        headerImageUrl: input.headerImageUrl,
        footerImageUrl: input.footerImageUrl,
        logoUrl: input.logoUrl,
        pageMargins: (input.pageMargins || DEFAULT_MARGINS) as Prisma.InputJsonValue,
        isEnabled: input.isEnabled ?? true,
      },
    });

    await createAuditLog({
      action: 'CREATE',
      entityType: 'TenantLetterhead',
      entityId: letterhead.id,
      changes: { after: letterhead },
      userId,
      tenantId,
    });
  }

  return letterhead;
}

/**
 * Update header image URL
 */
export async function updateHeaderImage(
  imageUrl: string | null,
  params: TenantAwareParams
): Promise<TenantLetterhead> {
  const { tenantId, userId } = params;

  const existing = await prisma.tenantLetterhead.findUnique({
    where: { tenantId },
  });

  if (!existing) {
    // Create new letterhead with just the header image
    return upsertLetterhead({ headerImageUrl: imageUrl }, params);
  }

  const letterhead = await prisma.tenantLetterhead.update({
    where: { tenantId },
    data: { headerImageUrl: imageUrl },
  });

  await createAuditLog({
    action: 'UPDATE',
    entityType: 'TenantLetterhead',
    entityId: letterhead.id,
    changes: {
      before: { headerImageUrl: existing.headerImageUrl },
      after: { headerImageUrl: imageUrl },
    },
    userId,
    tenantId,
  });

  return letterhead;
}

/**
 * Update footer image URL
 */
export async function updateFooterImage(
  imageUrl: string | null,
  params: TenantAwareParams
): Promise<TenantLetterhead> {
  const { tenantId, userId } = params;

  const existing = await prisma.tenantLetterhead.findUnique({
    where: { tenantId },
  });

  if (!existing) {
    return upsertLetterhead({ footerImageUrl: imageUrl }, params);
  }

  const letterhead = await prisma.tenantLetterhead.update({
    where: { tenantId },
    data: { footerImageUrl: imageUrl },
  });

  await createAuditLog({
    action: 'UPDATE',
    entityType: 'TenantLetterhead',
    entityId: letterhead.id,
    changes: {
      before: { footerImageUrl: existing.footerImageUrl },
      after: { footerImageUrl: imageUrl },
    },
    userId,
    tenantId,
  });

  return letterhead;
}

/**
 * Update logo URL
 */
export async function updateLogoImage(
  imageUrl: string | null,
  params: TenantAwareParams
): Promise<TenantLetterhead> {
  const { tenantId, userId } = params;

  const existing = await prisma.tenantLetterhead.findUnique({
    where: { tenantId },
  });

  if (!existing) {
    return upsertLetterhead({ logoUrl: imageUrl }, params);
  }

  const letterhead = await prisma.tenantLetterhead.update({
    where: { tenantId },
    data: { logoUrl: imageUrl },
  });

  await createAuditLog({
    action: 'UPDATE',
    entityType: 'TenantLetterhead',
    entityId: letterhead.id,
    changes: {
      before: { logoUrl: existing.logoUrl },
      after: { logoUrl: imageUrl },
    },
    userId,
    tenantId,
  });

  return letterhead;
}

/**
 * Toggle letterhead enabled status
 */
export async function toggleLetterhead(
  isEnabled: boolean,
  params: TenantAwareParams
): Promise<TenantLetterhead> {
  const { tenantId, userId } = params;

  const existing = await prisma.tenantLetterhead.findUnique({
    where: { tenantId },
  });

  if (!existing) {
    return upsertLetterhead({ isEnabled }, params);
  }

  const letterhead = await prisma.tenantLetterhead.update({
    where: { tenantId },
    data: { isEnabled },
  });

  await createAuditLog({
    action: 'UPDATE',
    entityType: 'TenantLetterhead',
    entityId: letterhead.id,
    changes: {
      before: { isEnabled: existing.isEnabled },
      after: { isEnabled },
    },
    userId,
    tenantId,
  });

  return letterhead;
}

/**
 * Delete letterhead configuration
 */
export async function deleteLetterhead(params: TenantAwareParams): Promise<void> {
  const { tenantId, userId } = params;

  const existing = await prisma.tenantLetterhead.findUnique({
    where: { tenantId },
  });

  if (!existing) {
    return;
  }

  await prisma.tenantLetterhead.delete({
    where: { tenantId },
  });

  await createAuditLog({
    action: 'DELETE',
    entityType: 'TenantLetterhead',
    entityId: existing.id,
    changes: { before: existing },
    userId,
    tenantId,
  });
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parse page margins from JSON field
 */
function parsePageMargins(margins: Prisma.JsonValue): PageMargins {
  if (margins && typeof margins === 'object' && !Array.isArray(margins)) {
    const m = margins as Record<string, unknown>;
    return {
      top: typeof m.top === 'number' ? m.top : DEFAULT_MARGINS.top,
      right: typeof m.right === 'number' ? m.right : DEFAULT_MARGINS.right,
      bottom: typeof m.bottom === 'number' ? m.bottom : DEFAULT_MARGINS.bottom,
      left: typeof m.left === 'number' ? m.left : DEFAULT_MARGINS.left,
    };
  }
  return DEFAULT_MARGINS;
}

/**
 * Build complete header HTML for PDF generation
 */
export function buildHeaderHtml(letterhead: TenantLetterhead | null): string {
  if (!letterhead || !letterhead.isEnabled) {
    return '';
  }

  const parts: string[] = [];

  // Add logo if present
  if (letterhead.logoUrl) {
    parts.push(`<img src="${letterhead.logoUrl}" style="max-height: 50px; margin-bottom: 10px;" />`);
  }

  // Add header image if present
  if (letterhead.headerImageUrl) {
    parts.push(`<img src="${letterhead.headerImageUrl}" style="max-width: 100%; max-height: 80px;" />`);
  }

  // Add header HTML if present
  if (letterhead.headerHtml) {
    parts.push(letterhead.headerHtml);
  }

  if (parts.length === 0) {
    return '';
  }

  return `
    <div style="width: 100%; font-size: 10px; text-align: center; padding: 10px 40px;">
      ${parts.join('')}
    </div>
  `;
}

/**
 * Build complete footer HTML for PDF generation
 */
export function buildFooterHtml(letterhead: TenantLetterhead | null): string {
  if (!letterhead || !letterhead.isEnabled) {
    // Default footer with page numbers
    return `
      <div style="width: 100%; font-size: 9px; text-align: center; padding: 10px 40px; color: #666;">
        Page <span class="pageNumber"></span> of <span class="totalPages"></span>
      </div>
    `;
  }

  const parts: string[] = [];

  // Add footer image if present
  if (letterhead.footerImageUrl) {
    parts.push(`<img src="${letterhead.footerImageUrl}" style="max-width: 100%; max-height: 60px;" />`);
  }

  // Add footer HTML if present
  if (letterhead.footerHtml) {
    parts.push(letterhead.footerHtml);
  }

  // Always include page numbers
  parts.push(`
    <div style="margin-top: 5px; color: #666;">
      Page <span class="pageNumber"></span> of <span class="totalPages"></span>
    </div>
  `);

  return `
    <div style="width: 100%; font-size: 9px; text-align: center; padding: 10px 40px;">
      ${parts.join('')}
    </div>
  `;
}

/**
 * Get default letterhead for tenant (create if not exists)
 */
export async function getOrCreateLetterhead(
  params: TenantAwareParams
): Promise<TenantLetterhead> {
  const { tenantId, userId } = params;

  const existing = await prisma.tenantLetterhead.findUnique({
    where: { tenantId },
  });

  if (existing) {
    return existing;
  }

  return prisma.tenantLetterhead.create({
    data: {
      tenantId,
      pageMargins: DEFAULT_MARGINS as Prisma.InputJsonValue,
      isEnabled: false,
    },
  });
}
