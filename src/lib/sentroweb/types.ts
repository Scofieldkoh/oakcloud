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
