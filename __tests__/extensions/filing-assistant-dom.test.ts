import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

/** The shape of globalThis.OakDom that these tests use. */
interface OakDomApi {
  STRATEGIES: Record<string, string[]>;
  labelInfo(el: Element): { name: string; source: string };
  groupName(el: Element): string;
  detectKind(el: Element): string;
  resolveField(el: Element): Element | null;
  blockReason(el: Element | null): string | null;
  readState(el: Element): Record<string, unknown>;
  describe(el: Element): Record<string, unknown>;
  relocate(doc: Document, descriptor: Record<string, unknown>): Element | null;
  applyStrategy(el: Element, kind: string, strategy: string, value: string, optionText?: string): Promise<string>;
  verdict(
    kind: string,
    expected: string,
    before: Record<string, unknown>,
    settled: Record<string, unknown>,
    signals: Record<string, unknown> | null,
  ): string;
}

const probe = (): OakDomApi => (globalThis as unknown as { OakDom: OakDomApi }).OakDom;
const byId = <T extends Element = HTMLElement>(id: string) => document.getElementById(id) as unknown as T;

beforeAll(() => {
  const source = readFileSync(path.resolve(__dirname, '../../extensions/oakcloud-filing-assistant/src/core/dom.js'), 'utf8');
  (0, eval)(source);
});

beforeEach(() => {
  document.body.innerHTML = `
    <label for="full-name">Full name</label><input id="full-name" name="fullName" />
    <span id="id-label">Identification number</span><input id="id-number" aria-labelledby="id-label" />
    <div class="row"><span>Postal code</span><div><input id="postal" /></div></div>
    <input id="appointed" placeholder="DD/MM/YYYY" />
    <div id="position" role="combobox" aria-expanded="false" tabindex="0">Select position</div>
    <input id="nationality" role="combobox" aria-autocomplete="list" />
    <select id="id-type"><option value="">Select</option><option value="nric">NRIC</option><option value="passport">Passport</option></select>
    <fieldset><legend>Residency status</legend>
      <label><input type="radio" name="residency" id="resident" value="resident" /> Singapore resident</label>
      <label><input type="radio" name="residency" id="foreign" value="foreign" /> Foreigner</label>
    </fieldset>
    <label><input type="checkbox" id="declaration" /> I declare that the information given is true</label>
    <button type="button" id="next"><span id="next-text">Next</span></button>
    <input type="password" id="secret" aria-label="Password" />
  `;
});

describe('labelInfo', () => {
  it('reports where each field name comes from', () => {
    const P = probe();
    expect(P.labelInfo(byId('full-name'))).toEqual({ name: 'Full name', source: 'label' });
    expect(P.labelInfo(byId('id-number'))).toEqual({ name: 'Identification number', source: 'aria-labelledby' });
    expect(P.labelInfo(byId('postal'))).toEqual({ name: 'Postal code', source: 'nearby-text' });
    expect(P.labelInfo(byId('appointed'))).toEqual({ name: 'DD/MM/YYYY', source: 'placeholder' });
    expect(P.labelInfo(byId('foreign'))).toEqual({ name: 'Foreigner', source: 'label' });
  });

  it('names the question a radio belongs to', () => {
    expect(probe().groupName(byId('resident'))).toBe('Residency status');
  });
});

describe('detectKind', () => {
  it('classifies the control types Bizfile uses', () => {
    const P = probe();
    expect(P.detectKind(byId('full-name'))).toBe('text');
    expect(P.detectKind(byId('appointed'))).toBe('date');
    expect(P.detectKind(byId('position'))).toBe('combobox');
    expect(P.detectKind(byId('nationality'))).toBe('typeahead');
    expect(P.detectKind(byId('id-type'))).toBe('native-select');
    expect(P.detectKind(byId('resident'))).toBe('radio');
    expect(P.detectKind(byId('declaration'))).toBe('checkbox');
  });
});

describe('resolveField and blockReason', () => {
  it('maps a click on a label or wrapper to its field', () => {
    const P = probe();
    expect(P.resolveField(document.querySelector('label[for="full-name"]')!)).toBe(byId('full-name'));
    expect(P.resolveField(byId('foreign').parentElement!)).toBe(byId('foreign'));
  });

  it('refuses buttons, declarations and passwords, even when picked through a child element', () => {
    const P = probe();
    expect(P.resolveField(byId('next-text'))).toBe(byId('next'));
    expect(P.blockReason(byId('next'))).toMatch(/never operated/);
    expect(P.blockReason(byId('declaration'))).toMatch(/declaration/);
    expect(P.blockReason(byId('secret'))).toMatch(/Password/);
    expect(P.blockReason(byId('full-name'))).toBeNull();
    expect(P.blockReason(byId('resident'))).toBeNull();
  });

  it('refuses a radio whose question looks like a declaration', () => {
    document.body.innerHTML = `<fieldset><legend>Do you confirm the particulars?</legend>
      <label><input type="radio" name="c" id="yes" /> Yes</label></fieldset>`;
    expect(probe().blockReason(byId('yes'))).toMatch(/declaration, filing or step control/);
  });
});

