// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fixtureNames, fixtureText, fixtureJson } from '../../helpers/sentroweb-fixtures';

const ROOT = path.resolve(__dirname, '../../..');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

describe('Sentroweb fixture hygiene', () => {
  it('has the expected recorded fixtures', () => {
    expect(fixtureNames()).toEqual([
      'confirm-modal.html',
      'export-modal.html',
      'login-form.html',
      'result-entity-clear.html',
      'result-entity-match.html',
      'result-individual-clear.html',
      'result-individual-match.html',
      'search-entity-clear.json',
      'search-entity-match.json',
      'search-individual-clear-name-only.json',
      'search-individual-clear-with-country.json',
      'search-individual-clear.json',
      'search-individual-match.json',
    ]);
  });

  it.each(fixtureNames())('%s holds no balance, token, account id or credentials', (name) => {
    const text = fixtureText(name);
    expect(text).not.toMatch(/Balance:/i);
    expect(text).not.toMatch(/authorization/i);
    expect(text).not.toMatch(/x-account-name/i);
    expect(text).not.toMatch(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/); // JWT
    expect(text).not.toMatch(/accountId=/i);
    expect(text).not.toMatch(/<input[^>]*name="(accountId|username|password)"[^>]*value="[^"]+"/i);
    expect(text).not.toMatch(/Search By/i);
    expect(text).not.toMatch(/JSESSIONID|csrf/i);
  });

  it('search fixtures name only the allowed test and public subjects', () => {
    const allowed = new Set([
      'Zzqx Testname Qwv Pte Ltd',
      'Zzqx Testname Qwv',
      'Vladimir Putin',
      'Rosneft Oil Company',
    ]);
    for (const name of fixtureNames().filter((n) => n.startsWith('search-'))) {
      const [payload] = fixtureJson<Array<{ name: string }>>(name);
      expect(allowed.has(payload.name), name).toBe(true);
    }
  });
});

describe('Sentroweb selector literals', () => {
  // The one place to fix when Sentroweb changes: nothing else may hard-code these.
  const forbiddenOutsideSelectors = [
    'search-title-div',
    'search-button',
    'search-result-div',
    'Search name',
    'checkquota',
    'screening/private/search',
    'auth/private/authenticate',
    'Credit Deduction',
    'modal-content',
    'screening-result-save-button',
    'Report Generation Success',
  ];

  it('are defined only in src/lib/sentroweb/selectors.ts', () => {
    const selectorsFile = path.join(ROOT, 'src/lib/sentroweb/selectors.ts');
    const files = [
      ...walk(path.join(ROOT, 'src/lib/sentroweb')),
      ...walk(path.join(ROOT, 'src/services/sentroweb')),
      ...walk(path.join(ROOT, 'src/app/api/companies')).filter((f) => f.includes('sentroweb')),
      ...walk(path.join(ROOT, 'src/components/companies')).filter((f) => /sentroweb|screening/i.test(f)),
    ].filter((file) => file !== selectorsFile);

    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      for (const literal of forbiddenOutsideSelectors) {
        if (text.includes(literal)) offenders.push(`${path.relative(ROOT, file)}: ${literal}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
