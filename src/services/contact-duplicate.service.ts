import {
  Prisma,
  type ContactDetailType,
  type ContactType,
  type IdentificationType,
} from '@/generated/prisma';
import { scoreContactIdentityMatch, rankContactMaster } from '@/lib/contact-identity-matching';
import { buildContactIdentityFingerprint } from '@/lib/contact-identity-normalization';
import { prisma } from '@/lib/prisma';
import type {
  ContactIdentityConflict,
  ContactIdentityRecord,
  ContactMatchReason,
} from '@/types/contact-identity';

const MAX_EXACT_GROUPS_PER_KEY = 200;
const MAX_FUZZY_SEEDS = 200;
const MAX_FUZZY_MATCHES_PER_SEED = 10;
const MAX_FUZZY_PAIRS = 500;
const MAX_DISCOVERY_CONTACTS = 1_000;

type DiscoveryContact = {
  id: string;
  tenantId: string;
  contactType: ContactType;
  firstName: string | null;
  lastName: string | null;
  fullName: string;
  canonicalName: string | null;
  alias: string | null;
  identificationType: IdentificationType | null;
  identificationNumber: string | null;
  nationality: string | null;
  dateOfBirth: Date | null;
  corporateName: string | null;
  corporateUen: string | null;
  fullAddress: string | null;
  createdAt: Date;
  updatedAt: Date;
  contactDetails: Array<{
    detailType: ContactDetailType;
    value: string;
    companyId: string | null;
  }>;
  companyRelations: Array<{
    company: { id: string; name: string; uen: string };
  }>;
  _count: {
    companyRelations: number;
    officerPositions: number;
    shareholdings: number;
    chargeHoldings: number;
    contactDetails: number;
    noteTabs: number;
    workflow_communication_log_entries: number;
    workflow_milestones: number;
  };
};

type CandidatePair = {
  leftContactId: string;
  rightContactId: string;
  reasons: ContactMatchReason[];
  confidence: number;
  conflicts: ContactIdentityConflict[];
};

