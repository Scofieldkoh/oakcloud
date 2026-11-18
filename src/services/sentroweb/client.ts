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
  SENTROWEB_SEARCH_OPTIONS,
  type SentrowebConfig,
} from '@/lib/sentroweb/config';
import {
  SENTROWEB_PATHS,
  SENTROWEB_PATTERNS,
  SENTROWEB_SELECTORS,
  SENTROWEB_XHR,
} from '@/lib/sentroweb/selectors';
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
const CLOSE_STEP_TIMEOUT_MS = 5_000;

export interface SentrowebSearchRequest {
  name: string;
  searchType: SentrowebSearchTypeValue;
  /**
   * The most credits this search may cost. Defaults to the fixed 1 per search. With 0 the search
   * is cancelled at the confirm box (UNEXPECTED_CREDIT_COST) and only a free repeat goes through.
   */
  maxCredits?: number;
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
    await this.phase('type-name', async () => {
      await page.type(selectors.search.nameInput, request.name);
      // The name must still be what was typed (a late redraw of the form can clear it).
      const typed = await page.$eval(selectors.search.nameInput, (input) => (input as HTMLInputElement).value);
      if (typed !== request.name) throw new SentrowebError('LAYOUT_CHANGED');
    });
    await this.phase('tick-type', () => this.setSearchType(request.searchType, signal));
    await this.phase('submit-enabled', async () => {
      const typedAfter = await page.$eval(selectors.search.nameInput, (input) => (input as HTMLInputElement).value);
      if (typedAfter !== request.name) throw new SentrowebError('LAYOUT_CHANGED');
      await pollUntil(async () => (await page.$(selectors.search.submitEnabled)) !== null, {
        timeoutMs: this.stepMs,
        signal,
        onTimeout: () => new SentrowebError('LAYOUT_CHANGED'),
      });
    });
    await this.phase('click-search', () => page.click(selectors.search.submit));

    let gate: ConfirmGate;
    try {
      gate = await this.phase('confirm-modal', () => this.awaitConfirmOrFree(signal));
    } catch (error) {
      // If the page already sent the search (an automatic search whose quota answer we did not
      // accept, or an abort while waiting), it is submitted whatever we think of the answer: the
      // charge is unknown, and nothing may submit it again.
      if (state.searchDispatched) {
        throw new SentrowebError(error instanceof SentrowebError ? error.code : 'LAYOUT_CHANGED', {
          searchSubmitted: true,
        });
      }
      throw error;
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
        (checkboxSelector, submitSelector, inputSelector) => ({
          path: location.pathname,
          modals: Array.from(document.querySelectorAll('.modal')).map((element) => String(element.className)),
          checkboxes: Array.from(document.querySelectorAll(checkboxSelector)).map((element) => String(element.className)),
          submit: String(document.querySelector(submitSelector)?.className ?? 'none'),
          nameLength: (document.querySelector(inputSelector) as HTMLInputElement | null)?.value.length ?? -1,
        }),
        checkbox,
        submit,
        nameInput,
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

  /** Ticks exactly the wanted search type, with fuzzy matching off, and verifies the result. */
  private async setSearchType(searchType: SentrowebSearchTypeValue, signal?: AbortSignal): Promise<void> {
    const { individualLabelText, entityLabelText, fuzzyLabelText } = SENTROWEB_SELECTORS.search;
    const wantIndividual = searchType === 'INDIVIDUAL';
    const expected: Array<[string, boolean]> = [
      [wantIndividual ? individualLabelText : entityLabelText, true],
      [wantIndividual ? entityLabelText : individualLabelText, false],
      [fuzzyLabelText, SENTROWEB_SEARCH_OPTIONS.fuzzy],
    ];

    for (const [label, wanted] of expected) {
      throwIfAborted(signal);
      const states = await this.checkboxStates();
      const current = states.find((state) => state.label === label);
      if (!current) throw new SentrowebError('LAYOUT_CHANGED');
      // Re-read the box before every click, so a click that did register is never undone.
      for (let attempt = 0; attempt < CHECKBOX_ATTEMPTS; attempt += 1) {
        const now = (await this.checkboxStates()).find((state) => state.label === label);
        if (!now) throw new SentrowebError('LAYOUT_CHANGED');
        if (now.checked === wanted) break;
        await this.clickCheckboxLabel(label);
        await sleep(CHECKBOX_SETTLE_MS);
      }
    }

    const after = await this.checkboxStates();
    for (const [label, wanted] of expected) {
      const current = after.find((state) => state.label === label);
      if (!current || current.checked !== wanted) throw new SentrowebError('LAYOUT_CHANGED');
    }
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

      const state: PageState = { authCount: 0, authStatus: null, search: null, appInitialized: false, quota: null, searchDispatched: false, recentCalls: [] };
      page.on('request', (request) => {
        try {
          if (request.method() === 'POST' && new URL(request.url()).pathname.endsWith(SENTROWEB_XHR.search)) {
            state.searchDispatched = true;
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
