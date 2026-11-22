// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fixtureHtml, launchWithExtension, type ExtensionSession } from '../helpers/filing-assistant-extension';

/**
 * The OakCloud Filing Assistant end to end, against a React stand-in for Bizfile's appointment
 * screen and a fake OakCloud whose AI answers deterministically. Both are Playwright routes, so no
 * request leaves this machine. Run with `npm run test:chromium:filing-assistant`.
 */

const SCREEN = 'https://www.bizfile.gov.sg/registry/update-personnel/appoint-withdraw-position-holder-form';
const OAKCLOUD = 'https://oakcloud.test';
const DETAILS = {
  category: 'Individual',
  position: 'Director',
  appointmentDate: '2026-02-01',
  idNumber: 'S1234567D',
  name: 'Tan Ah Kow',
  email: 'tan@example.com',
  addressType: 'Local',
  postalCode: '123456',
};
const PERSONAL = /S1234567D|Tan Ah Kow|TAN AH KOW|tan@example\.com|KOH ZHI YONG/i;

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any;

let session: ExtensionSession;
let page: Page;
let panel: Page;
let tempDir: string;
const aiRequests: Json[] = [];

/** A deterministic stand-in for OakCloud's AI: matches fields by their labels. */
function fakeAi(body: Json): Json {
  const fields: Json[] = body.snapshot.fields;
  if (body.task === 'repair-step') {
    const field = fields.find((item) => item.kind === 'date');
    return { ref: field ? field.ref : null, kind: 'date', format: 'DD MMM YYYY', confidence: 0.86, reason: 'The date field is now labelled "Appointment date".' };
  }
  const rules: Record<string, (field: Json) => boolean> = {
    category: (field) => field.label === 'Category',
    position: (field) => field.placeholder === 'Select position',
    appointmentDate: (field) => /appointment/i.test(field.label),
    idNumber: (field) => /identification number/i.test(field.label),
    name: (field) => /^name/i.test(field.label),
    email: (field) => /email/i.test(field.label),
    addressType: (field) => field.label === 'Address type',
    postalCode: (field) => /postal code/i.test(field.label),
    foreignAddress1: (field) => /foreign address/i.test(field.label),
  };
  const steps = Object.entries(rules)
    .map(([key, rule]) => {
      const field = fields.find(rule);
      return field && { type: 'fill', key, ref: field.ref, kind: field.kind, format: key === 'appointmentDate' ? 'DD MMM YYYY' : null, confidence: 0.9, reason: 'Matched by label.' };
    })
    .filter(Boolean);
  return { steps, unmappedKeys: [], notes: 'Fake AI.' };
}

async function formState(): Promise<Json> {
  return JSON.parse((await page.locator('#state').textContent()) ?? '{}');
}

async function openScreen(variant?: string): Promise<void> {
  await page.goto(SCREEN + (variant ? '?variant=' + variant : ''));
  await page.locator('#state').waitFor();
}

async function tab(name: string): Promise<void> {
  await panel.getByRole('tab', { name, exact: true }).click();
}

const fillStatus = () => panel.locator('#fill-status').textContent();

async function startFilling(): Promise<void> {
  await tab('Fill');
  await panel.getByRole('button', { name: 'Start filling' }).click();
}

async function fillUntilDone(): Promise<string> {
  await startFilling();
  await expect.poll(fillStatus, { timeout: 60_000 }).toMatch(/Finished|Stopped/);
  return (await fillStatus()) ?? '';
}

const mapInfo = () =>
  panel.evaluate(() => {
    const map = (globalThis as Json).Panel.currentMap();
    return { version: map.version, sources: map.history.map((entry: Json) => entry.source), steps: map.screens[0]?.steps ?? [] };
  });

