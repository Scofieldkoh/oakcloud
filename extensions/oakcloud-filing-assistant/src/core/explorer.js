/*
 * OakCloud Filing Assistant: exploring a screen. The assistant discovers the whole screen itself:
 * it clicks the allowed add/reveal buttons, then tries every option of each radio group, list and
 * dropdown, and records which fields each option shows or hides, to a bounded depth. The result is
 * a value-free screen model: every field seen, with the conditions under which it appears.
 *
 * Safety: it only clicks add/reveal buttons and options; it never types into fields, never saves or
 * submits, skips anything named like a declaration, stops when staff touch the page or the page
 * navigates, and puts the original choices back at the end. It changes selections on an unsaved
 * draft, so staff should explore a test filing.
 * Defines globalThis.OakExplorer; needs OakDom and OakLocator.
 */
(function (root) {
  'use strict';
  const D = root.OakDom;
  const L = root.OakLocator;

  const DEFAULTS = { maxDepth: 3, maxTests: 60, maxMs: 120000, maxOptions: 12 };
  const CHOICE = new Set(['radio', 'native-select', 'combobox']);
  const PLACEHOLDER = /^(select|choose|please select|--|-)\b/i;

  function identity(locator) {
    const first = locator.candidates[0];
    return locator.kind + '|' + (first ? first.by + ':' + first.value + ':' + (first.section || '') : locator.label);
  }

  /** The fields showing now, one entry per field (one per radio group), keyed by a stable identity. */
  function currentFields(doc) {
    const fields = new Map();
    for (const el of D.deepQueryAll(doc, D.FIELD_SELECTOR)) {
      const kind = D.detectKind(el);
      const usable = kind === 'radio' || kind === 'checkbox' ? D.isVisible(el) || Boolean(el.closest('label') && D.isVisible(el.closest('label'))) : D.isVisible(el);
      if (!usable) continue;
      const locator = L.buildLocator(el);
      if (!locator.candidates.length) continue;
      const id = identity(locator);
      if (!fields.has(id)) fields.set(id, { el, locator });
    }
    return fields;
  }

  function optionLabelsOfGroup(doc, locator) {
    const found = L.resolve(doc, locator);
    return found.group ? found.group.map((el) => D.labelInfo(el).name).filter(Boolean) : [];
  }

  function currentChoice(doc, kind, locator) {
    const found = L.resolve(doc, locator);
    if (!found.el) return null;
    if (kind === 'radio') {
      const checked = (found.group || []).find((el) => el.checked || el.getAttribute('aria-checked') === 'true');
      return checked ? D.labelInfo(checked).name : null;
    }
    const state = D.readState(found.el);
    return state.value || state.display || null;
  }

  function closeMenu(el) {
    const doc = el.ownerDocument;
    const target = doc.activeElement && doc.activeElement !== doc.body ? doc.activeElement : el;
    ['keydown', 'keyup'].forEach((type) => target.dispatchEvent(new (doc.defaultView.KeyboardEvent)(type, { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true })));
    if (doc.activeElement && doc.activeElement !== doc.body) doc.activeElement.blur();
  }

  /** Opens a dropdown, reads its option texts and closes it again. */
  async function dropdownOptions(doc, el) {
    const popupsBefore = new Set(D.deepQueryAll(doc, D.POPUP_SELECTOR).filter((node) => D.isVisible(node)));
    const texts = () => {
      const known = D.visibleOptions(el, null).map((option) => D.labelText(option));
      if (known.length) return known;
      const popups = D.deepQueryAll(doc, D.POPUP_SELECTOR).filter((node) => D.isVisible(node) && !popupsBefore.has(node) && !node.contains(el));
      return popups.flatMap((popup) =>
        Array.from(popup.querySelectorAll('li,button,a,[role=option],div,span'))
          .filter((node) => D.isVisible(node) && !Array.from(node.children).some((child) => D.labelText(child) === D.labelText(node)))
          .map((node) => D.labelText(node)),
      );
    };
    let found = [];
    let usedOpener = null;
    for (const opener of [el, D.toggleOf(el)].filter(Boolean)) {
      D.pointerClick(opener);
      await D.settle(doc, 250, 1500);
      found = texts();
      if (found.length) {
        usedOpener = opener;
        break;
      }
    }
    // Many menus close when their opener is clicked again; Escape and blur cover the rest.
    if (usedOpener && texts().length) {
      D.pointerClick(usedOpener);
      await D.settle(doc, 200, 1000);
    }
    closeMenu(el);
    await D.settle(doc, 200, 1000);
    return Array.from(new Set(found.filter((text) => text && text.length <= 120 && !D.FORBIDDEN_NAME.test(text) && !PLACEHOLDER.test(text))));
  }

  async function optionsOf(doc, entry) {
    const kind = entry.locator.kind;
    if (kind === 'radio') return optionLabelsOfGroup(doc, entry.locator);
    if (kind === 'native-select') {
      return Array.from(entry.el.options)
        .map((option) => D.clean(option.textContent))
        .filter((text) => text && !PLACEHOLDER.test(text));
    }
    return dropdownOptions(doc, entry.el);
  }

  /** Selects one option of a choice control, the same way a fill step would. */
  async function choose(doc, locator, option) {
    const found = L.resolve(doc, locator);
    if (!found.el) throw new Error('The control disappeared.');
    if (locator.kind === 'radio') {
      const radio = (found.group || []).find((el) => D.normalise(D.labelInfo(el).name) === D.normalise(option));
      if (!radio) throw new Error('No option ' + option + '.');
      radio.click();
    } else {
      await D.applyStrategy(found.el, locator.kind, locator.kind === 'native-select' ? 'set-value-events' : 'pointer', option, option, null);
    }
    await D.settle(doc, 300, 3000);
  }

  /**
   * Explores the screen. Returns { model, locators, stats } where model is value-free (sent to AI),
   * locators maps model references to locators, and stats says how far it got and why it stopped.
   */
  async function explore(doc, options = {}) {
    const settings = { ...DEFAULTS, ...options };
    const started = Date.now();
    const startUrl = doc.location ? doc.location.href : '';
    const catalog = new Map(); // identity -> entry
    const branches = [];
    const actions = [];
    const originals = new Map(); // control identity -> the option chosen before exploring
    let tests = 0;
    let stoppedBecause = null;
    const progress = settings.onProgress || (() => {});

    const stop = () => {
      if (stoppedBecause) return true;
      if (settings.shouldStop && settings.shouldStop()) stoppedBecause = 'You used the page, so exploring stopped.';
      else if (doc.location && doc.location.href !== startUrl) stoppedBecause = 'The page changed, so exploring stopped.';
      else if (tests >= settings.maxTests) stoppedBecause = 'Reached the limit of ' + settings.maxTests + ' tries.';
      else if (Date.now() - started > settings.maxMs) stoppedBecause = 'Reached the time limit.';
      return Boolean(stoppedBecause);
    };

    // A field's conditions are what all its sightings share: a field seen under both "Individual"
    // and "Corporate" does not depend on the category at all.
    const sameCondition = (a, b) => a.id === b.id && a.option === b.option;
    const remember = (fields, conditions) => {
      for (const [id, entry] of fields) {
        const record = catalog.get(id);
        if (record) {
          record.shownWhen = record.shownWhen.filter((condition) => conditions.some((other) => sameCondition(condition, other)));
          continue;
        }
        catalog.set(id, { ref: 'f' + (catalog.size + 1), id, locator: entry.locator, shownWhen: conditions.slice(), options: null });
      }
    };

    // 1. Allowed reveal buttons, each clicked once, noting the fields each one brings.
    let fields = currentFields(doc);
    remember(fields, []);
    const clicked = new Set();
    for (const button of D.deepQueryAll(doc, D.ACTION_SELECTOR)) {
      if (stop()) break;
      const label = D.actionLabel(button);
      if (!D.isVisible(button) || D.actionBlockReason(button) || clicked.has(label)) continue;
      clicked.add(label);
      progress('Clicking "' + label + '"…');
      D.pointerClick(button);
      await D.settle(doc, 400, 4000);
      tests++;
      const after = currentFields(doc);
      const revealed = Array.from(after.keys()).filter((id) => !fields.has(id));
      remember(after, []);
      actions.push({ label, locator: L.buildActionLocator(button), reveals: revealed });
      fields = after;
    }

    // 2. Every option of every choice control, recursing into what each option reveals.
    async function visit(onlyIds, conditions, depth) {
      const present = currentFields(doc);
      remember(present, conditions);
      if (depth >= settings.maxDepth) return;
      const controls = Array.from(present.entries()).filter(([id, entry]) => (!onlyIds || onlyIds.includes(id)) && CHOICE.has(entry.locator.kind) && !D.blockReason(entry.el) && !conditions.some((condition) => condition.id === id));
      for (const [id, entry] of controls) {
        if (stop()) return;
        const label = entry.locator.group || entry.locator.label || entry.locator.candidates[0].value;
        progress('Trying the options of "' + label + '"…');
        const options = (await optionsOf(doc, entry)).slice(0, settings.maxOptions);
        const record = catalog.get(id);
        if (record && !record.options) record.options = options;
        const original = currentChoice(doc, entry.locator.kind, entry.locator);
        if (original && !originals.has(id)) originals.set(id, original);
        // Each option is compared with the screen as it was before this control was touched.
        const before = currentFields(doc);
        for (const option of options) {
          if (stop()) break;
          try {
            await choose(doc, entry.locator, option);
          } catch (error) {
            branches.push({ control: id, option, error: String(error.message || error).slice(0, 160) });
            continue;
          }
          tests++;
          const after = currentFields(doc);
          const shown = Array.from(after.keys()).filter((key) => !before.has(key));
          const hidden = Array.from(before.keys()).filter((key) => !after.has(key));
          const branchConditions = [...conditions, { id, option }];
          remember(after, branchConditions);
          branches.push({ control: id, option, shown, hidden });
          if (shown.length) await visit(shown, branchConditions, depth + 1);
        }
        if (original && !stoppedBecause) {
          try {
            await choose(doc, entry.locator, original);
          } catch {
            // Restoring is best effort; the filing is an unsaved draft.
          }
        }
      }
    }
    await visit(null, [], 0);

    // 3. A field present from the start but hidden by some options appears only with the original choice.
    for (const branch of branches) {
      for (const hiddenId of branch.hidden || []) {
        const record = catalog.get(hiddenId);
        if (!record || record.shownWhen.length) continue;
        const originalOption = originals.get(branch.control);
        if (originalOption) record.shownWhen = [{ id: branch.control, option: originalOption }];
      }
    }

    const refOf = (id) => (catalog.get(id) || {}).ref;
    const locators = {};
    const fieldsModel = Array.from(catalog.values()).map((record) => {
      locators[record.ref] = record.locator;
      const loc = record.locator;
      return {
        ref: record.ref,
        kind: loc.kind,
        tag: loc.tag,
        type: loc.type,
        label: (loc.kind === 'radio' || loc.kind === 'checkbox') && loc.group ? loc.group : loc.label,
        labelSource: loc.labelSource,
        group: loc.group,
        section: loc.section,
        placeholder: (loc.candidates.find((candidate) => candidate.by === 'placeholder') || {}).value || '',
        ...(record.options && record.options.length ? { options: record.options } : {}),
        ...(record.shownWhen.length ? { shownWhen: record.shownWhen.map((condition) => ({ ref: refOf(condition.id), option: condition.option })).filter((condition) => condition.ref) } : {}),
      };
    });
    const actionsModel = actions.map((action, index) => {
      const ref = 'a' + (index + 1);
      locators[ref] = action.locator;
      return { ref, label: action.label, section: action.locator.section, allowed: true, reveals: action.reveals.map(refOf).filter(Boolean) };
    });
    const model = {
      path: doc.location ? doc.location.pathname : '',
      title: D.clean(doc.title),
      headings: Array.from(doc.querySelectorAll('h1,h2,h3')).filter((el) => D.isVisible(el)).map((el) => D.clean(D.labelText(el), 100)).filter(Boolean).slice(0, 30),
      fields: fieldsModel,
      actions: actionsModel,
    };
    const branchSummary = branches.map((branch) => ({
      control: refOf(branch.control),
      option: branch.option,
      shown: (branch.shown || []).map(refOf).filter(Boolean),
      hidden: (branch.hidden || []).map(refOf).filter(Boolean),
      ...(branch.error ? { error: branch.error } : {}),
    }));
    return { model, locators, branches: branchSummary, stats: { tests, ms: Date.now() - started, stoppedBecause } };
  }

  root.OakExplorer = { explore, DEFAULTS };
})(globalThis);
