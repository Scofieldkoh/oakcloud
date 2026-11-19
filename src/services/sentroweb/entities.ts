/**
 * Which people and companies a Sentroweb check screens (decision D2):
 * the company itself, its current directors and its current shareholders. Secretaries, the CEO
 * and former officers are not screened. The same person in two roles is one entry with both roles.
 */
import { createHash } from 'node:crypto';
import { plausibleDateOfBirth, toDateOnlyString } from '@/lib/date-only';
import { prisma } from '@/lib/prisma';
import { mapToSentrowebCountry } from '@/lib/sentroweb/countries';
import { NotFoundError } from '@/lib/errors';
import type {
  SentrowebCandidateDto,
  SentrowebGender,
  SentrowebSearchDetailsDto,
  SentrowebEntityKindValue,
  SentrowebSearchTypeValue,
} from '@/lib/sentroweb/types';

export const SCREENED_OFFICER_ROLES = [
  'DIRECTOR',
  'MANAGING_DIRECTOR',
  'ALTERNATE_DIRECTOR',
  'NOMINEE_DIRECTOR',
] as const;

export interface CandidateEntity extends Omit<SentrowebCandidateDto, 'searchDetails'> {
  /** Where the entry came from: the company, an officer row or a shareholder row. */
  sourceRefs: Array<{ type: 'COMPANY' | 'OFFICER' | 'SHAREHOLDER'; id: string }>;
  contactId: string | null;
  /**
   * What an individual is searched with besides the name (never for companies or corporate
   * holders): the exact Sentroweb country option and the date of birth as YYYY-MM-DD. Null means
   * that field is left blank. Gender is MALE or FEMALE from the linked contact, else null.
   */
  country: string | null;
  dateOfBirth: string | null;
  gender: SentrowebGender | null;
}

/** What the confirm dialog and the results show (the date itself is never returned). */
export function searchDetailsFor(
  candidate: Pick<CandidateEntity, 'country' | 'dateOfBirth' | 'gender'>,
): SentrowebSearchDetailsDto {
  return { country: candidate.country, dateOfBirth: candidate.dateOfBirth !== null, gender: candidate.gender };
}

/** The gender Sentroweb can be given: only MALE and FEMALE exist there (OTHER is not sent). */
export function sentrowebGenderOf(value: string | null | undefined): SentrowebGender | null {
  return value === 'MALE' || value === 'FEMALE' ? value : null;
}

/**
 * The Sentroweb country for the nationalities held for one person: sent only when every stated
 * nationality maps to the same option. A stated one that cannot be mapped counts as a
 * disagreement, so the person is searched without a country rather than with a partial one.
 */
export function agreedCountry(nationalities: Array<string | null>): string | null {
  const stated = nationalities.filter((value): value is string => typeof value === 'string' && value.trim() !== '');
  const mapped = stated.map((value) => mapToSentrowebCountry(value));
  if (mapped.length === 0 || mapped.some((value) => value === null)) return null;
  return agreedValue(mapped);
}

/** YYYY-MM-DD of a stored date of birth, or null when it is missing or implausible. */
export function formatDateOfBirth(value: Date | null | undefined, now: Date = new Date()): string | null {
  // The same rule Contacts enforces when the date is entered, so a saved date is always sent.
  return plausibleDateOfBirth(toDateOnlyString(value), now);
}

/**
 * One value for a person who appears in several records: the single distinct value, or null when
 * the records disagree (the field is then left blank rather than picking one).
 */
