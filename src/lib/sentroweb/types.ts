/** Shapes shared by the parser, the service, the API and the UI. No server imports. */

import type { SentrowebCategory } from './selectors';

export type SentrowebSearchTypeValue = 'INDIVIDUAL' | 'ENTITY';
export type SentrowebParsedStatus = 'CLEAR' | 'POSSIBLE_MATCH' | 'ERROR';

/** One hit, reduced to whitelisted fields. Nothing else from Sentroweb is stored. */
export interface SentrowebMatch {
  category: SentrowebCategory;
  uniqueId: string | null;
  name: string;
  /** Sentroweb's own category or type label for the hit, when it gives one. */
  matchType: string | null;
  /** Nationality (people) or country (entities and FATF countries). */
  country: string | null;
  dateOfBirth: string | null;
  yearOfBirth: string | null;
  /** The list references Sentroweb shows, for example "Current Sanctions". */
  source: string | null;
  /** At most the first 5 aliases. */
  aliases: string[];
}

export type SentrowebCategoryCounts = Partial<Record<SentrowebCategory, number>>;

// --- API shapes (what the routes return and the UI reads) -----------------------------------------

export type SentrowebRunStatusValue = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED';
export type SentrowebOverallValue = 'CLEAR' | 'POSSIBLE_MATCH' | 'INCOMPLETE';
export type SentrowebResultStatusValue = 'CLEAR' | 'POSSIBLE_MATCH' | 'ERROR' | 'NOT_RUN';
export type SentrowebEntityKindValue = 'COMPANY' | 'INDIVIDUAL' | 'CORPORATE';

/** One person or company that can be ticked in the confirm dialog. */
export interface SentrowebCandidateDto {
  /** Opaque, server-derived. Send it back unchanged in `entityKeys`. */
  key: string;
  name: string;
  entityKind: SentrowebEntityKindValue;
  searchType: SentrowebSearchTypeValue;
  roles: string[];
  identifierType: string | null;
  identifier: string | null;
}

export interface SentrowebCandidatesResponse {
  configured: boolean;
  maxEntities: number;
  creditsPerSearch: number;
  candidates: SentrowebCandidateDto[];
  activeRunId: string | null;
  /** When the cooldown after the latest run ends, or null when a new run is allowed now. */
  cooldownUntil: string | null;
}

export interface SentrowebResultDto {
  id: string;
  position: number;
  name: string;
  entityKind: SentrowebEntityKindValue;
  searchType: SentrowebSearchTypeValue;
  roles: string[];
  identifierType: string | null;
  identifier: string | null;
  status: SentrowebResultStatusValue;
  matchCount: number;
  categoryCounts: SentrowebCategoryCounts;
  matches: SentrowebMatch[];
  monitorEnabled: boolean | null;
  errorCode: string | null;
  /** Fixed text for `errorCode`; never page text. */
  errorMessage: string | null;
  documentId: string | null;
  hasScreenshot: boolean;
  checkedAt: string | null;
}

export interface SentrowebRunDto {
  id: string;
  companyId: string;
  status: SentrowebRunStatusValue;
  overallResult: SentrowebOverallValue | null;
  errorCode: string | null;
  errorMessage: string | null;
  entityCount: number;
  creditsUsed: number;
  requestedBy: { id: string; name: string } | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  /** Present on the detail response, absent on the history list. */
  results?: SentrowebResultDto[];
}

export interface SentrowebRunListResponse {
  runs: SentrowebRunDto[];
  nextCursor: string | null;
}
