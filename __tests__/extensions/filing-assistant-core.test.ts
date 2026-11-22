import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Api = any;
const g = globalThis as unknown as Record<string, Api>;
const CORE = ['dom', 'formats', 'schemas', 'locator', 'snapshot', 'playbook', 'recorder', 'runner', 'explorer'];
const byId = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const originalRects = Element.prototype.getClientRects;

beforeAll(() => {
  for (const name of CORE) {
    (0, eval)(readFileSync(path.resolve(__dirname, '../../extensions/oakcloud-filing-assistant/src/core', name + '.js'), 'utf8'));
  }
  // jsdom has no layout; treat every element as drawn so visibility checks pass.
  Element.prototype.getClientRects = function () {
    return [{ width: 10, height: 10 }] as unknown as DOMRectList;
  };
});

afterAll(() => {
  Element.prototype.getClientRects = originalRects;
});

/** A small stand-in for Bizfile's appointment card. */
function card(options: { idNumberId?: string; dateLabel?: string } = {}) {
  document.body.innerHTML = `
    <h2>Appoint position holder</h2>
    <button type="button" id="add">+ Add position holder</button>
    <fieldset><legend>Category</legend>
      <label><input type="radio" name="" id="0b6b1f8e-2f4c-4b8e-9d3a-1c2b3d4e5f60" /><span class="sr-only">Individual</span> Individual</label>
      <label><input type="radio" name="" id="1b6b1f8e-2f4c-4b8e-9d3a-1c2b3d4e5f61" /><span class="sr-only">Corporate</span> Corporate</label>
    </fieldset>
    <div class="field"><input id="position" placeholder="Select position" readonly /></div>
    <div class="field"><label for="appoint-position-holder-card-1-position-held-1-date-of-appointment">${options.dateLabel || 'Date of appointment'}</label>
      <input id="appoint-position-holder-card-1-position-held-1-date-of-appointment" name="appoint-position-holder-card-1-position-held-1-date-of-appointment" /></div>
    <div class="field"><div class="label">Identification number</div><input id="${options.idNumberId || 'appoint-position-holder-card-1-individual-id-number'}" name="text-input" /></div>
    <div class="field"><div class="label">Name (As per NRIC/Identification document)</div><input id="appoint-position-holder-card-1-individual-name" name="text-input" /></div>
    <h2>Withdraw position holder</h2>
    <button type="button" id="save">Save draft</button>
    <button type="button" id="review">Review and confirm</button>`;
}

beforeEach(() => card());

describe('OakDom additions', () => {
  it('collapses doubled labels, treats "Select ..." inputs as dropdowns and allows only add or reveal buttons', () => {
    const D = g.OakDom;
    expect(D.labelInfo(byId('0b6b1f8e-2f4c-4b8e-9d3a-1c2b3d4e5f60')).name).toBe('Individual');
    expect(D.detectKind(byId('position'))).toBe('combobox');
    expect(D.actionBlockReason(byId('add'))).toBeNull();
    expect(D.actionBlockReason(byId('save'))).toMatch(/never clicks/);
    expect(D.actionBlockReason(byId('review'))).toMatch(/never clicks/);
    const expand = document.createElement('button');
    expand.textContent = 'Expand all';
    expect(D.actionBlockReason(expand)).toBeNull();
    const withdraw = document.createElement('button');
    withdraw.textContent = 'Withdraw';
    expect(D.actionBlockReason(withdraw)).toMatch(/never clicks/);
    const other = document.createElement('button');
    other.textContent = 'Retrieve address';
    expect(D.actionBlockReason(other)).toMatch(/left to staff/);
  });
});

describe('OakFormats', () => {
  it('formats and recognises the date formats Bizfile may use', () => {
    const F = g.OakFormats;
    expect(F.formatDate('2026-02-01', 'DD MMM YYYY')).toBe('01 Feb 2026');
    expect(F.formatDate('2026-02-01', 'DD/MM/YYYY')).toBe('01/02/2026');
    expect(F.formatDate('2026-02-30', 'DD MMM YYYY')).toBeNull();
    expect(F.detectDateFormat('01 feb 2026', '2026-02-01')).toBe('DD MMM YYYY');
    expect(F.matchValue('01/02/2026', '2026-02-01', 'date')).toEqual({ match: true, format: 'DD/MM/YYYY' });
    expect(F.matchValue('TAN AH KOW', 'Tan Ah Kow', 'text')).toEqual({ match: true, format: 'upper' });
    expect(F.matchValue('+65 9123 4567', '6591234567', 'phone')).toEqual({ match: true, format: 'digits' });
    expect(F.matchValue('S1234567D', 'S7654321A', 'text')).toEqual({ match: false });
  });
});