describe('fill methods', () => {
  it('sets a text value and sends input and change events', async () => {
    const P = probe();
    const field = byId<HTMLInputElement>('full-name');
    const events: string[] = [];
    field.addEventListener('input', () => events.push('input'));
    field.addEventListener('change', () => events.push('change'));
    await P.applyStrategy(field, 'text', 'set-value-events', 'Tan Ah Kow');
    expect(field.value).toBe('Tan Ah Kow');
    expect(events).toEqual(['input', 'change']);
  });

  it('types key by key, honouring a field that cancels some keys', async () => {
    const P = probe();
    const field = byId<HTMLInputElement>('appointed');
    field.addEventListener('keydown', (event) => {
      if (!/^\d$/.test(event.key)) event.preventDefault();
    });
    await P.applyStrategy(field, 'date', 'key-by-key', '01/02/2026');
    expect(field.value).toBe('01022026');
  });

  it('chooses a native option by its text', async () => {
    const select = byId<HTMLSelectElement>('id-type');
    await probe().applyStrategy(select, 'native-select', 'set-value-events', '', 'Passport');
    expect(select.value).toBe('passport');
  });

  it('rejects a method that does not belong to the control type', async () => {
    await expect(probe().applyStrategy(byId('full-name'), 'text', 'pointer', 'x')).rejects.toThrow(/Unknown method/);
  });
});

describe('verdict', () => {
  const connected = (extra: Record<string, unknown>) => ({ connected: true, errorText: '', ...extra });

  it('separates kept, lost, framework disagreement, new errors and inconclusive runs', () => {
    const P = probe();
    const before = connected({ value: '' });
    expect(P.verdict('text', 'Tan', before, connected({ value: 'Tan' }), null)).toBe('kept');
    expect(P.verdict('text', 'Tan', before, connected({ value: '' }), null)).toBe('lost');
    expect(P.verdict('text', 'Tan', before, connected({ value: 'Tan' }), { react: { value: '' } })).toBe('kept-dom-only');
    expect(P.verdict('text', 'Tan', before, connected({ value: 'Tan' }), { react: { value: 'Tan' } })).toBe('kept');
    expect(P.verdict('text', 'Tan', before, connected({ value: 'Tan', errorText: 'Invalid name' }), null)).toBe('error-shown');
    expect(P.verdict('text', 'Tan', connected({ value: 'Tan' }), connected({ value: 'Tan' }), null)).toBe('inconclusive');
  });

  it('accepts a reformatted date and a dropdown that shows the option in its box', () => {
    const P = probe();
    expect(P.verdict('date', '01022026', connected({ value: '' }), connected({ value: '01/02/2026' }), null)).toBe('kept');
    expect(
      P.verdict('combobox', 'Director', connected({ value: '', display: 'Select position' }), connected({ value: '', display: 'Director' }), {
        react: { componentValue: 'Director' },
      }),
    ).toBe('kept');
    expect(P.verdict('radio', '', connected({ checked: false }), connected({ checked: true }), { react: { checked: false } })).toBe('kept-dom-only');
  });
});

describe('readState', () => {
  it('reads a dropdown box without its open options or neighbouring fields', () => {
    document.body.innerHTML = `
      <form><input id="other" value="Director of something" />
        <div class="custom-select"><div id="pos" role="combobox">Select position</div>
          <ul role="listbox"><li role="option">Director</li><li role="option">Secretary</li></ul>
        </div>
      </form>`;
    const P = probe();
    const state = P.readState(byId('pos'));
    expect(state.display).toBe('Select position');
    expect(P.verdict('combobox', 'Director', { connected: true, errorText: '' }, state, null)).toBe('lost');
    expect(P.readState(byId('other')).display).toBe('');
  });
});

describe('relocate', () => {
  it('finds a re-rendered field by id, name or label', () => {
    const P = probe();
    const descriptor = P.describe(byId('foreign'));
    const original = byId('foreign');
    original.parentElement!.innerHTML = '<input type="radio" name="residency" value="foreign" /> Foreigner';
    const found = P.relocate(document, { ...descriptor, id: '' });
    expect(found).not.toBe(original);
    expect(found?.getAttribute('value')).toBe('foreign');
  });

  it('returns nothing when the field is gone', () => {
    const P = probe();
    const descriptor = P.describe(byId('full-name'));
    byId('full-name').remove();
    document.querySelector('label[for="full-name"]')!.remove();
    expect(P.relocate(document, descriptor)).toBeNull();
  });
});
