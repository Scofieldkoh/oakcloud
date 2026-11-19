// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  MAX_ALIASES_PER_MATCH,
  MAX_MATCHES_PER_CATEGORY,
  parseSentrowebResult,
  type ParsedSentrowebResult,
} from '@/services/sentroweb/result-parser';
import {
  FIXTURE_CASES,
  accordionTitles,
  cloneFixtureJson,
  fixtureText,
  loadCase,
  type FixtureCase,
} from '../../helpers/sentroweb-fixtures';

type Search = 'ENTITY' | 'INDIVIDUAL';
type Payload = Array<Record<string, unknown>>;

const clearEntity = () => loadCase('entity-clear');
const clearIndividual = () => loadCase('individual-clear');

function parse(c: { searchType: Search; json: unknown; titles: string[]; name: string }) {
  return parseSentrowebResult(c.searchType, c.json, c.titles, { expectedName: c.name });
}

describe('parseSentrowebResult: recorded fixtures', () => {
  it('classifies an entity with no hits as CLEAR', () => {
    const result = parse(clearEntity());
    expect(result).toMatchObject({
      status: 'CLEAR',
      matchCount: 0,
      categoryCounts: { SIE: 0 },
      matches: [],
      sentrowebReportId: '129',
      monitorEnabled: true,
    });
    expect(result.errorCode).toBeUndefined();
  });

  it('classifies an individual with no hits as CLEAR', () => {
    const result = parse(clearIndividual());
    expect(result).toMatchObject({
      status: 'CLEAR',
      matchCount: 0,
      categoryCounts: { FATF: 0, PEP: 0, SIP: 0 },
      sentrowebReportId: '130',
    });
  });

  it('classifies the Putin individual search as POSSIBLE_MATCH with PEP 2 and SIP 1', () => {
    const result = parse(loadCase('individual-match'));
    expect(result.status).toBe('POSSIBLE_MATCH');
    expect(result.matchCount).toBe(3);
    expect(result.categoryCounts).toEqual({ FATF: 0, PEP: 2, SIP: 1 });
    expect(result.matches.map((m) => m.category)).toEqual(['PEP', 'PEP', 'SIP']);
    expect(result.matches.every((m) => m.name.includes('Putin'))).toBe(true);
    expect(result.errorCode).toBeUndefined();
  });

  it('classifies the Rosneft entity search as POSSIBLE_MATCH with SIE 1', () => {
    const result = parse(loadCase('entity-match'));
    expect(result.status).toBe('POSSIBLE_MATCH');
    expect(result.matchCount).toBe(1);
    expect(result.categoryCounts).toEqual({ SIE: 1 });
    expect(result.matches[0]).toMatchObject({
      category: 'SIE',
      name: 'Neftyanaya Kompaniya Rosneft PAO',
      uniqueId: 'C49829',
    });
  });

  it('keeps only whitelisted fields of a match and at most 5 aliases', () => {
    const result = parse(loadCase('individual-match'));
    const allowed = ['category', 'uniqueId', 'name', 'matchType', 'country', 'dateOfBirth', 'yearOfBirth', 'source', 'aliases'];
    for (const match of result.matches) {
      expect(Object.keys(match).sort()).toEqual([...allowed].sort());
      expect(match.aliases.length).toBeLessThanOrEqual(MAX_ALIASES_PER_MATCH);
    }
    expect(result.matches.some((m) => m.aliases.length === MAX_ALIASES_PER_MATCH)).toBe(true);
    const serialised = JSON.stringify(result);
    for (const dropped of ['picture', 'example.invalid', 'trimmed note', 'Sample City', 'homeTelephone']) {
      expect(serialised).not.toContain(dropped);
    }
    const entity = parse(loadCase('entity-match'));
    expect(entity.matches[0].aliases).toHaveLength(MAX_ALIASES_PER_MATCH);
    expect(JSON.stringify(entity)).not.toContain('+00 0000');
  });

  it('caps stored matches per category but still counts them all', () => {
    const c = loadCase('entity-match');
    const entry = (c.json[0].sieEntities as Payload)[0];
    c.json[0].sieEntities = Array.from({ length: 40 }, () => structuredClone(entry));
    c.titles = ['Special Interest Entities [40 matches]'];
    const result = parse(c);
    expect(result.status).toBe('POSSIBLE_MATCH');
    expect(result.matchCount).toBe(40);
    expect(result.matches).toHaveLength(MAX_MATCHES_PER_CATEGORY);
  });
});

