/**
 * Browser client for Sentroweb (https://sentroweb.ingenique.net). It drives the real web app
 * like a person would and reads the two XHR responses the page makes anyway. It never calls
 * the Sentroweb API directly.
 *
 * Hard rules (see docs/features/SENTROWEB_CHECK.md):
 * - One incognito browser context with no persistent profile. Log out and close in `finally`.
 * - 1 credit per confirmed search: the confirm modal must say exactly "1 credit(s)", otherwise
 *   CANCEL is clicked. `searchSubmitted` becomes true the moment CONFIRM is clicked, and a
 *   submitted search is never submitted again by this module.
 * - Never opens Manage Ongoing Monitoring and never clicks Match Yes/No, "All results are false
 *   match", Save or Cancel on a result. The only clicks are the ones listed in `selectors.ts`.
 * - Logs only step names. No credentials, names, balances, URLs, cookies or page text.
 * - The PDF download is named by Chrome's GUID (`allowAndName`), so the account number that
 *   Sentroweb puts in its own file name never reaches the disk.
 */

import { mkdtemp, readdir, readFile, rm, stat, unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Browser, BrowserContext, ElementHandle, HTTPResponse, Page } from 'puppeteer-core';
import { findChromePath } from '@/lib/chrome-executable';
import { createLogger } from '@/lib/logger';
import {
  SENTROWEB_CREDITS_PER_SEARCH,
  type SentrowebConfig,
} from '@/lib/sentroweb/config';
import {
  SENTROWEB_PATHS,
  SENTROWEB_PATTERNS,
  SENTROWEB_SELECTORS,
  SENTROWEB_XHR,
} from '@/lib/sentroweb/selectors';
import { isSentrowebCountry } from '@/lib/sentroweb/countries';
import type { SentrowebSearchTypeValue } from '@/lib/sentroweb/types';
import { SentrowebError } from './errors';

const log = createLogger('sentroweb-client');

const LAUNCH_ARGS = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'];

/** Environment variables Chrome may inherit. Nothing else (no credentials, no database URL). */
const BROWSER_ENV_ALLOWLIST = ['PATH', 'HOME', 'LANG', 'LC_ALL', 'TMPDIR', 'TZ', 'DISPLAY', 'XDG_RUNTIME_DIR'];

const POLL_INTERVAL_MS = 150;
/** How long the header balance must stay unchanged after `initializeApp` before it is trusted. */
const BALANCE_SETTLE_MS = 900;
/** Quiet time the network needs after `initializeApp` before the form is used, and its upper bound. */
const PAGE_IDLE_MS = 800;
const PAGE_IDLE_MAX_MS = 10_000;
/** Clicks allowed per checkbox before the form is declared unusable (state is re-read before each). */
const CHECKBOX_ATTEMPTS = 3;
const CHECKBOX_SETTLE_MS = 400;
/** After the reload that stops a given-up attempt: time for in-flight request events to arrive. */
const QUIESCE_SETTLE_MS = 800;
const CLOSE_STEP_TIMEOUT_MS = 5_000;

export interface SentrowebSearchRequest {
  name: string;
  searchType: SentrowebSearchTypeValue;
  /**
   * The most credits this search may cost. Defaults to the fixed 1 per search. With 0 the search
   * is cancelled at the confirm box (UNEXPECTED_CREDIT_COST) and only a free repeat goes through.
   */
  maxCredits?: number;
  /**
   * An individual's details besides the name. Both are exactly what is typed or chosen: `country`
   * is one option of Sentroweb's country list, `dateOfBirth` is YYYY-MM-DD. Null or absent leaves
   * the field blank. Ignored for entities. Gender is never sent: Oakcloud holds none.
   */
  country?: string | null;
  dateOfBirth?: string | null;
  /** MALE or FEMALE ticks that box for an individual; null or absent leaves both unticked. */
  gender?: 'MALE' | 'FEMALE' | null;
  /** Tick Fuzzy Search for this search. Off unless the person asked for it. */
  fuzzy?: boolean;
}

export interface SentrowebSearchOutcome {
  /** The parsed search response the page receives, or null when it was not captured. */
  json: unknown;
  /** The `<Category> [N matches]` accordion titles. */
  domTitles: string[];
  /** Sentroweb's own PDF report, or null when the export failed. */
  pdf: Buffer | null;
  /** Screenshot of the result block only, or null when it could not be taken. */
  png: Buffer | null;
  /**
   * Credits the search cost: 1 after the confirm dialog, 0 when Sentroweb itself answered that
   * nothing is deducted (a name that was searched before). Absent means 1.
   */
  creditsCharged?: number;
}

export interface SentrowebSession {
  /** Credits shown in the Sentroweb header after login. */
  readonly balance: number;
  search(request: SentrowebSearchRequest, options?: { signal?: AbortSignal }): Promise<SentrowebSearchOutcome>;
  /** Logs out and closes the browser. Safe to call more than once; never throws. */
  close(): Promise<void>;
}

export interface OpenSessionOptions {
  signal?: AbortSignal;
  /** Fails with INSUFFICIENT_CREDITS, before any search, when the balance is lower. */
  requiredCredits?: number;
  /** Test hook: receives the browser's process id as soon as it is launched. */
  onBrowserLaunched?: (pid: number | undefined) => void;
}

export interface SentrowebClient {
  openSession(config: SentrowebConfig, options?: OpenSessionOptions): Promise<SentrowebSession>;
}

// --- helpers -----------------------------------------------------------------------------------

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function throwIfAborted(signal: AbortSignal | undefined, searchSubmitted = false): void {
  if (signal?.aborted) throw new SentrowebError('TIMEOUT', { searchSubmitted });
}

interface BoxOptions {
  fuzzy: boolean;
  gender: 'MALE' | 'FEMALE' | null;
}

/**
 * The wanted state of every checkbox of the form, by label. The real form draws Male, Female and the
 * date of birth only after Individual is ticked (an empty form, or one with Entity ticked, has just
 * Individual, Entity and Fuzzy Search). The gender boxes are listed for every search: wanted ticked
 * only on an individual search that has a gender, and wanted unticked otherwise (an entity search
 * never carries a gender filter). A box that is not wanted and not on the form counts as unticked; one
 * that is on the form and ticked is cleared, or the search fails before SEARCH.
 */
function expectedBoxes(searchType: SentrowebSearchTypeValue, options: BoxOptions): Array<[string, boolean]> {
  const { individualLabelText, entityLabelText, fuzzyLabelText, genderLabelTexts } = SENTROWEB_SELECTORS.search;
  const wantIndividual = searchType === 'INDIVIDUAL';
  const [maleLabel, femaleLabel] = genderLabelTexts;
  return [
    [wantIndividual ? individualLabelText : entityLabelText, true],
    [wantIndividual ? entityLabelText : individualLabelText, false],
    [fuzzyLabelText, options.fuzzy],
    [maleLabel, wantIndividual && options.gender === 'MALE'],
    [femaleLabel, wantIndividual && options.gender === 'FEMALE'],
  ];
}

