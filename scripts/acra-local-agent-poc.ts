/**
 * Local, attended ACRA Bizfile browser proof of concept.
 *
 * This intentionally DOES NOT automate login, declarations, payments, submission,
 * or company record updates. No credentials or browser storage leave this machine.
 *
 * Run: npx tsx scripts/acra-local-agent-poc.ts
 * Optional: ACRA_BIZFILE_URL=https://www.bizfile.gov.sg/ npx tsx scripts/acra-local-agent-poc.ts
 */
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { chromium } from 'playwright';

const DEFAULT_URL = 'https://www.bizfile.gov.sg/';
const allowedHosts = new Set(['www.bizfile.gov.sg', 'bizfile.gov.sg']);
const url = new URL(process.env.ACRA_BIZFILE_URL || DEFAULT_URL);

if (url.protocol !== 'https:' || !allowedHosts.has(url.hostname) || url.username || url.password) {
  throw new Error('Only the official ACRA Bizfile HTTPS host is permitted.');
}

async function main() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ acceptDownloads: false });
  const page = await context.newPage();
  const prompt = createInterface({ input: stdin, output: stdout });
  try {
    console.log('ACRA filing proof of concept: attended navigation only.');
    console.log('Log in manually. No filing will be submitted by this agent.');
    await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await prompt.question('After manually exploring Bizfile, press Enter to capture page metadata (no screenshots): ');
    const current = new URL(page.url());
    if (!allowedHosts.has(current.hostname)) {
      console.log('Current page is outside Bizfile; refusing to inspect it.');
      return;
    }
    console.log(JSON.stringify({
      host: current.hostname,
      path: current.pathname,
      title: await page.title(),
      inspectedAt: new Date().toISOString(),
    }, null, 2));
    console.log('No credentials, page content, form values, or session cookies were captured.');
    await prompt.question('Press Enter to close this isolated browser session: ');
  } finally {
    prompt.close();
    await context.close();
    await browser.close();
  }
}

main().catch(error => {
  console.error('Local agent failed:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