describe('parseSentrowebResult: the two sources', () => {
  it('a DOM count above 0 with an empty JSON array is POSSIBLE_MATCH', () => {
    const c = clearEntity();
    c.titles = ['Special Interest Entities [2 matches]'];
    const result = parse(c);
    expect(result.status).toBe('POSSIBLE_MATCH');
    expect(result.matchCount).toBe(2);
    expect(result.categoryCounts).toEqual({ SIE: 2 });
  });

  it('a JSON count above 0 with DOM 0 is POSSIBLE_MATCH', () => {
    const c = loadCase('entity-match');
    c.titles = ['Special Interest Entities [0 matches]'];
    const result = parse(c);
    expect(result.status).toBe('POSSIBLE_MATCH');
    expect(result.categoryCounts).toEqual({ SIE: 1 });
  });

  it('a count above 0 in a category the search type does not show is still POSSIBLE_MATCH', () => {
    const c = clearEntity();
    (c.json[0] as Record<string, unknown>).pepPersons = [{ forename: 'A', surname: 'B' }];
    const result = parse(c);
    expect(result.status).toBe('POSSIBLE_MATCH');
    expect(result.categoryCounts).toMatchObject({ PEP: 1 });
  });

  it('a missing category title is ERROR', () => {
    const c = clearIndividual();
    c.titles = c.titles.slice(0, 2);
    expect(parse(c)).toMatchObject({ status: 'ERROR', errorCode: 'LAYOUT_CHANGED' });
  });

  it('no titles at all is ERROR RESULT_MISMATCH (one source is missing)', () => {
    const c = clearEntity();
    c.titles = [];
    expect(parse(c)).toMatchObject({ status: 'ERROR', errorCode: 'RESULT_MISMATCH' });
  });

  it('no JSON is ERROR RESULT_MISMATCH even when the page shows zero', () => {
    const c = clearEntity();
    expect(parseSentrowebResult(c.searchType, null, c.titles, { expectedName: c.name })).toMatchObject({
      status: 'ERROR',
      errorCode: 'RESULT_MISMATCH',
    });
  });

  it('[N matches] text that does not parse is ERROR', () => {
    for (const title of [
      'Special Interest Entities [many matches]',
      'Special Interest Entities',
      'Special Interest Entities [-1 matches]',
      'Special Interest Entities [0 matches] extra',
      'Unknown Category [0 matches]',
      '',
    ]) {
      const c = clearEntity();
      c.titles = [title];
      const result = parse(c);
      expect(result.status, title).toBe('ERROR');
    }
  });

  it('a repeated category title is ERROR', () => {
    const c = clearEntity();
    c.titles = [...c.titles, ...c.titles];
    expect(parse(c).status).toBe('ERROR');
  });

  it('an entity search that shows individual categories is ERROR', () => {
    const c = clearEntity();
    c.titles = [...accordionTitles(fixtureText('result-individual-clear.html'))];
    expect(parse(c)).toMatchObject({ status: 'ERROR', errorCode: 'LAYOUT_CHANGED' });
  });

  it('an individual search that shows the entity category is ERROR', () => {
    const c = clearIndividual();
    c.titles = [...c.titles, 'Special Interest Entities [0 matches]'];
    expect(parse(c).status).toBe('ERROR');
  });

  it('an unknown non-empty array in the payload is not CLEAR', () => {
    const c = clearEntity();
    (c.json[0] as Record<string, unknown>).adverseMedia = [{ headline: 'x' }];
    expect(parse(c)).toMatchObject({ status: 'ERROR', errorCode: 'LAYOUT_CHANGED' });
  });

  it('an unknown EMPTY array in the payload is ignored', () => {
    const c = clearEntity();
    (c.json[0] as Record<string, unknown>).adverseMedia = [];
    expect(parse(c).status).toBe('CLEAR');
  });

  it('a missing known array is ERROR (emptiness cannot be proven)', () => {
    for (const key of ['fatfCountries', 'pepPersons', 'sipPersons', 'sieEntities']) {
      const c = clearEntity();
      delete (c.json[0] as Record<string, unknown>)[key];
      expect(parse(c).status, key).toBe('ERROR');
    }
  });

  it('a response for another search type or name is ERROR RESULT_MISMATCH', () => {
    const wrongType = clearEntity();
    (wrongType.json[0] as Record<string, unknown>).searchEntity = false;
    (wrongType.json[0] as Record<string, unknown>).searchIndividual = true;
    expect(parse(wrongType)).toMatchObject({ status: 'ERROR', errorCode: 'RESULT_MISMATCH' });

    const wrongName = clearEntity();
    wrongName.name = 'Some Other Company Pte Ltd';
    expect(parse(wrongName)).toMatchObject({ status: 'ERROR', errorCode: 'RESULT_MISMATCH' });
  });

  it('compares names ignoring case and extra spaces', () => {
    const c = clearEntity();
    c.name = '  zzqx   TESTNAME qwv  pte LTD ';
    expect(parse(c).status).toBe('CLEAR');
  });

  it('empty or invalid JSON is ERROR', () => {
    const c = clearEntity();
    for (const bad of [undefined, null, '', 'not json', 42, {}, [], [{}, {}], [null], ['x'], [[]], true]) {
      const result = parseSentrowebResult(c.searchType, bad, c.titles);
      expect(result.status, JSON.stringify(bad)).toBe('ERROR');
      expect(result.errorCode).toBeDefined();
    }
  });
});