describe('OakCloud Filing Assistant', () => {
  beforeAll(async () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'filing-assistant-test-'));
    const html = await fixtureHtml('bizfile-appoint-app.tsx', 'Bizfile');
    session = await launchWithExtension({ extraHostPermissions: [OAKCLOUD + '/*'] });
    await session.context.route('https://www.bizfile.gov.sg/**', (route) => route.fulfill({ contentType: 'text/html', body: html }));
    await session.context.route(OAKCLOUD + '/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/filing-assistant/status') return route.fulfill({ json: { ok: true, user: 'Test User', aiAvailable: true } });
      if (url.pathname === '/api/filing-assistant/ai-proposals') {
        const body = route.request().postDataJSON();
        aiRequests.push(body);
        return route.fulfill({ json: { proposal: fakeAi(body) } });
      }
      return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>OakCloud</title><h1>OakCloud</h1>' });
    });
    page = await session.context.newPage();
    await openScreen();
    panel = await session.openPanel();
    await tab('Details');
    for (const [key, value] of Object.entries(DETAILS)) await panel.locator('#detail-' + key).fill(value);
  });

  afterAll(async () => {
    await session?.close();
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  });

  it('learns the screen by watching staff fill it once', async () => {
    await tab('Learn');
    await panel.getByRole('button', { name: 'Start watching' }).click();
    await expect.poll(() => panel.locator('#learn-status').textContent()).toContain('Watching');

    await page.getByRole('button', { name: '+ Add position holder' }).click();
    await page.getByRole('radio', { name: 'Individual' }).check();
    await page.getByPlaceholder('Select position').click();
    await page.getByText('Director', { exact: true }).click();
    await page.getByLabel('Date of appointment').fill('01 Feb 2026');
    await page.locator('#appoint-position-holder-card-1-individual-id-number').fill('S1234567D');
    await page.locator('#appoint-position-holder-card-1-individual-name').fill('TAN AH KOW');
    await page.locator('#appoint-position-holder-card-1-individual-email').fill('tan@example.com');
    await page.getByRole('button', { name: 'Save draft' }).click();

    await panel.getByRole('button', { name: 'Finish' }).click();
    await expect.poll(() => panel.locator('#learn-status').textContent()).toContain('Learned 7 steps');
    const proposal = (await panel.locator('#learn-proposal').textContent()) ?? '';
    expect(proposal).toContain('Click "+ Add position holder" when its fields are missing');
    expect(proposal).toContain('Category → "Category" (radio)');
    expect(proposal).toContain('Position held → "Select position" (combobox)');
    expect(proposal).toContain('Date of appointment → "Date of appointment" (date, DD MMM YYYY)');
    expect(proposal).toContain('Identification number → "Identification number" (text)');
    expect(proposal).toContain('(text, upper)');
    expect(proposal).toContain('Left to staff: Save draft');

    await panel.getByRole('button', { name: 'Save to screen map' }).click();
    await expect.poll(() => panel.locator('#learn-status').textContent()).toContain('version 1');
    expect((await mapInfo()).sources).toEqual(['demonstration']);
  });

  it('fills the screen from what it learned, verifies each field and leaves submission to staff', async () => {
    await openScreen();
    expect(await fillUntilDone()).toContain('Finished: 7 filled, 0 skipped');
    const state = await formState();
    expect(state.card).toMatchObject({ category: 'Individual', position: 'Director', appointmentDate: '01 Feb 2026', idNumber: 'S1234567D', name: 'TAN AH KOW', email: 'tan@example.com' });
    expect(state.clicks).toEqual({ back: 0, save: 0, review: 0 });
    expect((await mapInfo()).version).toBe(1);
  });

  it('finds a field whose id changed by its label, and saves the correction', async () => {
    await openScreen('renamed');
    expect(await fillUntilDone()).toContain('Finished: 7 filled');
    expect((await formState()).card.idNumber).toBe('S1234567D');
    expect(await panel.locator('#fill-steps').textContent()).toContain('Self-corrected');
    const info = await mapInfo();
    expect(info.version).toBe(2);
    expect(info.sources.at(-1)).toBe('auto-correction');
    const idStep = info.steps.find((step: Json) => step.key === 'idNumber');
    expect(idStep.locator.candidates[0].value).toBe('appoint-position-holder-card-{card}-person-id-no');
  });

  it('asks OakCloud’s AI when a field cannot be found, and changes the map only after approval', async () => {
    const oakcloud = await session.context.newPage();
    await oakcloud.goto(OAKCLOUD + '/');
    await tab('Settings');
    await panel.locator('#settings-origin').fill(OAKCLOUD);
    await panel.getByRole('button', { name: 'Connect' }).click();
    await expect.poll(() => panel.locator('#settings-status').textContent()).toContain('Connected as Test User');

    // This variant also restores the original ID-number id, so that field heals back by itself.
    await openScreen('relabelled');
    await startFilling();
    await panel.locator('#fill-ai-approve').waitFor({ timeout: 30_000 });
    expect(await fillStatus()).toContain('Paused at "Date of appointment"');
    expect((await mapInfo()).version).toBe(2); // nothing changes before staff approve
    const repair = aiRequests.find((request) => request.task === 'repair-step');
    expect(repair.step).toMatchObject({ key: 'appointmentDate', failure: 'not-found' });
    expect(JSON.stringify(repair)).not.toMatch(PERSONAL);

    await panel.locator('#fill-ai-approve').click();
    await expect.poll(fillStatus, { timeout: 60_000 }).toContain('Finished: 7 filled');
    expect((await formState()).card.appointmentDate).toBe('01 Feb 2026');
    const info = await mapInfo();
    expect(info.sources.slice(2)).toEqual(['ai-approved', 'auto-correction']);
    const dateStep = info.steps.find((step: Json) => step.key === 'appointmentDate');
    expect(dateStep.locator.candidates.map((candidate: Json) => candidate.value)).toEqual(
      expect.arrayContaining(['appointment-date-input', 'appoint-position-holder-card-{card}-position-held-{position-held}-date-of-appointment']),
    );
  });

  it('maps a screen with AI from structure only, and saves nothing until approved', async () => {
    const versionBefore = (await mapInfo()).version;
    await openScreen();
    await page.getByRole('button', { name: '+ Add position holder' }).click();
    await page.getByRole('radio', { name: 'Individual' }).check();
    await tab('Learn');
    await panel.getByRole('button', { name: 'Ask AI to map this screen' }).click();
    await expect.poll(() => panel.locator('#learn-status').textContent()).toContain('The AI proposed 7 steps');
    const request = aiRequests.find((item) => item.task === 'map-screen');
    expect(request.targets.map((target: Json) => target.key)).toContain('idNumber');
    expect(JSON.stringify(request)).not.toMatch(PERSONAL);
    expect(request.snapshot.actions.find((action: Json) => action.label === 'Review and confirm').allowed).toBe(false);
    await panel.getByRole('button', { name: 'Discard' }).click();
    expect((await mapInfo()).version).toBe(versionBefore);
  });

  it('explores the whole screen, finds what each option shows, and fills only what applies', async () => {
    const versionBefore = (await mapInfo()).version;
    await openScreen();
    await tab('Learn');
    await panel.getByRole('button', { name: 'Explore this screen' }).click();
    await expect.poll(() => panel.locator('#learn-status').textContent(), { timeout: 150_000 }).toMatch(/The AI mapped \d+ of \d+ fields/);

    const found = (await panel.locator('#learn-explore-result').textContent()) ?? '';
    expect(found).toContain('Reveal buttons: "+ Add position holder"');
    expect(found).toMatch(/Category = "Corporate" shows UEN, Entity name/);
    expect(found).toMatch(/Address type = "Local" shows Postal code/);
    expect(found).toMatch(/Address type = "Foreign" shows Foreign address line 1/);

    const proposal = (await panel.locator('#learn-proposal').textContent()) ?? '';
    expect(proposal).toContain('Identification number → "Identification number" (text) — only when Category is "Individual"');
    expect(proposal).toContain('Postal code → "Postal code" (text) — only when Address type is "Local"');
    expect(proposal).toContain('Foreign address line 1 → "Foreign address line 1" (text) — only when Address type is "Foreign"');
    expect(proposal).toContain('Fields found that the AI did not map');
    expect(proposal).toContain('"UEN" (text)');

    const request = aiRequests.filter((item) => item.task === 'map-screen').at(-1);
    expect(request.snapshot.fields.some((field: Json) => field.shownWhen)).toBe(true);
    expect(request.snapshot.fields.find((field: Json) => field.label === 'Select position').options).toEqual(['Director', 'Secretary', 'Chief Executive Officer', 'Auditor']);
    expect(JSON.stringify(request)).not.toMatch(PERSONAL);
    expect((await formState()).clicks).toEqual({ back: 0, save: 0, review: 0 });

    await panel.getByRole('button', { name: 'Save to screen map' }).click();
    await expect.poll(() => panel.locator('#learn-status').textContent()).toContain('Saved as screen map version');
    const info = await mapInfo();
    expect(info.version).toBe(versionBefore + 1);
    expect(info.steps.find((step: Json) => step.key === 'postalCode').conditions).toEqual([{ key: 'addressType', equalsAny: ['Local'], label: 'Address type' }]);

    await openScreen();
    expect(await fillUntilDone()).toMatch(/Finished: \d+ filled/);
    const state = await formState();
    expect(state.card).toMatchObject({ category: 'Individual', idNumber: 'S1234567D', addressType: 'Local', postalCode: '123456', foreignAddress1: '' });
    expect(await panel.locator('#fill-steps').textContent()).toContain('Not needed for these details: only shown when Address type is "Foreign"');
    expect(state.clicks).toEqual({ back: 0, save: 0, review: 0 });
  }, 240_000);

  it('learns how an SGDS-style dropdown opens, and finds the option by typing when there is no chevron', async () => {
    await openScreen('sgds');
    await page.getByRole('button', { name: '+ Add position holder' }).click();
    await tab('Learn');
    await panel.getByRole('button', { name: 'Start watching' }).click();
    await expect.poll(() => panel.locator('#learn-status').textContent()).toContain('Watching');
    await page.locator('.chevron').click();
    await page.getByRole('button', { name: 'Director', exact: true }).click();
    await panel.getByRole('button', { name: 'Finish' }).click();
    await expect.poll(() => panel.locator('#learn-status').textContent()).toContain('Learned 1 step.');
    expect(await panel.locator('#learn-proposal').textContent()).toContain('Position held → "Select position" (combobox)');
    await panel.getByRole('button', { name: 'Save to screen map' }).click();
    await expect.poll(() => panel.locator('#learn-status').textContent()).toContain('Saved as screen map version');

    const info = await mapInfo();
    const position = info.steps.find((step: Json) => step.key === 'position');
    expect(position.dropdown.opener).toEqual({ relation: 'wrapper-descendant', signature: { tag: 'span', role: '', classes: ['form-control-icon', 'chevron'] } });
    expect(position.dropdown.option.classes).toContain('dropdown-item');
    expect(info.steps.some((step: Json) => step.type === 'action')).toBe(true); // re-learning one field kept the rest

    for (const variant of ['sgds', 'typing']) {
      await openScreen(variant);
      expect(await fillUntilDone()).toMatch(/Finished: \d+ filled/);
      const state = await formState();
      expect(state.card.position).toBe('Director');
      expect(state.clicks).toEqual({ back: 0, save: 0, review: 0 });
    }
  }, 180_000);

  it('switches the date format itself when Bizfile rejects the learned one', async () => {
    const versionBefore = (await mapInfo()).version;
    await openScreen('slashdates');
    expect(await fillUntilDone()).toMatch(/Finished: \d+ filled/);
    expect((await formState()).card.appointmentDate).toBe('01/02/2026');
    expect(await panel.locator('#fill-steps').textContent()).toContain('accepted "DD/MM/YYYY"');
    const info = await mapInfo();
    expect(info.version).toBeGreaterThan(versionBefore);
    expect(info.sources.at(-1)).toBe('auto-correction');
    expect(info.steps.find((step: Json) => step.key === 'appointmentDate').format).toBe('DD/MM/YYYY');
  });

  it('pauses as soon as staff click on the Bizfile page, and resumes when asked', async () => {
    await openScreen('slashdates');
    await startFilling();
    await panel.locator('#fill-steps li[data-status="done"]').first().waitFor({ timeout: 20_000 });
    await page.locator('h1').click();
    await expect.poll(fillStatus).toContain('Paused because you used the Bizfile page');
    const doneWhilePaused = await panel.locator('#fill-steps li[data-status="done"]').count();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(await panel.locator('#fill-steps li[data-status="done"]').count()).toBeLessThanOrEqual(doneWhilePaused + 1);
    await panel.getByRole('button', { name: 'Resume' }).click();
    await expect.poll(fillStatus, { timeout: 60_000 }).toMatch(/Finished: \d+ filled/);
  });

  it('refuses to click a submission button even when a screen map tells it to', async () => {
    const map = await panel.evaluate(() => (globalThis as Json).Panel.currentMap());
    map.screens[0].steps.unshift({
      id: 'a-review-and-confirm',
      type: 'action',
      label: 'Review and confirm',
      locator: { kind: 'action', tag: 'button', label: 'Review and confirm', section: '', candidates: [{ by: 'action', value: 'Review and confirm', section: '' }] },
    });
    const file = path.join(tempDir, 'tampered-map.json');
    writeFileSync(file, JSON.stringify(map));
    await tab('Screen maps');
    panel.once('dialog', (dialog) => dialog.accept());
    await panel.locator('#maps-import').setInputFiles(file);
    await expect.poll(() => panel.locator('#maps-status').textContent()).toContain('Imported');

    await openScreen();
    await startFilling();
    const decision = panel.locator('#fill-decision');
    await decision.waitFor({ state: 'visible', timeout: 20_000 });
    expect(await decision.textContent()).toMatch(/"Review and confirm" is a button the assistant never clicks/);
    await decision.getByRole('button', { name: 'Stop' }).click();
    await expect.poll(fillStatus).toContain('Stopped');
    expect((await formState()).clicks).toEqual({ back: 0, save: 0, review: 0 });
  });
});