/** A gender box that is not wanted may be absent (the form may not draw it): absent counts as unticked. */
function isOptionalWhenOff(label: string, wanted: boolean): boolean {
  return !wanted && (SENTROWEB_SELECTORS.search.genderLabelTexts as readonly string[]).includes(label);
}

/** The only error names the failure log may print (everything else is logged as `Other`). */
const LOGGABLE_ERROR_NAMES: ReadonlySet<string> = new Set([
  'Error',
  'TypeError',
  'RangeError',
  'SyntaxError',
  'ReferenceError',
  'EvalError',
  'URIError',
  'AbortError',
  'TimeoutError',
  'ProtocolError',
  'TargetCloseError',
  'DOMException',
]);

/**
 * The kind of an error that is not a SentrowebError, as fixed words for the failure log. Neither the
 * message nor a custom error name is ever logged (both can carry a selector, a name or a value): the
 * name is printed only when it is on a fixed list, and the category comes from a fixed set.
 */
export function unexpectedErrorKind(error: unknown): { errorName: string; reason: string } {
  const name =
    error instanceof Error ? (LOGGABLE_ERROR_NAMES.has(error.name) ? error.name : 'Other') : 'NonError';
  const message = error instanceof Error ? error.message : '';
  const reason = /no element found for selector|failed to find element matching selector/i.test(message)
    ? 'no-element-for-selector'
    : /not clickable|not an element|not visible/i.test(message)
      ? 'not-clickable'
      : /waiting .*failed|timeout/i.test(message)
        ? 'timeout'
        : /detached|execution context was destroyed|frame/i.test(message)
          ? 'page-changed'
          : /target closed|session closed|connection closed|protocol error/i.test(message)
            ? 'browser-closed'
            : 'other';
  return { errorName: name, reason };
}

interface SearchDetails {
  country: string | null;
  dateOfBirth: string | null;
  gender: 'MALE' | 'FEMALE' | null;
}

/** Only an individual is searched with details, and only with values of the exact expected shape. */
function detailsFor(request: SentrowebSearchRequest): SearchDetails {
  if (request.searchType !== 'INDIVIDUAL') return { country: null, dateOfBirth: null, gender: null };
  const country = request.country && isSentrowebCountry(request.country) ? request.country : null;
  const dateOfBirth = request.dateOfBirth && /^\d{4}-\d{2}-\d{2}$/.test(request.dateOfBirth) ? request.dateOfBirth : null;
  const gender = request.gender === 'MALE' || request.gender === 'FEMALE' ? request.gender : null;
  return { country, dateOfBirth, gender };
}