describe('parseSentrowebResult: nothing but a proven clear is CLEAR', () => {
  const KNOWN_ARRAYS = ['fatfCountries', 'pepPersons', 'sipPersons', 'sieEntities'] as const;

  type Mutation = { label: string; apply: (c: ReturnType<typeof loadCase>) => void };

  const mutationsFor = (key: FixtureCase): Mutation[] => {
    const mutations: Mutation[] = [];
    for (const array of KNOWN_ARRAYS) {
      mutations.push({
        label: `delete ${array}`,
        apply: (c) => delete (c.json[0] as Record<string, unknown>)[array],
      });
      mutations.push({
        label: `${array} = null`,
        apply: (c) => ((c.json[0] as Record<string, unknown>)[array] = null),
      });
      mutations.push({
        label: `${array} has one entry`,
        apply: (c) => ((c.json[0] as Record<string, unknown>)[array] = [{ forename: 'X', surname: 'Y' }]),
      });
    }
    const titleCount = FIXTURE_CASES[key].searchType === 'ENTITY' ? 1 : 3;
    for (let index = 0; index < titleCount; index += 1) {
      // Only the FATF heading of an individual may be absent (country-only section); covered by its own tests.
      const optional = FIXTURE_CASES[key].searchType === 'INDIVIDUAL' && loadCase(key).titles[index]?.startsWith('FATF');
      if (!optional) mutations.push({ label: `remove title ${index}`, apply: (c) => c.titles.splice(index, 1) });
      mutations.push({
        label: `title ${index} shows 1 match`,
        apply: (c) => (c.titles[index] = c.titles[index].replace(/\[\d+ matches\]/, '[1 matches]')),
      });
      mutations.push({
        label: `title ${index} unparsable`,
        apply: (c) => (c.titles[index] = c.titles[index].replace(/\[\d+ matches\]/, '[? matches]')),
      });
    }
    mutations.push(
      { label: 'no titles', apply: (c) => (c.titles = []) },
      { label: 'JSON is not an array', apply: (c) => (c.json = c.json[0] as never) },
      { label: 'JSON has two objects', apply: (c) => c.json.push(structuredClone(c.json[0])) },
      { label: 'JSON is empty', apply: (c) => (c.json = []) },
      { label: 'flags flipped', apply: (c) => {
        const record = c.json[0] as Record<string, unknown>;
        [record.searchEntity, record.searchIndividual] = [record.searchIndividual, record.searchEntity];
      } },
      { label: 'name differs', apply: (c) => ((c.json[0] as Record<string, unknown>).name = 'Someone Else') },
      { label: 'unknown array with data', apply: (c) => ((c.json[0] as Record<string, unknown>).extra = [1]) },
      { label: 'extra unknown title', apply: (c) => c.titles.push('Something New [0 matches]') },
      { label: 'duplicate title', apply: (c) => c.titles.push(c.titles[0]) },
    );
    return mutations;
  };

  const nonClear = (r: ParsedSentrowebResult) => r.status !== 'CLEAR';

  it.each(['individual-match', 'entity-match'] as FixtureCase[])('the %s fixture is never CLEAR', (key) => {
    expect(nonClear(parse(loadCase(key)))).toBe(true);
  });

  it.each(['entity-clear', 'individual-clear'] as FixtureCase[])('no mutation of the %s fixture is CLEAR', (key) => {
    expect(parse(loadCase(key)).status).toBe('CLEAR'); // the unmutated baseline is clear
    for (const mutation of mutationsFor(key)) {
      const c = loadCase(key);
      mutation.apply(c);
      const result = parse(c);
      expect(nonClear(result), `${key}: ${mutation.label}`).toBe(true);
      if (result.status === 'ERROR') expect(result.errorCode, `${key}: ${mutation.label}`).toBeDefined();
    }
  });

  it('a clear baseline of one search type is never clear for the other', () => {
    const entity = clearEntity();
    const individual = clearIndividual();
    expect(parseSentrowebResult('INDIVIDUAL', entity.json, entity.titles).status).not.toBe('CLEAR');
    expect(parseSentrowebResult('ENTITY', individual.json, individual.titles).status).not.toBe('CLEAR');
  });
});

