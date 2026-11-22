/*
 * Side panel: the Learn tab. Two ways to learn a screen, both ending in a proposal staff review
 * before it is saved as a new screen-map version:
 *   - by watching staff fill the screen once (no AI)
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

  function describeStep(step) {
    if (step.type === 'action') return 'Click "' + step.label + '" when its fields are missing';
    const choice = step.kind === 'radio' || step.kind === 'checkbox';
    const where = (choice && step.locator.group) || step.locator.label || step.locator.group || step.locator.candidates[0].value;
    return P.stepLabel(step) + ' → "' + where + '" (' + step.kind + (step.format ? ', ' + step.format : '') + ')';
  }

  function render() {
    const box = P.$('learn-proposal');
    if (!proposal) {
      box.replaceChildren();
      return;
    }
    const parts = [
      h('h3', null, proposal.source === 'demonstration' ? 'What the assistant learned' : 'What the AI proposes'),
      h('p', { className: 'muted' }, 'Untick anything wrong. Nothing is saved until you press Save.'),
      h(
        'ol',
        { className: 'plain' },
        proposal.items.map((item, index) =>
          h(
            'li',
            null,
            h('label', { className: 'check' }, h('input', { type: 'checkbox', checked: item.include, onchange: (event) => (proposal.items[index].include = event.target.checked) }), describeStep(item.step)),
            item.note ? h('p', { className: 'muted small' }, item.note) : null,
          ),
        ),
      ),
      proposal.unmapped.length
        ? h(
            'div',
            null,
            h('h4', null, 'Fields you changed that matched no detail'),
            proposal.unmapped.map((item, index) =>
              h('label', null, '"' + item.label + '" (' + item.kind + ')', h('select', { onchange: (event) => (proposal.unmapped[index].key = event.target.value) }, keyOptions(item.key))),
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
      if (step.when && step.when.missing) return true;
      const next = step.revealsKey ? steps.find((item) => item.key === step.revealsKey) : steps.slice(index + 1).find((item) => item.type === 'fill');
      if (!next) return false;
      step.when = { missing: next.locator };
      delete step.revealsKey;
      return true;
    });
  }

  async function save() {
    const chosen = proposal.items.filter((item) => item.include).map((item) => item.step);
    proposal.unmapped
      .filter((item) => item.key)
      .forEach((item) => chosen.push({ type: 'fill', key: item.key, kind: item.kind, method: DEFAULT_METHOD[item.kind], format: null, locator: item.locator }));
    const steps = linkActions(chosen.map((step) => JSON.parse(JSON.stringify(step))));
    if (!steps.length) {
      P.say('learn-status', 'Nothing to save.', 'bad');
      return;
    }
    const map = P.currentMap();
    const existing = globalThis.OakPlaybook.findScreen(map, proposal.path);
    const newKeys = new Set(steps.filter((step) => step.type === 'fill').map((step) => step.key));
    const kept = existing ? existing.steps.filter((step) => step.type === 'fill' && !newKeys.has(step.key)) : [];
    const screen = {
      path: proposal.path,
      title: existing ? existing.title : proposal.title || proposal.path,
      fingerprint: proposal.fingerprint || (existing && existing.fingerprint) || null,
      steps: [...steps.map(({ id, ...rest }) => rest), ...kept],
    };
    const source = proposal.source === 'demonstration' ? 'demonstration' : 'ai-approved';
    const next = globalThis.OakPlaybook.putScreen(map, screen, {
      source,
      summary: (source === 'demonstration' ? 'Learned by watching: ' : 'AI mapping approved: ') + steps.length + ' steps on ' + proposal.path + (kept.length ? ', ' + kept.length + ' earlier steps kept' : '') + '.',
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
    P.say('learn-status', 'Learned ' + result.steps.length + ' steps. Review them below.');
    render();
  }

  async function cancelWatching() {
    clearInterval(watchTimer);
    watchingButtons(false);
    await P.send({ type: 'oak-filing:record-cancel' }).catch(() => {});
    P.say('learn-status', 'Stopped watching. Nothing was learned.');
  }

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
  });
})();
