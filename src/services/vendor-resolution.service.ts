/**
 * Vendor resolution service
 *
 * Goal: make vendor names consistent by linking extracted text to a canonical
 * vendor Contact (corporate) via fuzzy matching + VendorAlias learning.
 */

import { prisma } from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import { normalizeCompanyName } from '@/lib/utils';
import { normalizeVendorName } from '@/lib/vendor-name';
import { jaroWinkler } from '@/lib/string-similarity';
import { jaccardSimilarity, tokenizeEntityName } from '@/lib/entity-name';

const log = createLogger('vendor-resolution');

export type VendorResolutionStrategy = 'ALIAS' | 'CONTACT' | 'CREATED' | 'NONE';

export interface VendorResolutionResult {
  vendorName?: string;
  vendorId?: string;
  confidence: number;
  strategy: VendorResolutionStrategy;
  matchedTo?: string;
}

export interface ResolveVendorInput {
  tenantId: string;
  companyId: string;
  rawVendorName?: string | null;
  createdById?: string;
}

const DEFAULTS = {
  aliasScanLimit: 1500,
  contactScanLimit: 500,
  autoAcceptThreshold: 0.93,
  tokenJaccardThreshold: 0.8,
};

function normalizeForDisplay(name: string): string {
  return normalizeCompanyName(name)?.trim() || name.trim();
}

function scoreNameSimilarity(a: string, b: string): number {
  const normA = normalizeVendorName(a);
  const normB = normalizeVendorName(b);
  if (!normA || !normB) return 0;
  if (normA === normB) return 1.0;

  const jw = jaroWinkler(normA, normB);
  const tokenSim = jaccardSimilarity(tokenizeEntityName(a), tokenizeEntityName(b));

  // Guardrail: prevent accidental merges of distinct entities like
  // "Nobody" vs "Nobody Business" (high prefix similarity but different tokens).
  if (tokenSim < DEFAULTS.tokenJaccardThreshold) return 0;

  return jw;
}

async function upsertVendorAlias(params: {
  tenantId: string;
  companyId: string;
  rawName: string;
  normalizedContactId: string;
  confidence: number;
  createdById?: string;
}): Promise<void> {
  const { tenantId, companyId, rawName, normalizedContactId, confidence, createdById } = params;

  const existing = await prisma.vendorAlias.findFirst({
    where: { tenantId, companyId, rawName, deletedAt: null },
    select: { id: true },
  });

  if (existing) {
    await prisma.vendorAlias.update({
      where: { id: existing.id },
      data: {
        normalizedContactId,
        confidence,
        createdById: createdById ?? null,
      },
    });
    return;
  }

  await prisma.vendorAlias.create({
    data: {
      tenantId,
      companyId,
      rawName,
      normalizedContactId,
      confidence,
      createdById: createdById ?? null,
    },
  });
}

export async function learnVendorAlias(input: {
  tenantId: string;
  companyId: string;
  rawName: string;
  vendorId: string;
  confidence?: number;
  createdById?: string;
}): Promise<void> {
  const raw = input.rawName?.trim();
  if (!raw) return;

  await upsertVendorAlias({
    tenantId: input.tenantId,
    companyId: input.companyId,
    rawName: normalizeForDisplay(raw),
    normalizedContactId: input.vendorId,
    confidence: Math.max(0, Math.min(1, input.confidence ?? 1.0)),
    createdById: input.createdById,
  });
}

/**
 * Attempt to resolve a raw vendor name to an existing canonical vendor Contact.
 * Does not create new Contacts.
 */