describe('parseSentrowebResult: prototype names and repeated headings', () => {
  it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf'])(
    'a non-empty array named %s in the payload is never CLEAR',
    (key) => {
      const c = clearEntity();
      // JSON.parse makes `__proto__` an own property, as a hostile or odd response would.
      const record = JSON.parse(JSON.stringify(c.json[0]).replace(/}$/, `,${JSON.stringify(key)}:[{"x":1}]}`));
      c.json = [record];
      expect(Object.hasOwn(record, key)).toBe(true);
      const result = parse(c);
      expect(result.status).not.toBe('CLEAR');
      expect(result).toMatchObject({ status: 'ERROR', errorCode: 'LAYOUT_CHANGED' });
    },
  );

  it('an EMPTY array under a prototype name is ignored', () => {
    const c = clearEntity();
    c.json = [JSON.parse(JSON.stringify(c.json[0]).replace(/}$/, ',"constructor":[],"__proto__":[]}'))];
    expect(parse(c).status).toBe('CLEAR');
  });

  it.each(['constructor', 'toString', '__proto__'])('a heading called %s is not a category', (name) => {
    const c = clearEntity();
    c.titles = [...c.titles, `${name} [0 matches]`];
    expect(parse(c).status).toBe('ERROR');
    c.titles = [...clearEntity().titles, `${name} [2 matches]`];
    expect(parse(c)).toMatchObject({ status: 'POSSIBLE_MATCH', matchCount: 2 });
  });

  it.each([
    ['zero then positive', ['Special Interest Entities [0 matches]', 'Special Interest Entities [1 matches]']],
    ['positive then zero', ['Special Interest Entities [1 matches]', 'Special Interest Entities [0 matches]']],
    ['positive twice', ['Special Interest Entities [2 matches]', 'Special Interest Entities [1 matches]']],
  ])('a repeated heading keeps the positive count (%s)', (_name, titles) => {
    const c = clearEntity();
    c.titles = titles;
    const result = parse(c);
    expect(result.status).toBe('POSSIBLE_MATCH');
    expect(result.matchCount).toBe(Math.max(...titles.map((t) => Number(/\[(\d+)/.exec(t)![1]))));
  });

  it('a positive count under an unrecognised heading is a possible match, whatever else is wrong', () => {
    const c = clearIndividual();
    c.titles = [...c.titles, 'Adverse Media [3 matches]'];
    expect(parse(c)).toMatchObject({ status: 'POSSIBLE_MATCH', matchCount: 3 });
  });

  it('an unrecognised heading with zero hits is still an error, not clear', () => {
    const c = clearIndividual();
    c.titles = [...c.titles, 'Adverse Media [0 matches]'];
    expect(parse(c).status).toBe('ERROR');
  });
});

