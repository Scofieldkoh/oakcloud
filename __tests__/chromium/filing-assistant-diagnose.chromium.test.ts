// @vitest-environment node
import type { Locator, Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fixtureHtml, launchWithExtension, type ExtensionSession } from '../helpers/filing-assistant-extension';

/**
 * The Filing Assistant's Diagnose tab (the input probe) against a React stand-in for a Bizfile form,
 * served at a routed bizfile.gov.sg address so the extension's real host rules apply. No request
 * leaves this machine. Run with `npm run test:chromium:filing-assistant`.
 */

const FIXTURE_URL = 'https://www.bizfile.gov.sg/probe-fixture/officers';

let session: ExtensionSession;
let page: Page;
let panel: Page;

async function formState(): Promise<Record<string, unknown>> {
  return JSON.parse((await page.locator('#state').textContent()) ?? '{}');
}

async function pick(field: Locator): Promise<void> {
  await panel.getByRole('button', { name: 'Pick a field in Bizfile' }).click();
  await expect.poll(() => panel.locator('#pick-status').textContent()).toContain('Click a field');
  await field.click();
  await panel.locator('#field-card').waitFor({ state: 'visible' });
  await expect.poll(() => panel.locator('#pick-status').textContent()).toBe('');
}

async function run(options: { strategy: string; value?: string; option?: string }): Promise<string | null> {
  if (options.value !== undefined) await panel.locator('#value').fill(options.value);
  if (options.option !== undefined) await panel.locator('#option').fill(options.option);
  await panel.locator('#strategy').selectOption(options.strategy);
  const results = panel.locator('#results li');
  const before = await results.count();
  await panel.locator('#run').click();
  await expect.poll(() => results.count(), { timeout: 15_000 }).toBe(before + 1);
  return results.first().getAttribute('data-verdict');
}

describe('Filing Assistant: Diagnose tab', () => {
  beforeAll(async () => {
    const html = await fixtureHtml('probe-fixture-app.tsx', 'Officer change (probe fixture)');
    session = await launchWithExtension();
    await session.context.route('https://www.bizfile.gov.sg/**', (route) => route.fulfill({ contentType: 'text/html', body: html }));
    page = await session.context.newPage();
    await page.goto(FIXTURE_URL);
    await page.locator('#state').waitFor();
    panel = await session.openPanel();
    await panel.getByRole('tab', { name: 'Diagnose' }).click();
  });

  afterAll(async () => {
    await session?.close();
  });

  it('scans the page without reading values and detects React', async () => {
    await panel.getByRole('button', { name: 'Scan page' }).click();
    const result = panel.locator('#scan-result');
    await expect.poll(() => result.textContent()).toContain('React');
    const text = (await result.textContent()) ?? '';
    expect(text).toContain('Change in company officers');
    expect(text).toMatch(/aria-labelledby 1/);
  });

  it('fills a controlled text field and the page state takes the value', async () => {
    await pick(page.locator('#full-name'));
    expect(await panel.locator('#kind').inputValue()).toBe('text');
    expect(await run({ strategy: 'set-value-events', value: 'Tan Ah Kow' })).toBe('kept');
    expect((await formState()).name).toBe('Tan Ah Kow');
  });

  it('reports a field that ignores non-genuine input as lost, and the editing command as kept', async () => {
    await pick(page.locator('#strict-id'));
    expect(await run({ strategy: 'set-value-events', value: 'S1234567D' })).toBe('lost');
    expect((await formState()).strict).toBe('');
    expect(await run({ strategy: 'insert-text-command', value: 'S7654321A' })).toBe('kept');
    expect((await formState()).strict).toBe('S7654321A');
  });

  it('types a masked date key by key', async () => {
    await pick(page.locator('#appointment-date'));
    expect(await panel.locator('#kind').inputValue()).toBe('date');
    expect(await run({ strategy: 'key-by-key', value: '01022026' })).toBe('kept');
    expect((await formState()).date).toBe('01/02/2026');
  });

  it('distinguishes dropdown methods: click() cannot open a mouse-down dropdown, full mouse events and keys can', async () => {
    await pick(page.getByRole('combobox', { name: 'Position held' }));
    expect(await panel.locator('#kind').inputValue()).toBe('combobox');
    expect(await run({ strategy: 'click', option: 'Director' })).toBe('not-applied');
    expect(await run({ strategy: 'pointer', option: 'Director' })).toBe('kept');
    expect((await formState()).position).toBe('Director');
    expect(await run({ strategy: 'keyboard', option: 'Secretary' })).toBe('kept');
    expect((await formState()).position).toBe('Secretary');
  });

  it('checks a radio button', async () => {
    await pick(page.getByRole('radio', { name: 'Foreigner' }));
    expect(await run({ strategy: 'click' })).toBe('kept');
    expect((await formState()).residency).toBe('foreign');
  });

  it('types into a search field and chooses the suggestion', async () => {
    await pick(page.locator('#nationality'));
    expect(await panel.locator('#kind').inputValue()).toBe('typeahead');
    expect(await run({ strategy: 'insert-text-command+pointer', value: 'Singa', option: 'Singapore Citizen' })).toBe('kept');
    expect((await formState()).nationality).toBe('Singapore Citizen');
  });

  it('refuses declarations and buttons, and clicks made while picking never reach the page', async () => {
    await pick(page.locator('#declaration'));
    await expect.poll(() => panel.locator('#field-blocked').textContent()).toMatch(/declaration/);
    expect(await panel.locator('#run').isDisabled()).toBe(true);

    await pick(page.getByRole('button', { name: 'Next' }));
    await expect.poll(() => panel.locator('#field-blocked').textContent()).toMatch(/never operated/);
    expect(await panel.locator('#run').isDisabled()).toBe(true);

    expect(await page.locator('#declaration').isChecked()).toBe(false);
    const state = await formState();
    expect(state.nextClicks).toBe(0);
    expect(state.submitClicks).toBe(0);
  });

  it('rechecks a field after the page changes it', async () => {
    const result = panel
      .locator('#results li')
      .filter({ has: panel.locator('.result-head strong', { hasText: /^Full name · / }) })
      .first();
    await result.getByRole('button', { name: 'Recheck' }).click();
    await expect.poll(() => result.textContent()).toMatch(/RecheckKept on/);

    await page.locator('#full-name').fill('Someone Else');
    await result.getByRole('button', { name: 'Recheck' }).click();
    await expect.poll(() => result.textContent()).toMatch(/RecheckLost on/);
  });
});
