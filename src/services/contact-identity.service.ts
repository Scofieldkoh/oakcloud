import { Prisma, type Contact } from '@/generated/prisma';
import { createAuditLog } from '@/lib/audit';
import { scoreContactIdentityMatch } from '@/lib/contact-identity-matching';
import {
  buildContactIdentityFingerprint,
  canonicalizeContactName,
  isDeterministicIdentifier,
  normalizeContactDetailValue,
  normalizeContactIdentifier,
} from '@/lib/contact-identity-normalization';
import { prisma } from '@/lib/prisma';
import { createContactDetail } from '@/services/contact-detail.service';
import type { PrismaTransactionClient, TenantAwareParams } from '@/services/contact.service';
import type {
  ContactIdentityCandidate,
  ContactIdentityConflict,
  ContactIdentityRecord,
  ContactMatchResult,
  ContactResolutionDecision,
} from '@/types/contact-identity';

export interface ResolveContactIdentityResult {
  contact: Contact;
  outcome:
    | 'CREATED'
    | 'REUSED_IDENTIFIER'
    | 'REUSED_NAME'
    | 'REUSED_ALIAS'
    | 'CREATED_SEPARATE';
  match: ContactMatchResult | null;
  enrichedFields: string[];
  conflicts: ContactIdentityConflict[];
}

type ContactWithIdentityRelations = Contact & {
  contactDetails?: Array<{ detailType: Parameters<typeof normalizeContactDetailValue>[0]; value: string; companyId: string | null }>;
  _count?: {
    companyRelations: number;
    officerPositions: number;
    shareholdings: number;
    contactDetails: number;
  };
};

function identityName(candidate: ContactIdentityCandidate): string {
  return candidate.contactType === 'CORPORATE'
    ? candidate.corporateName ?? ''
    : `${candidate.firstName ?? ''}${candidate.lastName ?? ''}`;
}

function fullName(candidate: ContactIdentityCandidate): string {
  if (candidate.contactType === 'CORPORATE') return candidate.corporateName?.trim() || 'Unknown Corporate';
  return [candidate.firstName, candidate.lastName].map((part) => part?.trim()).filter(Boolean).join(' ') || 'Unknown';
}

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
}

function toIdentityRecord(contact: ContactWithIdentityRelations): ContactIdentityRecord {
  const populatedFields = [
    contact.firstName,
    contact.lastName,
    contact.corporateName,
    contact.alias,
    contact.identificationNumber,
    contact.corporateUen,
    contact.nationality,
    contact.dateOfBirth,
    contact.fullAddress,
  ].filter((value) => !isBlank(value)).length + (contact._count?.contactDetails ?? contact.contactDetails?.length ?? 0);

  return {
    id: contact.id,
    tenantId: contact.tenantId,
    source: 'MANUAL',
    contactType: contact.contactType,
    firstName: contact.firstName,
    lastName: contact.lastName,
    corporateName: contact.corporateName,
    alias: contact.alias,
    identificationType: contact.identificationType,
    identificationNumber: contact.identificationNumber,
    corporateUen: contact.corporateUen,
    nationality: contact.nationality,
    dateOfBirth: contact.dateOfBirth?.toISOString() ?? null,
    fullAddress: contact.fullAddress,
    contactDetails: contact.contactDetails?.map((detail) => ({
      detailType: detail.detailType,
      value: detail.value,
      companyId: detail.companyId ?? undefined,
    })),
    canonicalName: contact.canonicalName ?? canonicalizeContactName(contact.fullName),
    createdAt: contact.createdAt,
    updatedAt: contact.updatedAt,
    relationshipCount:
      (contact._count?.companyRelations ?? 0) +
      (contact._count?.officerPositions ?? 0) +
      (contact._count?.shareholdings ?? 0),
    populatedFieldCount: populatedFields,
  };
}