describe('parseSentrowebResult: an individual searched by name only (no FATF heading)', () => {
  const withoutFatf = (titles: string[]) => titles.filter((title) => !title.startsWith('FATF'));

  it('is CLEAR with the PEP and SIP headings only, as the real site shows without a country', () => {
    const c = clearIndividual();
    c.titles = withoutFatf(c.titles);
    expect(c.titles).toHaveLength(2);
    expect(parse(c)).toMatchObject({ status: 'CLEAR', matchCount: 0, categoryCounts: { FATF: 0, PEP: 0, SIP: 0 } });
  });

  it('is still CLEAR when a FATF heading with zero hits is shown', () => {
    expect(parse(clearIndividual()).status).toBe('CLEAR');
  });

  it('is ERROR when the PEP or the SIP heading is missing (only FATF may be absent)', () => {
    for (const missing of ['Politically Exposed Persons', 'Special Interest Persons']) {
      const c = clearIndividual();
      c.titles = withoutFatf(c.titles).filter((title) => !title.startsWith(missing));
      expect(parse(c).status).toBe('ERROR');
    }
  });

  it('is ERROR when the FATF array is missing from the JSON, even without a FATF heading', () => {
    const c = clearIndividual();
    c.titles = withoutFatf(c.titles);
    delete c.json[0].fatfCountries;
    expect(parse(c)).toMatchObject({ status: 'ERROR', errorCode: 'LAYOUT_CHANGED' });
  });

  it('is POSSIBLE_MATCH when the JSON FATF array has an entry, even without a FATF heading', () => {
    const c = clearIndividual();
    c.titles = withoutFatf(c.titles);
    c.json[0].fatfCountries = [{ name: 'Somewhere' }];
    expect(parse(c)).toMatchObject({ status: 'POSSIBLE_MATCH', matchCount: 1 });
  });

  it('is POSSIBLE_MATCH when a FATF heading shows a count and the JSON is empty', () => {
    const c = clearIndividual();
    c.titles = c.titles.map((title) => (title.startsWith('FATF') ? 'FATF Country/ Region [1 matches]' : title));
    expect(parse(c)).toMatchObject({ status: 'POSSIBLE_MATCH', matchCount: 1 });
  });

  it('an entity still needs its SIE heading', () => {
    const c = clearEntity();
    c.titles = [];
    expect(parse(c).status).toBe('ERROR');
  });
});

