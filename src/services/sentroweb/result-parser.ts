/**
 * Pure classification of one Sentroweb search result. Fail-closed (decision D4):
 *
 * - CLEAR only when the captured search-response JSON and the page's
 *   `<Category> [N matches]` titles both show zero for every expected category, no other array in
 *   the payload holds anything, and the payload describes the search we submitted.
 * - POSSIBLE_MATCH when either source shows a count above zero, even if the two disagree.
 * - ERROR for everything else: missing, unparsable or unexpected structure, mismatching
 *   search type or name.
 *
 * No branch falls through to CLEAR; CLEAR is returned from exactly one place at the bottom.
 */

import {
  SENTROWEB_CATEGORY_TITLES,
  SENTROWEB_DOM_OPTIONAL_CATEGORIES,
  SENTROWEB_EXPECTED_CATEGORIES,
  SENTROWEB_JSON_ARRAYS,
  SENTROWEB_PATTERNS,
  type SentrowebCategory,
} from '@/lib/sentroweb/selectors';
import type {
  SentrowebCategoryCounts,
  SentrowebMatch,
  SentrowebParsedStatus,
  SentrowebSearchTypeValue,
} from '@/lib/sentroweb/types';
import type { SentrowebErrorCode } from '@/lib/sentroweb/error-codes';

export const MAX_MATCHES_PER_CATEGORY = 25;
export const MAX_ALIASES_PER_MATCH = 5;
const MAX_TEXT_LENGTH = 200;

export interface ParsedSentrowebResult {
  status: SentrowebParsedStatus;
  matchCount: number;
  categoryCounts: SentrowebCategoryCounts;
  matches: SentrowebMatch[];
  sentrowebReportId: string | null;
  monitorEnabled: boolean | null;
  /** Set when status is ERROR. */
  errorCode?: SentrowebErrorCode;
}

export interface ParseOptions {
  /** The name that was typed into the search box. A response for another name is an error. */
  expectedName?: string;
  /**
   * What the search was sent with (an individual's country option and YYYY-MM-DD birth date), null
   * for "left blank". Left undefined, the echo is not checked. When given, Sentroweb's response
   * must echo exactly that, otherwise it describes another search (RESULT_MISMATCH).
   */
  expectedCountry?: string | null;
  expectedDateOfBirth?: string | null;
}

type Json = Record<string, unknown>;

function isRecord(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return null;
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (!trimmed || trimmed === 'None') return null;
  return trimmed.slice(0, MAX_TEXT_LENGTH);
}

function joinNames(...parts: unknown[]): string | null {
  const joined = parts.map(text).filter((part): part is string => part !== null).join(' ');
  return joined || null;
}

function normaliseName(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
}

