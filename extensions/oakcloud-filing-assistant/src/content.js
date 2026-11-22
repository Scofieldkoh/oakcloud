/*
 * OakCloud Filing Assistant: content script (isolated world), loaded in every Bizfile frame after
 * the core modules. Handles the side panel's requests: snapshots, learning by watching, running
 * steps, pausing when staff use the page, and the diagnose (probe) tools.
 */
(function () {
  'use strict';
  if (globalThis.OakProbeContent) return;
  const P = globalThis.OakDom;

  const handles = new Map();
  let nextHandle = 1;

  // ---- Framework signals from page-signals.js ---------------------------------------------

  function readJsonAttribute(el, attribute) {
    const raw = el.getAttribute(attribute);
    el.removeAttribute(attribute);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function readSignals(el) {
    if (!el || !el.isConnected) return null;
    el.dispatchEvent(new CustomEvent('oak-probe:signals', { bubbles: false, composed: true }));
    return readJsonAttribute(el, 'data-oak-probe-signals');
  }

  function readPageInfo() {
    document.dispatchEvent(new CustomEvent('oak-probe:page-info'));
    return readJsonAttribute(document.documentElement, 'data-oak-probe-page-info');
  }

  // ---- Field handles -------------------------------------------------------------------------

  function register(el) {
    const handleId = 'f' + nextHandle++;
    handles.set(handleId, { ref: new WeakRef(el), descriptor: P.describe(el) });
    return handleId;
  }

  /** Finds the field again: the same element if it is still on the page, else by its description. */
  function locate(handleId, descriptor) {
    const entry = handles.get(handleId);
    const el = entry && entry.ref.deref();
    if (el && el.isConnected) return { el, relocated: false };
    const found = P.relocate(document, descriptor || (entry && entry.descriptor) || {});
    if (found && handleId) handles.set(handleId, { ref: new WeakRef(found), descriptor: P.describe(found) });
    return { el: found, relocated: Boolean(found) };
  }

  function summary(handleId, el) {
    const kind = P.detectKind(el);
    return {
      handleId,
      kind,
      descriptor: P.describe(el),
      blockReason: P.blockReason(el),
      state: P.readState(el),
      signals: readSignals(el),
    };
  }

  // ---- Pick mode -----------------------------------------------------------------------------

  let picking = false;
  let overlay = null;

  function send(message) {
    try {
      chrome.runtime.sendMessage(message).catch(() => {});
    } catch {
      // The side panel is closed or the extension was reloaded; nothing to tell.
    }
  }

  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.setAttribute('data-oak-probe-overlay', '');
    overlay.style.cssText =
      'position:fixed;z-index:2147483647;pointer-events:none;border:2px solid #165d43;background:rgba(22,93,67,.08);border-radius:4px;display:none;';
    const tag = document.createElement('div');
    tag.style.cssText =
      'position:absolute;left:-2px;top:-22px;background:#165d43;color:#fff;font:12px/18px system-ui,sans-serif;padding:0 6px;border-radius:3px;white-space:nowrap;max-width:360px;overflow:hidden;text-overflow:ellipsis;';
    overlay.appendChild(tag);
    document.documentElement.appendChild(overlay);
    return overlay;
  }

  function highlight(el, message) {
    const box = ensureOverlay();
    if (!el) {
      box.style.display = 'none';
      return;
    }
    const rect = el.getBoundingClientRect();
    Object.assign(box.style, {
      display: 'block',
      left: rect.left - 3 + 'px',
      top: rect.top - 3 + 'px',
      width: rect.width + 6 + 'px',
      height: rect.height + 6 + 'px',
    });
    box.firstChild.textContent = message;
  }

  function targetOf(event) {
    const first = event.composedPath()[0];
    return first && first.nodeType === 1 ? first : event.target;
  }

  function describeForHover(field) {
    if (!field) return 'Not a form field';
    const blocked = P.blockReason(field);
    const name = P.labelInfo(field).name || '(no label)';
    return (blocked ? 'Blocked: ' : P.detectKind(field) + ': ') + name;
  }

  function onPointerMove(event) {
    if (!picking) return;
    const field = P.resolveField(targetOf(event));
    highlight(field || targetOf(event), describeForHover(field));
  }

  function onBlocked(event) {
    if (!picking) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.type !== 'click') return;
    const field = P.resolveField(targetOf(event));
    if (!field) {
      send({ type: 'oak-probe:pick-miss', message: 'That is not a form field. Click the field itself.' });
      return;
    }
    stopPick();
    send({ type: 'oak-probe:picked', field: summary(register(field), field) });
  }

  function onKey(event) {
    if (!picking || event.key !== 'Escape') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    stopPick();
    send({ type: 'oak-probe:pick-cancelled' });
  }

  const BLOCKED_EVENTS = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'auxclick', 'contextmenu', 'touchstart', 'touchend'];

  function startPick() {
    if (picking) return true;
    picking = true;
    window.addEventListener('pointermove', onPointerMove, true);
    BLOCKED_EVENTS.forEach((type) => window.addEventListener(type, onBlocked, true));
    window.addEventListener('keydown', onKey, true);
    return true;
  }

  function stopPick() {
    picking = false;
    window.removeEventListener('pointermove', onPointerMove, true);
    BLOCKED_EVENTS.forEach((type) => window.removeEventListener(type, onBlocked, true));
    window.removeEventListener('keydown', onKey, true);
    highlight(null);
    return true;
  }

  // ---- Fill test and recheck -----------------------------------------------------------------

  function blurActive() {
    const active = document.activeElement;
    if (active && active !== document.body && typeof active.blur === 'function') active.blur();
  }

  async function runFill({ handleId, descriptor, kind, strategy, value, optionText }) {
    const { el, relocated } = locate(handleId, descriptor);
    if (!el) return { ok: false, error: 'The field is no longer on this page.' };
    const blocked = P.blockReason(el);
    if (blocked) return { ok: false, error: blocked };
    const expected = kind === 'combobox' || kind === 'typeahead' || kind === 'native-select' ? optionText || value : value;
    const before = P.readState(el);
    let note = '';
    let error = '';
    try {
      note = await P.applyStrategy(el, kind, strategy, value, optionText);
    } catch (caught) {
      error = String((caught && caught.message) || caught).slice(0, 300);
    }
    await P.sleep(250);
    const afterSet = P.readState(el);
    blurActive();
    await P.sleep(600);
    const afterBlur = P.readState(el);
    await P.sleep(1200);
    const settledEl = el.isConnected ? el : P.relocate(document, P.describe(el)) || el;
    const settled = P.readState(settledEl);
    const signals = readSignals(settledEl);
    return {
      ok: true,
      result: {
        relocated,
        note,
        error,
        before,
        afterSet,
        afterBlur,
        settled,
        signals,
        expected,
        verdict: error ? 'not-applied' : P.verdict(kind, expected, before, settled, signals),
      },
    };
  }

  function recheck({ handleId, descriptor }) {
    const { el, relocated } = locate(handleId, descriptor);
    if (!el) return { ok: true, found: false };
    return { ok: true, found: true, relocated, state: P.readState(el), signals: readSignals(el) };
  }

  // ---- Dropdown inspector --------------------------------------------------------------------
  //
  // Records how a dropdown works while staff open it and choose an option as usual: the field's
  // markup, the React handlers on it and its wrappers, what appears or changes on the page and the
  // order of events. Field values are never read; captured texts are short and capitalised names
  // are masked.

  const LIKELY_NAME = /\b[A-Z][A-Z'.-]+(?:\s+[A-Z][A-Z'.-]+)+\b/g;
  const WATCHED_ATTRIBUTES = ['class', 'aria-expanded', 'aria-hidden', 'hidden', 'style', 'aria-activedescendant', 'aria-selected'];
  const INSPECT_EVENTS = ['pointerdown', 'mousedown', 'mouseup', 'click', 'focusin', 'focusout', 'keydown', 'input', 'change'];
  let inspector = null;

  function signatureText(node) {
    if (!node || node.nodeType !== 1) return '';
    const classes = Array.from(node.classList).slice(0, 4).join('.');
    const role = node.getAttribute('role');
    return node.tagName.toLowerCase() + (classes ? '.' + classes : '') + (role ? '[role=' + role + ']' : '');
  }

  function ancestry(node, levels = 6) {
    const chain = [];
    for (let current = node; current && current.nodeType === 1 && chain.length < levels; current = current.parentElement) chain.push(signatureText(current));
    return chain;
  }

  function shortText(node) {
    const text = P.clean(node.textContent, 60);
    return text && text.length <= 40 ? text.replace(LIKELY_NAME, '[name]') : '';
  }

  function attributesOf(el) {
    const kept = {};
    for (const attribute of Array.from(el.attributes)) {
      if (attribute.name === 'value' || attribute.name === 'style') continue;
      if (/^(aria-|role$|type$|readonly$|placeholder$|autocomplete$|tabindex$|data-bs-|data-toggle)/.test(attribute.name)) kept[attribute.name] = P.clean(attribute.value, 80);
    }
    return kept;
  }

  function readHandlers(el) {
    el.dispatchEvent(new CustomEvent('oak-probe:handlers', { bubbles: false, composed: true }));
    return readJsonAttribute(el, 'data-oak-probe-handlers');
  }

  function startInspect() {
    if (inspector) inspector.stop();
    const started = Date.now();
    const events = [];
    const changes = [];
    let field = null;
    let fieldInfo = null;
    let option = null;
    const onEvent = (event) => {
      if (!event.isTrusted) return;
      const target = targetOf(event);
      if (events.length < 100) events.push({ ms: Date.now() - started, type: event.type, target: signatureText(target), ...(event.type === 'keydown' ? { key: event.key } : {}) });
      if (!field && ['pointerdown', 'mousedown', 'focusin'].includes(event.type)) {
        const resolved = P.resolveField(target);
        const candidate = resolved && resolved.matches(P.FIELD_SELECTOR) ? resolved : P.dropdownFieldFor(target);
        if (candidate) {
          field = candidate;
          const toggle = P.toggleOf(candidate);
          fieldInfo = {
            kind: P.detectKind(candidate),
            describe: P.describe(candidate),
            attributes: attributesOf(candidate),
            ancestry: ancestry(candidate),
            openedBy: target === candidate || candidate.contains(target) ? 'the field' : signatureText(target),
            toggleNearby: toggle ? signatureText(toggle) : null,
            reactHandlers: readHandlers(candidate),
          };
        }
      }
      if (field && event.type === 'click' && target !== field && !field.contains(target)) {
        option = { text: shortText(target), ancestry: ancestry(target, 8), reactHandlers: readHandlers(target) };
      }
    };
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (changes.length >= 200) break;
        if (record.target.closest && record.target.closest('[data-oak-probe-overlay]')) continue;
        if (record.type === 'childList') {
          record.addedNodes.forEach((node) => {
            if (node.nodeType !== 1 || changes.length >= 200) return;
            const texts = Array.from(new Set([node, ...node.querySelectorAll('*')].map(shortText).filter(Boolean))).slice(0, 20);
            changes.push({ ms: Date.now() - started, added: signatureText(node), into: signatureText(record.target), elements: node.querySelectorAll('*').length + 1, texts });
          });
        } else if (record.type === 'attributes' && WATCHED_ATTRIBUTES.includes(record.attributeName)) {
          changes.push({ ms: Date.now() - started, changed: signatureText(record.target), attribute: record.attributeName, value: P.clean(record.target.getAttribute(record.attributeName), 80) });
        }
      }
    });
    observer.observe(document.body || document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: WATCHED_ATTRIBUTES });
    INSPECT_EVENTS.forEach((type) => window.addEventListener(type, onEvent, true));
    inspector = {
      stop() {
        observer.disconnect();
        INSPECT_EVENTS.forEach((type) => window.removeEventListener(type, onEvent, true));
        inspector = null;
        return { path: location.pathname, recordedMs: Date.now() - started, field: fieldInfo, option, events, changes };
      },
    };
    return { ok: true };
  }

  function stopInspect() {
    if (!inspector) return { ok: false, error: 'Not inspecting.' };
    return { ok: true, report: inspector.stop() };
  }

  // ---- Page scan -----------------------------------------------------------------------------

  const LIBRARY_PREFIXES = {
    'Angular Material': /^mat-|^mdc-/,
    'ng-select': /^ng-select|^ng-option/,
    PrimeNG: /^p-(dropdown|calendar|inputtext|autocomplete|radiobutton|checkbox)/,
    'Ant Design': /^ant-/,
    'Material UI': /^Mui/,
    'react-select': /react-select|^select__/,
    'SG Design System': /^sgds/,
    Bootstrap: /^(form-control|form-select|form-check|btn)$/,
    Vuetify: /^v-(input|select|text-field)/,
    'Element UI': /^el-(input|select)/,
  };

  function libraryHints() {
    const counts = {};
    const all = document.querySelectorAll('[class]');
    for (let index = 0; index < all.length && index < 8000; index++) {
      const classes = String(all[index].className && all[index].className.baseVal !== undefined ? all[index].className.baseVal : all[index].className).split(/\s+/);
      for (const [library, pattern] of Object.entries(LIBRARY_PREFIXES)) {
        if (classes.some((name) => pattern.test(name))) counts[library] = (counts[library] || 0) + 1;
      }
    }
    return counts;
  }

  function tally(items, key) {
    return items.reduce((counts, item) => {
      counts[item[key]] = (counts[item[key]] || 0) + 1;
      return counts;
    }, {});
  }

  function scan() {
    const fields = P.deepQueryAll(document, P.FIELD_SELECTOR)
      .filter((el) => P.isVisible(el))
      .slice(0, 250)
      .map((el) => ({ kind: P.detectKind(el), ...P.describe(el), blocked: Boolean(P.blockReason(el)) }));
    return {
      url: location.origin + location.pathname,
      title: P.clean(document.title),
      topFrame: window === window.top,
      page: readPageInfo(),
      headings: Array.from(document.querySelectorAll('h1,h2,h3,legend'))
        .filter((el) => P.isVisible(el))
        .slice(0, 25)
        .map((el) => P.clean(el.textContent, 100)),
      fieldCount: fields.length,
      kinds: tally(fields, 'kind'),
      labelSources: tally(fields, 'labelSource'),
      shadowRootCount: P.deepQueryAll(document, '*').filter((el) => el.shadowRoot).length,
      iframes: Array.from(document.querySelectorAll('iframe')).map((frame) => {
        try {
          const url = new URL(frame.src || 'about:blank', location.href);
          return { src: url.origin + url.pathname, sameOrigin: url.origin === location.origin };
        } catch {
          return { src: 'unparseable', sameOrigin: false };
        }
      }),
      libraries: libraryHints(),
      fields,
    };
  }

  // ---- Filing assistant: snapshots, learning, running ------------------------------------------

  const snapshots = new Map();
  let nextSnapshot = 1;
  let recorder = null;
  let watchingRun = false;
  let lastActivityAt = 0;

  function takeSnapshot() {
    const { snapshot, registry } = globalThis.OakSnapshot.take(document);
    const snapshotId = 's' + nextSnapshot++;
    snapshots.set(snapshotId, registry);
    while (snapshots.size > 5) snapshots.delete(snapshots.keys().next().value);
    return { snapshotId, snapshot };
  }

  /** Builds locators for references an AI proposal used, from the elements seen in that snapshot. */
  function locatorsForRefs({ snapshotId, refs }) {
    const registry = snapshots.get(snapshotId);
    if (!registry) return { ok: false, error: 'That snapshot is too old. Ask again.' };
    const locators = {};
    for (const ref of refs) {
      const el = registry.get(ref);
      if (el && Array.isArray(el.candidates)) {
        locators[ref] = el; // an exploration stores locators, built when each field was seen
        continue;
      }
      if (!el || !el.isConnected) continue;
      locators[ref] = ref.startsWith('a') ? globalThis.OakLocator.buildActionLocator(el) : globalThis.OakLocator.buildLocator(el);
    }
    return { ok: true, locators };
  }

  /** Staff clicking or typing on the page during a run pauses it. The assistant's own events are not trusted, so they never count. */
  let exploring = false;
  let exploreAbort = false;
  let pendingAsk = null;

  /**
   * Asks the side panel for a value staff must give (a real NRIC or FIN) and waits for the answer.
   * The value only ever travels panel → this script → the page field; nothing here keeps it.
   */
  function askPanel(question) {
    return new Promise((resolve) => {
      const askId = 'ask-' + Date.now();
      const finish = (answer) => {
        clearTimeout(timer);
        pendingAsk = null;
        resolve(answer);
      };
      const timer = setTimeout(() => finish({ skip: true }), 15 * 60 * 1000);
      pendingAsk = { askId, finish };
      send({ type: 'oak-filing:explore-ask', askId, ...question });
    });
  }

  function onUserActivity(event) {
    if (!event.isTrusted) return;
    if (exploring) {
      exploreAbort = true;
      if (pendingAsk) pendingAsk.finish({ stop: true });
      return;
    }
    if (!watchingRun) return;
    const now = Date.now();
    if (now - lastActivityAt < 1000) return;
    lastActivityAt = now;
    send({ type: 'oak-filing:user-activity', event: event.type });
  }
  ['pointerdown', 'keydown'].forEach((type) => window.addEventListener(type, onUserActivity, true));

  function highlightLocator(locator) {
    const found = globalThis.OakLocator.resolve(document, locator);
    if (found.el) {
      found.el.scrollIntoView({ block: 'center' });
      highlight(found.el, locator.label || locator.group || 'Field');
      setTimeout(() => highlight(null), 2000);
    }
    return { ok: true, found: Boolean(found.el), tried: found.tried };
  }

  const filingHandlers = {
    'oak-filing:page-info': () => ({ ok: true, path: location.pathname, title: document.title, topFrame: window === window.top }),
    'oak-filing:snapshot': () => ({ ok: true, ...takeSnapshot() }),
    'oak-filing:locators-for-refs': (message) => locatorsForRefs(message),
    'oak-filing:record-start': () => {
      if (recorder) recorder.stop();
      recorder = globalThis.OakRecorder.start(document);
      return { ok: true };
    },
    'oak-filing:record-status': () => ({ ok: true, recording: Boolean(recorder), counts: recorder ? recorder.counts() : null }),
    'oak-filing:record-stop': (message) => {
      if (!recorder) return { ok: false, error: 'Not recording.' };
      const recording = recorder.stop();
      recorder = null;
      const built = globalThis.OakRecorder.buildSteps(recording, message.transaction, message.payload || {});
      return { ok: true, ...built, fingerprint: takeSnapshot().snapshot.fingerprint, path: location.pathname };
    },
    'oak-filing:record-cancel': () => {
      if (recorder) recorder.stop();
      recorder = null;
      return { ok: true };
    },
    'oak-filing:run-begin': () => {
      watchingRun = true;
      return { ok: true };
    },
    'oak-filing:run-end': () => {
      watchingRun = false;
      return { ok: true, fingerprint: takeSnapshot().snapshot.fingerprint };
    },
    'oak-filing:run-step': async (message) => {
      // Staff activity is only watched between steps; the step's own work must not pause itself.
      const result = await globalThis.OakRunner.runStep(document, message.step, message.payload || {}, readSignals);
      return { ok: true, result };
    },
    'oak-filing:highlight-locator': (message) => highlightLocator(message.locator),
    'oak-filing:explore': async (message) => {
      if (exploring) return { ok: false, error: 'Already exploring.' };
      exploring = true;
      exploreAbort = false;
      try {
        const result = await globalThis.OakExplorer.explore(document, {
          ...(message.limits || {}),
          testData: Boolean(message.testData),
          testValues: message.testValues || {},
          askForValue: message.testData ? askPanel : null,
          shouldStop: () => exploreAbort,
          onProgress: (text) => send({ type: 'oak-filing:explore-progress', text }),
        });
        const snapshotId = 's' + nextSnapshot++;
        snapshots.set(snapshotId, new Map(Object.entries(result.locators)));
        while (snapshots.size > 5) snapshots.delete(snapshots.keys().next().value);
        return { ok: true, snapshotId, model: result.model, branches: result.branches, stats: result.stats };
      } finally {
        exploring = false;
      }
    },
    'oak-filing:explore-stop': () => {
      exploreAbort = true;
      if (pendingAsk) pendingAsk.finish({ stop: true });
      return { ok: true };
    },
    'oak-filing:explore-answer': (message) => {
      if (!pendingAsk || pendingAsk.askId !== message.askId) return { ok: false, error: 'Exploring is no longer waiting for that answer.' };
      pendingAsk.finish(message.answer || { skip: true });
      return { ok: true };
    },
  };

  // ---- Messaging -----------------------------------------------------------------------------

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message.type !== 'string' || !/^oak-(probe|filing):/.test(message.type)) return false;
    const reply = (promise) => {
      Promise.resolve()
        .then(promise)
        .then(sendResponse, (error) => sendResponse({ ok: false, error: String((error && error.message) || error) }));
      return true;
    };
    if (filingHandlers[message.type]) return reply(() => filingHandlers[message.type](message));
    if (message.type === 'oak-probe:run') return reply(() => runFill(message));
    if (message.type === 'oak-probe:inspect-start') return reply(() => startInspect());
    if (message.type === 'oak-probe:inspect-stop') return reply(() => stopInspect());
    if (message.type === 'oak-probe:recheck') return reply(() => recheck(message));
    if (message.type === 'oak-probe:highlight') {
      return reply(() => {
        const { el } = locate(message.handleId, message.descriptor);
        if (el) {
          el.scrollIntoView({ block: 'center' });
          highlight(el, P.labelInfo(el).name || 'Field');
          setTimeout(() => highlight(null), 2000);
        }
        return { ok: true, found: Boolean(el) };
      });
    }
    return false;
  });

  globalThis.OakProbeContent = { scan, startPick, stopPick, ping: () => true };
})();