describe('parseSentrowebResult: the individual result recorded live for a name-only search', () => {
  // Recorded from the real site for the test name, searched without a country: the page shows only
  // the PEP and SIP headings, and the response still carries an empty fatfCountries array.
  const liveTitles = [
    'Politically Exposed Persons (PEP)/ Relative or Close Associate of PEP/SIP [0 matches]',
    'Special Interest Persons [0 matches]',
  ];
  const live = () => ({
    searchType: 'INDIVIDUAL' as const,
    name: 'Zzqx Testname Qwv',
    json: cloneFixtureJson<Array<Record<string, unknown>>>('search-individual-clear-name-only.json'),
    titles: [...liveTitles],
  });

  it('is CLEAR', () => {
    expect(parse(live())).toMatchObject({ status: 'CLEAR', matchCount: 0, categoryCounts: { FATF: 0, PEP: 0, SIP: 0 } });
  });

  it('a hit in the response is a possible match even though the headings show zero', () => {
    const c = live();
    c.json[0].pepPersons = [{ forename: 'X', surname: 'Y' }];
    expect(parse(c).status).toBe('POSSIBLE_MATCH');
  });

  it('a heading with a hit is a possible match even though the response is empty', () => {
    const c = live();
    c.titles[1] = 'Special Interest Persons [1 matches]';
    expect(parse(c)).toMatchObject({ status: 'POSSIBLE_MATCH', matchCount: 1 });
  });
});


describe('parseSentrowebResult: an individual searched with a country and a date of birth', () => {
  // Recorded live with the test name, country Singapore and 1980-01-01 (response trimmed to the
  // fields the parser reads); the headings are the recorded ones, FATF included.
  const sent = { expectedCountry: 'Singapore', expectedDateOfBirth: '1980-01-01' };
  const withDetails = () => {
    const c = clearIndividual();
    c.json = cloneFixtureJson<Payload>('search-individual-clear-with-country.json');
    return c;
  };
  const run = (c: ReturnType<typeof withDetails>, options: Record<string, string | null> = sent) =>
    parseSentrowebResult(c.searchType, c.json, c.titles, { expectedName: c.name, ...options });

  it('is CLEAR when the answer echoes what was sent and every heading, FATF included, shows zero', () => {
    const c = withDetails();
    expect(c.titles[0]).toMatch(/^FATF/);
    expect(run(c)).toMatchObject({ status: 'CLEAR', matchCount: 0, categoryCounts: { FATF: 0, PEP: 0, SIP: 0 } });
  });

  it.each([
    ['another country', { country: 'Malaysia' }],
    ['no country', { country: '' }],
    ['another birth date', { dateOfBirth: '1981-01-01' }],
    ['no birth date', { dateOfBirth: '' }],
    ['a country that is not text', { country: 5 }],
  ])('is ERROR RESULT_MISMATCH, never CLEAR, when the answer echoes %s', (_label, change) => {
    const c = withDetails();
    Object.assign(c.json[0], change);
    expect(run(c)).toMatchObject({ status: 'ERROR', errorCode: 'RESULT_MISMATCH' });
  });

  it('is ERROR when a country was sent but the FATF heading is missing', () => {
    const c = withDetails();
    c.titles = c.titles.filter((title) => !title.startsWith('FATF'));
    expect(run(c).status).toBe('ERROR');
    // The same page for a name-only search is fine.
    c.json[0].country = '';
    c.json[0].dateOfBirth = '';
    expect(run(c, { expectedCountry: null, expectedDateOfBirth: null }).status).toBe('CLEAR');
  });

  it('is POSSIBLE_MATCH for a FATF hit, whether it shows in the response or in the heading', () => {
    const inJson = withDetails();
    inJson.json[0].fatfCountries = [{ name: 'Somewhere' }];
    expect(run(inJson)).toMatchObject({ status: 'POSSIBLE_MATCH', categoryCounts: { FATF: 1 } });
    const inHeading = withDetails();
    inHeading.titles[0] = 'FATF Country/ Region [1 matches]';
    expect(run(inHeading)).toMatchObject({ status: 'POSSIBLE_MATCH', categoryCounts: { FATF: 1 } });
  });

  it('keeps a recorded match a possible match even when the echo does not fit', () => {
    const c = loadCase('individual-match');
    c.json[0].country = 'Malaysia';
    expect(
      parseSentrowebResult(c.searchType, c.json, c.titles, { expectedName: c.name, expectedCountry: 'Russia', expectedDateOfBirth: null }).status,
    ).toBe('POSSIBLE_MATCH');
  });

  it('treats a missing echo as blank: a name-only search needs no country in the answer', () => {
    const c = clearIndividual();
    delete c.json[0].country;
    expect(run(c, { expectedCountry: null, expectedDateOfBirth: null }).status).toBe('CLEAR');
    expect(run(c, sent).status).toBe('ERROR');
  });

  it('does not check the echo when the caller gave no expectation', () => {
    const c = withDetails();
    c.json[0].country = 'Anything';
    expect(parseSentrowebResult(c.searchType, c.json, c.titles, { expectedName: c.name }).status).toBe('CLEAR');
  });
});