export interface ContactDuplicatePreview {
  id: string;
  contactType: ContactType;
  fullName: string;
  firstName: string | null;
  lastName: string | null;
  corporateName: string | null;
  alias: string | null;
  identificationType: IdentificationType | null;
  identificationNumber: string | null;
  corporateUen: string | null;
  nationality: string | null;
  dateOfBirth: string | null;
  fullAddress: string | null;
  contactDetails: DiscoveryContact['contactDetails'];
  companies: Array<{ id: string; name: string; uen: string }>;
  referenceCounts: {
    companyRelations: number;
    officerPositions: number;
    shareholdings: number;
    chargeHoldings: number;
    contactDetails: number;
    noteTabs: number;
    workflowCommunicationLogEntries: number;
    workflowMilestones: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface ContactDuplicateGroup {
  contactIds: string[];
  contacts: ContactDuplicatePreview[];
  reasons: ContactMatchReason[];
  confidence: number;
  conflicts: ContactIdentityConflict[];
  fingerprints: Record<string, string>;
  recommendedMasterId: string;
}

export interface ListContactDuplicateGroupsResult {
  groups: ContactDuplicateGroup[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface RejectContactDuplicatePairInput {
  leftContactId: string;
  rightContactId: string;
  leftFingerprint: string;
  rightFingerprint: string;
  reason: string;
}

function toIdentityRecord(contact: DiscoveryContact): ContactIdentityRecord {
  const populatedFieldCount = [
    contact.firstName,
    contact.lastName,
    contact.corporateName,
    contact.alias,
    contact.identificationNumber,
    contact.corporateUen,
    contact.nationality,
    contact.dateOfBirth,
    contact.fullAddress,
  ].filter((value) => value !== null && value !== '').length + contact._count.contactDetails;

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
    contactDetails: contact.contactDetails.map((detail) => ({
      detailType: detail.detailType,
      value: detail.value,
      companyId: detail.companyId ?? undefined,
    })),
    canonicalName: contact.canonicalName ?? '',
    createdAt: contact.createdAt,
    updatedAt: contact.updatedAt,
    relationshipCount:
      contact._count.companyRelations +
      contact._count.officerPositions +
      contact._count.shareholdings +
      contact._count.chargeHoldings,
    populatedFieldCount,
  };
}

function preview(contact: DiscoveryContact): ContactDuplicatePreview {
  return {
    id: contact.id,
    contactType: contact.contactType,
    fullName: contact.fullName,
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
    contactDetails: contact.contactDetails,
    companies: contact.companyRelations.map(({ company }) => company),
    referenceCounts: {
      companyRelations: contact._count.companyRelations,
      officerPositions: contact._count.officerPositions,
      shareholdings: contact._count.shareholdings,
      chargeHoldings: contact._count.chargeHoldings,
      contactDetails: contact._count.contactDetails,
      noteTabs: contact._count.noteTabs,
      workflowCommunicationLogEntries: contact._count.workflow_communication_log_entries,
      workflowMilestones: contact._count.workflow_milestones,
    },
    createdAt: contact.createdAt.toISOString(),
    updatedAt: contact.updatedAt.toISOString(),
  };
}

function sortedPair(leftContactId: string, rightContactId: string): [string, string] {
  return leftContactId.localeCompare(rightContactId) <= 0
    ? [leftContactId, rightContactId]
    : [rightContactId, leftContactId];
}

function pairKey(leftContactId: string, rightContactId: string): string {
  return sortedPair(leftContactId, rightContactId).join('\u0000');
}

function combinations(contactIds: string[]): Array<[string, string]> {
  const ids = [...contactIds].sort();
  const pairs: Array<[string, string]> = [];
  for (let left = 0; left < ids.length; left += 1) {
    for (let right = left + 1; right < ids.length; right += 1) pairs.push([ids[left], ids[right]]);
  }
  return pairs;
}

function addPair(
  pairs: Map<string, CandidatePair>,
  left: ContactIdentityRecord,
  right: ContactIdentityRecord,
  fallbackReason?: ContactMatchReason,
): void {
  const score = scoreContactIdentityMatch(left, right);
  const reasons = score.reasons.length > 0 ? score.reasons : fallbackReason ? [fallbackReason] : [];
  if (reasons.length === 0) return;
  const [leftContactId, rightContactId] = sortedPair(left.id, right.id);
  const key = pairKey(leftContactId, rightContactId);
  const prior = pairs.get(key);
  pairs.set(key, {
    leftContactId,
    rightContactId,
    reasons: [...new Set([...(prior?.reasons ?? []), ...reasons])].sort() as ContactMatchReason[],
    confidence: Math.max(prior?.confidence ?? 0, score.score || (fallbackReason ? 1 : 0)),
    conflicts: [...(prior?.conflicts ?? []), ...score.conflicts],
  });
}

function groupBy<T>(items: T[], key: (item: T) => string | null): Map<string, T[]> {
  const result = new Map<string, T[]>();
  for (const item of items) {
    const value = key(item);
    if (!value) continue;
    result.set(value, [...(result.get(value) ?? []), item]);
  }
  return result;
}

function uniqueConflicts(conflicts: ContactIdentityConflict[]): ContactIdentityConflict[] {
  return [...new Map(conflicts.map((conflict) => [JSON.stringify(conflict), conflict])).values()];
}

function buildGroups(
  contacts: DiscoveryContact[],
  pairs: CandidatePair[],
  fingerprints: Map<string, string>,
): ContactDuplicateGroup[] {
  const contactById = new Map(contacts.map((contact) => [contact.id, contact]));
  const parent = new Map(contacts.map((contact) => [contact.id, contact.id]));
  const find = (id: string): string => {
    const current = parent.get(id)!;
    if (current === id) return id;
    const root = find(current);
    parent.set(id, root);
    return root;
  };
  const union = (left: string, right: string): void => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot === rightRoot) return;
    const [root, child] = leftRoot.localeCompare(rightRoot) <= 0
      ? [leftRoot, rightRoot]
      : [rightRoot, leftRoot];
    parent.set(child, root);
  };
  pairs.forEach((pair) => union(pair.leftContactId, pair.rightContactId));

  const members = new Map<string, string[]>();
  for (const pair of pairs) {
    for (const id of [pair.leftContactId, pair.rightContactId]) {
      const root = find(id);
      if (!members.get(root)?.includes(id)) members.set(root, [...(members.get(root) ?? []), id]);
    }
  }

  return [...members.values()].map((ids) => {
    const contactIds = [...ids].sort();
    const records = contactIds.map((id) => toIdentityRecord(contactById.get(id)!));
    const groupPairs = pairs.filter((pair) => contactIds.includes(pair.leftContactId) && contactIds.includes(pair.rightContactId));
    return {
      contactIds,
      contacts: contactIds.map((id) => preview(contactById.get(id)!)),
      reasons: [...new Set(groupPairs.flatMap((pair) => pair.reasons))].sort() as ContactMatchReason[],
      confidence: Math.max(...groupPairs.map((pair) => pair.confidence)),
      conflicts: uniqueConflicts(groupPairs.flatMap((pair) => pair.conflicts)),
      fingerprints: Object.fromEntries(contactIds.map((id) => [id, fingerprints.get(id)!])),
      recommendedMasterId: rankContactMaster(records)[0].id,
    };
  }).sort((left, right) =>
    right.confidence - left.confidence || left.contactIds.join('\u0000').localeCompare(right.contactIds.join('\u0000')),
  );
}

const contactSelection = {
  id: true,
  tenantId: true,
  contactType: true,
  firstName: true,
  lastName: true,
  fullName: true,
  canonicalName: true,
  alias: true,
  identificationType: true,
  identificationNumber: true,
  nationality: true,
  dateOfBirth: true,
  corporateName: true,
  corporateUen: true,
  fullAddress: true,
  createdAt: true,
  updatedAt: true,
  contactDetails: {
    where: { deletedAt: null },
    select: { detailType: true, value: true, companyId: true },
  },
  companyRelations: {
    where: { deletedAt: null },
    select: { company: { select: { id: true, name: true, uen: true } } },
  },
  _count: {
    select: {
      companyRelations: true,
      officerPositions: true,
      shareholdings: true,
      chargeHoldings: true,
      contactDetails: true,
      noteTabs: true,
      workflow_communication_log_entries: true,
      workflow_milestones: true,
    },
  },
} satisfies Prisma.ContactSelect;

export async function listContactDuplicateGroups({
  tenantId,
  page,
  limit,
}: {
  tenantId: string;
  page: number;
  limit: number;
}): Promise<ListContactDuplicateGroupsResult> {
  const activeScope = { tenantId, deletedAt: null, isActive: true } as const;
  const [canonicalGroups, identifierGroups, uenGroups, fuzzyRows] = await Promise.all([
    prisma.contact.groupBy({
      by: ['contactType', 'canonicalName'],
      where: { ...activeScope, canonicalName: { not: null } },
      having: { canonicalName: { _count: { gt: 1 } } },
      orderBy: [{ contactType: 'asc' }, { canonicalName: 'asc' }],
      take: MAX_EXACT_GROUPS_PER_KEY,
      _count: { _all: true },
    }),
    prisma.contact.groupBy({
      by: ['identificationType', 'identificationNumber'],
      where: {
        ...activeScope,
        identificationType: { not: null },
        identificationNumber: { not: null },
      },
      having: { identificationNumber: { _count: { gt: 1 } } },
      orderBy: [{ identificationType: 'asc' }, { identificationNumber: 'asc' }],
      take: MAX_EXACT_GROUPS_PER_KEY,
      _count: { _all: true },
    }),
    prisma.contact.groupBy({
      by: ['corporateUen'],
      where: { ...activeScope, corporateUen: { not: null } },
      having: { corporateUen: { _count: { gt: 1 } } },
      orderBy: { corporateUen: 'asc' },
      take: MAX_EXACT_GROUPS_PER_KEY,
      _count: { _all: true },
    }),
    prisma.$queryRaw<Array<{ leftContactId: string; rightContactId: string }>>(Prisma.sql`
      WITH seeds AS (
        SELECT id, "contactType", "canonicalName"
        FROM contacts
        WHERE "tenantId" = ${tenantId}
          AND "deletedAt" IS NULL
          AND "isActive" = true
          AND "canonicalName" IS NOT NULL
          AND char_length("canonicalName") >= 5
        ORDER BY id
        LIMIT ${MAX_FUZZY_SEEDS}
      )
      SELECT seed.id AS "leftContactId", candidate.id AS "rightContactId"
      FROM seeds seed
      CROSS JOIN LATERAL (
        SELECT contact.id
        FROM contacts contact
        WHERE contact."tenantId" = ${tenantId}
          AND contact."deletedAt" IS NULL
          AND contact."isActive" = true
          AND contact."contactType" = seed."contactType"
          AND contact.id > seed.id
          AND contact."canonicalName" IS NOT NULL
          AND char_length(contact."canonicalName") >= 5
          AND contact."canonicalName" % seed."canonicalName"
          AND similarity(contact."canonicalName", seed."canonicalName") >= 0.3
        ORDER BY similarity(contact."canonicalName", seed."canonicalName") DESC, contact.id
        LIMIT ${MAX_FUZZY_MATCHES_PER_SEED}
      ) candidate
      LIMIT ${MAX_FUZZY_PAIRS}
    `),
  ]);

  const canonicalKeys = (canonicalGroups ?? []).flatMap((group) => group.canonicalName
    ? [{ contactType: group.contactType, canonicalName: group.canonicalName }]
    : []);
  const identifiers = (identifierGroups ?? []).flatMap((group) =>
    group.identificationType && group.identificationNumber
      ? [{ identificationType: group.identificationType, identificationNumber: group.identificationNumber }]
      : [],
  );
  const corporateUens = (uenGroups ?? []).flatMap((group) => group.corporateUen ? [group.corporateUen] : []);
  const fuzzyIds = [...new Set((fuzzyRows ?? []).flatMap((row) => [row.leftContactId, row.rightContactId]))];
  const candidateFilters: Prisma.ContactWhereInput[] = [];
  if (canonicalKeys.length > 0) candidateFilters.push(...canonicalKeys);
  if (identifiers.length > 0) candidateFilters.push(...identifiers);
  if (corporateUens.length > 0) candidateFilters.push({ corporateUen: { in: corporateUens } });
  if (fuzzyIds.length > 0) candidateFilters.push({ id: { in: fuzzyIds } });

  if (candidateFilters.length === 0) {
    return { groups: [], total: 0, page, limit, totalPages: 0 };
  }

  const contacts = await prisma.contact.findMany({
    where: { ...activeScope, OR: candidateFilters },
    select: contactSelection,
    orderBy: { id: 'asc' },
    take: MAX_DISCOVERY_CONTACTS,
  }) as DiscoveryContact[];
  const contactById = new Map(contacts.map((contact) => [contact.id, contact]));
  const records = new Map(contacts.map((contact) => [contact.id, toIdentityRecord(contact)]));
  const pairs = new Map<string, CandidatePair>();

  const canonicalKeySet = new Set(canonicalKeys.map(({ contactType, canonicalName }) =>
    `${contactType}\u0000${canonicalName}`,
  ));
  for (const bucket of groupBy(contacts, (contact) => contact.canonicalName
    ? `${contact.contactType}\u0000${contact.canonicalName}`
    : null,
  ).values()) {
    if (!canonicalKeySet.has(`${bucket[0].contactType}\u0000${bucket[0].canonicalName}`)) continue;
    for (const [leftId, rightId] of combinations(bucket.map(({ id }) => id))) {
      addPair(pairs, records.get(leftId)!, records.get(rightId)!, 'EXACT_CANONICAL_NAME');
    }
  }
  for (const bucket of groupBy(contacts, (contact) =>
    contact.identificationType && contact.identificationNumber
      ? `${contact.identificationType}\u0000${contact.identificationNumber}`
      : null,
  ).values()) {
    for (const [leftId, rightId] of combinations(bucket.map(({ id }) => id))) {
      addPair(pairs, records.get(leftId)!, records.get(rightId)!);
    }
  }
  for (const bucket of groupBy(contacts, (contact) => contact.corporateUen).values()) {
    for (const [leftId, rightId] of combinations(bucket.map(({ id }) => id))) {
      addPair(pairs, records.get(leftId)!, records.get(rightId)!);
    }
  }
  for (const fuzzy of fuzzyRows ?? []) {
    const left = records.get(fuzzy.leftContactId);
    const right = records.get(fuzzy.rightContactId);
    if (left && right) addPair(pairs, left, right);
  }

  const fingerprints = new Map([...records].map(([id, record]) => [id, buildContactIdentityFingerprint(record)]));
  const decisions = pairs.size === 0 ? [] : await prisma.contactDuplicateDecision.findMany({
    where: {
      tenantId,
      decision: { in: ['REJECTED', 'CREATE_SEPARATE'] },
      leftContactId: { in: [...contactById.keys()] },
      rightContactId: { in: [...contactById.keys()] },
    },
    select: { leftContactId: true, rightContactId: true, leftFingerprint: true, rightFingerprint: true },
    take: MAX_FUZZY_PAIRS + MAX_DISCOVERY_CONTACTS,
  });
  const rejected = new Set((decisions ?? []).flatMap((decision) => {
    const current = fingerprints.get(decision.leftContactId) === decision.leftFingerprint &&
      fingerprints.get(decision.rightContactId) === decision.rightFingerprint;
    return current ? [pairKey(decision.leftContactId, decision.rightContactId)] : [];
  }));
  const activePairs = [...pairs.entries()].flatMap(([key, pair]) => rejected.has(key) ? [] : [pair]);
  const groups = buildGroups(contacts, activePairs, fingerprints);
  const total = groups.length;
  const totalPages = Math.ceil(total / limit);
  return {
    groups: groups.slice((page - 1) * limit, page * limit),
    total,
    page,
    limit,
    totalPages,
  };
}

export async function rejectContactDuplicatePair(
  input: RejectContactDuplicatePairInput,
  params: { tenantId: string; userId: string },
): Promise<{ rejected: true }> {
  if (input.leftContactId === input.rightContactId) throw new Error('Contact IDs must be different');
  if (input.reason.trim().length < 10) throw new Error('Rejection reason must be at least 10 characters');
  const contacts = await prisma.contact.findMany({
    where: {
      id: { in: [input.leftContactId, input.rightContactId] },
      tenantId: params.tenantId,
      deletedAt: null,
      isActive: true,
    },
    select: contactSelection,
    orderBy: { id: 'asc' },
    take: 2,
  }) as DiscoveryContact[];
  if (contacts.length !== 2) throw new Error('Duplicate contact pair not found');

  const suppliedFingerprints = new Map([
    [input.leftContactId, input.leftFingerprint],
    [input.rightContactId, input.rightFingerprint],
  ]);
  const [leftContactId, rightContactId] = sortedPair(input.leftContactId, input.rightContactId);
  const contactById = new Map(contacts.map((contact) => [contact.id, contact]));
  const leftFingerprint = buildContactIdentityFingerprint(toIdentityRecord(contactById.get(leftContactId)!));
  const rightFingerprint = buildContactIdentityFingerprint(toIdentityRecord(contactById.get(rightContactId)!));
  if (
    suppliedFingerprints.get(leftContactId) !== leftFingerprint ||
    suppliedFingerprints.get(rightContactId) !== rightFingerprint
  ) {
    throw new Error('Duplicate recommendation is stale');
  }

  const data = {
    tenantId: params.tenantId,
    leftContactId,
    rightContactId,
    leftFingerprint,
    rightFingerprint,
    decision: 'REJECTED',
    reason: input.reason.trim(),
    decidedById: params.userId,
  };
  await prisma.contactDuplicateDecision.upsert({
    where: {
      tenantId_leftContactId_rightContactId: {
        tenantId: params.tenantId,
        leftContactId,
        rightContactId,
      },
    },
    create: data,
    update: data,
  });
  return { rejected: true };
}
