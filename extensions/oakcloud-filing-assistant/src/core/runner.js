/*
 * OakCloud Filing Assistant: runs one screen-map step on the page and corrects itself where it can.
 *
 * Order of self-correction, all verified before they count:
 *   1. locator: a lower candidate found the field; the locator is rebuilt from that element
 *   2. method:  the value was not kept; other fill methods for the control type are tried
 *   3. format:  a date raised a validation message; other date formats are tried
 * Anything else fails with needsAi so the side panel can ask OakCloud's AI and staff to approve.
 * Defines globalThis.OakRunner; needs OakDom, OakLocator and OakFormats.
 */
(function (root) {
  'use strict';
  const D = root.OakDom;
  const L = root.OakLocator;
  const F = root.OakFormats;

  const OK_VERDICTS = new Set(['kept', 'inconclusive']);
  const CHOICE = new Set(['radio', 'checkbox']);
  const DROPDOWN = new Set(['combobox', 'typeahead', 'native-select']);

  function blurActive(doc) {
    const active = doc.activeElement;
    if (active && active !== doc.body && typeof active.blur === 'function') active.blur();
  }

  function describeCandidate(candidate) {
    return candidate ? candidate.by : 'unknown';
  }

  /** The option in a radio or checkbox group whose label is the wanted text. */
  function pickChoice(group, wanted) {
    const target = D.normalise(wanted);
    const exact = group.filter((el) => D.normalise(D.labelInfo(el).name) === target);
    if (exact.length === 1) return exact[0];
    return null;
  }

  async function attempt(doc, el, kind, method, text, optionText, expected, readSignals, hint) {
    const before = D.readState(el);
    let error = '';
    try {
      await D.applyStrategy(el, kind, method, text, optionText, hint);
    } catch (caught) {
      error = String((caught && caught.message) || caught).slice(0, 300);
    }
    await D.settle(doc, 200, 2000);
    blurActive(doc);
    await D.settle(doc, 300, 3000);
    const settled = D.readState(el);
    const signals = readSignals ? readSignals(el) : null;
    const verdict = error ? 'not-applied' : D.verdict(kind, expected, before, settled, signals);
    return { method, verdict, error, errorText: settled.errorText || '', shown: settled.checked !== undefined ? String(settled.checked) : settled.value };
  }

  /**
   * Whether a step applies to these filing details. Steps learned by exploring carry conditions such
   * as "only when category is Corporate"; a step whose condition fails is skipped, not failed.
   */
  function conditionsHold(step, payload) {
    for (const condition of step.conditions || []) {
      const value = payload[condition.key];
      const wanted = condition.equalsAny || [];
      const label = condition.label || condition.key;
      if (value == null || value === '') return 'Not needed: only shown when ' + label + ' is "' + wanted[0] + '", and that detail is empty.';
      if (!wanted.some((option) => F.normaliseText(option) === F.normaliseText(value))) return 'Not needed for these details: only shown when ' + label + ' is "' + wanted[0] + '".';
    }
    return null;
  }

  async function runAction(doc, step) {
    if (step.when && step.when.missing && L.resolve(doc, step.when.missing).el) {
      return { status: 'skipped', message: 'Not needed: the fields it reveals are already showing.' };
    }
    const found = L.resolve(doc, step.locator);
    if (!found.el) {
      return { status: 'failed', reason: found.ambiguous ? 'ambiguous' : 'not-found', needsAi: true, message: 'Could not find the "' + step.label + '" button.' };
    }
    const blocked = D.actionBlockReason(found.el);
    if (blocked) return { status: 'blocked', message: blocked };
    D.pointerClick(found.el);
    await D.settle(doc, 400, 5000);
    if (step.when && step.when.missing && !L.resolve(doc, step.when.missing).el) {
      return { status: 'failed', reason: 'not-revealed', needsAi: true, message: 'Clicked "' + step.label + '" but the expected fields did not appear.' };
    }
    return { status: 'done', message: 'Clicked "' + step.label + '".' };
  }

  /**
   * Runs a fill step. Returns { status: done | skipped | failed | blocked, message, method, format,
   * verdict, corrections: [{ type, summary, patch }], needsAi, reason, errorText, options }.
   */
  async function runFill(doc, step, payload, readSignals) {
    const raw = payload[step.key];
    if (raw == null || raw === '') return { status: 'skipped', message: 'No value in the filing details.' };

    const found = L.resolve(doc, step.locator);
    if (!found.el) {
      return {
        status: 'failed',
        reason: found.ambiguous ? 'ambiguous' : 'not-found',
        needsAi: true,
        message: found.ambiguous ? 'More than one field matches, so nothing was filled.' : 'The field is not on this screen.',
      };
    }

    const corrections = [];
    if (found.via > 0) {
      const refreshed = L.refresh(step.locator, found.el);
      corrections.push({
        type: 'locator',
        summary:
          'Found "' + (step.locator.label || step.key) + '" by its ' + describeCandidate(step.locator.candidates[found.via]) + ' after its ' + describeCandidate(step.locator.candidates[0]) + ' stopped working.',
        patch: { locator: refreshed },
      });
    }

    const kind = step.kind;
    const shownValue = (step.valueMap && step.valueMap[raw]) || String(raw);
    let el = found.el;
    if (CHOICE.has(kind)) {
      el = pickChoice(found.group || [found.el], shownValue);
      if (!el) {
        return {
          status: 'failed',
          reason: 'option-missing',
          needsAi: true,
          corrections,
          options: (found.group || []).map((item) => D.labelInfo(item).name),
          message: 'No option "' + shownValue + '" in "' + (step.locator.group || step.locator.label) + '".',
        };
      }
    }
    const blocked = D.blockReason(el);
    if (blocked) return { status: 'blocked', message: blocked, corrections };

    const isDate = kind === 'date';
    const text = DROPDOWN.has(kind) || CHOICE.has(kind) ? shownValue : F.applyFormat(raw, step.format);
    const expected = text;
    const optionText = DROPDOWN.has(kind) ? shownValue : '';
    const typed = kind === 'typeahead' ? shownValue : text;

    const hint = step.dropdown || null;
    const first = await attempt(doc, el, kind, step.method, typed, optionText, expected, readSignals, hint);
    const tried = [first];
    if (OK_VERDICTS.has(first.verdict)) {
      return { status: 'done', message: first.verdict === 'inconclusive' ? 'Already filled.' : 'Filled and verified.', method: step.method, format: step.format || null, verdict: first.verdict, corrections };
    }

    // 3. A date with a validation message: try the other date formats with the same method.
    if (isDate && first.verdict === 'error-shown') {
      for (const format of F.DATE_FORMATS) {
        if (format === step.format) continue;
        const next = await attempt(doc, el, kind, step.method, F.applyFormat(raw, format), '', F.applyFormat(raw, format), readSignals, hint);
        tried.push({ ...next, format });
        if (OK_VERDICTS.has(next.verdict)) {
          corrections.push({ type: 'format', summary: 'Bizfile rejected "' + (step.format || 'the learned format') + '" and accepted "' + format + '".', patch: { format } });
          return { status: 'done', message: 'Filled after changing the date format to ' + format + '.', method: step.method, format, verdict: next.verdict, corrections };
        }
      }
    }

    // 2. Not kept: try the other fill methods for this control type. A dropdown that accepts typing
    //    may also work as a type-ahead search.
    if (first.verdict !== 'error-shown') {
      const alternatives = (D.STRATEGIES[kind] || []).filter((method) => method !== step.method).map((method) => ({ kind, method }));
      if (kind === 'combobox' && D.isEditable(el)) D.STRATEGIES.typeahead.forEach((method) => alternatives.push({ kind: 'typeahead', method }));
      for (const alternative of alternatives) {
        const next = await attempt(doc, el, alternative.kind, alternative.method, alternative.kind === 'typeahead' ? shownValue : typed, optionText, expected, readSignals, hint);
        tried.push(next);
        if (OK_VERDICTS.has(next.verdict)) {
          const kindChanged = alternative.kind !== kind;
          corrections.push({
            type: 'method',
            summary: '"' + step.method + '" did not stick; ' + (kindChanged ? 'treating it as a type-ahead search with "' + alternative.method + '"' : '"' + alternative.method + '"') + ' did.',
            patch: kindChanged ? { method: alternative.method, kind: alternative.kind } : { method: alternative.method },
          });
          return { status: 'done', message: 'Filled after switching to ' + alternative.method + '.', method: alternative.method, format: step.format || null, verdict: next.verdict, corrections };
        }
      }
    }

    const last = tried[tried.length - 1];
    return {
      status: 'failed',
      reason: first.verdict === 'error-shown' ? 'validation-error' : 'not-kept',
      needsAi: true,
      corrections,
      verdict: last.verdict,
      errorText: tried.map((item) => item.errorText).filter(Boolean)[0] || '',
      message:
        first.verdict === 'error-shown'
          ? 'Bizfile showed a message: ' + (first.errorText || 'validation error') + '.'
          : 'No fill method kept the value (' + tried.map((item) => item.method + ': ' + item.verdict + (item.error ? ' - ' + item.error : '')).join('; ') + ').',
    };
  }

  async function runStep(doc, step, payload, readSignals) {
    const notNeeded = conditionsHold(step, payload);
    if (notNeeded) return { status: 'skipped', message: notNeeded };
    const result = step.type === 'action' ? await runAction(doc, step) : step.type === 'fill' ? await runFill(doc, step, payload, readSignals) : { status: 'failed', message: 'Unknown step type.' };
    // A field seen while exploring under a condition the filing details cannot express is optional.
    if (step.optional && result.status === 'failed' && result.reason === 'not-found') {
      return { status: 'skipped', message: 'Not on the screen for these details (an optional field found while exploring).' };
    }
    return result;
  }

  root.OakRunner = { runStep, conditionsHold };
})(globalThis);