describe('parseSentrowebResult: Fuzzy Search echo', () => {
  const run = (fuzzyValue: unknown, expectedFuzzy: boolean | undefined) => {
    const c = clearIndividual();
    c.json[0].fuzzyValue = fuzzyValue;
    return parseSentrowebResult(c.searchType, c.json, c.titles, { expectedName: c.name, expectedFuzzy });
  };

  it('is CLEAR when the answer says the same as what was asked', () => {
    expect(run(false, false).status).toBe('CLEAR');
    expect(run(true, true).status).toBe('CLEAR');
  });

  it.each([
    [true, false],
    [false, true],
    [undefined, true],
    [undefined, false],
    ['true', true],
    [null, false],
  ])('is ERROR RESULT_MISMATCH, never CLEAR, when the answer says %j and %j was asked', (answer, asked) => {
    expect(run(answer, asked)).toMatchObject({ status: 'ERROR', errorCode: 'RESULT_MISMATCH' });
  });

  it('does not check the echo when nothing is expected', () => {
    expect(run('anything', undefined).status).toBe('CLEAR');
  });

  it('a hit is still a possible match whatever the fuzzy echo says', () => {
    const c = loadCase('individual-match');
    c.json[0].fuzzyValue = true;
    expect(
      parseSentrowebResult(c.searchType, c.json, c.titles, { expectedName: c.name, expectedFuzzy: false }).status,
    ).toBe('POSSIBLE_MATCH');
  });
});

describe('parseSentrowebResult: searchEchoVerified', () => {
  const sent = { expectedCountry: 'Singapore', expectedDateOfBirth: '1980-01-01', expectedFuzzy: false };
  const echoing = (change: Record<string, unknown> = {}) => {
    const c = loadCase('individual-match');
    Object.assign(c.json[0], { country: 'Singapore', dateOfBirth: '1980-01-01', fuzzyValue: false }, change);
    return parseSentrowebResult(c.searchType, c.json, c.titles, { expectedName: c.name, ...sent });
  };

  it('is true for a possible match whose answer echoes the search', () => {
    expect(echoing()).toMatchObject({ status: 'POSSIBLE_MATCH', searchEchoVerified: true });
  });

  it.each([
    [{ country: 'Malaysia' }],
    [{ dateOfBirth: '1981-01-01' }],
    [{ fuzzyValue: true }],
    [{ name: 'Someone Else' }],
    [{ searchEntity: true, searchIndividual: false }],
  ])('keeps POSSIBLE_MATCH but is false when the answer differs (%j)', (change) => {
    expect(echoing(change)).toMatchObject({ status: 'POSSIBLE_MATCH', searchEchoVerified: false });
  });

  it('is true for CLEAR and false for every ERROR', () => {
    expect(parse(clearIndividual())).toMatchObject({ status: 'CLEAR', searchEchoVerified: true });
    const mismatch = clearIndividual();
    mismatch.json[0].name = 'Another Name';
    expect(parse(mismatch)).toMatchObject({ status: 'ERROR', searchEchoVerified: false });
    expect(parseSentrowebResult('INDIVIDUAL', null, [], {})).toMatchObject({ status: 'ERROR', searchEchoVerified: false });
  });

  it('is false for a possible match found only in the headings of an unreadable response', () => {
    const c = loadCase('individual-match');
    expect(parseSentrowebResult(c.searchType, 'not json', c.titles, { expectedName: c.name })).toMatchObject({
      status: 'POSSIBLE_MATCH',
      searchEchoVerified: false,
    });
  });
});
