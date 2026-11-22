/*
 * OakCloud Filing Assistant: exploring a screen. The assistant discovers the whole screen itself:
 * it clicks the allowed add/reveal buttons, then tries every option of each radio group, list and
 * dropdown, and records which fields each option shows or hides, to a bounded depth. The result is
 * a value-free screen model: every field seen, with the conditions under which it appears.
 *
 * With test data, it also types obviously fake values into empty fields (an example.com email, the
 * office's phone and postal code, "TEST" names, today's date) to find fields that appear only after
 * typing, samples search-as-you-type lists, learns which date format the page accepts, and clears
 * what it typed afterwards.
 *
 * Safety: it only clicks add/reveal buttons and options; it never saves or submits, never presses
 * Retrieve information, never types an NRIC or FIN number (an ID number only when Passport is
 * chosen, since any well-formed NRIC or FIN may belong to a real person), skips anything named like
 * a declaration, stops when staff touch the page or the page navigates, and puts original choices
 * back. It changes an unsaved draft, so staff explore a test filing and delete the draft after.
 *
 * To explore past an NRIC or FIN field, it pauses once and asks staff (through askForValue) for a
 * real number they may use, its ID type, and whether to press Retrieve information. The number is
 * typed into the page and cleared afterwards; it is not kept, and it never enters the screen model.
 * Defines globalThis.OakExplorer; needs OakDom and OakLocator.
 */