async function pollUntil<T>(
  check: () => Promise<T | null | undefined | false>,
  options: { timeoutMs: number; signal?: AbortSignal; onTimeout: () => SentrowebError; searchSubmitted?: boolean },
): Promise<T> {
  const deadline = Date.now() + options.timeoutMs;
  for (;;) {
    throwIfAborted(options.signal, options.searchSubmitted);
    const value = await check();
    if (value) return value;
    if (Date.now() >= deadline) throw options.onTimeout();
    await sleep(POLL_INTERVAL_MS);
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<undefined>((resolve) => {
        timer = setTimeout(() => resolve(undefined), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function buildBrowserEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of BROWSER_ENV_ALLOWLIST) {
    const value = process.env[key];
    if (value) env[key] = value;
  }
  return env;
}

interface CapturedSearch {
  status: number;
  body: string | null;
}

/** What the page showed after SEARCH: the confirm box with its cost, or a free repeat (no box). */
type ConfirmGate = { kind: 'modal'; cost: number } | { kind: 'free' };

interface PageState {
  authCount: number;
  authStatus: number | null;
  search: CapturedSearch | null;
  /** The page's own `initializeApp` call answered 200: only then is the header balance real. */
  appInitialized: boolean;
  /**
   * The page's own quota check for the search that was just started. `free` only when Sentroweb
   * answered 200 with `deductCredit: false` and no unique names: nothing is deducted and the page
   * searches without a confirm dialog.
   */
  quota: { status: number; free: boolean; deductCredit: boolean | null; uniqueNames: number | null } | null;
  /**
   * The page sent the search request for the current attempt. Latched from the request itself, so
   * it holds whether or not the quota answer was accepted, a dialog showed, or a response came.
   */
  searchDispatched: boolean;
  /** The page sent its quota request for the current attempt: the SEARCH click reached it. */
  quotaRequested: boolean;
  /** The last few XHR calls as `METHOD label status` (allow-listed labels only), for the failure log. */
  recentCalls: string[];
}

function normalise(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

// --- the session -------------------------------------------------------------------------------

class Session implements SentrowebSession {
  balance = 0;
  private closed = false;
  private reloginDone = false;

  constructor(
    private readonly config: SentrowebConfig,
    private readonly browser: Browser,
    private readonly context: BrowserContext,
    private readonly page: Page,
    private readonly state: PageState,
    private readonly downloadDir: string,
  ) {}

  private url(pathAndQuery: string): string {
    return new URL(pathAndQuery, this.config.baseUrl).toString();
  }

  private get stepMs(): number {
    return this.config.timeouts.stepMs;
  }

  private isOnLoginPage(): boolean {
    try {
      return new URL(this.page.url()).pathname.toLowerCase().startsWith(SENTROWEB_PATHS.loginPrefix.toLowerCase());
    } catch {
      return false;
    }
  }

  private isOnMainPage(): boolean {
    try {
      return new URL(this.page.url()).pathname.toLowerCase().startsWith(SENTROWEB_PATHS.mainPrefix.toLowerCase());
    } catch {
      return false;
    }
  }

  // --- login ---------------------------------------------------------------------------------

  /** One login attempt. LOGIN_FAILED is never retried. */
  async login(signal?: AbortSignal): Promise<void> {
    const { page, state } = this;
    const selectors = SENTROWEB_SELECTORS.login;
    log.info('Sentroweb login: opening the login page');

    await this.goto(SENTROWEB_PATHS.login, signal);
    await pollUntil(async () => (await page.$(selectors.accountId)) !== null, {
      timeoutMs: this.stepMs,
      signal,
      onTimeout: () => new SentrowebError('LAYOUT_CHANGED'),
    });
    for (const selector of [selectors.username, selectors.password, selectors.submit]) {
      if (!(await page.$(selector))) throw new SentrowebError('LAYOUT_CHANGED');
    }

    state.authCount = 0;
    state.authStatus = null;
    state.appInitialized = false;
    await page.type(selectors.accountId, this.config.accountId);
    await page.type(selectors.username, this.config.username);
    await page.type(selectors.password, this.config.password);
    await page.click(selectors.submit);

    // Landing on the main page is success. Anything else is classified once the answer is in.
    const outcome = await pollUntil(
      async () => {
        if (this.isOnMainPage()) return 'landed' as const;
        if (state.authStatus !== null && state.authStatus >= 400) return 'rejected' as const;
        if (state.authStatus !== null && !this.isOnLoginPage()) return 'elsewhere' as const;
        if (state.authStatus !== null && (await this.pageAsksForExtraStep())) return 'extra-step' as const;
        return null;
      },
      {
        timeoutMs: this.stepMs,
        signal,
        onTimeout: () => new SentrowebError(state.authStatus === null ? 'TIMEOUT' : 'LAYOUT_CHANGED'),
      },
    );

    if (outcome === 'rejected') throw new SentrowebError('LOGIN_FAILED');
    if (outcome === 'extra-step') throw new SentrowebError('MFA_OR_CAPTCHA_REQUIRED');
    if (outcome === 'elsewhere') {
      throw (await this.pageAsksForExtraStep())
        ? new SentrowebError('MFA_OR_CAPTCHA_REQUIRED')
        : new SentrowebError('LAYOUT_CHANGED');
    }

    // The main page must show the search form and the balance.
    await pollUntil(async () => (await this.page.$(SENTROWEB_SELECTORS.search.nameInput)) !== null, {
      timeoutMs: this.stepMs,
      signal,
      onTimeout: () => new SentrowebError('LAYOUT_CHANGED'),
    }).catch(async (error: unknown) => {
      throw (await this.pageAsksForExtraStep()) ? new SentrowebError('MFA_OR_CAPTCHA_REQUIRED') : error;
    });
    this.balance = await this.readBalance(signal);
    log.info('Sentroweb login: signed in');
  }

  private async pageAsksForExtraStep(): Promise<boolean> {
    try {
      const text = await this.page.evaluate(() => document.body?.innerText ?? '');
      return SENTROWEB_PATTERNS.mfaHint.test(text);
    } catch {
      return false;
    }
  }

  /**
   * The header shows "Balance: 0" as a placeholder until the page's `initializeApp` call answers
   * (seen on the real site), so a value is only trusted after that call returned 200 and the
   * number then stayed the same for BALANCE_SETTLE_MS. A genuine 0 therefore still reads as 0.
   * Without the call (or without a number) it fails closed with LAYOUT_CHANGED.
   */
  private async readBalance(signal?: AbortSignal): Promise<number> {
    let last: number | null = null;
    let since = 0;
    const balance = await pollUntil(
      async () => {
        if (!this.state.appInitialized) return null;
        const body = await this.page.evaluate(() => document.body?.innerText ?? '');
        const match = SENTROWEB_PATTERNS.balance.exec(body);
        const value = match ? Number.parseInt(match[1].replace(/,/g, ''), 10) : Number.NaN;
        if (!Number.isFinite(value) || value < 0) {
          last = null;
          return null;
        }
        if (value !== last) {
          last = value;
          since = Date.now();
          return null;
        }
        return Date.now() - since >= BALANCE_SETTLE_MS ? { value } : null;
      },
      { timeoutMs: this.stepMs, signal, onTimeout: () => new SentrowebError('LAYOUT_CHANGED') },
    );
    return balance.value;
  }

  private async goto(pathAndQuery: string, signal?: AbortSignal): Promise<void> {
    throwIfAborted(signal);
    try {
      await this.page.goto(this.url(pathAndQuery), { waitUntil: 'domcontentloaded', timeout: this.stepMs });
    } catch {
      throwIfAborted(signal);
      throw new SentrowebError('TIMEOUT');
    }
  }

  // --- search --------------------------------------------------------------------------------

  async search(
    request: SentrowebSearchRequest,
    options: { signal?: AbortSignal } = {},
  ): Promise<SentrowebSearchOutcome> {
    const { signal } = options;
    const { page, state } = this;
    const selectors = SENTROWEB_SELECTORS;
    if (this.closed) throw new SentrowebError('SESSION_EXPIRED');

    // Before the first click on CONFIRM nothing has been spent, so everything up to there may
    // re-login once and start again.
    await this.phase('open-form', () => this.openSearchForm(signal));
    state.search = null;

    state.quota = null;
    state.searchDispatched = false;
    state.quotaRequested = false;
    // Details only for an individual; an entity (or a person with nothing usable) leaves them blank.
    const details = detailsFor(request);
    const fuzzy = request.fuzzy === true;
    try {
      // SEARCH stays disabled until a name and a search type are filled in, and the name is typed
      // last: nothing can submit the form (not even an Enter key in the dropdown) while the other
      // fields are set. The country dropdown is always on the form and is set first. The Male and
      // Female boxes and the date of birth field exist only once Individual is ticked (the real
      // form does not draw them before), so the type is ticked next and those follow.
      await this.phase('set-country', () => this.setCountry(details, signal));
      await this.phase('tick-type', () => this.setSearchType(request.searchType, { fuzzy, gender: details.gender }, signal));
      await this.phase('set-birth-date', () => this.setDateOfBirth(details, signal));
      await this.phase('type-name', async () => {
        await page.type(selectors.search.nameInput, request.name);
        // The name must still be what was typed (a late redraw of the form can clear it).
        const typed = await page.$eval(selectors.search.nameInput, (input) => (input as HTMLInputElement).value);
        if (typed !== request.name) throw new SentrowebError('LAYOUT_CHANGED');
      });
      await this.phase('submit-enabled', async () => {
        // SEARCH may take a while to enable, and the form can redraw (a filter ticked or a country
        // changed) while it does. Wait for it first, and only then read everything back, so the last
        // read is of the form as it is when the click follows.
        await pollUntil(async () => (await page.$(selectors.search.submitEnabled)) !== null, {
          timeoutMs: this.stepMs,
          signal,
          onTimeout: () => new SentrowebError('LAYOUT_CHANGED'),
        });
        const typedAfter = await page.$eval(selectors.search.nameInput, (input) => (input as HTMLInputElement).value);
        if (typedAfter !== request.name) throw new SentrowebError('LAYOUT_CHANGED');
        // The search must go out exactly as intended: every field is read back one last time.
        await this.verifyDetails(details, true);
        if (!(await this.optionsAreSet(request.searchType, { fuzzy, gender: details.gender }))) {
          throw new SentrowebError('LAYOUT_CHANGED');
        }
        // SEARCH must still be enabled after the read-back (a redraw that disabled it is a changed form).
        if ((await page.$(selectors.search.submitEnabled)) === null) throw new SentrowebError('LAYOUT_CHANGED');
        // Nothing may have been asked of Sentroweb yet: the click below is the only trigger.
        this.assertNothingSent();
      });
    } catch (error) {
      // A page that reacted to the form being filled in by asking for a quota (or searching) has
      // already started a search we did not click for. Stop it, and keep the attempt submitted:
      // cooldown, no retry, unknown charge.
      if (state.quotaRequested || state.searchDispatched) {
        if (!state.searchDispatched) await this.quiescePage();
        throw new SentrowebError(error instanceof SentrowebError ? error.code : 'LAYOUT_CHANGED', {
          searchSubmitted: true,
        });
      }
      throw error;
    }
    // From the click on, the page may send the search by itself (a free repeat) or after a dialog.
    // Whatever then goes wrong here (the click call failing, the quota answer being rejected, a
    // timeout, an abort), a search the page really sent is submitted: it keeps the cooldown, is
    // never retried, and its charge is unknown.
    let gate: ConfirmGate;
    try {
      await this.phase('click-search', () => page.click(selectors.search.submit));
      gate = await this.phase('confirm-modal', () => this.awaitConfirmOrFree(signal));
    } catch (error) {
      // Not sent yet does not mean it never will be: a slow quota answer can still make the page
      // search a moment from now. Reload the page first (that drops its pending calls) and only
      // then decide, so a search that goes out later cannot be recorded as "not submitted".
      const quiet = state.searchDispatched ? true : await this.quiescePage();
      if (state.searchDispatched || !quiet || this.searchMaybeSent()) {
        throw new SentrowebError(error instanceof SentrowebError ? error.code : 'LAYOUT_CHANGED', {
          searchSubmitted: true,
        });
      }
      // Nothing was sent: a plain failure, never a raw browser error.
      throw error instanceof SentrowebError ? error : new SentrowebError('LAYOUT_CHANGED', { cause: error });
    }
    // The search may be sent (and a credit spent) from the very next instruction on.
    const submitted = { searchSubmitted: true };
    let creditsCharged: number = SENTROWEB_CREDITS_PER_SEARCH;
    if (gate.kind === 'free') {
      // Sentroweb said nothing is deducted for this name and the page searches by itself. There is
      // no dialog to confirm, and nothing to cancel: the search call is already on its way.
      creditsCharged = 0;
      log.info('Sentroweb search: a repeated name, nothing is deducted (no confirm dialog)');
    } else {
      const allowed = request.maxCredits ?? SENTROWEB_CREDITS_PER_SEARCH;
      if (gate.cost !== SENTROWEB_CREDITS_PER_SEARCH || gate.cost > allowed) {
        await this.clickModalButton(selectors.confirmModal.root, selectors.confirmModal.cancel).catch(() => undefined);
        throw new SentrowebError('UNEXPECTED_CREDIT_COST');
      }
      try {
        await this.clickModalButton(selectors.confirmModal.root, selectors.confirmModal.confirm);
      } catch (error) {
        throw error instanceof SentrowebError
          ? new SentrowebError(error.code, submitted)
          : new SentrowebError('LAYOUT_CHANGED', submitted);
      }
      log.info('Sentroweb search: confirmed');
    }

    try {
      const domTitles = await this.waitForResult(signal);
      const captured = state.search as CapturedSearch | null;
      const json = this.parseCaptured(captured);
      const png = await this.screenshotResult();
      const pdf = await this.exportPdf(signal);
      return { json, domTitles, pdf, png, creditsCharged };
    } catch (error) {
      // From CONFIRM on, every failure carries the flag so nothing submits this search again. A
      // search Sentroweb itself said is free keeps that: the failure then costs nothing.
      const known = creditsCharged === 0 ? { creditsCharged: 0 } : {};
      throw new SentrowebError(error instanceof SentrowebError ? error.code : 'LAYOUT_CHANGED', {
        ...submitted,
        ...known,
      });
    }
  }

  /**
   * Could the page have sent the search without a request event that we saw? A request cancelled
   * by the reload can still have reached the server, so a missing event proves nothing. Not
   * submitted is only certain when the page never asked for a quota (the click did not reach it),
   * or when its quota answer asked for credits (the page then waits for a CONFIRM that we never
   * click). Every other case, including a quota still unanswered, stays uncertain.
   */
  private searchMaybeSent(): boolean {
    const { state } = this;
    if (state.searchDispatched) return true;
    if (!state.quotaRequested) return false;
    const quota = state.quota as PageState['quota'];
    return !(quota && quota.status === 200 && quota.deductCredit === true);
  }

  /**
   * Stops the page from sending a search after we gave up on it: loads the search page afresh,
   * which drops the old page's pending calls, then lets the caller read the request latch.
   * Returns true when that is certain. If the reload itself fails (a lost connection, a hung page)
   * nothing is certain, whatever events were or were not observed, so the caller must treat the
   * attempt as submitted.
   */
  private async quiescePage(): Promise<boolean> {
    try {
      await this.page.goto(this.url(SENTROWEB_PATHS.search), { waitUntil: 'domcontentloaded', timeout: CLOSE_STEP_TIMEOUT_MS });
      // A request sent in the instant before the reload reports itself a little later than the
      // navigation result; let those events land before anyone reads the latch.
      await sleep(QUIESCE_SETTLE_MS);
      return true;
    } catch {
      // The old page may still be alive (or the browser gone with the search already sent), and
      // nothing we observed can prove otherwise: an absent event is not proof. Stay uncertain.
      return false;
    }
  }

  private async openSearchForm(signal?: AbortSignal): Promise<void> {
    const { page } = this;
    const open = async () => {
      this.state.appInitialized = false;
      await this.goto(SENTROWEB_PATHS.search, signal);
      if (this.isOnLoginPage()) return false;
      await pollUntil(async () => (await page.$(SENTROWEB_SELECTORS.search.nameInput)) !== null || this.isOnLoginPage(), {
        timeoutMs: this.stepMs,
        signal,
        onTimeout: () => new SentrowebError('LAYOUT_CHANGED'),
      });
      if (this.isOnLoginPage()) return false;
      await this.awaitPageReady(signal);
      return true;
    };

    if (await open()) return;
    // The session ended between searches. One new login is allowed, and only here, before the
    // search is submitted.
    if (this.reloginDone) throw new SentrowebError('SESSION_EXPIRED');
    this.reloginDone = true;
    log.warn('Sentroweb session expired between searches; logging in once more');
    await this.login(signal);
    if (!(await open())) throw new SentrowebError('SESSION_EXPIRED');
  }

  /**
   * Runs one step of the search before CONFIRM. A failure is logged with the step name, the error
   * code and the structure of the form (class names, counts: never text), so a changed page can be
   * diagnosed from the log without a second paid search. Nothing is swallowed.
   */
  private async phase<T>(name: string, work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      const code = error instanceof SentrowebError ? error.code : 'UNEXPECTED_ERROR';
      log.warn('Sentroweb search: a step failed before CONFIRM', {
        phase: name,
        code,
        // An unexpected error is classified into a fixed word (never its message, which can quote a value).
        ...(error instanceof SentrowebError ? {} : unexpectedErrorKind(error)),
        appInitialized: this.state.appInitialized,
        recentCalls: this.state.recentCalls,
        quota: this.state.quota && {
          status: this.state.quota.status,
          deductCredit: this.state.quota.deductCredit,
          uniqueNames: this.state.quota.uniqueNames,
        },
        form: await this.describeForm(),
      });
      throw error;
    }
  }

  /**
   * The structure of the search form for the failure log: a page label, class-name tokens (only
   * short lowercase words) and a length. No text, no values, no paths.
   */
  private async describeForm(): Promise<unknown> {
    const { checkbox, submit, nameInput } = SENTROWEB_SELECTORS.search;
    try {
      const raw = await this.page.evaluate(
        (checkboxSelector, submitSelector, inputSelector, dobSelector, countrySelector) => ({
          path: location.pathname,
          modals: Array.from(document.querySelectorAll('.modal')).map((element) => String(element.className)),
          checkboxes: Array.from(document.querySelectorAll(checkboxSelector)).map((element) => String(element.className)),
          submit: String(document.querySelector(submitSelector)?.className ?? 'none'),
          nameLength: (document.querySelector(inputSelector) as HTMLInputElement | null)?.value.length ?? -1,
          hasDateOfBirthField: document.querySelector(dobSelector) !== null,
          hasCountryDropdown: document.querySelector(countrySelector) !== null,
        }),
        checkbox,
        submit,
        nameInput,
        SENTROWEB_SELECTORS.search.dateOfBirthInput,
        SENTROWEB_SELECTORS.search.countryDropdown,
      );
      const classes = (value: string) =>
        value
          .split(/\s+/)
          .filter((token) => /^[a-z][a-z-]{0,23}$/.test(token))
          .slice(0, 12)
          .join(' ');
      return {
        page: pageLabel(raw.path),
        modals: raw.modals.slice(0, 4).map(classes),
        checkboxes: raw.checkboxes.slice(0, 6).map(classes),
        submit: classes(raw.submit),
        nameLength: raw.nameLength,
        hasDateOfBirthField: raw.hasDateOfBirthField,
        hasCountryDropdown: raw.hasCountryDropdown,
      };
    } catch {
      return 'unreadable';
    }
  }

  /**
   * The form is drawn before the page is wired up: on the real site a click on a checkbox label
   * right after the form appears is ignored. The page is ready once its own `initializeApp` call
   * answered 200 and the network went quiet; without that, nothing is typed or clicked.
   */
  private async awaitPageReady(signal?: AbortSignal): Promise<void> {
    await pollUntil(async () => this.state.appInitialized, {
      timeoutMs: this.stepMs,
      signal,
      onTimeout: () => new SentrowebError('LAYOUT_CHANGED'),
    });
    // Best effort: a page that never goes quiet is still checked by the state verification below.
    await this.page
      .waitForNetworkIdle({ idleTime: PAGE_IDLE_MS, timeout: Math.min(this.stepMs, PAGE_IDLE_MAX_MS) })
      .catch(() => undefined);
    throwIfAborted(signal);
  }

  private async checkboxStates(): Promise<Array<{ label: string; checked: boolean }>> {
    const { checkbox, checkboxLabel, checkboxCheckedClass } = SENTROWEB_SELECTORS.search;
    return this.page.evaluate(
      (wrapperSelector, labelSelector, checkedClass) =>
        Array.from(document.querySelectorAll(wrapperSelector)).map((wrapper) => ({
          label: (wrapper.querySelector(labelSelector)?.textContent ?? '').replace(/\s+/g, ' ').trim(),
          checked: wrapper.classList.contains(checkedClass),
        })),
      checkbox,
      checkboxLabel,
      checkboxCheckedClass,
    );
  }

  private async clickCheckboxLabel(labelText: string): Promise<void> {
    const { checkbox, checkboxLabel } = SENTROWEB_SELECTORS.search;
    const handle = await this.page.evaluateHandle(
      (wrapperSelector, labelSelector, text) => {
        for (const wrapper of Array.from(document.querySelectorAll(wrapperSelector))) {
          const label = wrapper.querySelector(labelSelector);
          if (label && (label.textContent ?? '').replace(/\s+/g, ' ').trim() === text) return label;
        }
        return null;
      },
      checkbox,
      checkboxLabel,
      labelText,
    );
    const element = handle.asElement() as ElementHandle<Element> | null;
    if (!element) {
      await handle.dispose();
      throw new SentrowebError('LAYOUT_CHANGED');
    }
    try {
      await element.click();
    } finally {
      await element.dispose();
    }
  }

  /**
   * Chooses the country and types the birth date, then reads both back. A field that cannot be set
   * to exactly the wanted value fails the attempt here, before SEARCH, so a different search than
   * intended is never submitted. Blank wanted values are left alone (and checked to be blank).
   */
  private async setCountry(details: SearchDetails, signal?: AbortSignal): Promise<void> {
    const { page } = this;
    const search = SENTROWEB_SELECTORS.search;
    // Nothing may be able to submit the form while it is being filled in: SEARCH must still be
    // disabled (no name or type yet). If it is not, the page is not what this client was built for.
    if (details.country !== null && (await page.$(search.submitEnabled)) !== null) {
      throw new SentrowebError('LAYOUT_CHANGED');
    }
    if (details.country !== null) {
      throwIfAborted(signal);
      await page.click(search.countryDropdown);
      await sleep(CHECKBOX_SETTLE_MS);
      // Typing narrows the list; the option is then picked by its exact text, never by "first".
      await page.keyboard.type(details.country);
      await sleep(CHECKBOX_SETTLE_MS);
      // The recorded flow typed the name and pressed Enter, which takes the first listed option.
      // That is used only when the first listed option is exactly the wanted one; otherwise (the
      // text also narrows to other countries: "Guinea") the exact option is clicked.
      const firstListed = await page.evaluate(
        (itemSelector, textSelector) => {
          const visible = Array.from(document.querySelectorAll(itemSelector)).filter((item) => {
            const text = (item.querySelector(textSelector)?.textContent ?? '').trim();
            return text !== '' && (item as HTMLElement).offsetParent !== null;
          });
          return (visible[0]?.querySelector(textSelector)?.textContent ?? '').replace(/\s+/g, ' ').trim();
        },
        search.countryItem,
        search.countryItemText,
      );
      // Enter is pressed only while SEARCH is disabled, so it cannot submit the form on its own.
      if (firstListed === details.country && (await page.$(search.submitEnabled)) === null) {
        await page.keyboard.press('Enter');
      } else {
        const option = await page.evaluateHandle(
          (itemSelector, textSelector, wanted) => {
            const matches = Array.from(document.querySelectorAll(itemSelector)).filter(
              (item) => (item.querySelector(textSelector)?.textContent ?? '').replace(/\s+/g, ' ').trim() === wanted,
            );
            return matches.length === 1 ? matches[0] : null;
          },
          search.countryItem,
          search.countryItemText,
          details.country,
        );
        const element = option.asElement() as ElementHandle<Element> | null;
        if (!element) throw new SentrowebError('LAYOUT_CHANGED');
        await element.click();
      }
      await sleep(CHECKBOX_SETTLE_MS);
    }
    await this.verifyDetails(details, false);
    this.assertNothingSent();
  }

  /** Types the date of birth into the field Individual reveals; SEARCH must still be disabled (no name yet). */
  private async setDateOfBirth(details: SearchDetails, signal?: AbortSignal): Promise<void> {
    const { page } = this;
    const search = SENTROWEB_SELECTORS.search;
    if (details.dateOfBirth !== null) {
      throwIfAborted(signal);
      if ((await page.$(search.submitEnabled)) !== null) throw new SentrowebError('LAYOUT_CHANGED');
      // The field is drawn after the Individual box is ticked: wait for it, never type blind.
      await pollUntil(async () => (await page.$(search.dateOfBirthInput)) !== null, {
        timeoutMs: this.stepMs,
        signal,
        onTimeout: () => new SentrowebError('LAYOUT_CHANGED'),
      });
      await page.type(search.dateOfBirthInput, details.dateOfBirth);
      await sleep(CHECKBOX_SETTLE_MS);
    }
    await this.verifyDetails(details, true);
    this.assertNothingSent();
  }

  /**
   * The page may only be asked for a quota or a search by our click on SEARCH. If it has been
   * before that (a form that submits itself), the attempt is already out of our hands.
   */
  private assertNothingSent(): void {
    if (this.state.quotaRequested || this.state.searchDispatched) throw new SentrowebError('LAYOUT_CHANGED');
  }

  /**
   * The country shown and the birth date typed must be exactly the wanted ones (blank when null).
   * The date field exists only for an individual: an absent field reads as blank, which is right
   * when no date is wanted and a mismatch when one is. Before the date step (`withDate` false) only
   * the country is compared.
   */
  private async verifyDetails(details: SearchDetails, withDate: boolean): Promise<void> {
    const search = SENTROWEB_SELECTORS.search;
    const current = await this.page
      .evaluate(
        (countrySelector, defaultClass, dobSelector) => {
          const country = document.querySelector(countrySelector);
          const dob = document.querySelector(dobSelector) as HTMLInputElement | null;
          if (!country) return null;
          return {
            country: country.classList.contains(defaultClass)
              ? ''
              : (country.textContent ?? '').replace(/\s+/g, ' ').trim(),
            dateOfBirth: dob ? dob.value : '',
          };
        },
        search.countryText,
        search.countryDefaultClass,
        search.dateOfBirthInput,
      )
      .catch(() => null);
    if (!current) throw new SentrowebError('LAYOUT_CHANGED');
    if (current.country !== (details.country ?? '')) throw new SentrowebError('LAYOUT_CHANGED');
    if (withDate && current.dateOfBirth !== (details.dateOfBirth ?? '')) throw new SentrowebError('LAYOUT_CHANGED');
  }

  /** Ticks exactly the wanted type, fuzzy and gender boxes (all others off) and verifies the result. */
  private async setSearchType(
    searchType: SentrowebSearchTypeValue,
    options: BoxOptions,
    signal?: AbortSignal,
  ): Promise<void> {
    const expected = expectedBoxes(searchType, options);

    for (const [label, wanted] of expected) {
      throwIfAborted(signal);
      if (wanted && (SENTROWEB_SELECTORS.search.genderLabelTexts as readonly string[]).includes(label)) {
        // A gender box is drawn only after Individual is ticked (and the page has redrawn): wait for it.
        await pollUntil(async () => (await this.checkboxStates()).some((state) => state.label === label), {
          timeoutMs: this.stepMs,
          signal,
          onTimeout: () => new SentrowebError('LAYOUT_CHANGED'),
        });
      }
      const states = await this.checkboxStates();
      const current = states.find((state) => state.label === label);
      if (!current && isOptionalWhenOff(label, wanted)) continue;
      if (!current) throw new SentrowebError('LAYOUT_CHANGED');
      // Re-read the box before every click, so a click that did register is never undone.
      for (let attempt = 0; attempt < CHECKBOX_ATTEMPTS; attempt += 1) {
        const now = (await this.checkboxStates()).find((state) => state.label === label);
        if (!now && isOptionalWhenOff(label, wanted)) break;
        if (!now) throw new SentrowebError('LAYOUT_CHANGED');
        if (now.checked === wanted) break;
        await this.clickCheckboxLabel(label);
        await sleep(CHECKBOX_SETTLE_MS);
      }
    }

    if (!(await this.optionsAreSet(searchType, options))) throw new SentrowebError('LAYOUT_CHANGED');
    // Ticking the type must not have asked the page for a quota or a search.
    this.assertNothingSent();
  }

  /** Every checkbox (type, fuzzy, gender) is in exactly the wanted state. */
  private async optionsAreSet(searchType: SentrowebSearchTypeValue, options: BoxOptions): Promise<boolean> {
    const states = await this.checkboxStates();
    return expectedBoxes(searchType, options).every(([label, wanted]) => {
      const state = states.find((candidate) => candidate.label === label);
      return state ? state.checked === wanted : isOptionalWhenOff(label, wanted);
    });
  }

  /**
   * After SEARCH, Sentroweb answers one of two ways. Normally the confirm dialog ("Credit
   * Deduction", with the cost) opens and nothing happens until CONFIRM. For a name that was searched
   * before, the page's quota check says `deductCredit: false` with no unique names and the page
   * searches at once. The free path is taken only on that exact answer; a quota that asks for
   * credits but shows no dialog, or any other answer, is a changed page and fails closed.
   */
  private async awaitConfirmOrFree(signal?: AbortSignal): Promise<ConfirmGate> {
    const { root, header, content, headerText } = SENTROWEB_SELECTORS.confirmModal;
    const seen = await pollUntil(
      async () => {
        const found = await this.page.evaluate(
          (rootSelector, headerSelector, contentSelector) => {
            const element = document.querySelector(rootSelector);
            if (!element) return null;
            return {
              header: (element.querySelector(headerSelector)?.textContent ?? '').replace(/\s+/g, ' ').trim(),
              content: (element.querySelector(contentSelector)?.textContent ?? '').replace(/\s+/g, ' ').trim(),
            };
          },
          root,
          header,
          content,
        );
        if (found && found.content) return { kind: 'modal' as const, modal: found };
        if (this.state.quota?.free) return { kind: 'free' as const };
        return null;
      },
      { timeoutMs: this.stepMs, signal, onTimeout: () => new SentrowebError('LAYOUT_CHANGED') },
    );
    if (seen.kind === 'free') return { kind: 'free' };
    if (!normalise(seen.modal.header).includes(headerText)) throw new SentrowebError('LAYOUT_CHANGED');
    const match = SENTROWEB_PATTERNS.creditCost.exec(seen.modal.content);
    // A modal we cannot read is not "1 credit(s)": treat it as an unexpected cost and cancel.
    return { kind: 'modal', cost: match ? Number.parseInt(match[1], 10) : -1 };
  }

  private async clickModalButton(rootSelector: string, buttonSelector: string): Promise<void> {
    const handle = await this.page.evaluateHandle(
      (root, button) => document.querySelector(root)?.querySelector(button) ?? null,
      rootSelector,
      buttonSelector,
    );
    const element = handle.asElement() as ElementHandle<Element> | null;
    if (!element) {
      await handle.dispose();
      throw new SentrowebError('LAYOUT_CHANGED');
    }
    try {
      await element.click();
    } finally {
      await element.dispose();
    }
  }

  /** Waits for the search response and the accordion titles, then returns the titles. */
  private async waitForResult(signal?: AbortSignal): Promise<string[]> {
    const { title } = SENTROWEB_SELECTORS.result;
    const readTitles = () =>
      this.page.$$eval(title, (elements) => elements.map((element) => (element.textContent ?? '').replace(/\s+/g, ' ').trim()));

    const fail = () => new SentrowebError('TIMEOUT', { searchSubmitted: true });
    await pollUntil(async () => (this.state.search !== null ? true : null), {
      timeoutMs: this.config.timeouts.resultMs,
      signal,
      onTimeout: fail,
      searchSubmitted: true,
    });
    // An HTTP error on the search call is not a result. Say so now instead of waiting it out.
    const answered = this.state.search as CapturedSearch | null;
    if (answered && (answered.status < 200 || answered.status >= 300)) {
      throw new SentrowebError(
        answered.status === 401 || answered.status === 403 ? 'SESSION_EXPIRED' : 'RESULT_MISMATCH',
        { searchSubmitted: true },
      );
    }
    // The titles come from the page itself. If the search call answered but the page never
    // shows them, the page has changed: that is not a timeout.
    const first = await pollUntil(
      async () => {
        const titles = await readTitles();
        return titles.length > 0 ? titles : null;
      },
      {
        timeoutMs: this.stepMs,
        signal,
        onTimeout: () => new SentrowebError('LAYOUT_CHANGED', { searchSubmitted: true }),
        searchSubmitted: true,
      },
    );
    // Let the accordion finish rendering, then take the final reading.
    await sleep(250);
    const second = await readTitles();
    return second.length >= first.length ? second : first;
  }

  private parseCaptured(captured: CapturedSearch | null): unknown {
    if (!captured || captured.status < 200 || captured.status >= 300 || captured.body === null) return null;
    try {
      return JSON.parse(captured.body) as unknown;
    } catch {
      return null;
    }
  }

  private async screenshotResult(): Promise<Buffer | null> {
    try {
      const area = await this.page.$(SENTROWEB_SELECTORS.result.area);
      if (!area) return null;
      try {
        return Buffer.from(await area.screenshot({ type: 'png' }));
      } finally {
        await area.dispose();
      }
    } catch {
      return null;
    }
  }

  /** EXPORT → the success box → the download link. Null when any step fails. */
  private async exportPdf(signal?: AbortSignal): Promise<Buffer | null> {
    const { exportButton, exportButtonText } = SENTROWEB_SELECTORS.search;
    const { root, successText, link } = SENTROWEB_SELECTORS.exportModal;
    try {
      await this.clearDownloadDir();
      const button = await this.page.evaluateHandle(
        (selector, text) =>
          Array.from(document.querySelectorAll(selector)).find(
            (element) => (element.textContent ?? '').replace(/\s+/g, ' ').trim().toUpperCase() === text,
          ) ?? null,
        exportButton,
        exportButtonText,
      );
      const buttonElement = button.asElement() as ElementHandle<Element> | null;
      if (!buttonElement) {
        await button.dispose();
        return null;
      }
      await buttonElement.click();
      await buttonElement.dispose();

      await pollUntil(
        async () =>
          this.page.evaluate(
            (rootSelector, text) => (document.querySelector(rootSelector)?.textContent ?? '').includes(text),
            root,
            successText,
          ),
        { timeoutMs: this.stepMs, signal, onTimeout: () => new SentrowebError('EVIDENCE_MISSING', { searchSubmitted: true }) },
      );

      const anchor = await this.page.$(link);
      if (!anchor) return null;
      await anchor.click();
      await anchor.dispose();

      return await this.readDownloadedPdf(signal);
    } catch {
      // The PDF is optional evidence here; the service decides what its absence means. This holds
      // for a run abort too: the result is already read, so it is returned (a match is never
      // thrown away) and the abort stops the run before the next search.
      return null;
    }
  }

  private async clearDownloadDir(): Promise<void> {
    for (const name of await readdir(this.downloadDir)) await unlink(path.join(this.downloadDir, name)).catch(() => undefined);
  }

  private async readDownloadedPdf(signal?: AbortSignal): Promise<Buffer | null> {
    let lastSize = -1;
    const file = await pollUntil(
      async () => {
        const names = (await readdir(this.downloadDir)).filter((name) => !name.endsWith('.crdownload'));
        for (const name of names) {
          const full = path.join(this.downloadDir, name);
          const size = (await stat(full)).size;
          if (size > 0 && size === lastSize) return full;
          lastSize = size;
        }
        return null;
      },
      { timeoutMs: this.stepMs, signal, onTimeout: () => new SentrowebError('EVIDENCE_MISSING', { searchSubmitted: true }) },
    );
    const data = await readFile(file);
    await unlink(file).catch(() => undefined);
    return data.subarray(0, 4).toString('latin1') === '%PDF' ? data : null;
  }

  // --- logout and shutdown -------------------------------------------------------------------

  private async logout(): Promise<void> {
    const { toggle, itemSelector, logoutText } = SENTROWEB_SELECTORS.menu;
    if (!this.isOnMainPage()) return;
    await this.page.click(toggle);
    await sleep(300);
    const handle = await this.page.evaluateHandle(
      (selector, text) =>
        Array.from(document.querySelectorAll(selector)).find(
          (element) => (element.textContent ?? '').replace(/\s+/g, ' ').trim() === text,
        ) ?? null,
      itemSelector,
      logoutText,
    );
    const element = handle.asElement() as ElementHandle<Element> | null;
    if (!element) {
      await handle.dispose();
      return;
    }
    await element.click();
    await element.dispose();
    await pollUntil(async () => this.isOnLoginPage(), {
      timeoutMs: CLOSE_STEP_TIMEOUT_MS,
      onTimeout: () => new SentrowebError('TIMEOUT'),
    });
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    try {
      await withTimeout(this.logout().catch(() => undefined), CLOSE_STEP_TIMEOUT_MS * 2);
    } catch {
      // Logging out is best effort; closing the incognito context drops the session anyway.
    }
    await shutdown(this.browser, this.context, this.downloadDir);
  }
}

async function shutdown(browser: Browser, context: BrowserContext | null, downloadDir: string): Promise<void> {
  const processHandle = browser.process();
  await withTimeout(context?.close().catch(() => undefined) ?? Promise.resolve(), CLOSE_STEP_TIMEOUT_MS);
  await withTimeout(browser.close().catch(() => undefined), CLOSE_STEP_TIMEOUT_MS);
  if (processHandle && processHandle.exitCode === null && !processHandle.killed) processHandle.kill('SIGKILL');
  await rm(downloadDir, { recursive: true, force: true }).catch(() => undefined);
}

/**
 * A fixed label for the few endpoints the client knows. Every other path is just `other`: a path
 * can carry an account id, a name or a report id of any length, so none of it is ever logged.
 */
function xhrLabel(pathname: string): string {
  for (const [label, endpoint] of Object.entries(SENTROWEB_XHR)) {
    if (pathname.endsWith(endpoint)) return label;
  }
  return 'other';
}

function pageLabel(pathname: string): string {
  const lower = pathname.toLowerCase();
  if (lower.startsWith(SENTROWEB_PATHS.mainPrefix.toLowerCase())) return 'main';
  if (lower.startsWith(SENTROWEB_PATHS.loginPrefix.toLowerCase())) return 'login';
  return 'other';
}

async function captureResponse(state: PageState, response: HTTPResponse): Promise<void> {
  try {
    const resourceType = response.request().resourceType();
    if (resourceType === 'xhr' || resourceType === 'fetch') {
      const label = xhrLabel(new URL(response.url()).pathname);
      state.recentCalls = [...state.recentCalls, `${response.request().method()} ${label} ${response.status()}`].slice(-8);
    }
    if (response.request().method() !== 'POST') return;
    const pathname = new URL(response.url()).pathname;
    if (pathname.endsWith(SENTROWEB_XHR.authenticate)) {
      state.authCount += 1;
      state.authStatus = response.status();
    } else if (pathname.endsWith(SENTROWEB_XHR.checkQuota)) {
      type QuotaBody = { deductCredit?: unknown; uniqueNames?: unknown };
      let parsed: QuotaBody | null;
      try {
        parsed = JSON.parse(await response.text()) as QuotaBody;
      } catch {
        parsed = null;
      }
      const deductCredit = typeof parsed?.deductCredit === 'boolean' ? parsed.deductCredit : null;
      const uniqueNames = Array.isArray(parsed?.uniqueNames) ? parsed.uniqueNames.length : null;
      state.quota = {
        status: response.status(),
        deductCredit,
        uniqueNames,
        free: response.status() === 200 && deductCredit === false && uniqueNames === 0,
      };
    } else if (pathname.endsWith(SENTROWEB_XHR.initializeApp)) {
      if (response.status() === 200) state.appInitialized = true;
    } else if (pathname.endsWith(SENTROWEB_XHR.search)) {
      let body: string | null = null;
      try {
        body = await response.text();
      } catch {
        body = null;
      }
      state.search = { status: response.status(), body };
    }
  } catch {
    // A response we cannot read is the same as no response; the result parser fails closed.
  }
}

export const sentrowebClient: SentrowebClient = {
  async openSession(config, options = {}) {
    throwIfAborted(options.signal);
    const puppeteer = await import('puppeteer-core');
    const executablePath = await findChromePath();
    const downloadDir = await mkdtemp(path.join(os.tmpdir(), 'oakcloud-sentroweb-'));

    let browser: Browser | null = null;
    let context: BrowserContext | null = null;
    try {
      browser = await puppeteer.default.launch({
        headless: true,
        executablePath,
        args: LAUNCH_ARGS,
        env: buildBrowserEnv(),
      });
      options.onBrowserLaunched?.(browser.process()?.pid);

      context = await browser.createBrowserContext({
        downloadBehavior: { policy: 'allowAndName', downloadPath: downloadDir },
      });
      const page = await context.newPage();
      page.setDefaultTimeout(config.timeouts.stepMs);
      page.setDefaultNavigationTimeout(config.timeouts.stepMs);
      await page.setViewport({ width: 1400, height: 1000 });

      const state: PageState = { authCount: 0, authStatus: null, search: null, appInitialized: false, quota: null, searchDispatched: false, quotaRequested: false, recentCalls: [] };
      page.on('request', (request) => {
        try {
          if (request.method() === 'POST') {
            const pathname = new URL(request.url()).pathname;
            if (pathname.endsWith(SENTROWEB_XHR.search)) state.searchDispatched = true;
            if (pathname.endsWith(SENTROWEB_XHR.checkQuota)) state.quotaRequested = true;
          }
        } catch {
          // An unreadable request is not the search request.
        }
      });
      page.on('response', (response) => {
        void captureResponse(state, response);
      });

      const session = new Session(config, browser, context, page, state, downloadDir);
      try {
        await session.login(options.signal);
        if (options.requiredCredits !== undefined && session.balance < options.requiredCredits) {
          throw new SentrowebError('INSUFFICIENT_CREDITS');
        }
      } catch (error) {
        await session.close();
        throw error;
      }
      return session;
    } catch (error) {
      if (browser) await shutdown(browser, context, downloadDir);
      else await rm(downloadDir, { recursive: true, force: true }).catch(() => undefined);
      throw error instanceof SentrowebError ? error : new SentrowebError('LAYOUT_CHANGED', { cause: error });
    }
  },
};
