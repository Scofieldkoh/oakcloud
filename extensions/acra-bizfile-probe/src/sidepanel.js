/* OakCloud Bizfile input probe: side panel. Talks only to the Bizfile tab's content scripts. */
'use strict';

(function () {
  const { STRATEGIES, KINDS, verdict, clean } = globalThis.OakProbe;
  const BIZFILE_URL = /^https:\/\/([a-z0-9-]+\.)*bizfile\.gov\.sg\//i;
  const $ = (id) => document.getElementById(id);

  const KIND_LABELS = {
    text: 'Text',
    date: 'Date',
    'native-select': 'Native dropdown',
    combobox: 'Custom dropdown',
    typeahead: 'Type-ahead search',
    radio: 'Radio button',
    checkbox: 'Checkbox',
  };

  const METHOD_HELP = {
    'set-value-events': 'Sets the value directly, then sends input and change events (marked as not from a user).',
    'insert-text-command': 'Uses the browser editing command; its input events are marked as genuine user input.',
    'key-by-key': 'Sends every character as key events. Masked fields (dates, ID numbers) may need this.',
    pointer: 'Sends the full mouse sequence (pointer and mouse down, up, click) at the centre of the control.',
    click: 'Calls click() on the control, which sends a click event only.',
    keyboard: 'Focuses the control and uses the arrow keys, Enter or Space.',
    'label-click': 'Sends the full mouse sequence to the label instead of the control.',
  };

  const VERDICTS = {
    kept: ['Kept', 'good'],
    'kept-dom-only': ['Shown only; page state disagrees', 'warn'],
    'error-shown': ['Kept, but an error appeared', 'warn'],
    lost: ['Lost', 'bad'],
    'not-applied': ['Method failed', 'bad'],
    inconclusive: ['Inconclusive: already had this value', 'neutral'],
    'not-found': ['Field not on this page', 'neutral'],
  };

  const MANUAL = [
    ['kept', 'Bizfile kept it'],
    ['lost', 'Bizfile lost it'],
    ['error', 'Bizfile showed an error'],
  ];

  let target = null;
  let picked = null;
  let picking = false;
  let store = { results: [], scans: [] };

  // ---- Helpers -------------------------------------------------------------------------------

  function h(tag, attributes, ...children) {
    const el = document.createElement(tag);
    Object.entries(attributes || {}).forEach(([key, value]) => {
      if (value === undefined || value === null || value === false) return;
      if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
      else if (key === 'className') el.className = value;
      else el.setAttribute(key, value === true ? '' : value);
    });
    children.flat().forEach((child) => {
      if (child !== null && child !== undefined && child !== false) el.append(child instanceof Node ? child : String(child));
    });
    return el;
  }

  function facts(pairs) {
    return h('dl', null, pairs.filter(([, value]) => value !== '' && value !== null && value !== undefined).flatMap(([term, value]) => [h('dt', null, term), h('dd', null, value)]));
  }

  function hostPath(url) {
    try {
      const parsed = new URL(url);
      return parsed.host + parsed.pathname;
    } catch {
      return 'Bizfile';
    }
  }

  function expectedOf(result) {
    const kind = result.field.kind;
    return kind === 'combobox' || kind === 'typeahead' || kind === 'native-select' ? result.optionText || result.value : result.value;
  }

  function kindNeeds(kind) {
    return {
      value: kind === 'text' || kind === 'date' || kind === 'typeahead',
      option: kind === 'combobox' || kind === 'typeahead' || kind === 'native-select',
    };
  }

  async function save() {
    await chrome.storage.session.set({ probe: store });
  }

  // ---- Target tab ----------------------------------------------------------------------------

  async function findTarget() {
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (active && active.url && BIZFILE_URL.test(active.url)) return active;
    const tabs = await chrome.tabs.query({ url: ['https://*.bizfile.gov.sg/*'] });
    tabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
    return tabs[0] || null;
  }

  async function refreshTarget() {
    const tab = await findTarget();
    target = tab ? { tabId: tab.id, url: tab.url } : null;
    $('target').textContent = target ? 'Testing tab: ' + hostPath(target.url) : 'Open Bizfile (bizfile.gov.sg) in a tab to start.';
    $('scan').disabled = !target;
    $('pick').disabled = !target;
    return target;
  }

  async function inAllFrames(func) {
    return chrome.scripting.executeScript({ target: { tabId: target.tabId, allFrames: true }, func });
  }

  const NOT_LOADED = 'The probe is not loaded in this tab yet. Reload the Bizfile tab and try again.';

  // ---- Scan ----------------------------------------------------------------------------------

  function describeFramework(page) {
    if (!page) return 'Unknown (in-page script did not answer)';
    const found = [];
    if (page.react) found.push('React');
    if (page.angularVersion) found.push('Angular ' + page.angularVersion);
    if (page.vue) found.push('Vue');
    if (page.jquery) found.push('jQuery ' + page.jquery);
    return found.length ? found.join(', ') : 'None detected';
  }

  function countsText(counts) {
    const entries = Object.entries(counts || {});
    return entries.length ? entries.map(([key, count]) => key + ' ' + count).join(', ') : 'none';
  }

  function renderScan(scan) {
    const container = $('scan-result');
    container.replaceChildren(
      ...scan.frames.map((frame) =>
        h(
          'div',
          null,
          h('h3', null, frame.topFrame ? 'Main page' : 'Frame ' + frame.frameId),
          facts([
            ['Page', frame.title + ' (' + frame.url + ')'],
            ['Frameworks', describeFramework(frame.page)],
            ['Component libraries', countsText(frame.libraries)],
            ['Fields', frame.fieldCount + ' (' + countsText(frame.kinds) + ')'],
            ['Labelled by', countsText(frame.labelSources)],
            ['Shadow roots', String(frame.shadowRootCount)],
            ['Frames inside', frame.iframes.length ? frame.iframes.map((item) => item.src + (item.sameOrigin ? '' : ' (other site)')).join('; ') : 'none'],
            ['Headings', frame.headings.join(' / ')],
          ]),
          h(
            'details',
            null,
            h('summary', null, 'Field list'),
            h(
              'pre',
              null,
              frame.fields
                .map((field) => [field.kind, field.label || '(no label)', '[' + field.labelSource + ']', field.group && 'in "' + field.group + '"', field.blocked && 'BLOCKED', field.inShadowRoot && 'shadow'].filter(Boolean).join(' · '))
                .join('\n'),
            ),
          ),
        ),
      ),
    );
  }

  async function scanPage() {
    if (!(await refreshTarget())) return;
    let frames;
    try {
      frames = await inAllFrames(() => (globalThis.OakProbeContent ? globalThis.OakProbeContent.scan() : null));
    } catch (error) {
      $('scan-result').textContent = 'Scan failed: ' + error.message;
      return;
    }
    const loaded = frames.filter((frame) => frame.result);
    if (!loaded.length) {
      $('scan-result').textContent = NOT_LOADED;
      return;
    }
    const scan = { at: new Date().toISOString(), frames: loaded.map((frame) => ({ frameId: frame.frameId, ...frame.result })) };
    store.scans = [...store.scans, scan].slice(-30);
    await save();
    renderScan(scan);
  }

  // ---- Picking -------------------------------------------------------------------------------

  async function stopPicking(message) {
    picking = false;
    $('pick').textContent = 'Pick a field in Bizfile';
    if (message !== undefined) $('pick-status').textContent = message;
    if (!target) return;
    try {
      await inAllFrames(() => globalThis.OakProbeContent && globalThis.OakProbeContent.stopPick());
    } catch {
      // The tab may have navigated away; nothing to stop.
    }
  }

  async function togglePick() {
    if (picking) {
      await stopPicking('Picking cancelled.');
      return;
    }
    if (!(await refreshTarget())) return;
    let frames;
    try {
      frames = await inAllFrames(() => (globalThis.OakProbeContent ? globalThis.OakProbeContent.startPick() : null));
    } catch (error) {
      $('pick-status').textContent = 'Could not start picking: ' + error.message;
      return;
    }
    if (!frames.some((frame) => frame.result)) {
      $('pick-status').textContent = NOT_LOADED;
      return;
    }
    picking = true;
    $('pick').textContent = 'Cancel picking';
    $('pick-status').textContent = 'Click a field in the Bizfile tab. Press Esc to cancel. Clicks are not passed to Bizfile while picking.';
  }

  function fillSelect(select, values, labels, selected) {
    select.replaceChildren(...values.map((value) => h('option', { value, selected: value === selected }, labels[value] || value)));
  }

  function updateKindControls() {
    const kind = $('kind').value;
    const needs = kindNeeds(kind);
    $('value-row').hidden = !needs.value;
    $('option-row').hidden = !needs.option;
    $('value-row').firstChild.textContent = kind === 'typeahead' ? 'Text to type' : 'Value to enter';
    fillSelect($('strategy'), STRATEGIES[kind], {}, STRATEGIES[kind][0]);
    updateStrategyHelp();
  }

  function updateStrategyHelp() {
    const parts = $('strategy').value.split('+');
    $('strategy-help').textContent = parts.map((part) => METHOD_HELP[part]).filter(Boolean).join(' Then: ');
  }

  function renderField() {
    const { field, frameId } = picked;
    const descriptor = field.descriptor;
    $('field-card').hidden = false;
    $('field-facts').replaceWith(
      Object.assign(
        facts([
          ['Field', descriptor.label || '(no label)'],
          ['Labelled by', descriptor.labelSource],
          ['Question', descriptor.group],
          ['Element', [descriptor.tag, descriptor.type && 'type=' + descriptor.type, descriptor.role && 'role=' + descriptor.role].filter(Boolean).join(' ')],
          ['Where', (frameId === 0 ? 'Main page' : 'Frame ' + frameId) + (descriptor.inShadowRoot ? ', inside shadow DOM' : '')],
          ['Page state readable', field.signals && (field.signals.react || field.signals.vue) ? 'Yes (' + (field.signals.react ? 'React' : 'Vue') + ')' : 'No'],
        ]),
        { id: 'field-facts' },
      ),
    );
    fillSelect($('kind'), KINDS, KIND_LABELS, field.kind);
    $('field-blocked').hidden = !field.blockReason;
    $('field-blocked').textContent = field.blockReason ? 'Not testable: ' + field.blockReason : '';
    $('run').disabled = Boolean(field.blockReason);
    $('test-controls').hidden = Boolean(field.blockReason);
    $('value').value = '';
    $('option').value = '';
    $('pick-status').textContent = '';
    updateKindControls();
  }

  // ---- Running tests -------------------------------------------------------------------------

  async function sendToFrame(message, frameId) {
    try {
      return await chrome.tabs.sendMessage(target.tabId, message, { frameId });
    } catch (error) {
      if (frameId !== 0) return chrome.tabs.sendMessage(target.tabId, message, { frameId: 0 });
      throw error;
    }
  }

  async function runTest(event) {
    event.preventDefault();
    if (!picked || !(await refreshTarget())) return;
    const kind = $('kind').value;
    const strategy = $('strategy').value;
    const needs = kindNeeds(kind);
    const value = needs.value ? $('value').value : '';
    const optionText = needs.option ? $('option').value.trim() : '';
    if ((needs.value && !value) || (needs.option && !optionText)) {
      $('pick-status').textContent = 'Fill in the value' + (needs.option ? ' and the option' : '') + ' first.';
      return;
    }
    $('run').disabled = true;
    $('pick-status').textContent = 'Running ' + strategy + '… (about 3 seconds)';
    try {
      const { field, frameId } = picked;
      const response = await sendToFrame(
        { type: 'oak-probe:run', handleId: field.handleId, descriptor: field.descriptor, kind, strategy, value, optionText },
        frameId,
      );
      if (!response || !response.ok) {
        $('pick-status').textContent = 'Not run: ' + ((response && response.error) || 'no answer from the page');
        return;
      }
      store.results.push({
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        page: hostPath(target.url),
        frameId,
        field: { handleId: field.handleId, descriptor: field.descriptor, kind },
        strategy,
        value,
        optionText,
        outcome: response.result,
        rechecks: [],
        manual: null,
      });
      await save();
      renderResults();
      $('pick-status').textContent = 'Done: ' + VERDICTS[response.result.verdict][0] + '.';
      const methods = STRATEGIES[kind];
      const next = methods[(methods.indexOf(strategy) + 1) % methods.length];
      $('strategy').value = next;
      updateStrategyHelp();
    } catch (error) {
      $('pick-status').textContent = 'Not run: ' + error.message + '. If the page changed, pick the field again.';
    } finally {
      $('run').disabled = Boolean(picked && picked.field.blockReason);
    }
  }

  async function recheck(result) {
    if (!(await refreshTarget())) return;
    let response;
    try {
      response = await sendToFrame({ type: 'oak-probe:recheck', handleId: result.field.handleId, descriptor: result.field.descriptor }, result.frameId);
    } catch (error) {
      response = { ok: false, error: error.message };
    }
    const entry = { at: new Date().toISOString(), page: hostPath(target.url) };
    if (!response || !response.ok) entry.verdict = 'not-found';
    else if (!response.found) entry.verdict = 'not-found';
    else {
      entry.relocated = response.relocated;
      entry.state = response.state;
      entry.signals = response.signals;
      entry.verdict = verdict(result.field.kind, expectedOf(result), { connected: false }, response.state, response.signals);
    }
    result.rechecks.push(entry);
    await save();
    renderResults();
  }

  async function showField(result) {
    if (!(await refreshTarget())) return;
    try {
      await sendToFrame({ type: 'oak-probe:highlight', handleId: result.field.handleId, descriptor: result.field.descriptor }, result.frameId);
    } catch {
      // Highlighting is a convenience only.
    }
  }

  // ---- Results -------------------------------------------------------------------------------

  function verdictBadge(code) {
    const [label, tone] = VERDICTS[code] || [code, 'neutral'];
    return h('span', { className: 'verdict ' + tone }, label);
  }

  function heldByPage(signals) {
    const held = signals && (signals.react || signals.vue);
    if (!held) return 'not readable';
    const parts = [];
    if (held.value !== undefined) parts.push('value "' + held.value + '"');
    if (held.componentValue !== undefined) parts.push('component value "' + held.componentValue + '"');
    if (held.checked !== undefined) parts.push(held.checked ? 'checked' : 'not checked');
    return parts.join(', ') || 'no value prop';
  }

  function shown(state) {
    if (!state || !state.connected) return 'field gone';
    if (state.checked !== undefined) return state.checked ? 'checked' : 'not checked';
    return '"' + clean(state.value, 60) + '"' + (state.display && state.display !== state.value ? ' (box shows "' + clean(state.display, 60) + '")' : '');
  }

  function renderResults() {
    $('result-count').textContent = store.results.length ? '(' + store.results.length + ')' : '';
    $('results').replaceChildren(
      ...store.results
        .slice()
        .reverse()
        .map((result) => {
          const outcome = result.outcome;
          const lastCheck = result.rechecks[result.rechecks.length - 1];
          return h(
            'li',
            { 'data-verdict': outcome.verdict },
            h(
              'div',
              { className: 'result-head' },
              h('strong', null, (result.field.descriptor.label || '(no label)') + ' · ' + KIND_LABELS[result.field.kind] + ' · ' + result.strategy),
              verdictBadge(outcome.verdict),
            ),
            outcome.error ? h('p', { className: 'blocked' }, outcome.error) : h('p', { className: 'muted' }, outcome.note),
            facts([
              ['Expected', '"' + outcome.expected + '"'],
              ['Shown after', shown(outcome.settled)],
              ['Page state', heldByPage(outcome.signals)],
              ['Message', outcome.settled && outcome.settled.errorText],
              ['Recheck', lastCheck ? (VERDICTS[lastCheck.verdict] || [lastCheck.verdict])[0] + ' on ' + lastCheck.page + ' at ' + lastCheck.at.slice(11, 19) : ''],
            ]),
            h(
              'div',
              { className: 'manual' },
              h('button', { type: 'button', className: 'small', onclick: () => recheck(result) }, 'Recheck'),
              h('button', { type: 'button', className: 'small', onclick: () => showField(result) }, 'Show field'),
              ...MANUAL.map(([code, label]) =>
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'small',
                    'aria-pressed': result.manual === code ? 'true' : 'false',
                    onclick: async () => {
                      result.manual = result.manual === code ? null : code;
                      await save();
                      renderResults();
                    },
                  },
                  label,
                ),
              ),
            ),
            h('details', null, h('summary', null, 'Details'), h('pre', null, JSON.stringify({ outcome, rechecks: result.rechecks }, null, 2))),
          );
        }),
    );
  }

  // ---- Export --------------------------------------------------------------------------------

  /** Keeps values that relate to the test value; anything else (e.g. real prefilled data) is reduced to its length. */
  function redact(value, expected) {
    if (value === undefined || value === null || value === '') return value;
    const text = String(value).toLowerCase().trim();
    const wanted = String(expected || '').toLowerCase().trim();
    const digits = (input) => input.replace(/\D/g, '');
    if (wanted && (text.includes(wanted) || wanted.includes(text) || (digits(text) && digits(text) === digits(wanted)))) return value;
    return '[other value, ' + String(value).length + ' characters]';
  }

  function redactState(state, expected) {
    if (!state) return state;
    return { ...state, value: redact(state.value, expected), display: redact(state.display, expected) };
  }

  function redactSignals(signals, expected) {
    if (!signals) return signals;
    const clip = (held) => held && { ...held, value: redact(held.value, expected), componentValue: redact(held.componentValue, expected) };
    return { ...signals, react: clip(signals.react), vue: clip(signals.vue) };
  }

  function exportResults() {
    const results = store.results.map((result) => {
      const expected = expectedOf(result);
      const outcome = result.outcome;
      return {
        ...result,
        outcome: {
          ...outcome,
          before: redactState(outcome.before, expected),
          afterSet: redactState(outcome.afterSet, expected),
          afterBlur: redactState(outcome.afterBlur, expected),
          settled: redactState(outcome.settled, expected),
          signals: redactSignals(outcome.signals, expected),
        },
        rechecks: result.rechecks.map((entry) => ({ ...entry, state: redactState(entry.state, expected), signals: redactSignals(entry.signals, expected) })),
      };
    });
    const payload = {
      tool: 'oakcloud-bizfile-input-probe',
      version: chrome.runtime.getManifest().version,
      exportedAt: new Date().toISOString(),
      browser: navigator.userAgent,
      scans: store.scans,
      results,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const anchor = h('a', { href: url, download: 'bizfile-probe-' + payload.exportedAt.slice(0, 16).replace(/[:T]/g, '') + '.json' });
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function clearResults() {
    if (!window.confirm('Clear all scans and results from this browser session?')) return;
    store = { results: [], scans: [] };
    await save();
    renderResults();
    $('scan-result').replaceChildren();
  }

  // ---- Wiring --------------------------------------------------------------------------------

  chrome.runtime.onMessage.addListener((message, sender) => {
    if (!message || !target || !sender.tab || sender.tab.id !== target.tabId) return;
    if (message.type === 'oak-probe:picked') {
      picked = { frameId: sender.frameId, field: message.field };
      stopPicking('');
      renderField();
    } else if (message.type === 'oak-probe:pick-miss') {
      $('pick-status').textContent = message.message;
    } else if (message.type === 'oak-probe:pick-cancelled') {
      stopPicking('Picking cancelled.');
    }
  });

  chrome.tabs.onActivated.addListener(() => refreshTarget());
  chrome.tabs.onUpdated.addListener((_tabId, change) => {
    if (change.url || change.status === 'complete') refreshTarget();
  });

  $('scan').addEventListener('click', scanPage);
  $('pick').addEventListener('click', togglePick);
  $('kind').addEventListener('change', updateKindControls);
  $('strategy').addEventListener('change', updateStrategyHelp);
  $('field-card').addEventListener('submit', runTest);
  $('export').addEventListener('click', exportResults);
  $('clear').addEventListener('click', clearResults);

  (async () => {
    const saved = await chrome.storage.session.get('probe');
    if (saved.probe) store = saved.probe;
    renderResults();
    const lastScan = store.scans[store.scans.length - 1];
    if (lastScan) renderScan(lastScan);
    await refreshTarget();
  })();
})();