describe('OakLocator', () => {
  it('keeps stable ids as templates, skips random ids and shared names, and records labels', () => {
    const L = g.OakLocator;
    const idNumber = L.buildLocator(byId('appoint-position-holder-card-1-individual-id-number'));
    expect(idNumber.candidates[0]).toEqual({ by: 'id', value: 'appoint-position-holder-card-{card}-individual-id-number' });
    expect(idNumber.candidates.some((candidate: { by: string }) => candidate.by === 'name')).toBe(false);
    expect(idNumber.candidates[1]).toMatchObject({ by: 'label', value: 'Identification number', section: 'Appoint position holder' });
    const radio = L.buildLocator(byId('0b6b1f8e-2f4c-4b8e-9d3a-1c2b3d4e5f60'));
    expect(radio.candidates).toEqual([{ by: 'group', value: 'Category', section: 'Appoint position holder' }]);
    expect(L.templateId('input-foreign-address-line-1')).toBe('input-foreign-address-line-1');
  });

  it('takes the newest card when a templated id matches several', () => {
    const L = g.OakLocator;
    const locator = L.buildLocator(byId('appoint-position-holder-card-1-individual-id-number'));
    const second = document.createElement('input');
    second.id = 'appoint-position-holder-card-2-individual-id-number';
    document.body.append(second);
    expect(L.resolve(document, locator).el).toBe(second);
  });

  it('heals by label when the id changes, and fails closed when two fields match', () => {
    const L = g.OakLocator;
    const locator = L.buildLocator(byId('appoint-position-holder-card-1-individual-id-number'));
    card({ idNumberId: 'appoint-position-holder-card-1-person-id-no' });
    const found = L.resolve(document, locator);
    expect(found.el).toBe(byId('appoint-position-holder-card-1-person-id-no'));
    expect(found.via).toBe(1);
    const refreshed = L.refresh(locator, found.el);
    expect(refreshed.candidates[0]).toEqual({ by: 'id', value: 'appoint-position-holder-card-{card}-person-id-no' });
    expect(refreshed.candidates.map((candidate: { by: string }) => candidate.by)).toContain('label');

    const duplicate = document.createElement('div');
    duplicate.innerHTML = '<div class="label">Identification number</div><input />';
    byId('appoint-position-holder-card-1-person-id-no').parentElement!.after(duplicate);
    const ambiguous = L.resolve(document, { ...locator, candidates: [locator.candidates[1]] });
    expect(ambiguous).toMatchObject({ el: null, ambiguous: true });
  });

  it('finds a radio group by its question', () => {
    const L = g.OakLocator;
    const found = L.resolve(document, L.buildLocator(byId('1b6b1f8e-2f4c-4b8e-9d3a-1c2b3d4e5f61')));
    expect(found.group).toHaveLength(2);
  });
});

describe('OakSnapshot', () => {
  it('describes structure only, groups radios, and flags which buttons may be clicked', () => {
    byId<HTMLInputElement>('appoint-position-holder-card-1-individual-id-number').value = 'S1234567D';
    const { snapshot, registry } = g.OakSnapshot.take(document);
    expect(JSON.stringify(snapshot)).not.toContain('S1234567D');
    const category = snapshot.fields.find((field: { label: string }) => field.label === 'Category');
    expect(category.options).toEqual(['Individual', 'Corporate']);
    expect(snapshot.fields.find((field: { label: string }) => field.label === 'Identification number').hasValue).toBe(true);
    expect(snapshot.actions.map((action: { label: string; allowed: boolean }) => [action.label, action.allowed])).toEqual([
      ['+ Add position holder', true],
      ['Save draft', false],
      ['Review and confirm', false],
    ]);
    expect(registry.get(category.ref)).toBe(byId('0b6b1f8e-2f4c-4b8e-9d3a-1c2b3d4e5f60'));
  });

  it('reports fields added or removed since a screen was learned', () => {
    const before = g.OakSnapshot.take(document).snapshot.fingerprint;
    card({ dateLabel: 'Appointment date' });
    const after = g.OakSnapshot.take(document).snapshot.fingerprint;
    expect(g.OakSnapshot.compare(before, after)).toMatchObject({ changed: true, added: ['Appointment date'], removed: ['Date of appointment'] });
  });
});