function agreedValue(values: Array<string | null>): string | null {
  const distinct = new Set(values.filter((value): value is string => value !== null));
  return distinct.size === 1 ? [...distinct][0] : null;
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
  /** The stored nationality text (contact first, then the record); mapped later. */
  nationality: string | null;
  dateOfBirth: string | null;
  gender: SentrowebGender | null;
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

const intersects = <T>(left: Set<T>, right: Set<T>) => [...left].some((value) => right.has(value));

/** The same contact or the same id type and number: the same person, whatever the names say. */
function sharesStrongIdentity(left: Group, right: Group): boolean {
  return intersects(left.contactIds, right.contactIds) || intersects(left.ids, right.ids);
}

/**
 * The same name and kind, and nothing contradicts it: the two never carry different id numbers
 * and never belong to different contacts. A record without an id (or contact) is compatible with
 * one that has it.
 */
function sharesNameWithoutConflict(left: Group, right: Group): boolean {
  if (!intersects(left.names, right.names)) return false;
  const idConflict = left.ids.size > 0 && right.ids.size > 0 && !intersects(left.ids, right.ids);
  const contactConflict =
    left.contactIds.size > 0 && right.contactIds.size > 0 && !intersects(left.contactIds, right.contactIds);
  return !idConflict && !contactConflict;
}

function mergeInto(target: Group, source: Group): void {
  target.entries.push(...source.entries);
  for (const id of source.contactIds) target.contactIds.add(id);
  for (const id of source.ids) target.ids.add(id);
  for (const name of source.names) target.names.add(name);
}

/**
 * Groups records into people (decision D2). Every record starts alone; groups are then joined
 * until nothing more joins, so a later record that reveals two groups to be one person (a "late
 * bridge") coalesces both. Strong identities (contact, id number) are applied before names are
 * considered, and a name never joins two groups whose id numbers or contacts differ, so one
 * name-only record cannot chain two known-different people together.
 */
function groupEntries(entries: RawEntry[]): Group[] {
  const groups: Group[] = entries.map((entry) => {
    const id = normaliseId(entry);
    return {
      entries: [entry],
      contactIds: new Set(entry.contactId ? [entry.contactId] : []),
      ids: new Set(id ? [id] : []),
      names: new Set([`${entry.searchType}:${normaliseName(entry.name)}`]),
    };
  });

  const joinOnce = (joins: (left: Group, right: Group) => boolean): boolean => {
    for (let i = 0; i < groups.length; i += 1) {
      for (let j = i + 1; j < groups.length; j += 1) {
        if (!joins(groups[i], groups[j])) continue;
        mergeInto(groups[i], groups[j]);
        groups.splice(j, 1);
        return true;
      }
    }
    return false;
  };

  let changed = true;
  while (changed) {
    changed = false;
    while (joinOnce(sharesStrongIdentity)) changed = true;
    if (joinOnce(sharesNameWithoutConflict)) changed = true;
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
          nationality: true,
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
              nationality: true,
              dateOfBirth: true,
              gender: true,
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
          nationality: true,
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
              nationality: true,
              dateOfBirth: true,
              gender: true,
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
      nationality: null,
      dateOfBirth: null,
      gender: null,
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
      nationality: cleanName(contact?.nationality ?? officer.nationality) || null,
      dateOfBirth: formatDateOfBirth(contact?.dateOfBirth),
      gender: sentrowebGenderOf(contact?.gender),
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
      nationality: cleanName(contact?.nationality ?? shareholder.nationality) || null,
      dateOfBirth: formatDateOfBirth(contact?.dateOfBirth),
      gender: sentrowebGenderOf(contact?.gender),
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
      country: null,
      dateOfBirth: null,
      gender: null,
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
      // Only an individual is searched with details. Where the records of one person disagree (two
      // nationalities, two birth dates) that field is left blank instead of picking one.
      ...(first.searchType === 'INDIVIDUAL' && !group.entries.some((entry) => entry.entityKind === 'CORPORATE')
        ? {
            country: agreedCountry(group.entries.map((entry) => entry.nationality)),
            dateOfBirth: agreedValue(group.entries.map((entry) => entry.dateOfBirth)),
            gender: agreedValue(group.entries.map((entry) => entry.gender)) as SentrowebGender | null,
          }
        : { country: null, dateOfBirth: null, gender: null }),
    });
  }

  const [self, ...others] = merged;
  others.sort((a, b) => {
    const rank = (candidate: CandidateEntity) => (candidate.roles.some((role) => role !== 'SHAREHOLDER') ? 0 : 1);
    return rank(a) - rank(b) || a.name.localeCompare(b.name);
  });
  return [self, ...others];
}
