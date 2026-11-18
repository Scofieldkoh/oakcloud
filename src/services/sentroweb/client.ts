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
const CLOSE_STEP_TIMEOUT_MS = 5_000;

export interface SentrowebSearchRequest {
  name: string;
  searchType: SentrowebSearchTypeValue;
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

interface PageState {
  authCount: number;
  authStatus: number | null;
  search: CapturedSearch | null;
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

  private async readBalance(signal?: AbortSignal): Promise<number> {
    const text = await pollUntil(
      async () => {
        const body = await this.page.evaluate(() => document.body?.innerText ?? '');
        return SENTROWEB_PATTERNS.balance.test(body) ? body : null;
      },
      { timeoutMs: this.stepMs, signal, onTimeout: () => new SentrowebError('LAYOUT_CHANGED') },
    );
    const match = SENTROWEB_PATTERNS.balance.exec(text);
    const balance = match ? Number.parseInt(match[1].replace(/,/g, ''), 10) : Number.NaN;
    if (!Number.isFinite(balance) || balance < 0) throw new SentrowebError('LAYOUT_CHANGED');
    return balance;
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
    await this.openSearchForm(signal);
    state.search = null;

    await page.type(selectors.search.nameInput, request.name);
    await this.setSearchType(request.searchType, signal);
    await pollUntil(async () => (await page.$(selectors.search.submitEnabled)) !== null, {
      timeoutMs: this.stepMs,
      signal,
      onTimeout: () => new SentrowebError('LAYOUT_CHANGED'),
    });
    await page.click(selectors.search.submit);

    const cost = await this.readConfirmCost(signal);
    if (cost !== SENTROWEB_CREDITS_PER_SEARCH) {
      await this.clickModalButton(selectors.confirmModal.root, selectors.confirmModal.cancel).catch(() => undefined);
      throw new SentrowebError('UNEXPECTED_CREDIT_COST');
    }

    // The credit may be spent from the very next instruction on.
    const submitted = { searchSubmitted: true };
    try {
      await this.clickModalButton(selectors.confirmModal.root, selectors.confirmModal.confirm);
    } catch (error) {
      throw error instanceof SentrowebError
        ? new SentrowebError(error.code, submitted)
        : new SentrowebError('LAYOUT_CHANGED', submitted);
    }
    log.info('Sentroweb search: confirmed');

    try {
      const domTitles = await this.waitForResult(signal);
      const captured = state.search as CapturedSearch | null;
      const json = this.parseCaptured(captured);
      const png = await this.screenshotResult();
      const pdf = await this.exportPdf(signal);
      return { json, domTitles, pdf, png };
    } catch (error) {
      // From CONFIRM on, every failure carries the flag so nothing submits this search again.
      throw error instanceof SentrowebError
        ? error.searchSubmitted
          ? error
          : new SentrowebError(error.code, submitted)
        : new SentrowebError('LAYOUT_CHANGED', submitted);
    }
  }

  private async openSearchForm(signal?: AbortSignal): Promise<void> {
    const { page } = this;
    const open = async () => {
      await this.goto(SENTROWEB_PATHS.search, signal);
      if (this.isOnLoginPage()) return false;
      await pollUntil(async () => (await page.$(SENTROWEB_SELECTORS.search.nameInput)) !== null || this.isOnLoginPage(), {
        timeoutMs: this.stepMs,
        signal,
        onTimeout: () => new SentrowebError('LAYOUT_CHANGED'),
      });
      return !this.isOnLoginPage();
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
      if (current.checked !== wanted) {
        await this.clickCheckboxLabel(label);
        await sleep(100);
      }
    }

    const after = await this.checkboxStates();
    for (const [label, wanted] of expected) {
      const current = after.find((state) => state.label === label);
      if (!current || current.checked !== wanted) throw new SentrowebError('LAYOUT_CHANGED');
    }
  }

  private async readConfirmCost(signal?: AbortSignal): Promise<number> {
    const { root, header, content, headerText } = SENTROWEB_SELECTORS.confirmModal;
    const modal = await pollUntil(
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
        return found && found.content ? found : null;
      },
      { timeoutMs: this.stepMs, signal, onTimeout: () => new SentrowebError('LAYOUT_CHANGED') },
    );
    if (!normalise(modal.header).includes(headerText)) throw new SentrowebError('LAYOUT_CHANGED');
    const match = SENTROWEB_PATTERNS.creditCost.exec(modal.content);
    // A modal we cannot read is not "1 credit(s)": treat it as an unexpected cost and cancel.
    return match ? Number.parseInt(match[1], 10) : -1;
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
      if (signal?.aborted) throw new SentrowebError('TIMEOUT', { searchSubmitted: true });
      // The PDF is optional evidence here; the service decides what its absence means.
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

async function captureResponse(state: PageState, response: HTTPResponse): Promise<void> {
  try {
    if (response.request().method() !== 'POST') return;
    const pathname = new URL(response.url()).pathname;
    if (pathname.endsWith(SENTROWEB_XHR.authenticate)) {
      state.authCount += 1;
      state.authStatus = response.status();
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

      const state: PageState = { authCount: 0, authStatus: null, search: null };
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
