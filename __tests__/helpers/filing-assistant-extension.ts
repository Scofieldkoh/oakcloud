import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium, type BrowserContext, type Page } from 'playwright';

/**
 * Launches Chromium with the OakCloud Filing Assistant extension loaded, for the Chromium tests.
 * Pages are served by Playwright routes, so no request leaves the machine. Set BROWSER_TEST_CHROMIUM
 * when Playwright's pinned browser is not installed.
 */

export const EXTENSION_SOURCE = path.resolve(__dirname, '../../extensions/oakcloud-filing-assistant');
export const FIXTURES = path.resolve(__dirname, '../fixtures/filing-assistant');

export interface ExtensionSession {
  context: BrowserContext;
  extensionId: string;
  openPanel(): Promise<Page>;
  close(): Promise<void>;
}

/** Bundles a React fixture into a self-contained HTML page. */
export async function fixtureHtml(entry: string, title: string): Promise<string> {
  const bundle = await build({
    entryPoints: [path.join(FIXTURES, entry)],
    bundle: true,
    write: false,
    format: 'iife',
    jsx: 'automatic',
    minify: true,
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  const script = bundle.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body><div id="root"></div><script>${script}</script></body></html>`;
}

/**
 * extraHostPermissions are added to a copy of the manifest, standing in for a site staff have
 * already granted (Chrome cannot show its permission prompt in a headless test).
 */
export async function launchWithExtension(options: { extraHostPermissions?: string[] } = {}): Promise<ExtensionSession> {
  const workDir = mkdtempSync(path.join(os.tmpdir(), 'filing-assistant-'));
  const extensionDir = path.join(workDir, 'extension');
  cpSync(EXTENSION_SOURCE, extensionDir, { recursive: true });
  if (options.extraHostPermissions?.length) {
    const manifestPath = path.join(extensionDir, 'manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifest.host_permissions = [...manifest.host_permissions, ...options.extraHostPermissions];
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  }
  const context = await chromium.launchPersistentContext(path.join(workDir, 'profile'), {
    headless: true,
    executablePath: process.env.BROWSER_TEST_CHROMIUM || undefined,
    args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`],
  });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const extensionId = new URL(worker.url()).host;
  return {
    context,
    extensionId,
    async openPanel() {
      const panel = await context.newPage();
      await panel.goto(`chrome-extension://${extensionId}/src/panel/sidepanel.html`);
      await panel.waitForFunction(() => document.getElementById('target')?.textContent?.includes('bizfile.gov.sg'));
      return panel;
    },
    async close() {
      await context.close();
      rmSync(workDir, { recursive: true, force: true });
    },
  };
}
