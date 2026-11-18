/**
 * Which people and companies a Sentroweb check screens (decision D2):
 * the company itself, its current directors and its current shareholders. Secretaries, the CEO
 * and former officers are not screened. The same person in two roles is one entry with both roles.
 */
import { createHash } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { NotFoundError } from '@/lib/errors';
import type {
  SentrowebCandidateDto,
  SentrowebEntityKindValue,
  SentrowebSearchTypeValue,
} from '@/lib/sentroweb/types';

export const SCREENED_OFFICER_ROLES = [
  'DIRECTOR',
  'MANAGING_DIRECTOR',
  'ALTERNATE_DIRECTOR',
  'NOMINEE_DIRECTOR',
] as const;

export interface CandidateEntity extends SentrowebCandidateDto {
  /** Where the entry came from: the company, an officer row or a shareholder row. */
  sourceRefs: Array<{ type: 'COMPANY' | 'OFFICER' | 'SHAREHOLDER'; id: string }>;
  contactId: string | null;
}

function normaliseName(name: string): string {
  return name.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
}

function cleanName(name: string | null | undefined): string {
  return (name ?? '').replace(/\s+/g, ' ').trim();
}

/** A stable key that does not expose the name or id number in a request body. */
function hashKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex').slice(0, 24);
}

interface RawEntry {
  name: string;
  entityKind: SentrowebEntityKindValue;
  searchType: SentrowebSearchTypeValue;
  role: string;
  contactId: string | null;
  identifierType: string | null;
  identifier: string | null;
  source: CandidateEntity['sourceRefs'][number];
}

/** Dedupe order (decision D2): contactId, then id type + number, then normalised name + kind. */
function dedupeKey(entry: RawEntry): string {
  if (entry.entityKind === 'COMPANY') return 'company';
  if (entry.contactId) return `contact:${entry.contactId}`;
  if (entry.identifierType && entry.identifier) {
    return `id:${entry.identifierType}:${entry.identifier.replace(/\s+/g, '').toUpperCase()}`;
  }
  return `name:${entry.searchType}:${normaliseName(entry.name)}`;
}

export async function listCandidateEntities(tenantId: string, companyId: string): Promise<CandidateEntity[]> {
  const company = await prisma.company.findFirst({
    where: { id: companyId, tenantId, deletedAt: null },
    select: {
      id: true,
      name: true,
      uen: true,
      officers: {
        where: { isCurrent: true, role: { in: [...SCREENED_OFFICER_ROLES] } },
        select: {
          id: true,
          name: true,
          role: true,
          contactId: true,
          identificationType: true,
          identificationNumber: true,
          contact: {
            select: {
              id: true,
              tenantId: true,
              contactType: true,
              fullName: true,
              corporateName: true,
              identificationType: true,
              identificationNumber: true,
              corporateUen: true,
              deletedAt: true,
            },
          },
        },
      },
      shareholders: {
        where: { isCurrent: true },
        select: {
          id: true,
          name: true,
          shareholderType: true,
          contactId: true,
          identificationType: true,
          identificationNumber: true,
          contact: {
            select: {
              id: true,
              tenantId: true,
              contactType: true,
              fullName: true,
              corporateName: true,
              identificationType: true,
              identificationNumber: true,
              corporateUen: true,
              deletedAt: true,
            },
          },
        },
      },
    },
  });
  if (!company) throw new NotFoundError('Company not found');

  const entries: RawEntry[] = [
    {
      name: cleanName(company.name),
      entityKind: 'COMPANY',
      searchType: 'ENTITY',
      role: 'COMPANY',
      contactId: null,
      identifierType: 'UEN',
      identifier: company.uen,
      source: { type: 'COMPANY', id: company.id },
    },
  ];

  type Party = (typeof company.officers)[number]['contact'];
  const usableContact = (contact: Party) =>
    contact && contact.tenantId === tenantId && contact.deletedAt === null ? contact : null;

  for (const officer of company.officers) {
    const contact = usableContact(officer.contact);
    const identifierType = contact?.identificationType ?? officer.identificationType ?? null;
    const corporate = contact?.contactType === 'CORPORATE' || identifierType === 'UEN';
    const name = cleanName(
      corporate ? contact?.corporateName || contact?.fullName || officer.name : officer.name || contact?.fullName,
    );
    if (!name) continue;
    entries.push({
      name,
      entityKind: corporate ? 'CORPORATE' : 'INDIVIDUAL',
      searchType: corporate ? 'ENTITY' : 'INDIVIDUAL',
      role: officer.role,
      contactId: contact?.id ?? null,
      identifierType,
      identifier: contact?.identificationNumber ?? contact?.corporateUen ?? officer.identificationNumber ?? null,
      source: { type: 'OFFICER', id: officer.id },
    });
  }

  for (const shareholder of company.shareholders) {
    const contact = usableContact(shareholder.contact);
    const identifierType = contact?.identificationType ?? shareholder.identificationType ?? null;
    const corporate = shareholder.shareholderType === 'CORPORATE' || contact?.contactType === 'CORPORATE';
    const name = cleanName(
      corporate ? contact?.corporateName || contact?.fullName || shareholder.name : shareholder.name || contact?.fullName,
    );
    if (!name) continue;
    entries.push({
      name,
      entityKind: corporate ? 'CORPORATE' : 'INDIVIDUAL',
      searchType: corporate ? 'ENTITY' : 'INDIVIDUAL',
      role: 'SHAREHOLDER',
      contactId: contact?.id ?? null,
      identifierType,
      identifier: contact?.identificationNumber ?? contact?.corporateUen ?? shareholder.identificationNumber ?? null,
      source: { type: 'SHAREHOLDER', id: shareholder.id },
    });
  }

  const merged = new Map<string, CandidateEntity>();
  for (const entry of entries) {
    const key = dedupeKey(entry);
    const existing = merged.get(key);
    if (existing) {
      if (!existing.roles.includes(entry.role)) existing.roles.push(entry.role);
      existing.sourceRefs.push(entry.source);
      existing.identifierType ??= entry.identifierType;
      existing.identifier ??= entry.identifier;
      continue;
    }
    merged.set(key, {
      key: hashKey(key),
      name: entry.name,
      entityKind: entry.entityKind,
      searchType: entry.searchType,
      roles: [entry.role],
      identifierType: entry.identifierType,
      identifier: entry.identifier,
      sourceRefs: [entry.source],
      contactId: entry.contactId,
    });
  }

  const [self, ...others] = [...merged.values()];
  others.sort((a, b) => {
    const rank = (candidate: CandidateEntity) => (candidate.roles.some((role) => role !== 'SHAREHOLDER') ? 0 : 1);
    return rank(a) - rank(b) || a.name.localeCompare(b.name);
  });
  return [self, ...others];
}
