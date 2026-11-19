import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

/** Hand-trimmed Sentroweb fixtures (test names, Vladimir Putin and Rosneft only). */
export const SENTROWEB_FIXTURE_DIR = path.resolve(__dirname, '../fixtures/sentroweb');

export function fixtureNames(): string[] {
  return readdirSync(SENTROWEB_FIXTURE_DIR).sort();
}

export function fixtureText(name: string): string {
  return readFileSync(path.join(SENTROWEB_FIXTURE_DIR, name), 'utf8');
}

export function fixtureJson<T = unknown>(name: string): T {
  return JSON.parse(fixtureText(name)) as T;
}

/** Deep copy so a test can mutate a fixture freely. */
export function cloneFixtureJson<T = unknown>(name: string): T {
  return structuredClone(fixtureJson<T>(name));
}

/** The `<Category> [N matches]` accordion titles of a result snippet, in order. */
export function accordionTitles(html: string): string[] {
  const titles: string[] = [];
  const pattern = /class="title search-title-div[^"]*">(?:<i[^>]*><\/i>)?([^<]*)</g;
  for (const match of html.matchAll(pattern)) titles.push(match[1]);
  return titles;
}

export type FixtureCase = 'entity-clear' | 'individual-clear' | 'individual-match' | 'entity-match';

export const FIXTURE_CASES: Record<FixtureCase, { searchType: 'ENTITY' | 'INDIVIDUAL'; name: string }> = {
  'entity-clear': { searchType: 'ENTITY', name: 'Zzqx Testname Qwv Pte Ltd' },
  'individual-clear': { searchType: 'INDIVIDUAL', name: 'Zzqx Testname Qwv' },
  'individual-match': { searchType: 'INDIVIDUAL', name: 'Vladimir Putin' },
  'entity-match': { searchType: 'ENTITY', name: 'Rosneft Oil Company' },
};

export function loadCase(key: FixtureCase) {
  return {
    ...FIXTURE_CASES[key],
    json: cloneFixtureJson<Array<Record<string, unknown>>>(`search-${key}.json`),
    titles: accordionTitles(fixtureText(`result-${key}.html`)),
  };
}