async function findCandidates(
  candidate: ContactIdentityCandidate,
  tenantId: string,
  db: PrismaTransactionClient | typeof prisma,
): Promise<ContactWithIdentityRelations[]> {
  return db.contact.findMany({
    where: { tenantId, contactType: candidate.contactType, deletedAt: null, isActive: true },
    include: {
      contactDetails: {
        where: { deletedAt: null },
        select: { detailType: true, value: true, companyId: true },
      },
      _count: {
        select: {
          companyRelations: true,
          officerPositions: true,
          shareholdings: true,
          contactDetails: true,
        },
      },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  }) as Promise<ContactWithIdentityRelations[]>;
}

function rankMatches(
  candidate: ContactIdentityCandidate,
  contacts: ContactWithIdentityRelations[],
): Array<{ contact: ContactWithIdentityRelations; record: ContactIdentityRecord; match: ContactMatchResult }> {
  return contacts
    .map((contact) => {
      const record = toIdentityRecord(contact);
      return { contact, record, match: scoreContactIdentityMatch(candidate, record) };
    })
    .sort((left, right) => {
      const identifierLeft = Number(left.match.reasons.includes('IDENTIFIER') || left.match.reasons.includes('CORPORATE_UEN'));
      const identifierRight = Number(right.match.reasons.includes('IDENTIFIER') || right.match.reasons.includes('CORPORATE_UEN'));
      return identifierRight - identifierLeft || right.match.score - left.match.score || left.contact.createdAt.getTime() - right.contact.createdAt.getTime() || left.contact.id.localeCompare(right.contact.id);
    });
}

export async function previewContactIdentity(
  candidate: ContactIdentityCandidate,
  tenantId: string,
  tx?: PrismaTransactionClient,
): Promise<ContactMatchResult | null> {
  if (!tenantId) throw new Error('Tenant context required for contact identity preview');
  const contacts = await findCandidates(candidate, tenantId, tx ?? prisma);
  return rankMatches(candidate, contacts)
    .map(({ match }) => match)
    .find((match) => match.score > 0 || match.conflicts.length > 0) ?? null;
}

function buildLockKeys(candidate: ContactIdentityCandidate, tenantId: string): string[] {
  const prefix = `contact-identity:${tenantId}:${candidate.contactType}`;
  const keys = [`${prefix}:name:${canonicalizeContactName(identityName(candidate))}`];
  if (hasUsableIdentificationNumber(candidate)) {
    keys.push(`${prefix}:id:${candidate.identificationType}:${normalizeContactIdentifier(candidate.identificationNumber, candidate.identificationType)}`);
  }
  if (hasUsableCorporateUen(candidate)) {
    keys.push(`${prefix}:uen:${normalizeContactIdentifier(candidate.corporateUen, 'UEN')}`);
  }
  return [...new Set(keys)].sort();
}

function meetsDeterministicConfidence(confidence: number | undefined): boolean {
  return confidence === undefined || confidence >= 0.9;
}

function hasUsableIdentificationNumber(candidate: ContactIdentityCandidate): boolean {
  return meetsDeterministicConfidence(candidate.confidence?.identificationNumber) &&
    isDeterministicIdentifier(candidate.identificationNumber, candidate.identificationType);
}

function hasUsableCorporateUen(candidate: ContactIdentityCandidate): boolean {
  return meetsDeterministicConfidence(candidate.confidence?.corporateUen) &&
    isDeterministicIdentifier(candidate.corporateUen, 'UEN');
}

function conflict(
  field: ContactIdentityConflict['field'],
  incomingValue: unknown,
  existingValue: unknown,
): ContactIdentityConflict {
  const printable = (value: unknown) => value instanceof Date ? value.toISOString() : value == null ? null : String(value);
  return { field, incomingValue: printable(incomingValue), existingValue: printable(existingValue) };
}

function comparable(field: ContactIdentityConflict['field'], value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = value == null ? '' : String(value);
  if (field === 'identificationNumber') return normalizeContactIdentifier(text, null) ?? '';
  return canonicalizeContactName(text);
}

function buildEnrichment(
  candidate: ContactIdentityCandidate,
  existing: ContactWithIdentityRelations,
): { data: Prisma.ContactUpdateInput; fields: string[]; conflicts: ContactIdentityConflict[] } {
  const data: Prisma.ContactUpdateInput = {};
  const fields: string[] = [];
  const conflicts: ContactIdentityConflict[] = [];
  const incomingDob = candidate.dateOfBirth ? new Date(candidate.dateOfBirth) : null;
  const values = [
    ['firstName', candidate.firstName, existing.firstName],
    ['lastName', candidate.lastName, existing.lastName],
    ['corporateName', candidate.corporateName, existing.corporateName],
    ['alias', candidate.alias, existing.alias],
    ['identificationType', hasUsableIdentificationNumber(candidate) ? candidate.identificationType : null, existing.identificationType],
    ['identificationNumber', hasUsableIdentificationNumber(candidate) ? candidate.identificationNumber : null, existing.identificationNumber],
    ['corporateUen', hasUsableCorporateUen(candidate) ? candidate.corporateUen : null, existing.corporateUen],
    ['nationality', candidate.nationality, existing.nationality],
    ['dateOfBirth', incomingDob, existing.dateOfBirth],
    ['fullAddress', candidate.fullAddress, existing.fullAddress],
  ] as const;
  const conflictFields = new Set<ContactIdentityConflict['field']>([
    'firstName', 'lastName', 'corporateName', 'identificationNumber', 'corporateUen', 'dateOfBirth', 'fullAddress',
  ]);

  for (const [field, incoming, current] of values) {
    if (isBlank(incoming)) continue;
    if (isBlank(current)) {
      data[field] = incoming as never;
      fields.push(field);
    } else if (conflictFields.has(field as ContactIdentityConflict['field']) && comparable(field as ContactIdentityConflict['field'], incoming) !== comparable(field as ContactIdentityConflict['field'], current)) {
      conflicts.push(conflict(field as ContactIdentityConflict['field'], incoming, current));
    }
  }
  return { data, fields, conflicts };
}

function sourceChangeSource(source: ContactIdentityCandidate['source']): 'MANUAL' | 'BIZFILE_UPLOAD' | 'API' {
  if (source === 'BIZFILE') return 'BIZFILE_UPLOAD';
  return source === 'MANUAL' || source === 'COMPANY_QUICK_CREATE' ? 'MANUAL' : 'API';
}

async function createNewContact(
  candidate: ContactIdentityCandidate,
  params: TenantAwareParams,
  tx: PrismaTransactionClient,
): Promise<Contact> {
  const contact = await tx.contact.create({
    data: {
      tenantId: params.tenantId,
      contactType: candidate.contactType,
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      fullName: fullName(candidate),
      canonicalName: canonicalizeContactName(identityName(candidate)),
      alias: candidate.alias,
      identificationType: hasUsableIdentificationNumber(candidate) ? candidate.identificationType : null,
      identificationNumber: hasUsableIdentificationNumber(candidate) ? candidate.identificationNumber?.trim() || null : null,
      nationality: candidate.nationality,
      dateOfBirth: candidate.dateOfBirth ? new Date(candidate.dateOfBirth) : null,
      corporateName: candidate.corporateName,
      corporateUen: hasUsableCorporateUen(candidate) ? candidate.corporateUen?.trim() || null : null,
      fullAddress: candidate.fullAddress,
    },
  });
  await createAuditLog({
    tenantId: params.tenantId,
    userId: params.userId,
    action: 'CREATE',
    entityType: 'Contact',
    entityId: contact.id,
    entityName: contact.fullName,
    summary: `Created contact "${contact.fullName}" through identity resolution`,
    changeSource: sourceChangeSource(candidate.source),
    metadata: { source: candidate.source, sourceRecordId: candidate.sourceRecordId },
  }, tx as Prisma.TransactionClient);
  return contact;
}

async function addDistinctDetails(
  candidate: ContactIdentityCandidate,
  contact: ContactWithIdentityRelations,
  params: TenantAwareParams,
  tx: PrismaTransactionClient,
): Promise<string[]> {
  const seen = new Set(
    (contact.contactDetails ?? []).map((detail) => `${detail.detailType}:${detail.companyId ?? ''}:${normalizeContactDetailValue(detail.detailType, detail.value)}`),
  );
  const added: string[] = [];
  for (const detail of candidate.contactDetails ?? []) {
    const normalized = normalizeContactDetailValue(detail.detailType, detail.value);
    const key = `${detail.detailType}:${detail.companyId ?? ''}:${normalized}`;
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    await createContactDetail({
      contactId: contact.id,
      companyId: detail.companyId,
      detailType: detail.detailType,
      value: detail.value.trim(),
      purposes: detail.purposes,
      isPrimary: detail.isPrimary,
      isPoc: detail.isPoc,
    }, { ...params, tx });
    added.push(`contactDetails.${detail.detailType.toLowerCase()}`);
  }
  return added;
}

async function resolveInTransaction(
  candidate: ContactIdentityCandidate,
  decision: ContactResolutionDecision,
  params: TenantAwareParams,
  tx: PrismaTransactionClient,
): Promise<ResolveContactIdentityResult> {
  for (const lockKey of buildLockKeys(candidate, params.tenantId)) {
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
  }
  const contacts = await findCandidates(candidate, params.tenantId, tx);
  const ranked = rankMatches(candidate, contacts);
  const allConflicts = ranked.flatMap(({ match }) => match.conflicts);
  let selected = decision.action === 'REUSE'
    ? ranked.find(({ contact }) => contact.id === decision.contactId)
    : ranked.find(({ match }) => match.automatic && !match.blockedByIdentifierConflict);

  if (decision.action === 'REUSE' && !selected) {
    throw new Error('Selected contact was not found in this tenant');
  }
  if (decision.action === 'CREATE_SEPARATE') selected = undefined;

  if (!selected) {
    const created = await createNewContact(candidate, params, tx);
    const enrichedFields = await addDistinctDetails(candidate, { ...created, contactDetails: [] }, params, tx);
    const reviewMatch = ranked.find(({ match }) => match.score > 0 || match.conflicts.length > 0);
    if (decision.action === 'CREATE_SEPARATE' && reviewMatch) {
      const ordered = [reviewMatch.contact.id, created.id].sort();
      const fingerprints = new Map([
        [reviewMatch.contact.id, buildContactIdentityFingerprint(reviewMatch.record)],
        [created.id, buildContactIdentityFingerprint({ ...candidate })],
      ]);
      await tx.contactDuplicateDecision.create({
        data: {
          tenantId: params.tenantId,
          leftContactId: ordered[0],
          rightContactId: ordered[1],
          leftFingerprint: fingerprints.get(ordered[0])!,
          rightFingerprint: fingerprints.get(ordered[1])!,
          decision: 'CREATE_SEPARATE',
          reason: decision.reason.trim(),
          decidedById: params.userId,
        },
      });
    }
    return {
      contact: created,
      outcome: decision.action === 'CREATE_SEPARATE' ? 'CREATED_SEPARATE' : 'CREATED',
      match: reviewMatch?.match ?? null,
      enrichedFields,
      conflicts: allConflicts,
    };
  }

  const enrichment = buildEnrichment(candidate, selected.contact);
  const updated = enrichment.fields.length > 0
    ? await tx.contact.update({ where: { id: selected.contact.id }, data: enrichment.data })
    : selected.contact;
  const detailFields = await addDistinctDetails(candidate, selected.contact, params, tx);
  const enrichedFields = [...enrichment.fields, ...detailFields];
  if (enrichedFields.length > 0) {
    await createAuditLog({
      tenantId: params.tenantId,
      userId: params.userId,
      action: 'UPDATE',
      entityType: 'Contact',
      entityId: updated.id,
      entityName: updated.fullName,
      summary: `Enriched contact "${updated.fullName}" through identity resolution`,
      changeSource: sourceChangeSource(candidate.source),
      metadata: { source: candidate.source, sourceRecordId: candidate.sourceRecordId, enrichedFields },
    }, tx as Prisma.TransactionClient);
  }
  const reasons = selected.match.reasons;
  const outcome = reasons.some((reason) => reason === 'IDENTIFIER' || reason === 'CORPORATE_UEN')
    ? 'REUSED_IDENTIFIER'
    : reasons.includes('APPROVED_ALIAS')
      ? 'REUSED_ALIAS'
      : 'REUSED_NAME';
  return {
    contact: updated as Contact,
    outcome,
    match: selected.match,
    enrichedFields,
    conflicts: [...selected.match.conflicts, ...enrichment.conflicts],
  };
}

export async function resolveOrCreateContact(
  candidate: ContactIdentityCandidate,
  decision: ContactResolutionDecision,
  params: TenantAwareParams,
): Promise<ResolveContactIdentityResult> {
  if (!params.tenantId) throw new Error('Tenant context required for contact identity resolution');
  if (decision.action === 'CREATE_SEPARATE' && !decision.reason.trim()) {
    throw new Error('A reason is required to create a separate contact');
  }
  if (params.tx) return resolveInTransaction(candidate, decision, params, params.tx);
  return prisma.$transaction((tx) => resolveInTransaction(candidate, decision, params, tx as PrismaTransactionClient));
}
