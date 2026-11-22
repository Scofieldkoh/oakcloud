/*
 * Side panel: the Learn tab. Three ways to learn a screen, all ending in a proposal staff review
 * before it is saved as a new screen-map version:
 *   - by watching staff fill the screen once (no AI)
 *   - by exploring: the assistant tries every option on the screen to find every field and which
 *     option shows it, then OakCloud's AI (or staff) maps the fields; steps get conditions
 *   - by asking OakCloud's AI to map the fields showing now
 */
(function () {
  'use strict';
  const P = globalThis.Panel;
  const h = P.h;
  const DEFAULT_METHOD = globalThis.OakRecorder.DEFAULT_METHOD;

  /** The proposal being reviewed: { source, path, fingerprint, items: [{ include, step, note }], unmapped, ignored, notes }. */
  let proposal = null;
  let watchTimer = null;

  function keyOptions(selected) {
    const fields = globalThis.OakSchemas.get(P.state.transaction).fields;
    return [h('option', { value: '' }, 'Ignore this field'), ...fields.map((field) => h('option', { value: field.key, selected: field.key === selected }, field.label))];
  }

  const FILLED = '(when filled)';

  function describeConditions(derived) {
    if (!derived) return '';
    const parts = derived.conditions.map((condition) => (condition.filled ? condition.label + ' is filled in' : condition.label + ' is "' + condition.equalsAny[0] + '"'));
    if (derived.optional) parts.push('an option not in the filing details');
    return parts.length ? ' — only when ' + parts.join(' and ') : '';
  }

  function describeStep(step, derived) {
    if (step.type === 'action') return 'Click "' + step.label + '"' + (step.always ? ' once, at this point' : ' when its fields are missing');
    const choice = step.kind === 'radio' || step.kind === 'checkbox';
    const where = (choice && step.locator.group) || step.locator.label || step.locator.group || step.locator.candidates[0].value;
    return P.stepLabel(step) + ' → "' + where + '" (' + step.kind + (step.format ? ', ' + step.format : '') + ')' + describeConditions(derived);
  }

  // ---- Conditions from exploring ------------------------------------------------------------

  /** Which filing-details key each explored field reference fills, with the choices made so far. */
  function keysByRef() {
    const keys = {};
    const valueMaps = {};
    proposal.items.filter((item) => item.include && item.ref && item.step.type === 'fill').forEach((item) => {
      keys[item.ref] = item.step.key;
      if (item.step.valueMap) valueMaps[item.ref] = item.step.valueMap;
    });
    proposal.unmapped.filter((item) => item.ref && item.key).forEach((item) => (keys[item.ref] = item.key));
    return { keys, valueMaps };
  }

  /**
   * Turns "shown when field f1 has option Corporate" into "only when the filing detail mapped to f1
   * is Corporate". A condition on a field mapped to no detail makes the step optional instead.
   */
  function conditionsFor(ref, mapping) {
    const field = proposal.model && proposal.model.fields.find((item) => item.ref === ref);
    if (!field || !field.shownWhen || !field.shownWhen.length) return null;
    const conditions = [];
    let optional = false;
    for (const condition of field.shownWhen) {
      const key = mapping.keys[condition.ref];
      if (!key) {
        optional = true;
        continue;
      }
      if (condition.option === FILLED) {
        const filledField = globalThis.OakSchemas.field(P.state.transaction, key);
        conditions.push({ key, filled: true, label: filledField ? filledField.label : key });
        continue;
      }
      const equivalents = Object.entries(mapping.valueMaps[condition.ref] || {})
        .filter(([, shown]) => globalThis.OakFormats.normaliseText(shown) === globalThis.OakFormats.normaliseText(condition.option))
        .map(([value]) => value);
      const schemaField = globalThis.OakSchemas.field(P.state.transaction, key);
      conditions.push({ key, equalsAny: [condition.option, ...equivalents], label: schemaField ? schemaField.label : key });
    }
    return { conditions, optional };
  }

  function render() {
    const box = P.$('learn-proposal');
    if (!proposal) {
      box.replaceChildren();
      return;
    }
    const mapping = proposal.model ? keysByRef() : null;
    const parts = [
      h('h3', null, proposal.source === 'demonstration' ? 'What the assistant learned' : proposal.source === 'exploration' ? 'Proposed steps from exploring' : 'What the AI proposes'),
      h('p', { className: 'muted' }, 'Untick anything wrong. Nothing is saved until you press Save.'),
      h(
        'ol',
        { className: 'plain' },
        proposal.items.map((item, index) =>
          h(
            'li',
            null,
            h(
              'label',
              { className: 'check' },
              h('input', {
                type: 'checkbox',
                checked: item.include,
                onchange: (event) => {
                  proposal.items[index].include = event.target.checked;
                  render();
                },
              }),
              describeStep(item.step, mapping && item.ref ? conditionsFor(item.ref, mapping) : null),
            ),
            item.note ? h('p', { className: 'muted small' }, item.note) : null,
          ),
        ),
      ),
      proposal.unmapped.length
        ? h(
            'div',
            null,
            h('h4', null, proposal.unmappedTitle || 'Fields you changed that matched no detail'),
            proposal.unmapped.map((item, index) =>
              h(
                'label',
                null,
                '"' + item.label + '" (' + item.kind + ')' + (mapping && item.ref && item.key ? describeConditions(conditionsFor(item.ref, mapping)) : ''),
                h(
                  'select',
                  {
                    onchange: (event) => {
                      proposal.unmapped[index].key = event.target.value;
                      render();
                    },
                  },
                  keyOptions(item.key),
                ),
              ),
            ),
          )
        : null,
      proposal.ignored.length ? h('p', { className: 'muted' }, 'Left to staff: ' + proposal.ignored.map((item) => item.label).join(', ') + '.') : null,
      proposal.notes ? h('p', { className: 'muted' }, proposal.notes) : null,
      h('div', { className: 'row' }, h('button', { type: 'button', id: 'learn-save', onclick: save }, 'Save to screen map'), h('button', { type: 'button', className: 'quiet', onclick: discard }, 'Discard')),
    ];
    box.replaceChildren(...parts.filter(Boolean));
  }

  function discard() {
    proposal = null;
    render();
    P.say('learn-status', 'Discarded.');
  }

  /** Links each reveal button to the first field step after it, so it is clicked only when needed. */
  function linkActions(steps) {
    return steps.filter((step, index) => {
      if (step.type !== 'action') return true;
      if (step.always || (step.when && step.when.missing)) return true;
      const next = step.revealsKey ? steps.find((item) => item.key === step.revealsKey) : steps.slice(index + 1).find((item) => item.type === 'fill');
      if (!next) return false;
      step.when = { missing: next.locator };
      delete step.revealsKey;
      return true;
    });
  }

  async function save() {
    const mapping = proposal.model ? keysByRef() : null;
    const withConditions = (step, ref) => {
      const derived = mapping && ref ? conditionsFor(ref, mapping) : null;
      if (!derived) return step;
      return { ...step, ...(derived.conditions.length ? { conditions: derived.conditions } : {}), ...(derived.optional ? { optional: true } : {}) };
    };
    const chosen = proposal.items.filter((item) => item.include).map((item) => withConditions(item.step, item.ref));
    proposal.unmapped
      .filter((item) => item.key)
      .forEach((item) => chosen.push(withConditions({ type: 'fill', key: item.key, kind: item.kind, method: DEFAULT_METHOD[item.kind], format: item.format || null, locator: item.locator }, item.ref)));
    const steps = linkActions(chosen.map((step) => JSON.parse(JSON.stringify(step))));
    if (!steps.length) {
      P.say('learn-status', 'Nothing to save.', 'bad');
      return;
    }
    const map = P.currentMap();
    const existing = globalThis.OakPlaybook.findScreen(map, proposal.path);
    const mergedSteps = globalThis.OakPlaybook.mergeSteps(existing ? existing.steps : [], steps.map(({ id, ...rest }) => rest));
    const kept = mergedSteps.length - steps.length;
    const screen = {
      path: proposal.path,
      title: existing ? existing.title : proposal.title || proposal.path,
      fingerprint: proposal.fingerprint || (existing && existing.fingerprint) || null,
      steps: mergedSteps,
    };
    const source = proposal.source === 'demonstration' ? 'demonstration' : proposal.source === 'exploration' && !proposal.usedAi ? 'exploration' : 'ai-approved';
    const next = globalThis.OakPlaybook.putScreen(map, screen, {
      source,
      summary: (proposal.source === 'exploration' ? 'Learned by exploring' + (proposal.usedAi ? ' with AI mapping' : '') + ': ' : source === 'demonstration' ? 'Learned by watching: ' : 'AI mapping approved: ') + steps.length + ' steps on ' + proposal.path + (kept > 0 ? ', ' + kept + ' earlier steps kept' : '') + '.',
    });
    await P.setMap(next);
    proposal = null;
    render();
    P.say('learn-status', 'Saved as screen map version ' + next.version + '. Use the Fill tab to run it.', 'good');
  }

  // ---- Learning by watching -----------------------------------------------------------------

  function watchingButtons(watching) {
    P.$('learn-watch-start').disabled = watching;
    P.$('learn-watch-finish').disabled = !watching;
    P.$('learn-watch-cancel').disabled = !watching;
  }

  async function startWatching() {
    if (!Object.keys(P.currentDetails()).length) {
      P.say('learn-status', 'Enter the filing details first (Details tab), so the assistant can recognise what you type.', 'bad');
      return;
    }
    try {
      await P.refreshTarget();
      await P.send({ type: 'oak-filing:record-start' });
    } catch (error) {
      P.say('learn-status', error.message, 'bad');
      return;
    }
    watchingButtons(true);
    P.say('learn-status', 'Watching. Fill the Bizfile screen yourself using the filing details (click Add position holder and so on as usual), then press Finish.');
    watchTimer = setInterval(async () => {
      try {
        const status = await P.send({ type: 'oak-filing:record-status' });
        if (status.counts) P.say('learn-status', 'Watching: ' + status.counts.fields + ' fields and ' + status.counts.actions + ' button clicks so far. Press Finish when the screen is filled.');
      } catch {
        // The page may be busy; the next tick will try again.
      }
    }, 1500);
  }

  async function finishWatching() {
    clearInterval(watchTimer);
    watchingButtons(false);
    let result;
    try {
      result = await P.send({ type: 'oak-filing:record-stop', transaction: P.state.transaction, payload: P.currentDetails() });
    } catch (error) {
      P.say('learn-status', error.message, 'bad');
      return;
    }
    proposal = {
      source: 'demonstration',
      path: result.path,
      fingerprint: result.fingerprint,
      items: result.steps.map((step) => ({ include: true, step })),
      unmapped: result.unmapped.map((item) => ({ ...item, key: item.candidates && item.candidates.length === 1 ? item.candidates[0] : '' })),
      ignored: result.ignored,
      notes: '',
    };
    P.say('learn-status', 'Learned ' + result.steps.length + (result.steps.length === 1 ? ' step.' : ' steps.') + ' Review below.');
    render();
  }

  async function cancelWatching() {
    clearInterval(watchTimer);
    watchingButtons(false);
    await P.send({ type: 'oak-filing:record-cancel' }).catch(() => {});
    P.say('learn-status', 'Stopped watching. Nothing was learned.');
  }

  // ---- Learning by exploring ----------------------------------------------------------------

  let exploring = false;

  function exploreButtons(active) {
    exploring = active;
    P.$('learn-explore').disabled = active;
    P.$('learn-explore-test').disabled = active;
    P.$('learn-explore-stop').disabled = !active;
  }

  /** Shows what exploring found: for each option, the fields it showed and hid. */
  function renderExploration(result) {
    const labelOf = (ref) => {
      const field = result.model.fields.find((item) => item.ref === ref);
      return field ? field.label || field.placeholder || ref : ref;
    };
    const rows = result.branches
      .filter((branch) => branch.error || branch.shown.length || branch.hidden.length)
      .map((branch) =>
        h(
          'li',
          { className: 'small' },
          h('strong', null, branch.option === FILLED ? '"' + labelOf(branch.control) + '" filled in' : labelOf(branch.control) + ' = "' + branch.option + '"'),
          branch.error ? ': could not choose it (' + branch.error + ')' : '',
          branch.shown.length ? ' shows ' + branch.shown.map(labelOf).join(', ') + '.' : '',
          branch.hidden.length ? ' Hides ' + branch.hidden.map(labelOf).join(', ') + '.' : '',
        ),
      );
    const tried = result.branches.length;
    P.$('learn-explore-result').replaceChildren(
      h(
        'details',
        { open: true },
        h('summary', null, 'Explored: ' + result.model.fields.length + ' fields, ' + tried + ' options tried in ' + Math.round(result.stats.ms / 1000) + 's'),
        result.stats.stoppedBecause ? h('p', { className: 'muted small' }, result.stats.stoppedBecause) : null,
        result.model.actions.length ? h('p', { className: 'small' }, 'Reveal buttons: ' + result.model.actions.map((action) => '"' + action.label + '"').join(', ') + '.') : null,
        rows.length ? h('ol', { className: 'plain' }, rows) : h('p', { className: 'muted small' }, 'No option showed or hid other fields.'),
        h('button', { type: 'button', className: 'small quiet', id: 'learn-explore-export', onclick: () => exportExploration(result) }, 'Export what was found'),
      ),
    );
  }

  /** The exploration as JSON: structure only (labels, types, options, conditions), never values. */
  function exportExploration(result) {
    const payload = { tool: 'oakcloud-filing-assistant-exploration', exportedAt: new Date().toISOString(), browser: navigator.userAgent, model: result.model, branches: result.branches, stats: result.stats };
    const url = URL.createObjectURL(new Blob([JSON.stringify(P.ai.redactDetails(payload), null, 2)], { type: 'application/json' }));
    const anchor = h('a', { href: url, download: 'bizfile-exploration.json' });
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /** Words too common in labels to count as a full match on their own. */
  const WEAK_WORDS = new Set(['the', 'and', 'for', 'per', 'select', 'enter', 'your', 'number', 'name']);

  function words(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, ' ')
      .split(' ')
      .filter((word) => word.length >= 3 || /^\d+$/.test(word));
  }

  /**
   * Without AI, suggests the filing detail whose label best matches a field's label: the share of
   * the detail's label words found in the field's label, with common words counting a quarter.
   * Only a clear, unused match of at least half is suggested; staff still review every choice.
   */
  function suggestKey(field, usedKeys) {
    const fieldWords = new Set(words((field.label || '') + ' ' + (field.placeholder || '')));
    const scored = globalThis.OakSchemas.get(P.state.transaction)
      .fields.filter((target) => !usedKeys.has(target.key))
      .map((target) => {
        const targetWords = words(target.label);
        const score = targetWords.reduce((total, word) => total + (fieldWords.has(word) ? (WEAK_WORDS.has(word) ? 0.25 : 1) : 0), 0) / Math.max(targetWords.length, 1);
        return { key: target.key, score };
      })
      .sort((a, b) => b.score - a.score);
    const [best, second] = scored;
    return best && best.score >= 0.5 && (!second || second.score < best.score) ? best.key : '';
  }

  /** Reveal buttons that brought fields which ended up mapped become action steps. */
  function revealSteps(result, mappedRefs, keyOf) {
    return result.model.actions
      .map((action) => {
        const firstMapped = (action.reveals || []).find((ref) => mappedRefs.has(ref));
        return firstMapped ? { ref: action.ref, firstMapped } : null;
      })
      .filter(Boolean)
      .map(({ ref, firstMapped }) => ({ ref, revealsKey: keyOf(firstMapped) }));
  }

  async function explore(testData) {
    if (exploring) return;
    exploreButtons(true);
    P.$('learn-explore-result').replaceChildren();
    P.say(
      'learn-status',
      'Exploring' + (testData ? ' with test data' : '') + '… The assistant is trying every option' + (testData ? ' and typing test values' : '') + ' on the Bizfile screen. Do not use the page; clicking it stops exploring.',
    );
    let result;
    try {
      await P.refreshTarget();
      const settings = P.state.settings;
      result = await P.send({ type: 'oak-filing:explore', testData, testValues: { phone: settings.testPhone || '', postalCode: settings.testPostalCode || '' } });
    } catch (error) {
      P.say('learn-status', error.message, 'bad');
      exploreButtons(false);
      return;
    }
    exploreButtons(false);
    renderExploration(result);
    if (!result.model.fields.length) {
      P.say('learn-status', 'No fields found on this screen.', 'bad');
      return;
    }

    let answer = null;
    if (P.ai.configured()) {
      P.say('learn-status', 'Asking OakCloud’s AI to map the ' + result.model.fields.length + ' fields found… (no filing values are sent)');
      try {
        answer = await P.ai.proposeMap(result.model);
      } catch (error) {
        P.say('learn-status', 'AI mapping failed (' + error.message + '). Map the fields yourself below.', 'warn');
      }
    }

    const fillSteps = answer ? answer.steps.filter((step) => step.type === 'fill') : [];
    const mappedRefs = new Set(fillSteps.map((step) => step.ref));
    const keyOf = (ref) => (fillSteps.find((step) => step.ref === ref) || {}).key;
    const reveals = revealSteps(result, mappedRefs, keyOf);
    const refs = [...reveals.map((item) => item.ref), ...result.model.fields.map((field) => field.ref)];
    const { locators } = await P.send({ type: 'oak-filing:locators-for-refs', snapshotId: result.snapshotId, refs });
    const order = (ref) => Number(String(ref).slice(1));

    const items = [
      ...reveals.filter((item) => locators[item.ref]).map((item) => ({ include: true, ref: null, note: 'Found while exploring.', step: { type: 'action', label: locators[item.ref].label, locator: locators[item.ref], revealsKey: item.revealsKey } })),
      ...fillSteps
        .filter((step) => locators[step.ref])
        .sort((a, b) => order(a.ref) - order(b.ref))
        .map((step) => ({
          include: step.confidence >= 0.6,
          ref: step.ref,
          note: Math.round(step.confidence * 100) + '% sure: ' + step.reason,
          step: {
            type: 'fill',
            key: step.key,
            kind: step.kind,
            method: DEFAULT_METHOD[step.kind],
            // A date format the page accepted while exploring beats the AI's guess.
            format: (result.model.fields.find((field) => field.ref === step.ref) || {}).format || step.format || null,
            ...(step.valueMap ? { valueMap: step.valueMap } : {}),
            locator: locators[step.ref],
          },
        })),
    ];
    const usedKeys = new Set(fillSteps.map((step) => step.key));
    const unmapped = result.model.fields
      .filter((field) => !mappedRefs.has(field.ref) && locators[field.ref])
      .map((field) => {
        const key = suggestKey(field, usedKeys);
        if (key) usedKeys.add(key);
        return { ref: field.ref, label: field.label || field.placeholder || '(no label)', kind: field.kind, locator: locators[field.ref], key, format: field.format || null };
      });

    proposal = {
      source: 'exploration',
      usedAi: Boolean(answer),
      path: result.model.path,
      title: result.model.title,
      model: result.model,
      fingerprint: { path: result.model.path, headings: result.model.headings, labels: Array.from(new Set(result.model.fields.map((field) => field.label || field.placeholder).filter(Boolean))).sort(), explored: true },
      items,
      unmapped,
      unmappedTitle: answer ? 'Fields found that the AI did not map' : 'Fields found: check or choose the detail each one holds (likely matches are pre-selected)',
      ignored: [],
      notes: answer && answer.notes ? answer.notes : '',
    };
    P.say('learn-status', answer ? 'The AI mapped ' + fillSteps.length + ' of ' + result.model.fields.length + ' fields. Review below.' : 'Choose the filing detail for each field below.');
    render();
  }

  async function stopExploring() {
    await P.send({ type: 'oak-filing:explore-stop' }).catch(() => {});
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message && message.type === 'oak-filing:explore-progress' && exploring) P.say('learn-status', 'Exploring… ' + message.text);
  });

  // ---- Learning with AI ---------------------------------------------------------------------

  async function askAi() {
    if (!P.ai.configured()) {
      P.say('learn-status', 'Connect OakCloud in Settings first.', 'bad');
      return;
    }
    P.$('learn-ai').disabled = true;
    P.say('learn-status', 'Reading the screen and asking OakCloud’s AI… (no filing values are sent)');
    try {
      await P.refreshTarget();
      const { snapshot, snapshotId } = await P.send({ type: 'oak-filing:snapshot' });
      const answer = await P.ai.proposeMap(snapshot);
      const refs = answer.steps.map((step) => step.ref);
      const { locators } = await P.send({ type: 'oak-filing:locators-for-refs', snapshotId, refs });
      const items = answer.steps
        .filter((step) => locators[step.ref])
        .map((step) => ({
          include: step.confidence >= 0.6,
          note: Math.round(step.confidence * 100) + '% sure: ' + step.reason,
          step:
            step.type === 'action'
              ? { type: 'action', label: locators[step.ref].label, locator: locators[step.ref], revealsKey: step.revealsKey }
              : { type: 'fill', key: step.key, kind: step.kind, method: DEFAULT_METHOD[step.kind], format: step.format || null, ...(step.valueMap ? { valueMap: step.valueMap } : {}), locator: locators[step.ref] },
        }));
      proposal = {
        source: 'ai',
        path: snapshot.path,
        fingerprint: snapshot.fingerprint,
        items,
        unmapped: [],
        ignored: [],
        notes: [answer.notes, answer.unmappedKeys && answer.unmappedKeys.length ? 'Not on this screen (or hidden until a button is clicked): ' + answer.unmappedKeys.join(', ') + '.' : ''].filter(Boolean).join(' '),
      };
      P.say('learn-status', 'The AI proposed ' + items.length + ' steps. Review them below.');
      render();
    } catch (error) {
      P.say('learn-status', error.message, 'bad');
    } finally {
      P.$('learn-ai').disabled = false;
    }
  }

  P.on('ready', () => {
    watchingButtons(false);
    P.$('learn-watch-start').addEventListener('click', startWatching);
    P.$('learn-watch-finish').addEventListener('click', finishWatching);
    P.$('learn-watch-cancel').addEventListener('click', cancelWatching);
    P.$('learn-ai').addEventListener('click', askAi);
    P.$('learn-explore').addEventListener('click', () => explore(false));
    P.$('learn-explore-test').addEventListener('click', () => {
      if (window.confirm('Explore with test data types fake values (TEST names, an example.com email, your office phone and postal code) into this Bizfile draft, then clears them. It never types NRIC or FIN numbers and never presses Retrieve information. Use a test filing and delete the draft afterwards. Continue?')) explore(true);
    });
    P.$('learn-explore-stop').addEventListener('click', stopExploring);
    P.$('learn-explore-stop').disabled = true;
  });
})();
