/**
 * Customer resolution service
 *
 * Goal: make customer names consistent by linking extracted text to a canonical
 * customer Contact (corporate) via fuzzy matching + CustomerAlias learning.
 */

import { prisma } from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import { normalizeCompanyName } from '@/lib/utils';
import { normalizeVendorName } from '@/lib/vendor-name';
import { jaroWinkler } from '@/lib/string-similarity';
import { jaccardSimilarity, tokenizeEntityName } from '@/lib/entity-name';

const log = createLogger('customer-resolution');

export type CustomerResolutionStrategy = 'ALIAS' | 'CONTACT' | 'CREATED' | 'NONE';

export interface CustomerResolutionResult {
  customerName?: string;
  customerId?: string;
  confidence: number;
  strategy: CustomerResolutionStrategy;
  matchedTo?: string;
}

export interface ResolveCustomerInput {
  tenantId: string;
  companyId: string;
  rawCustomerName?: string | null;
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
  if (tokenSim < DEFAULTS.tokenJaccardThreshold) return 0;

  return jw;
}

async function upsertCustomerAlias(params: {
  tenantId: string;
  companyId: string;
  rawName: string;
  normalizedContactId: string;
  confidence: number;
  createdById?: string;
}): Promise<void> {
  const { tenantId, companyId, rawName, normalizedContactId, confidence, createdById } = params;

  const existing = await prisma.customerAlias.findFirst({
    where: { tenantId, companyId, rawName, deletedAt: null },
    select: { id: true },
  });

  if (existing) {
    await prisma.customerAlias.update({
      where: { id: existing.id },
      data: {
        normalizedContactId,
        confidence,
        createdById: createdById ?? null,
      },
    });
    return;
  }

  await prisma.customerAlias.create({
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

export async function learnCustomerAlias(input: {
  tenantId: string;
  companyId: string;
  rawName: string;
  customerId: string;
  confidence?: number;
  createdById?: string;
}): Promise<void> {
  const raw = input.rawName?.trim();
  if (!raw) return;

  await upsertCustomerAlias({
    tenantId: input.tenantId,
    companyId: input.companyId,
    rawName: normalizeForDisplay(raw),
    normalizedContactId: input.customerId,
    confidence: Math.max(0, Math.min(1, input.confidence ?? 1.0)),
    createdById: input.createdById,
  });
}

/**
 * Attempt to resolve a raw customer name to an existing canonical customer Contact.
 * Does not create new Contacts.
 */
export async function resolveCustomer(input: ResolveCustomerInput): Promise<CustomerResolutionResult> {
  const raw = input.rawCustomerName?.trim();
  if (!raw) return { confidence: 0, strategy: 'NONE' };

  const rawDisplay = normalizeForDisplay(raw);

  const aliases = await prisma.customerAlias.findMany({
    where: { tenantId: input.tenantId, companyId: input.companyId, deletedAt: null },
    select: { rawName: true, normalizedContactId: true, confidence: true },
    orderBy: { createdAt: 'desc' },
    take: DEFAULTS.aliasScanLimit,
  });

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
        customerId: contact.id,
        customerName: contact.corporateName || contact.fullName,
        confidence: bestAlias.score,
        strategy: 'ALIAS',
        matchedTo: bestAlias.rawName,
      };
    }
  }

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
      customerId: bestContact.id,
      customerName: bestContact.name,
      confidence: bestContact.score,
      strategy: 'CONTACT',
      matchedTo: bestContact.name,
    };
  }

  return { customerName: rawDisplay, confidence: bestContact?.score ?? 0, strategy: 'NONE' };
}

export async function getOrCreateCustomerContact(
  input: ResolveCustomerInput
): Promise<CustomerResolutionResult> {
  const raw = input.rawCustomerName?.trim();
  if (!raw) return { confidence: 0, strategy: 'NONE' };

  const resolved = await resolveCustomer(input);
  const rawDisplay = normalizeForDisplay(raw);

  if (resolved.customerId && resolved.customerName) {
    try {
      await learnCustomerAlias({
        tenantId: input.tenantId,
        companyId: input.companyId,
        rawName: rawDisplay,
        customerId: resolved.customerId,
        confidence: resolved.confidence,
        createdById: input.createdById,
      });
    } catch (e) {
      log.warn(`Failed to upsert customer alias for "${rawDisplay}"`, e);
    }

    return resolved;
  }

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
    await learnCustomerAlias({
      tenantId: input.tenantId,
      companyId: input.companyId,
      rawName: rawDisplay,
      customerId: created.id,
      confidence: 1.0,
      createdById: input.createdById,
    });
  } catch (e) {
    log.warn(`Failed to create customer alias for "${rawDisplay}"`, e);
  }

  return {
    customerId: created.id,
    customerName: created.corporateName || created.fullName,
    confidence: 1.0,
    strategy: 'CREATED',
    matchedTo: rawDisplay,
  };
}