describe('OakPlaybook', () => {
  it('versions every change and records who made it', () => {
    const B = g.OakPlaybook;
    const locator = g.OakLocator.buildLocator(byId('appoint-position-holder-card-1-individual-id-number'));
    let map = B.create('appoint-position-holder');
    map = B.putScreen(map, { path: '/form', steps: [{ type: 'fill', key: 'idNumber', kind: 'text', method: 'set-value-events', format: null, locator }] }, { source: 'demonstration', summary: 'learned' });
    expect(map.version).toBe(1);
    expect(map.screens[0].steps[0].id).toBe('s-idNumber');
    const next = B.updateStep(map, '/form', 's-idNumber', { method: 'key-by-key' }, { source: 'auto-correction', summary: 'method' });
    expect(next.version).toBe(2);
    expect(map.screens[0].steps[0].method).toBe('set-value-events');
    expect(next.history.map((entry: { source: string }) => entry.source)).toEqual(['demonstration', 'auto-correction']);
    expect(B.validate(next)).toEqual([]);
    expect(() => B.change(next, () => {}, { source: 'robot', summary: '' })).toThrow(/Unknown change source/);
    expect(B.validate({ ...next, screens: [{ path: '/form', steps: [{ type: 'fill', kind: 'text', locator: { candidates: [] } }] }] })).toHaveLength(2);
  });
});

describe('OakPlaybook.mergeSteps', () => {
  it('replaces re-learned steps in place, keeps the rest and puts new reveal buttons first', () => {
    const B = g.OakPlaybook;
    const existing = [
      { id: 'a-add', type: 'action', label: 'Add position holder' },
      { id: 's-category', type: 'fill', key: 'category', method: 'click' },
      { id: 's-position', type: 'fill', key: 'position', method: 'pointer' },
    ];
    const merged = B.mergeSteps(existing, [
      { type: 'fill', key: 'position', method: 'keyboard' },
      { type: 'fill', key: 'email', method: 'set-value-events' },
      { type: 'action', label: 'Expand all' },
    ]);
    expect(merged.map((step: { id?: string; key?: string; label?: string }) => step.key || step.label)).toEqual(['Expand all', 'Add position holder', 'category', 'position', 'email']);
    expect(merged[3]).toMatchObject({ id: 's-position', method: 'keyboard' });
  });
});

describe('OakRunner.conditionsHold', () => {
  const step = { conditions: [{ key: 'addressType', equalsAny: ['Local', 'SG'], label: 'Address type' }] };
  it('lets a conditional step run only for matching filing details', () => {
    const R = g.OakRunner;
    expect(R.conditionsHold(step, { addressType: 'local' })).toBeNull();
    expect(R.conditionsHold(step, { addressType: 'SG' })).toBeNull();
    expect(R.conditionsHold(step, { addressType: 'Foreign' })).toMatch(/only shown when Address type is "Local"/);
    expect(R.conditionsHold(step, {})).toMatch(/that detail is empty/);
    expect(R.conditionsHold({}, {})).toBeNull();
  });
});

describe('OakRecorder.matchKeys', () => {
  it('matches what staff entered to filing-details keys', () => {
    const R = g.OakRecorder;
    const payload = { category: 'Individual', position: 'Director', appointmentDate: '2026-02-01', idNumber: 'S1234567D', name: 'Tan Ah Kow' };
    expect(R.matchKeys('appoint-position-holder', payload, '01 Feb 2026')).toEqual([{ key: 'appointmentDate', format: 'DD MMM YYYY', valueMap: null }]);
    expect(R.matchKeys('appoint-position-holder', payload, 'TAN AH KOW')).toEqual([{ key: 'name', format: 'upper', valueMap: null }]);
    expect(R.matchKeys('appoint-position-holder', payload, 'Director (Executive)')).toEqual([{ key: 'position', format: null, valueMap: { Director: 'Director (Executive)' } }]);
    expect(R.matchKeys('appoint-position-holder', payload, 'nothing like it')).toEqual([]);
  });
});