export async function resolveVendor(input: ResolveVendorInput): Promise<VendorResolutionResult> {
  const raw = input.rawVendorName?.trim();
  if (!raw) return { confidence: 0, strategy: 'NONE' };

  const rawDisplay = normalizeForDisplay(raw);

  const aliases = await prisma.vendorAlias.findMany({
    where: { tenantId: input.tenantId, companyId: input.companyId, deletedAt: null },
    select: { rawName: true, normalizedContactId: true, confidence: true },
    orderBy: { createdAt: 'desc' },
    take: DEFAULTS.aliasScanLimit,
  });

  // 1) Alias-based matching (preferred)
  let bestAlias: { normalizedContactId: string; rawName: string; score: number } | null = null;
  for (const a of aliases) {
    const score = scoreNameSimilarity(rawDisplay, a.rawName);
    if (!bestAlias || score > bestAlias.score) {
      bestAlias = { normalizedContactId: a.normalizedContactId, rawName: a.rawName, score };
    }
  }

  if (bestAlias && bestAlias.score >= DEFAULTS.autoAcceptThreshold) {
    const contact = await prisma.contact.findUnique({
      where: { id: bestAlias.normalizedContactId },
      select: { id: true, corporateName: true, fullName: true },
    });

    if (contact) {
      return {
        vendorId: contact.id,
        vendorName: contact.corporateName || contact.fullName,
        confidence: bestAlias.score,
        strategy: 'ALIAS',
        matchedTo: bestAlias.rawName,
      };
    }
  }

  // 2) Direct contact matching (fallback)
  const contacts = await prisma.contact.findMany({
    where: {
      tenantId: input.tenantId,
      deletedAt: null,
      contactType: 'CORPORATE',
      corporateName: { not: null },
    },
    select: { id: true, corporateName: true, fullName: true },
    orderBy: { updatedAt: 'desc' },
    take: DEFAULTS.contactScanLimit,
  });

  let bestContact: { id: string; name: string; score: number } | null = null;
  for (const c of contacts) {
    const name = c.corporateName || c.fullName;
    const score = scoreNameSimilarity(rawDisplay, name);
    if (!bestContact || score > bestContact.score) {
      bestContact = { id: c.id, name, score };
    }
  }

  if (bestContact && bestContact.score >= DEFAULTS.autoAcceptThreshold) {
    return {
      vendorId: bestContact.id,
      vendorName: bestContact.name,
      confidence: bestContact.score,
      strategy: 'CONTACT',
      matchedTo: bestContact.name,
    };
  }

  return { vendorName: rawDisplay, confidence: bestContact?.score ?? 0, strategy: 'NONE' };
}

/**
 * Ensure we have a canonical vendor Contact for this vendor name.
 * Used at approval time to "learn" vendors and stabilize future extractions.
 */
export async function getOrCreateVendorContact(input: ResolveVendorInput): Promise<VendorResolutionResult> {
  const raw = input.rawVendorName?.trim();
  if (!raw) return { confidence: 0, strategy: 'NONE' };

  const resolved = await resolveVendor(input);
  const rawDisplay = normalizeForDisplay(raw);

  if (resolved.vendorId && resolved.vendorName) {
    // Learn the raw name as an alias for future matching.
    try {
      await learnVendorAlias({
        tenantId: input.tenantId,
        companyId: input.companyId,
        rawName: rawDisplay,
        vendorId: resolved.vendorId,
        confidence: resolved.confidence,
        createdById: input.createdById,
      });
    } catch (e) {
      log.warn(`Failed to upsert vendor alias for "${rawDisplay}"`, e);
    }

    return resolved;
  }

  // Create a new corporate contact as the canonical vendor.
  const created = await prisma.contact.create({
    data: {
      tenantId: input.tenantId,
      contactType: 'CORPORATE',
      fullName: rawDisplay,
      corporateName: rawDisplay,
    },
    select: { id: true, corporateName: true, fullName: true },
  });

  try {
    await learnVendorAlias({
      tenantId: input.tenantId,
      companyId: input.companyId,
      rawName: rawDisplay,
      vendorId: created.id,
      confidence: 1.0,
      createdById: input.createdById,
    });
  } catch (e) {
    log.warn(`Failed to create vendor alias for "${rawDisplay}"`, e);
  }

  return {
    vendorId: created.id,
    vendorName: created.corporateName || created.fullName,
    confidence: 1.0,
    strategy: 'CREATED',
    matchedTo: rawDisplay,
  };
}