function normaliseTitle(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function aliasNames(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const names: string[] = [];
  for (const alias of raw) {
    if (!isRecord(alias)) continue;
    const name = text(alias.businessName) ?? joinNames(alias.forename, alias.middleName ?? alias.middlename, alias.surname);
    if (name) names.push(name);
    if (names.length >= MAX_ALIASES_PER_MATCH) break;
  }
  return names;
}

/** Whitelists the fields of one hit. Everything else Sentroweb sends is dropped. */
function toMatch(category: SentrowebCategory, entry: unknown): SentrowebMatch {
  const record = isRecord(entry) ? entry : {};
  const name =
    text(record.businessName) ??
    joinNames(record.forename, record.middlename, record.surname) ??
    text(record.name) ??
    text(record.countryName) ??
    text(record.country) ??
    'Unnamed match';
  return {
    category,
    uniqueId: text(record.uniqueID),
    name,
    matchType: text(record.category),
    country: text(record.nationality) ?? text(record.country) ?? text(record.countryName),
    dateOfBirth: text(record.dateOfBirth),
    yearOfBirth: text(record.yearOfBirth),
    source: text(record.source),
    aliases: aliasNames(record.aliases),
  };
}

function error(
  errorCode: SentrowebErrorCode,
  partial: Partial<Omit<ParsedSentrowebResult, 'status' | 'errorCode'>> = {},
): ParsedSentrowebResult {
  return {
    status: 'ERROR',
    matchCount: 0,
    categoryCounts: {},
    matches: [],
    sentrowebReportId: null,
    monitorEnabled: null,
    ...partial,
    errorCode,
  };
}

interface DomCounts {
  counts: Partial<Record<SentrowebCategory, number>>;
  /** Titles that did not parse, or repeat a category, or name an unknown category. */
  malformed: boolean;
  /** Hits shown under a heading we do not recognise. They still count as hits. */
  unknownHits: number;
}

/** Own-property lookup: `constructor`, `toString` and `__proto__` are never categories. */
function lookupOwn<T>(table: Record<string, T>, key: string): T | undefined {
  return Object.hasOwn(table, key) ? table[key] : undefined;
}

function parseDomTitles(titles: readonly string[]): DomCounts {
  const counts: Partial<Record<SentrowebCategory, number>> = {};
  let malformed = false;
  let unknownHits = 0;
  for (const raw of titles) {
    const match = SENTROWEB_PATTERNS.categoryTitle.exec(normaliseTitle(raw));
    const category = match ? lookupOwn(SENTROWEB_CATEGORY_TITLES, normaliseTitle(match[1])) : undefined;
    const count = match ? Number.parseInt(match[2], 10) : Number.NaN;
    const countOk = Number.isSafeInteger(count) && count >= 0;
    if (!match || !category || !countOk) {
      malformed = true;
      // A heading we cannot place can still report hits; never throw that evidence away.
      if (match && countOk && !category) unknownHits += count;
      continue;
    }
    if (Object.hasOwn(counts, category)) {
      // A repeated heading is malformed, but the larger count is kept: a positive is never lost.
      malformed = true;
      counts[category] = Math.max(counts[category] ?? 0, count);
      continue;
    }
    counts[category] = count;
  }
  return { counts, malformed, unknownHits };
}

/** An echoed optional field: absent, null and "" all mean blank. Anything but a string is odd. */
function echoedText(value: unknown): string | null {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') return null;
  return value.trim();
}

export function parseSentrowebResult(
  searchType: SentrowebSearchTypeValue,
  searchJson: unknown,
  domCategoryTitles: readonly string[] | null | undefined,
  options: ParseOptions = {},
): ParsedSentrowebResult {
  const expected = SENTROWEB_EXPECTED_CATEGORIES[searchType] as readonly SentrowebCategory[];
  // Sentroweb draws the FATF heading for an individual searched with a country (both recorded
  // country searches show it) and leaves it out for a name-only search. With a country sent every
  // heading is therefore required; without one the FATF heading may be absent.
  const countrySent = typeof options.expectedCountry === 'string' && options.expectedCountry !== '';
  const domOptional = (countrySent ? [] : SENTROWEB_DOM_OPTIONAL_CATEGORIES[searchType]) as readonly SentrowebCategory[];

  // --- JSON source -----------------------------------------------------------------------------
  // Observed shape: an array with exactly one object. Anything else is a layout change.
  const payload = Array.isArray(searchJson) && searchJson.length === 1 ? searchJson[0] : null;
  const jsonOk = isRecord(payload);

  const jsonCounts: Partial<Record<SentrowebCategory, number>> = {};
  const matches: SentrowebMatch[] = [];
  let jsonStructureOk = jsonOk;
  let unknownArrayHasData = false;
  let sentrowebReportId: string | null = null;
  let monitorEnabled: boolean | null = null;
  let describesOurSearch = true;

  if (jsonOk) {
    const record = payload as Json;
    sentrowebReportId = text(record.amlReportId);
    monitorEnabled = typeof record.monitorEnabled === 'boolean' ? record.monitorEnabled : null;

    for (const key of Object.keys(SENTROWEB_JSON_ARRAYS)) {
      const list = record[key];
      if (!Array.isArray(list)) {
        jsonStructureOk = false; // a known array is missing: cannot prove it is empty
        continue;
      }
      const category = SENTROWEB_JSON_ARRAYS[key]; // `key` comes from Object.keys: always own
      jsonCounts[category] = list.length;
      for (const entry of list.slice(0, MAX_MATCHES_PER_CATEGORY)) matches.push(toMatch(category, entry));
    }
    for (const [key, value] of Object.entries(record)) {
      if (Object.hasOwn(SENTROWEB_JSON_ARRAYS, key)) continue;
      if (Array.isArray(value) && value.length > 0) unknownArrayHasData = true;
    }

    const isEntity = searchType === 'ENTITY';
    if (record.searchEntity !== isEntity || record.searchIndividual !== !isEntity) describesOurSearch = false;
    if (options.expectedName !== undefined) {
      const echoed = text(record.name);
      if (!echoed || normaliseName(echoed) !== normaliseName(options.expectedName)) describesOurSearch = false;
    }
    // What was sent besides the name must come back unchanged: a response for another country or
    // birth date is another search, and is never read as clear for this one.
    if (options.expectedCountry !== undefined && echoedText(record.country) !== (options.expectedCountry ?? '')) {
      describesOurSearch = false;
    }
    if (
      options.expectedDateOfBirth !== undefined &&
      echoedText(record.dateOfBirth) !== (options.expectedDateOfBirth ?? '')
    ) {
      describesOurSearch = false;
    }
  }

  // --- DOM source ------------------------------------------------------------------------------
  const domTitles = Array.isArray(domCategoryTitles) ? domCategoryTitles : [];
  const dom = parseDomTitles(domTitles);
  const domSeen = Object.keys(dom.counts) as SentrowebCategory[];
  const domHasAllExpected = expected.every(
    (category) => domOptional.includes(category) || Object.hasOwn(dom.counts, category),
  );
  const domHasOnlyExpected = domSeen.every((category) => expected.includes(category));
  const domOk = domTitles.length > 0 && !dom.malformed && domHasAllExpected && domHasOnlyExpected;

  // --- Counts and matches ----------------------------------------------------------------------
  const categoryCounts: SentrowebCategoryCounts = {};
  let matchCount = 0;
  for (const category of ['FATF', 'PEP', 'SIP', 'SIE'] as const) {
    const fromJson = jsonCounts[category];
    const fromDom = dom.counts[category];
    if (fromJson === undefined && fromDom === undefined) continue;
    const count = Math.max(fromJson ?? 0, fromDom ?? 0);
    // Report only the categories Sentroweb shows for this search type, plus any with hits.
    if (count === 0 && !expected.includes(category)) continue;
    categoryCounts[category] = count;
    matchCount += count;
  }

  matchCount += dom.unknownHits;

  const base = { matchCount, categoryCounts, matches, sentrowebReportId, monitorEnabled };

  // Any positive count in either source is a possible match, whatever else is wrong.
  if (matchCount > 0) return { ...base, status: 'POSSIBLE_MATCH' };

  // From here nothing is positive; CLEAR needs every structural proof, otherwise ERROR.
  if (!jsonOk) return error(searchJson === null || searchJson === undefined ? 'RESULT_MISMATCH' : 'LAYOUT_CHANGED', base);
  if (!describesOurSearch) return error('RESULT_MISMATCH', base);
  if (!jsonStructureOk || unknownArrayHasData) return error('LAYOUT_CHANGED', base);
  if (domTitles.length === 0) return error('RESULT_MISMATCH', base);
  if (!domOk) return error('LAYOUT_CHANGED', base);

  // Both sources are well-formed and show zero for every expected category. The explicit
  // agreement check below is deliberately redundant with matchCount === 0: it keeps CLEAR
  // unreachable if the counting above is ever changed.
  const sourcesAgree = expected.every(
    (category) =>
      jsonCounts[category] === 0 &&
      (dom.counts[category] === 0 || (dom.counts[category] === undefined && domOptional.includes(category))),
  );
  if (!sourcesAgree) return error('RESULT_MISMATCH', base);

  return { ...base, status: 'CLEAR' };
}