(function (root) {
  'use strict';
  const D = root.OakDom;
  const L = root.OakLocator;
  const F = root.OakFormats;

  const DEFAULTS = { maxDepth: 3, maxTests: 60, maxMs: 120000, maxOptions: 12, testData: false, testValues: {} };
  const TEST_DATA_LIMITS = { maxTests: 160, maxMs: 300000 };

  /** The condition recorded for a field that appears once another field has been typed into. */
  const FILLED = '(when filled)';
  const TYPED_KINDS = new Set(['text', 'date', 'typeahead']);
  /** ID-number fields ("Identification number", "NRIC/FIN no."), not fields that merely mention one. */
  const SENSITIVE_ID = /(identification|nric|fin|passport|\bid)\s*(\/\s*fin\s*)?(no\b|no\.|number)|^(nric|fin)$/i;
  const TYPEAHEAD_LETTERS = ['a', 'c', 'm', 's', 'b'];
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

  /**
   * The option texts in a menu: each text-bearing element, grouped by its list item or option, so a
   * container holding every option is never read as one option.
   */
  function itemTexts(popup) {
    const groups = new Map(); // item element -> the elements holding its text
    const walker = popup.ownerDocument.createTreeWalker(popup, 4 /* NodeFilter.SHOW_TEXT */);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.nodeValue || !node.nodeValue.trim() || !node.parentElement) continue;
      const parent = node.parentElement;
      const found = parent.closest('li,[role=option],[role=menuitem],button,a,.dropdown-item,[class*=item i],[class*=option i],[class*=row i]');
      const item = found && popup.contains(found) && found !== popup ? found : parent;
      if (!groups.has(item)) groups.set(item, new Set());
      groups.get(item).add(parent);
    }
    // An "item" gathering text from many elements is really a list container: use its parts.
    const items = [];
    groups.forEach((parents, item) => (parents.size > 3 ? items.push(...parents) : items.push(item)));
    return Array.from(new Set(items))
      .filter((item) => D.isVisible(item))
      .map((item) => D.labelText(item))
      .filter((text) => text && text.length <= 80);
  }

  /** The option texts in whatever menu appeared for a field since popupsBefore was taken. */
  function menuTexts(doc, el, popupsBefore) {
    const known = D.visibleOptions(el, null).map((option) => D.labelText(option)).filter(Boolean);
    if (known.length) return known;
    // The menu that appeared: the outermost newly visible popup that is not the field's own box.
    const appeared = D.deepQueryAll(doc, D.POPUP_SELECTOR).filter((node) => D.isVisible(node) && !popupsBefore.has(node) && !node.contains(el));
    const outermost = appeared.filter((node) => !appeared.some((other) => other !== node && other.contains(node)));
    return outermost.flatMap(itemTexts);
  }

  /** Opens a dropdown, reads its option texts and closes it again. Never types. */
  async function dropdownOptions(doc, el) {
    const popupsBefore = new Set(D.deepQueryAll(doc, D.POPUP_SELECTOR).filter((node) => D.isVisible(node)));
    const texts = () => menuTexts(doc, el, popupsBefore);
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
    return Array.from(new Set(found.filter((text) => !D.FORBIDDEN_NAME.test(text) && !PLACEHOLDER.test(text))));
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
      // Exploring never types into a field, so a dropdown that only opens by typing is left as it is.
      await D.applyStrategy(found.el, locator.kind, locator.kind === 'native-select' ? 'set-value-events' : 'pointer', option, option, { noTyping: true });
    }
    await D.settle(doc, 300, 3000);
  }

  // ---- Test data ------------------------------------------------------------------------------

  function fieldText(el, locator) {
    return [locator.label, locator.group, el.getAttribute('placeholder'), el.getAttribute('name'), el.id].filter(Boolean).join(' ');
  }

  /** Whether the page currently shows Passport as the identification type. */
  function passportChosen(doc) {
    return D.deepQueryAll(doc, D.FIELD_SELECTOR).some((el) => {
      const question = (D.labelInfo(el).name || '') + ' ' + (el.getAttribute('placeholder') || '') + ' ' + D.groupName(el);
      if (!/identification type|id type|document type/i.test(question)) return false;
      const state = D.readState(el);
      return state.checked === true ? /passport/i.test(D.labelInfo(el).name) : /passport/i.test((state.value || '') + ' ' + (state.display || ''));
    });
  }

  function todayIso() {
    const now = new Date();
    return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  }

  /**
   * The obviously fake value to type into a field, or null when it must not be typed into.
   * ID numbers are typed only when Passport is chosen: a made-up NRIC or FIN may be a real person's.
   */
  function isSensitiveField(el, locator) {
    return SENSITIVE_ID.test(locator.label || '') || SENSITIVE_ID.test(el.getAttribute('placeholder') || '');
  }

  function retrieveButton(doc) {
    return D.deepQueryAll(doc, D.ACTION_SELECTOR).find((button) => D.isVisible(button) && /^retrieve\b/i.test(D.actionLabel(button))) || null;
  }

  function testValueFor(doc, el, locator, values) {
    if (locator.kind === 'date') return { date: todayIso() };
    const text = fieldText(el, locator);
    if (isSensitiveField(el, locator)) {
      return passportChosen(doc) ? { text: 'TESTP1234567' } : null;
    }
    if (/e-?mail/i.test(text)) return { text: 'filing-assistant-test@example.com' };
    if (/mobile|phone|telephone|contact (no|number)/i.test(text)) return { text: values.phone || '60000000' };
    if (/postal/i.test(text)) return { text: values.postalCode || '000000' };
    if (/\buen\b|registration (no|number)/i.test(text)) return { text: 'TEST00001A' };
    if (/name/i.test(text)) return { text: 'TEST FILING ASSISTANT' };
    if (el.getAttribute('type') === 'number' || el.getAttribute('inputmode') === 'numeric') return { text: '1' };
    return { text: 'TEST' };
  }

  async function clearField(doc, locator) {
    const found = L.resolve(doc, locator);
    if (!found.el || D.readState(found.el).value === '') return;
    try {
      await D.applyStrategy(found.el, locator.kind === 'date' ? 'date' : 'text', 'set-value-events', '', '', null);
    } catch {
      // Clearing is best effort; the draft is deleted afterwards.
    }
    closeMenu(found.el);
    await D.settle(doc, 250, 2000);
  }

  /** Types a value, leaves the field and reports any validation message. */
  async function typeAndLeave(doc, el, kind, value) {
    await D.applyStrategy(el, kind === 'date' ? 'date' : 'text', 'set-value-events', value, '', null);
    await D.settle(doc, 200, 2000);
    if (doc.activeElement && doc.activeElement !== doc.body) doc.activeElement.blur();
    await D.settle(doc, 300, 3000);
    return D.readState(el).errorText || '';
  }

  /** Fills a date with today's date, trying each format until the page accepts one. */
  async function typeDate(doc, el, iso) {
    let message = '';
    for (const format of F.DATE_FORMATS) {
      message = await typeAndLeave(doc, el, 'date', F.formatDate(iso, format));
      if (!message) return { format, message: '' };
    }
    return { format: null, message };
  }

  /** Types a few single letters into a search field and collects the suggestions each brings. */
  async function sampleSuggestions(doc, el, locator) {
    const seen = new Set();
    for (const letter of TYPEAHEAD_LETTERS) {
      const found = L.resolve(doc, locator);
      if (!found.el) break;
      const popupsBefore = new Set(D.deepQueryAll(doc, D.POPUP_SELECTOR).filter((node) => D.isVisible(node)));
      try {
        await D.applyStrategy(found.el, 'text', 'insert-text-command', letter, '', null);
      } catch {
        break;
      }
      await D.settle(doc, 300, 2500);
      menuTexts(doc, found.el, popupsBefore).forEach((text) => seen.add(text));
      await clearField(doc, locator);
      if (seen.size >= 40) break;
    }
    return Array.from(seen).filter((text) => !D.FORBIDDEN_NAME.test(text)).slice(0, 40);
  }

  /**
   * Explores the screen. Returns { model, locators, stats } where model is value-free (sent to AI),
   * locators maps model references to locators, and stats says how far it got and why it stopped.
   */
  async function explore(doc, options = {}) {
    const settings = { ...DEFAULTS, ...(options.testData ? TEST_DATA_LIMITS : {}), ...options };
    const started = Date.now();
    const startUrl = doc.location ? doc.location.href : '';
    const catalog = new Map(); // identity -> entry
    const branches = [];
    const actions = [];
    const originals = new Map(); // control identity -> the option chosen before exploring
    let tests = 0;
    let stoppedBecause = null;
    let waitedMs = 0; // time spent waiting for staff to answer does not count against the budget
    let sensitiveAsked = false;
    const progress = settings.onProgress || (() => {});

    const stop = () => {
      if (stoppedBecause) return true;
      if (settings.shouldStop && settings.shouldStop()) stoppedBecause = 'You used the page, so exploring stopped.';
      else if (doc.location && doc.location.href !== startUrl) stoppedBecause = 'The page changed, so exploring stopped.';
      else if (tests >= settings.maxTests) stoppedBecause = 'Reached the limit of ' + settings.maxTests + ' tries.';
      else if (Date.now() - started - waitedMs > settings.maxMs) stoppedBecause = 'Reached the time limit.';
      return Boolean(stoppedBecause);
    };

    // A field's conditions are what all its sightings share: a field seen under both "Individual"
    // and "Corporate" does not depend on the category at all.
    const sameCondition = (a, b) => a.id === b.id && a.option === b.option;
    const remember = (fields, conditions) => {
      for (const [id, entry] of fields) {
        const record = catalog.get(id);
        if (record) {
          // Fields a lookup revealed stay on screen afterwards (a Retrieve cannot be undone), so later
          // sightings say nothing about when they appear: keep their conditions as recorded.
          if (!record.pinned) record.shownWhen = record.shownWhen.filter((condition) => conditions.some((other) => sameCondition(condition, other)));
          continue;
        }
        catalog.set(id, { ref: 'f' + (catalog.size + 1), id, locator: entry.locator, shownWhen: conditions.slice(), options: null, format: null, hint: '' });
      }
    };

    // 1. Allowed reveal buttons, each clicked once, noting the fields each one brings.
    let fields = currentFields(doc);
    remember(fields, []);
    const clicked = new Set();
    for (const button of D.deepQueryAll(doc, D.ACTION_SELECTOR)) {
      if (stop()) break;
      const label = D.actionLabel(button);
      // Retrieve information looks up real records: never pressed while exploring.
      if (!D.isVisible(button) || D.actionBlockReason(button) || clicked.has(label) || /^retrieve\b/i.test(label)) continue;
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
      if (settings.testData) await typeIntoFields(onlyIds, conditions, depth);
    }

    /** With test data: types into each empty field, records what appears, then clears it again. */
    async function typeIntoFields(onlyIds, conditions, depth) {
      const present = currentFields(doc);
      const typable = Array.from(present.entries()).filter(([id, entry]) => (!onlyIds || onlyIds.includes(id)) && TYPED_KINDS.has(entry.locator.kind) && !conditions.some((condition) => condition.id === id));
      for (const [id, entry] of typable) {
        if (stop()) return;
        let el = L.resolve(doc, entry.locator).el;
        if (!el || D.blockReason(el) || el.readOnly || el.disabled || D.readState(el).value) continue;
        if (isSensitiveField(el, entry.locator)) {
          await exploreWithStaffNumber(id, entry, conditions, depth, present);
          if (stop()) return;
          el = L.resolve(doc, entry.locator).el;
          if (!el || D.readState(el).value) continue;
        }
        const value = testValueFor(doc, el, entry.locator, settings.testValues || {});
        const label = entry.locator.label || entry.locator.candidates[0].value;
        const record = catalog.get(id);
        if (!value) {
          if (record) record.hint = 'Not typed into while exploring: it takes an NRIC or FIN number.';
          continue;
        }
        if (entry.locator.kind === 'typeahead') {
          progress('Typing letters into "' + label + '" to see its suggestions…');
          const suggestions = await sampleSuggestions(doc, el, entry.locator);
          tests++;
          if (record && suggestions.length) record.options = suggestions;
          continue;
        }
        progress('Typing test data into "' + label + '"…');
        const before = currentFields(doc);
        let typed;
        try {
          typed = value.date ? await typeDate(doc, el, value.date) : { format: null, message: await typeAndLeave(doc, el, entry.locator.kind, value.text) };
        } catch (error) {
          branches.push({ control: id, option: FILLED, error: String(error.message || error).slice(0, 160) });
          continue;
        }
        tests++;
        if (record) {
          if (typed.format) record.format = typed.format;
          if (typed.message) record.hint = D.clean(typed.message, 200);
        }
        const after = currentFields(doc);
        const shown = Array.from(after.keys()).filter((key) => !before.has(key));
        const hidden = Array.from(before.keys()).filter((key) => !after.has(key));
        const branchConditions = [...conditions, { id, option: FILLED }];
        remember(after, branchConditions);
        branches.push({ control: id, option: FILLED, shown, hidden });
        if (shown.length && depth + 1 < settings.maxDepth) await visit(shown, branchConditions, depth + 1);
        await clearField(doc, entry.locator);
      }
    }

    /**
     * Asks staff, once per exploration, for a real NRIC or FIN they may use, so the path behind the
     * ID number (and Retrieve information, if they allow it) can be explored too.
     */
    async function exploreWithStaffNumber(idId, idEntry, conditions, depth, present) {
      if (sensitiveAsked || !settings.askForValue) return;
      sensitiveAsked = true;
      const label = idEntry.locator.label || 'Identification number';
      const typeEntry = Array.from(present.entries()).find(
        ([, entry]) => CHOICE.has(entry.locator.kind) && /identification type|id type|document type/i.test([entry.locator.label, entry.locator.group, (entry.locator.candidates.find((candidate) => candidate.by === 'placeholder') || {}).value].join(' ')),
      );
      const idTypes = typeEntry ? (await optionsOf(doc, typeEntry[1])).filter((option) => !/passport/i.test(option)) : [];
      progress('Waiting for you: "' + label + '" needs a real NRIC or FIN number.');
      const askedAt = Date.now();
      const answer = await settings.askForValue({ field: label, idTypes, retrieve: Boolean(retrieveButton(doc)) });
      waitedMs += Date.now() - askedAt;
      if (!answer || answer.stop) {
        stoppedBecause = stoppedBecause || 'You stopped exploring.';
        return;
      }
      if (answer.skip || !answer.value) return;

      const originalType = typeEntry ? currentChoice(doc, typeEntry[1].locator.kind, typeEntry[1].locator) : null;
      const before = currentFields(doc);
      const pathConditions = conditions.slice();
      try {
        if (typeEntry && answer.idType) {
          await choose(doc, typeEntry[1].locator, answer.idType);
          pathConditions.push({ id: typeEntry[0], option: answer.idType });
        }
        const el = L.resolve(doc, idEntry.locator).el;
        if (!el) return;
        progress('Typing the number you gave into "' + label + '"…');
        await typeAndLeave(doc, el, 'text', answer.value);
        tests++;
        let lookup = null;
        const button = answer.retrieve ? retrieveButton(doc) : null;
        if (button && !button.disabled && button.getAttribute('aria-disabled') !== 'true') {
          progress('Pressing "' + D.actionLabel(button) + '" as you asked…');
          lookup = { label: D.actionLabel(button), locator: L.buildActionLocator(button) };
          D.pointerClick(button);
          await D.settle(doc, 1200, 15000);
          tests++;
        }
        const after = currentFields(doc);
        const shown = Array.from(after.keys()).filter((key) => !before.has(key));
        const hidden = Array.from(before.keys()).filter((key) => !after.has(key));
        const branchConditions = [...pathConditions, { id: idId, option: FILLED }];
        remember(after, branchConditions);
        if (lookup) shown.forEach((key) => catalog.get(key) && (catalog.get(key).pinned = true));
        branches.push({ control: idId, option: FILLED, shown, hidden, staffValue: true });
        if (lookup) actions.push({ ...lookup, reveals: shown, after: idId, lookup: true });
        if (shown.length && depth + 1 < settings.maxDepth) await visit(shown, branchConditions, depth + 1);
      } catch (error) {
        branches.push({ control: idId, option: FILLED, error: String(error.message || error).slice(0, 160) });
      } finally {
        await clearField(doc, idEntry.locator);
        if (typeEntry && originalType && !stoppedBecause) {
          try {
            await choose(doc, typeEntry[1].locator, originalType);
          } catch {
            // Restoring is best effort; the draft is deleted afterwards.
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
        ...(record.format ? { format: record.format } : {}),
        ...(record.hint ? { hint: record.hint } : {}),
        ...(record.shownWhen.length ? { shownWhen: record.shownWhen.map((condition) => ({ ref: refOf(condition.id), option: condition.option })).filter((condition) => condition.ref) } : {}),
      };
    });
    const actionsModel = actions.map((action, index) => {
      const ref = 'a' + (index + 1);
      locators[ref] = action.locator;
      return {
        ref,
        label: action.label,
        section: action.locator.section,
        allowed: true,
        reveals: action.reveals.map(refOf).filter(Boolean),
        ...(action.lookup ? { lookup: true, after: refOf(action.after) } : {}),
      };
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
    return { model, locators, branches: branchSummary, stats: { tests, ms: Date.now() - started - waitedMs, stoppedBecause } };
  }

  root.OakExplorer = { explore, DEFAULTS, FILLED, testValueFor };
})(globalThis);
