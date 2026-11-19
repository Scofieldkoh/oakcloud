// @vitest-environment node
import { readdirSync } from 'node:fs';
import os from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SentrowebConfig } from '@/lib/sentroweb/config';
import { sentrowebClient, type SentrowebSession } from '@/services/sentroweb/client';
import { SentrowebError } from '@/services/sentroweb/errors';
import { parseSentrowebResult } from '@/services/sentroweb/result-parser';
import {
  FAKE_ACCOUNT_ID,
  FAKE_PASSWORD,
  FAKE_USERNAME,
  startFakeSentroweb,
  type FakeOptions,
  type FakeSentroweb,
} from '../helpers/fake-sentroweb';

/**
 * The browser client against a local fake Sentroweb built from the recorded fixtures. Needs a
 * real Chrome (`npm run test:chromium:sentroweb`). No request leaves this machine.
 */

const CLEAR_ENTITY = 'Zzqx Testname Qwv Pte Ltd';
const CLEAR_INDIVIDUAL = 'Zzqx Testname Qwv';

let fake: FakeSentroweb | null = null;
const pids: Array<number | undefined> = [];
const sessions: SentrowebSession[] = [];

function configFor(server: FakeSentroweb, overrides: Partial<SentrowebConfig> = {}, timeouts: Partial<SentrowebConfig['timeouts']> = {}): SentrowebConfig {
  return {
    baseUrl: server.baseUrl,
    accountId: FAKE_ACCOUNT_ID,
    username: FAKE_USERNAME,
    password: FAKE_PASSWORD,
    ...overrides,
    timeouts: { stepMs: 4_000, resultMs: 4_000, runMs: 60_000, searchDelayMs: 0, ...timeouts },
  };
}

async function start(options: Partial<FakeOptions> = {}): Promise<FakeSentroweb> {
  fake = await startFakeSentroweb(options);
  return fake;
}

async function open(
  server: FakeSentroweb,
  extra: { config?: Partial<SentrowebConfig>; timeouts?: Partial<SentrowebConfig['timeouts']>; requiredCredits?: number } = {},
): Promise<SentrowebSession> {
  const session = await sentrowebClient.openSession(configFor(server, extra.config, extra.timeouts), {
    requiredCredits: extra.requiredCredits,
    onBrowserLaunched: (pid) => pids.push(pid),
  });
  sessions.push(session);
  return session;
}

async function expectProcessGone(pid: number | undefined): Promise<void> {
  expect(pid).toBeTypeOf('number');
  const deadline = Date.now() + 5_000;
  for (;;) {
    try {
      process.kill(pid as number, 0);
    } catch {
      return; // ESRCH: the browser process no longer exists
    }
    if (Date.now() > deadline) throw new Error('browser process is still running');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

async function failureOf(promise: Promise<unknown>): Promise<SentrowebError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(SentrowebError);
    return error as SentrowebError;
  }
  throw new Error('expected a SentrowebError but the call succeeded');
}

const tempDirsNow = () => readdirSync(os.tmpdir()).filter((name) => name.startsWith('oakcloud-sentroweb-'));

beforeEach(() => {
  pids.length = 0;
  sessions.length = 0;
});

afterEach(async () => {
  for (const session of sessions) await session.close();
  if (fake) await fake.close();
  fake = null;
  // Every browser launched by a test must be gone, whatever the test did.
  for (const pid of pids) await expectProcessGone(pid);
  expect(tempDirsNow()).toEqual([]);
});