describe('OakRunner', () => {
  const payload = { appointmentDate: '2026-02-01', idNumber: 'S1234567D', category: 'Corporate' };

  function stepFor(id: string, key: string, kind: string, extra: Record<string, unknown> = {}) {
    return { id: 's-' + key, type: 'fill', key, kind, method: 'set-value-events', format: null, locator: g.OakLocator.buildLocator(byId(id)), ...extra };
  }

  it('fills, verifies, and reports a healed locator as a correction', async () => {
    const step = stepFor('appoint-position-holder-card-1-individual-id-number', 'idNumber', 'text');
    card({ idNumberId: 'appoint-position-holder-card-1-person-id-no' });
    const result = await g.OakRunner.runStep(document, step, payload, null);
    expect(result).toMatchObject({ status: 'done', method: 'set-value-events' });
    expect(byId<HTMLInputElement>('appoint-position-holder-card-1-person-id-no').value).toBe('S1234567D');
    expect(result.corrections[0]).toMatchObject({ type: 'locator' });
    expect(result.corrections[0].patch.locator.candidates[0].value).toBe('appoint-position-holder-card-{card}-person-id-no');
  });

  it('switches date format when the page rejects the learned one', async () => {
    const dateId = 'appoint-position-holder-card-1-position-held-1-date-of-appointment';
    const input = byId<HTMLInputElement>(dateId);
    input.setAttribute('aria-describedby', 'date-error');
    const message = document.createElement('p');
    message.id = 'date-error';
    input.after(message);
    // The page accepts only DD/MM/YYYY and says so otherwise.
    input.addEventListener('blur', () => {
      message.textContent = /^\d{2}\/\d{2}\/\d{4}$/.test(input.value) ? '' : 'Enter the date as DD/MM/YYYY';
    });
    const result = await g.OakRunner.runStep(document, stepFor(dateId, 'appointmentDate', 'date', { format: 'DD MMM YYYY' }), payload, null);
    expect(result).toMatchObject({ status: 'done', format: 'DD/MM/YYYY' });
    expect(result.corrections).toEqual([expect.objectContaining({ type: 'format', patch: { format: 'DD/MM/YYYY' } })]);
    expect(input.value).toBe('01/02/2026');
  }, 20_000);

  it('chooses the radio option by its label', async () => {
    const result = await g.OakRunner.runStep(document, stepFor('0b6b1f8e-2f4c-4b8e-9d3a-1c2b3d4e5f60', 'category', 'radio', { method: 'click' }), payload, null);
    expect(result.status).toBe('done');
    expect(byId<HTMLInputElement>('1b6b1f8e-2f4c-4b8e-9d3a-1c2b3d4e5f61').checked).toBe(true);
  });

  it('fails with needsAi when the field is gone, and skips keys without a value', async () => {
    const step = stepFor('appoint-position-holder-card-1-individual-name', 'name', 'text');
    document.body.innerHTML = '<h2>Appoint position holder</h2>';
    expect(await g.OakRunner.runStep(document, step, { name: 'Tan Ah Kow' }, null)).toMatchObject({ status: 'failed', reason: 'not-found', needsAi: true });
    expect(await g.OakRunner.runStep(document, step, {}, null)).toMatchObject({ status: 'skipped' });
  });

  it('refuses to click a button that is not an add or reveal button, whatever the map says', async () => {
    const step = { id: 'a-review', type: 'action', label: 'Review and confirm', locator: g.OakLocator.buildActionLocator(byId('review')) };
    let clicked = false;
    byId('review').addEventListener('click', () => (clicked = true));
    expect(await g.OakRunner.runStep(document, step, {}, null)).toMatchObject({ status: 'blocked' });
    expect(clicked).toBe(false);
  });
});
