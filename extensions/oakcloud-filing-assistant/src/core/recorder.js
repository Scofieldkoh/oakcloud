/*
 * OakCloud Filing Assistant: learning by watching. While recording, the content script notes what a
 * staff member does on the Bizfile screen: the fields they change, the add/reveal buttons they click
 * and the dropdown options they choose. Only trusted events (real user input) count. When recording
 * stops, each field's final value is matched to a filing-details key to build screen-map steps.
 * Defines globalThis.OakRecorder; needs OakDom, OakLocator, OakFormats and OakSchemas.
 */
(function (root) {
  'use strict';
  const D = root.OakDom;
  const L = root.OakLocator;
  const F = root.OakFormats;
  const S = root.OakSchemas;

  /** The fill method a newly learned step starts with; the runner falls back to others if needed. */
  const DEFAULT_METHOD = {
    text: 'set-value-events',
    date: 'set-value-events',
    'native-select': 'set-value-events',
    combobox: 'pointer',
    typeahead: 'insert-text-command+pointer',
    radio: 'click',
    checkbox: 'click',
  };

  const OPTION_WINDOW_MS = 15000;

  function start(doc) {
    const fields = new Map();
    const actions = [];
    let order = 0;
    let lastField = null;
    let lastFieldAt = 0;
    let lastFieldClick = null;

    const fieldOf = (target) => {
      const field = D.resolveField(target);
      return field && field.matches(D.FIELD_SELECTOR) ? field : null;
    };
    const touch = (el) => {
      if (!fields.has(el)) fields.set(el, { el, order: order++, typed: false, optionText: null });
      return fields.get(el);
    };
    const targetOf = (event) => {
      const first = event.composedPath()[0];
      return first && first.nodeType === 1 ? first : event.target;
    };

    const handlers = {
      focusin(event) {
        if (!event.isTrusted) return;
        const field = fieldOf(targetOf(event));
        if (field) {
          lastField = field;
          lastFieldAt = Date.now();
        }
      },
      input(event) {
        if (!event.isTrusted) return;
        const field = fieldOf(targetOf(event));
        if (!field) return;
        const observation = touch(field);
        if (!event.inputType || String(event.inputType).startsWith('insert')) observation.typed = true;
      },
      change(event) {
        if (!event.isTrusted) return;
        const field = fieldOf(targetOf(event));
        if (field) touch(field);
      },
      click(event) {
        if (!event.isTrusted) return;
        const target = targetOf(event);
        const field = fieldOf(target);
        const recent = lastField && Date.now() - lastFieldAt < OPTION_WINDOW_MS;

        // Choosing from an open list soon after using a field. Buttons count only with clear option
        // evidence, so that "Add position holder" is never mistaken for an option.
        if (!field && recent) {
          const strong = target.closest('[role=option],[role=menuitem],[role=menuitemradio],.dropdown-item');
          const listItem = target.closest('[role=listbox] *,[role=menu] *,.dropdown-menu *');
          const button = target.closest(D.ACTION_SELECTOR);
          const option = strong || (!button || listItem ? target.closest('li') || (target.closest(D.POPUP_SELECTOR) ? target : null) : null);
          const text = option ? D.labelText(option) : '';
          if (option && text && text.length <= 120 && !D.FORBIDDEN_NAME.test(text) && !D.SAFE_ACTION.test(text)) {
            const observation = touch(lastField);
            observation.optionText = text;
            observation.optionShape = D.describeOption(option);
            if (!observation.opener && lastFieldClick && lastFieldClick.field === lastField) observation.opener = D.describeOpener(lastField, lastFieldClick.target);
            return;
          }
        }

        // A click on a dropdown's chevron rather than the field: remember it as the way to open it.
        if (!field) {
          const companion = D.dropdownFieldFor(target);
          if (companion && !target.closest(D.POPUP_SELECTOR + ',[role=option]')) {
            lastField = companion;
            lastFieldAt = Date.now();
            lastFieldClick = { field: companion, target };
            return;
          }
        }

        const button = target.closest(D.ACTION_SELECTOR);
        if (button && !field) {
          actions.push({ el: button, label: D.actionLabel(button), order: order++, blocked: D.actionBlockReason(button) });
          return;
        }
        if (field) {
          if (D.detectKind(field) === 'radio' || D.detectKind(field) === 'checkbox') touch(field);
          lastField = field;
          lastFieldAt = Date.now();
          lastFieldClick = { field, target };
        }
      },
    };

    Object.entries(handlers).forEach(([type, handler]) => doc.addEventListener(type, handler, true));

    return {
      counts: () => ({ fields: fields.size, actions: actions.length }),
      stop() {
        Object.entries(handlers).forEach(([type, handler]) => doc.removeEventListener(type, handler, true));
        return { fields: Array.from(fields.values()), actions: actions.slice() };
      },
    };
  }

  /** What a recorded field ended up showing, and as which kind of control. */
  function observe(observation) {
    const el = observation.el;
    if (!el.isConnected) return null;
    const kind = D.detectKind(el);
    if (kind === 'radio' || kind === 'checkbox') {
      const state = D.readState(el);
      if (!state.checked) return null; // a later choice in the same question replaced it
      return { kind, observed: D.labelInfo(el).name };
    }
    const state = D.readState(el);
    if (observation.optionText && kind !== 'native-select') {
      // How this dropdown opened and what its options look like, so the runner can do the same.
      const dropdown = observation.optionShape ? { ...observation.optionShape, opener: observation.opener || { relation: 'self' } } : null;
      return { kind: observation.typed ? 'typeahead' : 'combobox', observed: observation.optionText, dropdown };
    }
    return { kind, observed: state.value || state.display || '' };
  }

  function choiceMatch(observed, value) {
    const seen = F.normaliseText(observed);
    const wanted = F.normaliseText(value);
    if (!seen || !wanted) return null;
    if (seen === wanted) return { match: true };
    if (seen.includes(wanted) || wanted.includes(seen)) return { match: true, valueMap: { [value]: observed } };
    return null;
  }

  /** The filing-details keys whose value is what the field shows. */
  function matchKeys(transactionId, payload, observed) {
    const transaction = S.get(transactionId);
    const matches = [];
    for (const field of transaction.fields) {
      const value = payload[field.key];
      if (value == null || value === '') continue;
      const result = field.type === 'choice' ? choiceMatch(observed, value) : F.matchValue(observed, value, field.type);
      if (result && result.match) matches.push({ key: field.key, format: result.format || null, valueMap: result.valueMap || null });
    }
    return matches;
  }

  /**
   * Turns a recording into screen-map steps. Returns { steps, unmapped, ignored } where unmapped are
   * fields staff changed whose value matched no filing-details key (or more than one), and ignored
   * are buttons staff clicked that the assistant will never click.
   */
  function buildSteps(recording, transactionId, payload) {
    const events = [
      ...recording.fields.map((item) => ({ type: 'field', ...item })),
      ...recording.actions.map((item) => ({ type: 'action', ...item })),
    ].sort((a, b) => a.order - b.order);

    const steps = [];
    const unmapped = [];
    const ignored = [];
    const usedKeys = new Set();
    let pendingAction = null;

    for (const event of events) {
      if (event.type === 'action') {
        if (event.blocked) {
          ignored.push({ label: event.label, reason: event.blocked });
          continue;
        }
        if (!event.el.isConnected) continue;
        pendingAction = { type: 'action', label: event.label, locator: L.buildActionLocator(event.el) };
        steps.push(pendingAction);
        continue;
      }
      const seen = observe(event);
      if (!seen) continue;
      const locator = L.buildLocator(event.el);
      const matches = matchKeys(transactionId, payload, seen.observed).filter((match) => !usedKeys.has(match.key));
      if (matches.length !== 1) {
        unmapped.push({
          label: locator.label || locator.group || D.clean(event.el.getAttribute('placeholder')) || '(no label)',
          kind: seen.kind,
          locator,
          candidates: matches.map((match) => match.key),
          reason: matches.length ? 'Its value matches more than one filing-details key.' : 'Its value matches no filing-details key.',
        });
        continue;
      }
      const [match] = matches;
      usedKeys.add(match.key);
      const step = { type: 'fill', key: match.key, kind: seen.kind, method: DEFAULT_METHOD[seen.kind], format: match.format, locator };
      if (match.valueMap) step.valueMap = match.valueMap;
      if (seen.dropdown) step.dropdown = seen.dropdown;
      // A reveal button clicked just before this field is needed only when the field is missing.
      if (pendingAction) {
        pendingAction.when = { missing: locator };
        pendingAction = null;
      }
      steps.push(step);
    }
    return { steps: steps.filter((step) => step.type === 'fill' || step.when), unmapped, ignored };
  }

  root.OakRecorder = { DEFAULT_METHOD, start, buildSteps, matchKeys };
})(globalThis);