describe('Sentroweb client against a fake Sentroweb', () => {
  it('logs in, reads the balance and searches a clear entity (JSON, titles, PDF, PNG)', async () => {
    const server = await start();
    const session = await open(server, { requiredCredits: 1 });
    expect(session.balance).toBe(372);

    const outcome = await session.search({ name: CLEAR_ENTITY, searchType: 'ENTITY' });
    expect(outcome.domTitles).toEqual(['Special Interest Entities [0 matches]']);
    expect(outcome.pdf?.subarray(0, 4).toString('latin1')).toBe('%PDF');
    expect(outcome.png?.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(parseSentrowebResult('ENTITY', outcome.json, outcome.domTitles, { expectedName: CLEAR_ENTITY }).status).toBe('CLEAR');

    // An entity is searched by name and type only: fuzzy off, no country, birth date or gender.
    expect(server.searches).toEqual([
      { name: CLEAR_ENTITY, searchEntity: true, searchIndividual: false, fuzzy: false, country: '', dateOfBirth: '', gender: null },
    ]);
    expect(server.count('authenticate')).toBe(1);
    expect(server.count('checkquota')).toBe(1);
    expect(server.count('search')).toBe(1);
    expect(server.count('download')).toBe(1);

    await session.close();
    expect(server.count('logout')).toBe(1);
  });

  it('searches an individual and reads a possible match (PEP 2, SIP 1)', async () => {
    const server = await start();
    const session = await open(server);
    const outcome = await session.search({ name: 'Vladimir Putin', searchType: 'INDIVIDUAL' });

    expect(outcome.domTitles).toHaveLength(2); // no country sent: no FATF heading
    const parsed = parseSentrowebResult('INDIVIDUAL', outcome.json, outcome.domTitles, { expectedName: 'Vladimir Putin' });
    expect(parsed).toMatchObject({ status: 'POSSIBLE_MATCH', categoryCounts: { FATF: 0, PEP: 2, SIP: 1 } });
    expect(outcome.pdf?.subarray(0, 4).toString('latin1')).toBe('%PDF');
    expect(server.searches[0]).toMatchObject({ searchIndividual: true, searchEntity: false, fuzzy: false });
  });

  describe('an individual searched with country and date of birth', () => {
    const DETAILS = { country: 'Singapore', dateOfBirth: '1980-01-01' };

    it('sends exactly the chosen country and typed birth date, no gender, and reads a clear result', async () => {
      const server = await start();
      const session = await open(server);
      const outcome = await session.search({ name: CLEAR_INDIVIDUAL, searchType: 'INDIVIDUAL', ...DETAILS });

      expect(server.searches).toHaveLength(1);
      expect(server.searches[0]).toMatchObject({ country: 'Singapore', dateOfBirth: '1980-01-01', gender: null, fuzzy: false });
      // With a country the FATF heading is drawn as well.
      expect(outcome.domTitles).toHaveLength(3);
      expect(outcome.domTitles[0]).toMatch(/^FATF/);
      const parsed = parseSentrowebResult('INDIVIDUAL', outcome.json, outcome.domTitles, {
        expectedName: CLEAR_INDIVIDUAL,
        expectedCountry: 'Singapore',
        expectedDateOfBirth: '1980-01-01',
      });
      expect(parsed).toMatchObject({ status: 'CLEAR', categoryCounts: { FATF: 0, PEP: 0, SIP: 0 } });
    });

    it('picks the exact option when several options contain the typed text (Guinea)', async () => {
      const server = await start();
      const session = await open(server);
      await session.search({ name: CLEAR_INDIVIDUAL, searchType: 'INDIVIDUAL', country: 'Guinea' });
      expect(server.searches[0].country).toBe('Guinea');
    });

    it('sends the country alone, or the birth date alone, when only one is held', async () => {
      const server = await start();
      const session = await open(server);
      await session.search({ name: 'Zzqx Alpha Qwv', searchType: 'INDIVIDUAL', country: 'Malaysia' });
      await session.search({ name: 'Zzqx Beta Qwv', searchType: 'INDIVIDUAL', dateOfBirth: '1975-12-31' });
      expect(server.searches[0]).toMatchObject({ country: 'Malaysia', dateOfBirth: '' });
      expect(server.searches[1]).toMatchObject({ country: '', dateOfBirth: '1975-12-31' });
    });

    it('a possible match with a country is still a possible match', async () => {
      const server = await start();
      const session = await open(server);
      const outcome = await session.search({ name: 'Vladimir Putin', searchType: 'INDIVIDUAL', country: 'Russia' });
      const parsed = parseSentrowebResult('INDIVIDUAL', outcome.json, outcome.domTitles, {
        expectedName: 'Vladimir Putin',
        expectedCountry: 'Russia',
        expectedDateOfBirth: null,
      });
      expect(parsed.status).toBe('POSSIBLE_MATCH');
    });

    it('never sends details for an entity, even if some are passed', async () => {
      const server = await start();
      const session = await open(server);
      await session.search({ name: CLEAR_ENTITY, searchType: 'ENTITY', ...DETAILS });
      expect(server.searches[0]).toMatchObject({ country: '', dateOfBirth: '', searchEntity: true });
    });

    it('ignores values that are not exactly an option or YYYY-MM-DD (blank rather than a guess)', async () => {
      const server = await start();
      const session = await open(server);
      await session.search({ name: CLEAR_INDIVIDUAL, searchType: 'INDIVIDUAL', country: 'Singaporean', dateOfBirth: '01/01/1980' });
      expect(server.searches[0]).toMatchObject({ country: '', dateOfBirth: '' });
    });

    it('a country option that cannot be set fails before SEARCH: not submitted, nothing sent', async () => {
      const server = await start({ countrySelection: 'ignored' });
      const session = await open(server);
      const error = await failureOf(session.search({ name: CLEAR_INDIVIDUAL, searchType: 'INDIVIDUAL', ...DETAILS }));
      expect(error.code).toBe('LAYOUT_CHANGED');
      expect(error.searchSubmitted).toBeFalsy();
      expect(server.count('checkquota')).toBe(0);
      expect(server.count('search')).toBe(0);
    });

    // The real form draws Male, Female and the date of birth only after Individual is ticked (the
    // recorded empty form has three checkboxes). Staging failed with UNEXPECTED_ERROR in the first
    // step because the client typed the date before ticking Individual, and an entity search failed
    // because it looked for gender boxes that an entity form does not have.
    describe('the form draws the individual-only fields after Individual is ticked', () => {
      async function logsOf(run: () => Promise<unknown>): Promise<unknown[][]> {
        const calls: unknown[][] = [];
        const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
          vi.spyOn(console, method).mockImplementation((...args: unknown[]) => void calls.push(args)),
        );
        try {
          await run();
        } finally {
          spies.forEach((spy) => spy.mockRestore());
        }
        return calls;
      }
      const stepFailures = (calls: unknown[][]) =>
        calls.filter((args) => String(args[0]).includes('a step failed before CONFIRM')).map((args) => args[1] as Record<string, unknown>);

      it('searches an individual with country, date of birth and gender with no step failing', async () => {
        const server = await start();
        const session = await open(server);
        const calls = await logsOf(() =>
          session.search({ name: CLEAR_INDIVIDUAL, searchType: 'INDIVIDUAL', ...DETAILS, gender: 'MALE' }),
        );
        expect(stepFailures(calls)).toEqual([]);
        expect(server.searches[0]).toMatchObject({ country: 'Singapore', dateOfBirth: '1980-01-01', gender: 'MALE', searchIndividual: true });
      });

      it('searches an entity on a form that has no gender boxes and no date field', async () => {
        const server = await start();
        const session = await open(server);
        const calls = await logsOf(() => session.search({ name: CLEAR_ENTITY, searchType: 'ENTITY' }));
        expect(stepFailures(calls)).toEqual([]);
        expect(server.searches[0]).toMatchObject({ searchEntity: true, searchIndividual: false, dateOfBirth: '', gender: null });
      });

      it('a form that never draws the date field fails before SEARCH, named in the log, not UNEXPECTED_ERROR', async () => {
        const server = await start({ omitIndividualFields: 'date' });
        const session = await open(server, { timeouts: { stepMs: 2_500 } });
        let error: SentrowebError | undefined;
        const calls = await logsOf(async () => {
          error = await failureOf(session.search({ name: CLEAR_INDIVIDUAL, searchType: 'INDIVIDUAL', ...DETAILS }));
        });
        expect(error?.code).toBe('LAYOUT_CHANGED');
        expect(error?.searchSubmitted).toBeFalsy();
        expect(server.count('checkquota')).toBe(0);
        expect(server.count('search')).toBe(0);
        expect(stepFailures(calls)).toMatchObject([{ phase: 'set-birth-date', code: 'LAYOUT_CHANGED', form: { hasDateOfBirthField: false, hasCountryDropdown: true } }]);
      });

      it('a filter the page changes while SEARCH is still disabled is caught after it enables: nothing is sent', async () => {
        for (const [label, options, search] of [
          ['an Entity search that gets a ticked Male box', { lateFilterChange: 'gender' as const }, { name: CLEAR_ENTITY, searchType: 'ENTITY' as const }],
          ['an individual search whose country changes', { lateFilterChange: 'country' as const }, { name: CLEAR_INDIVIDUAL, searchType: 'INDIVIDUAL' as const, ...DETAILS }],
        ] as const) {
          const server = await start({ enableDelayMs: 700, ...options });
          const session = await open(server, { timeouts: { stepMs: 4_000 } });
          const error = await failureOf(session.search(search));
          expect(error.code, label).toBe('LAYOUT_CHANGED');
          expect(error.searchSubmitted, label).toBeFalsy();
          expect(server.count('checkquota'), label).toBe(0);
          expect(server.count('search'), label).toBe(0);
        }
      });

      it('a slow SEARCH enable with no change still searches exactly what was asked', async () => {
        const server = await start({ enableDelayMs: 700 });
        const session = await open(server, { timeouts: { stepMs: 4_000 } });
        await session.search({ name: CLEAR_INDIVIDUAL, searchType: 'INDIVIDUAL', ...DETAILS, gender: 'MALE' });
        expect(server.searches[0]).toMatchObject({ country: 'Singapore', dateOfBirth: '1980-01-01', gender: 'MALE' });
      });

      it('an Entity search clears a gender box the form left ticked, and sends no gender filter', async () => {
        const server = await start({ staleGender: 'ticked' });
        const session = await open(server);
        await session.search({ name: CLEAR_ENTITY, searchType: 'ENTITY', gender: 'MALE' });
        expect(server.searches[0]).toMatchObject({ searchEntity: true, searchIndividual: false, gender: null });
      });

      it('an Entity search stops before any quota request when a ticked gender box cannot be cleared', async () => {
        const server = await start({ staleGender: 'stuck' });
        const session = await open(server, { timeouts: { stepMs: 2_500 } });
        const error = await failureOf(session.search({ name: CLEAR_ENTITY, searchType: 'ENTITY' }));
        expect(error.code).toBe('LAYOUT_CHANGED');
        expect(error.searchSubmitted).toBeFalsy();
        expect(server.count('checkquota')).toBe(0);
        expect(server.count('search')).toBe(0);
      });

      it('an individual search without a gender clears a stale ticked gender box too', async () => {
        const server = await start({ staleGender: 'ticked' });
        const session = await open(server);
        await session.search({ name: CLEAR_INDIVIDUAL, searchType: 'INDIVIDUAL', ...DETAILS });
        expect(server.searches[0]).toMatchObject({ searchIndividual: true, gender: null, dateOfBirth: '1980-01-01' });
      });

      it('a wanted gender whose boxes are never drawn fails before SEARCH; an unwanted one does not matter', async () => {
        const server = await start({ omitIndividualFields: 'gender' });
        const session = await open(server, { timeouts: { stepMs: 2_500 } });
        const error = await failureOf(session.search({ name: CLEAR_INDIVIDUAL, searchType: 'INDIVIDUAL', ...DETAILS, gender: 'FEMALE' }));
        expect(error.code).toBe('LAYOUT_CHANGED');
        expect(error.searchSubmitted).toBeFalsy();
        expect(server.count('checkquota')).toBe(0);
        const outcome = await session.search({ name: 'Zzqx Gamma Qwv', searchType: 'INDIVIDUAL', ...DETAILS });
        expect(outcome).toBeDefined();
        expect(server.searches.at(-1)).toMatchObject({ country: 'Singapore', dateOfBirth: '1980-01-01', gender: null });
      });
    });

    it('a page that shows another country than the one chosen fails before SEARCH', async () => {
      const server = await start({ countrySelection: 'wrong-option' });
      const session = await open(server);
      const error = await failureOf(session.search({ name: CLEAR_INDIVIDUAL, searchType: 'INDIVIDUAL', ...DETAILS }));
      expect(error.code).toBe('LAYOUT_CHANGED');
      expect(error.searchSubmitted).toBeFalsy();
      expect(server.count('checkquota')).toBe(0);
    });

    it('a birth date the page rewrites fails before SEARCH', async () => {
      const server = await start({ rewriteDateOfBirth: true });
      const session = await open(server);
      const error = await failureOf(session.search({ name: CLEAR_INDIVIDUAL, searchType: 'INDIVIDUAL', ...DETAILS }));
      expect(error.code).toBe('LAYOUT_CHANGED');
      expect(error.searchSubmitted).toBeFalsy();
      expect(server.count('checkquota')).toBe(0);
    });

    it('an answer that echoes another country or birth date is never CLEAR', async () => {
      for (const echo of [{ echoCountry: 'Malaysia' }, { echoCountry: null }, { echoDateOfBirth: '1981-01-01' }, { echoDateOfBirth: null }]) {
        const server = await start(echo);
        const session = await open(server);
        const outcome = await session.search({ name: CLEAR_INDIVIDUAL, searchType: 'INDIVIDUAL', ...DETAILS });
        const parsed = parseSentrowebResult('INDIVIDUAL', outcome.json, outcome.domTitles, {
          expectedName: CLEAR_INDIVIDUAL,
          expectedCountry: 'Singapore',
          expectedDateOfBirth: '1980-01-01',
        });
        expect(parsed.status, JSON.stringify(echo)).toBe('ERROR');
        expect(parsed.errorCode).toBe('RESULT_MISMATCH');
        await session.close();
        await server.close();
        fake = null;
      }
    });

    it('Enter in the country box cannot submit the form: nothing reaches Sentroweb before the click', async () => {
      // No Enter handler on the dropdown: Enter then does only what the browser does in a form, and
      // would click an enabled SEARCH. The name is already known to the fake, so a stray submit would
      // be a free repeat that searches at once, with a blank country.
      const server = await start({ dropdownEnterHandler: false, freeRepeats: true });
      const first = await open(server);
      await first.search({ name: CLEAR_INDIVIDUAL, searchType: 'INDIVIDUAL' });
      await first.close();
      const before = { quotas: server.count('checkquota'), searches: server.searches.length };

      const session = await open(server);
      // With no Enter handler the option is not chosen, so the attempt fails before SEARCH. What
      // matters is that Enter itself sent nothing: not a quota check, not a search.
      const error = await failureOf(session.search({ name: CLEAR_INDIVIDUAL, searchType: 'INDIVIDUAL', country: 'Singapore' }));
      expect(error.code).toBe('LAYOUT_CHANGED');
      expect(error.searchSubmitted).toBeFalsy();
      expect(server.count('checkquota') - before.quotas).toBe(0);
      expect(server.searches.length - before.searches).toBe(0);
    });

    it('a page that submits itself while a country is chosen is submitted, never retried, nothing confirmed', async () => {
      const server = await start({ submitsWhenCountryChosen: true });
      const session = await open(server);
      const error = await failureOf(session.search({ name: CLEAR_INDIVIDUAL, searchType: 'INDIVIDUAL', ...DETAILS }));
      expect(error.searchSubmitted).toBe(true);
      expect(server.count('checkquota')).toBeGreaterThanOrEqual(1);
      expect(server.count('search')).toBe(0); // its dialog was never confirmed
    });

    it('sends the gender as the ticked Male or Female box, for an individual only', async () => {
      const server = await start();
      const session = await open(server);
      await session.search({ name: 'Zzqx Male Qwv', searchType: 'INDIVIDUAL', gender: 'MALE' });
      await session.search({ name: 'Zzqx Female Qwv', searchType: 'INDIVIDUAL', gender: 'FEMALE' });
      await session.search({ name: 'Zzqx None Qwv', searchType: 'INDIVIDUAL' });
      await session.search({ name: 'Zzqx Entity Qwv Pte Ltd', searchType: 'ENTITY', gender: 'MALE' });
      expect(server.searches.map((search) => search.gender)).toEqual(['MALE', 'FEMALE', null, null]);
    });

    it('ticks Fuzzy Search only when asked, and the answer must say the same', async () => {
      const server = await start();
      const session = await open(server);
      const plain = await session.search({ name: 'Zzqx Plain Qwv', searchType: 'INDIVIDUAL' });
      const fuzzy = await session.search({ name: 'Zzqx Fuzzy Qwv', searchType: 'INDIVIDUAL', fuzzy: true });
      expect(server.searches.map((search) => search.fuzzy)).toEqual([false, true]);
      const parse = (name: string, outcome: typeof plain, expectedFuzzy: boolean) =>
        parseSentrowebResult('INDIVIDUAL', outcome.json, outcome.domTitles, { expectedName: name, expectedFuzzy });
      expect(parse('Zzqx Plain Qwv', plain, false).status).toBe('CLEAR');
      expect(parse('Zzqx Fuzzy Qwv', fuzzy, true).status).toBe('CLEAR');
      // An answer for the other kind of search is never clear.
      expect(parse('Zzqx Plain Qwv', plain, true)).toMatchObject({ status: 'ERROR', errorCode: 'RESULT_MISMATCH' });
      expect(parse('Zzqx Fuzzy Qwv', fuzzy, false)).toMatchObject({ status: 'ERROR', errorCode: 'RESULT_MISMATCH' });
    });

    it('fuzzy applies to an entity search too', async () => {
      const server = await start();
      const session = await open(server);
      await session.search({ name: CLEAR_ENTITY, searchType: 'ENTITY', fuzzy: true });
      expect(server.searches[0]).toMatchObject({ fuzzy: true, searchEntity: true });
    });

    it('a name-only individual search leaves the details blank and still reads CLEAR without a FATF heading', async () => {
      const server = await start();
      const session = await open(server);
      const outcome = await session.search({ name: CLEAR_INDIVIDUAL, searchType: 'INDIVIDUAL' });
      expect(server.searches[0]).toMatchObject({ country: '', dateOfBirth: '' });
      expect(outcome.domTitles.some((title) => title.startsWith('FATF'))).toBe(false);
      const parsed = parseSentrowebResult('INDIVIDUAL', outcome.json, outcome.domTitles, {
        expectedName: CLEAR_INDIVIDUAL,
        expectedCountry: null,
        expectedDateOfBirth: null,
      });
      expect(parsed.status).toBe('CLEAR');
    });
  });

  it('runs two searches in one session, each a fresh form, one login', async () => {
    const server = await start();
    const session = await open(server);
    await session.search({ name: CLEAR_ENTITY, searchType: 'ENTITY' });
    const second = await session.search({ name: CLEAR_INDIVIDUAL, searchType: 'INDIVIDUAL' });

    expect(second.domTitles).toHaveLength(2); // a name-only individual: PEP and SIP headings
    expect(server.searches.map((s) => s.name)).toEqual([CLEAR_ENTITY, CLEAR_INDIVIDUAL]);
    expect(server.searches[1]).toMatchObject({ searchIndividual: true, searchEntity: false });
    expect(server.count('authenticate')).toBe(1);
  });

  it('never touches monitoring, false-match, Save or result Cancel controls', async () => {
    const server = await start();
    const session = await open(server);
    await session.search({ name: 'Vladimir Putin', searchType: 'INDIVIDUAL' });
    await session.close();
    expect(server.count('forbidden-click')).toBe(0);
    expect(server.count('cancel-clicked')).toBe(0);
  });

  it('LOGIN_FAILED after exactly one attempt, with no search and the browser closed', async () => {
    const server = await start();
    const error = await failureOf(open(server, { config: { password: 'definitely-wrong' } }));
    expect(error.code).toBe('LOGIN_FAILED');
    expect(error.searchSubmitted).toBe(false);
    expect(server.count('authenticate')).toBe(1);
    expect(server.count('search')).toBe(0);
    expect(server.count('checkquota')).toBe(0);
  });

  it('MFA_OR_CAPTCHA_REQUIRED when Sentroweb asks for a code after login', async () => {
    const server = await start({ requireOtp: true });
    const error = await failureOf(open(server));
    expect(error.code).toBe('MFA_OR_CAPTCHA_REQUIRED');
    expect(server.count('authenticate')).toBe(1);
  });

  it('LAYOUT_CHANGED when the page after login is not the search page', async () => {
    const server = await start({ unexpectedLanding: true });
    const error = await failureOf(open(server, { timeouts: { stepMs: 1_500 } }));
    expect(error.code).toBe('LAYOUT_CHANGED');
    expect(server.count('search')).toBe(0);
  });

  it('INSUFFICIENT_CREDITS before any search when the balance is below the count', async () => {
    const server = await start({ balance: 3 });
    const error = await failureOf(open(server, { requiredCredits: 4 }));
    expect(error.code).toBe('INSUFFICIENT_CREDITS');
    expect(error.searchSubmitted).toBe(false);
    expect(server.count('checkquota')).toBe(0);
    expect(server.count('search')).toBe(0);
  });

  it('a name searched before is free: no confirm dialog, nothing cancelled, zero credits reported', async () => {
    const server = await start({ freeRepeats: true });
    const session = await open(server, { requiredCredits: 1 });
    const first = await session.search({ name: CLEAR_ENTITY, searchType: 'ENTITY' });
    expect(first.creditsCharged).toBe(1);
    expect(server.count('cancel-clicked')).toBe(0);

    const second = await session.search({ name: CLEAR_ENTITY, searchType: 'ENTITY' });
    expect(second.creditsCharged).toBe(0);
    expect(second.pdf?.subarray(0, 4).toString('latin1')).toBe('%PDF');
    expect(second.domTitles.length).toBeGreaterThan(0);
    expect(second.json).toBeTruthy();
    expect(server.count('checkquota')).toBe(2);
    expect(server.count('search')).toBe(2);
    expect(server.count('cancel-clicked')).toBe(0);
  });

  it('maxCredits 0 cancels the confirm box of a paid search and never confirms', async () => {
    const server = await start({ freeRepeats: true });
    const session = await open(server, { requiredCredits: 1 });
    const error = await failureOf(session.search({ name: CLEAR_ENTITY, searchType: 'ENTITY', maxCredits: 0 }));
    expect(error.code).toBe('UNEXPECTED_CREDIT_COST');
    expect(error.searchSubmitted).toBe(false);
    expect(server.count('cancel-clicked')).toBe(1);
    expect(server.count('search')).toBe(0);
  });

  it('maxCredits 0 still lets a free repeat through', async () => {
    const server = await start({ freeRepeats: true });
    const session = await open(server, { requiredCredits: 1 });
    await session.search({ name: CLEAR_ENTITY, searchType: 'ENTITY' });
    const again = await session.search({ name: CLEAR_ENTITY, searchType: 'ENTITY', maxCredits: 0 });
    expect(again.creditsCharged).toBe(0);
    expect(server.count('search')).toBe(2);
  });

  it('a repeat whose quota answer is not the exact free shape is still SUBMITTED when the page searched on its own', async () => {
    const server = await start({ freeRepeats: true, repeatQuotaUniqueNames: ['unexpected-name'] });
    const session = await open(server, { requiredCredits: 1, timeouts: { stepMs: 2_500 } });
    await session.search({ name: CLEAR_ENTITY, searchType: 'ENTITY' }); // seeds the name (paid, confirmed)
    const error = await failureOf(session.search({ name: CLEAR_ENTITY, searchType: 'ENTITY' }));
    expect(error.code).toBe('LAYOUT_CHANGED');
    expect(error.searchSubmitted).toBe(true); // the page's search request went out
    expect(error.creditsCharged).toBeUndefined(); // the charge is unknown: counted conservatively
    expect(server.count('search')).toBe(2);
  });

  it('a quota answer that arrives after the gate gave up cannot start a search either', async () => {
    const server = await start({ freeRepeats: true, repeatQuotaDelayMs: 4_000 });
    const session = await open(server, { requiredCredits: 1, timeouts: { stepMs: 2_000 } });
    await session.search({ name: CLEAR_ENTITY, searchType: 'ENTITY' });
    const error = await failureOf(session.search({ name: CLEAR_ENTITY, searchType: 'ENTITY' }));
    expect(error.code).toBe('LAYOUT_CHANGED');
    expect(error.searchSubmitted).toBe(true); // quota asked, no answer: uncertain, so submitted
    await new Promise((resolve) => setTimeout(resolve, 4_500));
    expect(server.count('search')).toBe(1); // and the late answer started nothing
  });

  it('an abort while waiting for the dialog, after the page searched on its own, is submitted too', async () => {
    const server = await start({ freeRepeats: true, repeatQuotaUniqueNames: ['unexpected-name'] });
    const session = await open(server, { requiredCredits: 1, timeouts: { stepMs: 30_000 } });
    await session.search({ name: CLEAR_ENTITY, searchType: 'ENTITY' });
    const controller = new AbortController();
    const watcher = setInterval(() => {
      if (server.count('search') >= 2) controller.abort();
    }, 50);
    try {
      const error = await failureOf(
        session.search({ name: CLEAR_ENTITY, searchType: 'ENTITY' }, { signal: controller.signal }),
      );
      expect(error.code).toBe('TIMEOUT');
      expect(error.searchSubmitted).toBe(true);
    } finally {
      clearInterval(watcher);
    }
  });

  describe('the SEARCH click call itself fails', () => {
    const SUBMIT = 'form button.search-button';
    let restore: (() => void) | null = null;
    afterEach(() => restore?.());

    /** Makes `page.click(SUBMIT)` reject: after really clicking (a lost answer), or without clicking. */
    async function failSubmitClick(clickFirst: boolean, afterClickMs = 0) {
      const puppeteer = await import('puppeteer-core');
      const proto = puppeteer.Page.prototype as unknown as { click: (selector: string, ...rest: unknown[]) => Promise<void> };
      const original = proto.click;
      proto.click = async function (this: unknown, selector: string, ...rest: unknown[]) {
        if (selector !== SUBMIT) return original.call(this, selector, ...rest);
        if (clickFirst) await original.call(this, selector, ...rest);
        if (afterClickMs > 0) await new Promise((resolve) => setTimeout(resolve, afterClickMs));
        throw new Error('injected transport fault');
      };
      restore = () => {
        proto.click = original;
      };
    }

    it('after the click reached the page, what is reported always matches what reached Sentroweb', async () => {
      const server = await start({ freeRepeats: true });
      const session = await open(server, { requiredCredits: 1 });
      await session.search({ name: CLEAR_ENTITY, searchType: 'ENTITY' }); // seeds the name, so the repeat is automatic
      await failSubmitClick(true);
      const error = await failureOf(session.search({ name: CLEAR_ENTITY, searchType: 'ENTITY' }));
      await new Promise((resolve) => setTimeout(resolve, 1_500)); // let anything still in flight land
      // The page had seen the click and its quota was a free repeat (or unanswered): that is never
      // reported as "not submitted", whether or not its search reached the fake before the reload.
      expect(error.searchSubmitted).toBe(true);
      expect(error.creditsCharged).toBeUndefined();
      expect(server.count('search')).toBeGreaterThanOrEqual(1);
    });

    it('a slow quota answer neither starts a late search nor lets the attempt be called not submitted', async () => {
      const server = await start({ freeRepeats: true, repeatQuotaDelayMs: 3_000 });
      const session = await open(server, { requiredCredits: 1 });
      await session.search({ name: CLEAR_ENTITY, searchType: 'ENTITY' });
      await failSubmitClick(true);
      const error = await failureOf(session.search({ name: CLEAR_ENTITY, searchType: 'ENTITY' }));
      // The page had asked for a quota and had no answer yet: whether it would have searched is
      // unknown, so the attempt stays submitted (cooldown, no retry) ...
      expect(error.searchSubmitted).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 4_500)); // longer than the quota delay
      // ... and the reload meant the late answer started nothing.
      expect(server.count('search')).toBe(1);
    });

    it('a lost browser connection keeps the attempt submitted: absent events are no proof of non-submission', async () => {
      const server = await start({ freeRepeats: true });
      const session = await open(server, { requiredCredits: 1 });
      await session.search({ name: CLEAR_ENTITY, searchType: 'ENTITY' });
      const puppeteer = await import('puppeteer-core');
      const proto = puppeteer.Page.prototype as unknown as { click: (selector: string, ...rest: unknown[]) => Promise<void> };
      const original = proto.click;
      proto.click = async function (this: unknown, selector: string, ...rest: unknown[]) {
        if (selector !== SUBMIT) return original.call(this, selector, ...rest);
        // The click is sent, then the browser dies before any event can be observed.
        const pending = original.call(this, selector, ...rest).catch(() => undefined);
        process.kill(pids[0] as number, 'SIGKILL');
        await pending;
        throw new Error('connection lost');
      };
      restore = () => {
        proto.click = original;
      };
      const error = await failureOf(session.search({ name: CLEAR_ENTITY, searchType: 'ENTITY' }));
      expect(error.searchSubmitted).toBe(true);
      expect(error.creditsCharged).toBeUndefined();
    });

    it('when the click never reached the page, nothing was submitted', async () => {
      const server = await start();
      const session = await open(server);
      await failSubmitClick(false);
      const error = await failureOf(session.search({ name: CLEAR_ENTITY, searchType: 'ENTITY' }));
      expect(error.searchSubmitted).toBe(false);
      expect(server.count('search')).toBe(0);
      expect(server.count('checkquota')).toBe(0);
    });

    it('a paid search whose click reached the page only opens the dialog: not submitted, never confirmed', async () => {
      const server = await start();
      const session = await open(server);
      // The fault comes after the quota answer (asking for credits) has been seen.
      await failSubmitClick(true, 1_000);
      const error = await failureOf(session.search({ name: CLEAR_ENTITY, searchType: 'ENTITY' }));
      expect(error.searchSubmitted).toBe(false);
      expect(server.count('search')).toBe(0);
    });

  });

  it('a verified free repeat whose search call fails reports zero credits and stays submitted', async () => {
    const server = await start({ freeRepeats: true, failRepeatSearches: true });
    const session = await open(server, { requiredCredits: 1 });
    await session.search({ name: CLEAR_ENTITY, searchType: 'ENTITY' });
    const error = await failureOf(session.search({ name: CLEAR_ENTITY, searchType: 'ENTITY' }));
    expect(error.code).toBe('RESULT_MISMATCH');
    expect(error.searchSubmitted).toBe(true);
    expect(error.creditsCharged).toBe(0);
    expect(server.count('search')).toBe(2);
  });

  it('a paid search whose call fails after CONFIRM is submitted with an unknown (not zero) charge', async () => {
    const server = await start({ searchStatus: 500 });
    const session = await open(server);
    const error = await failureOf(session.search({ name: CLEAR_ENTITY, searchType: 'ENTITY' }));
    expect(error.searchSubmitted).toBe(true);
    expect(error.creditsCharged).toBeUndefined();
  });

  it('the pre-confirm failure log carries no account id, name or path text (structured arguments checked)', async () => {
    const calls: unknown[][] = [];
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => void calls.push(args)),
    );
    try {
      const server = await start({ suppressModal: true, diagnosticFetchPath: `/diagnostics/${FAKE_ACCOUNT_ID}/${FAKE_USERNAME}` });
      const session = await open(server, { timeouts: { stepMs: 2_500 } });
      await failureOf(session.search({ name: CLEAR_ENTITY, searchType: 'ENTITY' }));
    } finally {
      spies.forEach((spy) => spy.mockRestore());
    }
    const failure = calls.find((args) => String(args[0]).includes('a step failed before CONFIRM'));
    expect(failure).toBeDefined();
    const all = JSON.stringify(calls);
    for (const secret of [FAKE_ACCOUNT_ID, FAKE_USERNAME, FAKE_PASSWORD, CLEAR_ENTITY, 'diagnostics', 'ACCT', 'sentroweb-service']) {
      expect(all.includes(secret), secret).toBe(false);
    }
    // What is logged is structure: a phase, a code, allow-listed call labels and class names.
    const payload = failure![1] as { phase: string; recentCalls: string[]; form: { page: string } };
    expect(payload.phase).toBe('confirm-modal');
    expect(payload.form.page).toBe('main');
    expect(payload.recentCalls.some((call) => call.includes('other'))).toBe(true);
    for (const call of payload.recentCalls) expect(call).toMatch(/^(GET|POST) (authenticate|initializeApp|checkQuota|search|other) \d{3}$/);
  });

  it('fails closed (LAYOUT_CHANGED, not submitted) when credits are due but no dialog appears', async () => {
    const server = await start({ suppressModal: true });
    const session = await open(server, { timeouts: { stepMs: 2_500 } });
    const error = await failureOf(session.search({ name: CLEAR_ENTITY, searchType: 'ENTITY' }));
    expect(error.code).toBe('LAYOUT_CHANGED');
    expect(error.searchSubmitted).toBe(false);
    expect(server.count('search')).toBe(0);
  });

  it('does not read the placeholder "Balance: 0" the page shows until initializeApp answers', async () => {
    const server = await start({ balance: 372, initDelayMs: 2_000 });
    const session = await open(server, { requiredCredits: 2 });
    expect(session.balance).toBe(372);
    expect(server.count('search')).toBe(0);
  });

  it('a genuine zero balance is still INSUFFICIENT_CREDITS (after initializeApp), with no search', async () => {
    const server = await start({ balance: 0, initDelayMs: 600 });
    const error = await failureOf(open(server, { requiredCredits: 2 }));
    expect(error.code).toBe('INSUFFICIENT_CREDITS');
    expect(server.count('search')).toBe(0);
  });

  it('fails closed (LAYOUT_CHANGED) when initializeApp never succeeds, instead of trusting the placeholder', async () => {
    const server = await start({ initStatus: 500 });
    const error = await failureOf(open(server, { timeouts: { stepMs: 2_500 }, requiredCredits: 2 }));
    expect(error.code).toBe('LAYOUT_CHANGED');
    expect(server.count('search')).toBe(0);
  });

  it('enough credits (balance equals the count) is allowed', async () => {
    const server = await start({ balance: 2 });
    const session = await open(server, { requiredCredits: 2 });
    expect(session.balance).toBe(2);
  });

  it('cancels and fails UNEXPECTED_CREDIT_COST when the modal says 2 credit(s)', async () => {
    const server = await start({ modalCost: 2 });
    const session = await open(server);
    const error = await failureOf(session.search({ name: CLEAR_ENTITY, searchType: 'ENTITY' }));
    expect(error.code).toBe('UNEXPECTED_CREDIT_COST');
    expect(error.searchSubmitted).toBe(false);
    expect(server.count('cancel-clicked')).toBe(1);
    expect(server.count('search')).toBe(0);
  });

  it('TIMEOUT within the configured time on a slow result, and the search is not repeated', async () => {
    const server = await start({ searchDelayMs: 6_000 });
    const session = await open(server, { timeouts: { resultMs: 1_500 } });
    const started = Date.now();
    const error = await failureOf(session.search({ name: CLEAR_ENTITY, searchType: 'ENTITY' }));
    const elapsed = Date.now() - started;

    expect(error.code).toBe('TIMEOUT');
    expect(error.searchSubmitted).toBe(true);
    expect(elapsed).toBeLessThan(5_000);
    expect(server.count('search')).toBe(1);
  });

  it('an aborted signal stops a waiting search with TIMEOUT, flagged as submitted', async () => {
    const server = await start({ searchDelayMs: 6_000 });
    const session = await open(server, { timeouts: { resultMs: 30_000 } });
    const controller = new AbortController();
    // Abort only once the search was really submitted (the form needs a moment to become usable).
    const watcher = setInterval(() => {
      if (server.count('search') > 0) controller.abort();
    }, 50);
    const error = await failureOf(session.search({ name: CLEAR_ENTITY, searchType: 'ENTITY' }, { signal: controller.signal })).finally(() => clearInterval(watcher));
    expect(error.code).toBe('TIMEOUT');
    expect(error.searchSubmitted).toBe(true);
    expect(server.count('search')).toBe(1);
  });

  it('a run abort during the PDF export still returns the result that was read (a match is not thrown away)', async () => {
    const server = await start({ pdfDelayMs: 8_000 });
    const session = await open(server, { timeouts: { resultMs: 30_000, stepMs: 30_000 } });
    const controller = new AbortController();
    const watcher = setInterval(() => {
      if (server.count('download') > 0) controller.abort();
    }, 50);
    try {
      const outcome = await session.search(
        { name: 'Rosneft Oil Company', searchType: 'ENTITY' },
        { signal: controller.signal },
      );
      expect(controller.signal.aborted).toBe(true);
      expect(outcome.pdf).toBeNull();
      expect(outcome.domTitles.some((title) => /\[[1-9]\d* matches?\]/.test(title))).toBe(true);
      expect(server.count('search')).toBe(1);
    } finally {
      clearInterval(watcher);
    }
  });

  it('LAYOUT_CHANGED (submitted) when the search answered but the page shows no category titles', async () => {
    const server = await start({ omitResultTitles: true });
    const session = await open(server, { timeouts: { stepMs: 1_500 } });
    const error = await failureOf(session.search({ name: CLEAR_ENTITY, searchType: 'ENTITY' }));
    expect(error.code).toBe('LAYOUT_CHANGED');
    expect(error.searchSubmitted).toBe(true);
    expect(server.count('search')).toBe(1);
  });

  it('a failing search call is RESULT_MISMATCH, submitted, and is not repeated', async () => {
    const server = await start({ searchStatus: 500 });
    const session = await open(server);
    const error = await failureOf(session.search({ name: CLEAR_ENTITY, searchType: 'ENTITY' }));
    expect(error.code).toBe('RESULT_MISMATCH');
    expect(error.searchSubmitted).toBe(true);
    expect(server.count('search')).toBe(1);
  });

  it('a missing PDF still returns the result, with pdf null', async () => {
    const server = await start({ pdfStatus: 500 });
    const session = await open(server, { timeouts: { stepMs: 2_500 } });
    const outcome = await session.search({ name: CLEAR_ENTITY, searchType: 'ENTITY' });
    expect(outcome.pdf).toBeNull();
    expect(outcome.json).not.toBeNull();
    expect(outcome.domTitles).toHaveLength(1);
  });

  it('logs in once more when the session expired between searches, before submitting', async () => {
    // Main-page requests: 1 = first search form, 2 = second search form (expired), 3 = after relogin.
    const server = await start({ expireSessionOnMainRequest: 2 });
    const session = await open(server);
    await session.search({ name: CLEAR_ENTITY, searchType: 'ENTITY' });
    const second = await session.search({ name: CLEAR_INDIVIDUAL, searchType: 'INDIVIDUAL' });

    expect(second.domTitles).toHaveLength(2); // a name-only individual: PEP and SIP headings
    expect(server.count('authenticate')).toBe(2);
    expect(server.searches.map((s) => s.name)).toEqual([CLEAR_ENTITY, CLEAR_INDIVIDUAL]);
  });

  it('keeps no credentials, names or balances in what it logs', async () => {
    const lines: string[] = [];
    const capture = (...args: unknown[]) => void lines.push(args.map(String).join(' '));
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(capture),
    );
    try {
      const server = await start({ expireSessionOnMainRequest: 2 }); // also exercises the warn path
      const session = await open(server);
      await session.search({ name: CLEAR_ENTITY, searchType: 'ENTITY' });
      await session.search({ name: 'Vladimir Putin', searchType: 'INDIVIDUAL' });
      await session.close();
      const bad = await start();
      await failureOf(open(bad, { config: { password: 'wrong-Pass-123' } }));
    } finally {
      spies.forEach((spy) => spy.mockRestore());
    }
    const output = lines.join('\n');
    expect(lines.length).toBeGreaterThan(0);
    for (const secret of [FAKE_PASSWORD, FAKE_ACCOUNT_ID, FAKE_USERNAME, 'wrong-Pass-123', CLEAR_ENTITY, 'Putin', 'Balance']) {
      expect(output.includes(secret), secret).toBe(false);
    }
  });

  it('stores no file named after the account id and removes its temp folder', async () => {
    const server = await start();
    const session = await open(server);
    await session.search({ name: CLEAR_ENTITY, searchType: 'ENTITY' });
    const during = tempDirsNow();
    expect(during).toHaveLength(1);
    const files = readdirSync(`${os.tmpdir()}/${during[0]}`);
    expect(files.join(' ')).not.toContain(FAKE_ACCOUNT_ID);
    await session.close();
    expect(tempDirsNow()).toEqual([]);
  });

  it('does not pass credentials or database settings to the browser process', async () => {
    process.env.SENTROWEB_PASSWORD = FAKE_PASSWORD;
    process.env.DATABASE_URL = 'postgresql://secret-user:secret-pass@127.0.0.1:5432/x';
    try {
      const server = await start();
      const session = await open(server);
      const environ = await import('node:fs').then((fs) => fs.readFileSync(`/proc/${pids[0]}/environ`, 'latin1'));
      expect(environ).not.toContain('SENTROWEB_');
      expect(environ).not.toContain('secret-pass');
      expect(environ).not.toContain(FAKE_PASSWORD);
      await session.close();
    } finally {
      delete process.env.SENTROWEB_PASSWORD;
      delete process.env.DATABASE_URL;
    }
  });
});
