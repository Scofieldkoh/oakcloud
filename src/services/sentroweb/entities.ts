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

function normaliseId(entry: RawEntry): string | null {
  if (!entry.identifierType || !entry.identifier) return null;
  const number = entry.identifier.replace(/\s+/g, '').toUpperCase();
  return number ? `${entry.identifierType}:${number}` : null;
}

interface Group {
  entries: RawEntry[];
  contactIds: Set<string>;
  ids: Set<string>;
  names: Set<string>;
}

/**
 * Is `entry` the same person as the people already in `group`? (Decision D2, widened so that a
 * record linked to a contact and one that is not still merge.)
 *
 * - the same contact, or the same id type and number, is the same person;
 * - otherwise the same name and kind is the same person only if nothing conflicts: the two never
 *   carry different id numbers, and never belong to two different contacts.
 *
 * A group never ends up holding two different id numbers or two different contacts, so a chain of
 * name-only records cannot join two people who are known to be different.
 */
function belongsTo(group: Group, entry: RawEntry): boolean {
  const id = normaliseId(entry);
  if (entry.contactId && group.contactIds.has(entry.contactId)) return true;
  if (id && group.ids.has(id)) return true;

  const idConflict = id !== null && group.ids.size > 0;
  const contactConflict = entry.contactId !== null && group.contactIds.size > 0;
  if (idConflict || contactConflict) return false;
  return group.names.has(`${entry.searchType}:${normaliseName(entry.name)}`);
}

function groupEntries(entries: RawEntry[]): Group[] {
  const groups: Group[] = [];
  for (const entry of entries) {
    const group = groups.find((candidate) => belongsTo(candidate, entry));
    const target: Group = group ?? { entries: [], contactIds: new Set(), ids: new Set(), names: new Set() };
    if (!group) groups.push(target);
    target.entries.push(entry);
    if (entry.contactId) target.contactIds.add(entry.contactId);
    const id = normaliseId(entry);
    if (id) target.ids.add(id);
    target.names.add(`${entry.searchType}:${normaliseName(entry.name)}`);
  }
  return groups;
}

/** A stable key from the strongest identity of the group (not from where the rows came from). */
function groupKey(group: Group): string {
  const contact = [...group.contactIds].sort()[0];
  if (contact) return `contact:${contact}`;
  const id = [...group.ids].sort()[0];
  if (id) return `id:${id}`;
  return `name:${[...group.names].sort()[0]}`;
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

  // Group in a fixed order so the same data always gives the same keys.
  const [companyEntry, ...people] = entries;
  people.sort(
    (a, b) =>
      a.name.localeCompare(b.name) || a.role.localeCompare(b.role) || a.source.id.localeCompare(b.source.id),
  );
  const groups = groupEntries(people);
  const merged: CandidateEntity[] = [
    {
      key: hashKey('company'),
      name: companyEntry.name,
      entityKind: 'COMPANY',
      searchType: 'ENTITY',
      roles: ['COMPANY'],
      identifierType: companyEntry.identifierType,
      identifier: companyEntry.identifier,
      sourceRefs: [companyEntry.source],
      contactId: null,
    },
  ];
  const usedKeys = new Set(merged.map((candidate) => candidate.key));
  for (const group of groups) {
    const first = group.entries[0];
    let key = hashKey(groupKey(group));
    // Two different people can never share a key.
    for (let n = 2; usedKeys.has(key); n += 1) key = hashKey(`${groupKey(group)}#${n}`);
    usedKeys.add(key);
    const withId = group.entries.find((entry) => entry.identifier);
    merged.push({
      key,
      name: first.name,
      entityKind: group.entries.some((entry) => entry.entityKind === 'CORPORATE') ? 'CORPORATE' : first.entityKind,
      searchType: first.searchType,
      roles: [...new Set(group.entries.map((entry) => entry.role))],
      identifierType: withId?.identifierType ?? null,
      identifier: withId?.identifier ?? null,
      sourceRefs: group.entries.map((entry) => entry.source),
      contactId: [...group.contactIds].sort()[0] ?? null,
    });
  }

  const [self, ...others] = merged;
  others.sort((a, b) => {
    const rank = (candidate: CandidateEntity) => (candidate.roles.some((role) => role !== 'SHAREHOLDER') ? 0 : 1);
    return rank(a) - rank(b) || a.name.localeCompare(b.name);
  });
  return [self, ...others];
}
