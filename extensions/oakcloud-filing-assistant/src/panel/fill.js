/*
 * Side panel: the Fill tab. Runs the screen map for the Bizfile page one step at a time.
 *
 * - Every step is verified in the page; verified corrections found without AI update the map
 *   automatically (Settings can turn this off) and are recorded in its history.
 * - A failed step pauses the run. Staff retry, skip, stop, or ask OakCloud's AI for a repair, which
 *   changes the map only after staff approve it.
 * - Clicking or typing on the Bizfile page pauses the run; Stop is always available.
 * - The run ends with the screen filled and unsubmitted. Staff review and submit in Bizfile.
 */
(function () {
  'use strict';
  const P = globalThis.Panel;
  const h = P.h;
  const B = globalThis.OakPlaybook;

  let run = null;

  // ---- Run control --------------------------------------------------------------------------

  function setButtons() {
    const active = Boolean(run && !run.finished);
    P.$('fill-start').disabled = active;
    P.$('fill-pause').disabled = !active;
    P.$('fill-stop').disabled = !active;
    P.$('fill-pause').textContent = active && run.paused ? 'Resume' : 'Pause';
  }

  function pause(reason) {
    if (!run || run.finished || run.paused) return;
    run.paused = true;
    P.say('fill-status', reason, 'warn');
    setButtons();
  }

  function resume() {
    if (!run || !run.paused) return;
    run.paused = false;
    P.say('fill-status', 'Running…');
    setButtons();
    if (run.wake) run.wake();
  }

  function stop() {
    if (!run || run.finished) return;
    run.stopped = true;
    run.paused = false;
    if (run.wake) run.wake();
    if (run.decide) run.decide('stop');
  }

  async function waitWhilePaused() {
    while (run.paused && !run.stopped) await new Promise((resolve) => (run.wake = resolve));
  }

  // ---- Rendering ----------------------------------------------------------------------------

  const STATUS_TEXT = { done: '✓', skipped: '–', failed: '✕', blocked: '⛔', running: '…', pending: '' };

  function renderSteps() {
    P.$('fill-steps').replaceChildren(
      ...run.rows.map((row) =>
        h(
          'li',
          { 'data-status': row.status, 'data-step': row.stepId },
          h('span', { className: 'step-status' }, STATUS_TEXT[row.status] || ''),
          h('span', { className: 'step-label' }, row.label),
          row.message ? h('p', { className: 'muted small' }, row.message) : null,
          row.corrections && row.corrections.length ? h('p', { className: 'small correction' }, 'Self-corrected: ' + row.corrections.join(' ')) : null,
        ),
      ),
    );
  }

  function describeMapStatus() {
    const map = P.currentMap();
    P.$('fill-map-status').textContent = map.version
      ? 'Screen map version ' + map.version + ': ' + map.screens.map((screen) => screen.steps.length + ' steps for ' + screen.path).join('; ') + '.'
      : 'Nothing learned yet. Use the Learn tab on the Bizfile screen first.';
  }

  /** Shows the choices after a failed step and resolves with what staff pick. */
  function decide(row, step, result) {
    const box = P.$('fill-decision');
    return new Promise((resolve) => {
      run.decide = (choice) => {
        box.hidden = true;
        box.replaceChildren();
        run.decide = null;
        resolve(choice);
      };
      const buttons = [
        h('button', { type: 'button', onclick: () => run.decide('retry') }, 'Retry'),
        step.type === 'fill' && result.needsAi && P.ai.configured() ? h('button', { type: 'button', id: 'fill-ask-ai', onclick: () => askAi(step, result) }, 'Ask AI to repair') : null,
        h('button', { type: 'button', className: 'quiet', onclick: () => run.decide('skip') }, 'Skip this step'),
        h('button', { type: 'button', className: 'quiet', onclick: () => run.decide('stop') }, 'Stop'),
      ];
      box.replaceChildren(
        h('p', null, h('strong', null, row.label + ': '), result.message || 'The step failed.'),
        h('p', { className: 'muted small' }, 'You can fix it on the Bizfile page yourself and press Skip, or let the assistant retry.'),
        h('div', { className: 'row' }, buttons),
        h('div', { id: 'fill-ai-proposal' }),
      );
      box.hidden = false;
      // AI helps find fields; when the field was found but would not fill, asking it first is pointless.
      const findingProblem = ['not-found', 'ambiguous', 'option-missing', 'not-revealed', 'validation-error'].includes(result.reason);
      if (step.type === 'fill' && result.needsAi && findingProblem && P.ai.configured() && P.state.settings.autoAskAi) askAi(step, result);
    });
  }

  // ---- AI repair ----------------------------------------------------------------------------

  async function askAi(step, result) {
    const area = P.$('fill-ai-proposal');
    const button = P.$('fill-ask-ai');
    if (button) button.disabled = true;
    area.replaceChildren(h('p', { className: 'muted' }, 'Asking OakCloud’s AI to find "' + P.stepLabel(step) + '" again… (no filing values are sent)'));
    try {
      const { snapshot, snapshotId } = await P.send({ type: 'oak-filing:snapshot' });
      const proposal = await P.ai.proposeRepair(snapshot, step, result);
      if (!proposal.ref) {
        area.replaceChildren(h('p', null, 'The AI could not find it: ' + proposal.reason));
        return;
      }
      const { locators } = await P.send({ type: 'oak-filing:locators-for-refs', snapshotId, refs: [proposal.ref] });
      const locator = locators[proposal.ref];
      if (!locator) {
        area.replaceChildren(h('p', null, 'The AI pointed at a field that is no longer on the page. Try again.'));
        return;
      }
      const sameField = locator.candidates.some((candidate) => step.locator.candidates.some((old) => old.by === candidate.by && old.value === candidate.value));
      const sameFormat = (proposal.format === undefined ? step.format : proposal.format) === step.format;
      if (sameField && proposal.kind === step.kind && sameFormat) {
        area.replaceChildren(
          h('p', null, h('strong', null, 'The AI agrees this is the right field'), ', so there is nothing to change in the screen map. The problem is filling it, not finding it.'),
          h('p', { className: 'muted small' }, 'Fill it yourself on Bizfile and press Skip. To fix it for next time, re-learn this screen by watching, or use Diagnose → Inspect a dropdown and send the export to your administrator.'),
        );
        return;
      }
      // The old ways of finding the field stay as fallbacks in case Bizfile changes back.
      const patch = { locator: globalThis.OakLocator.merge(locator, step.locator), kind: proposal.kind, ...(proposal.format !== undefined ? { format: proposal.format } : {}), ...(proposal.valueMap ? { valueMap: proposal.valueMap } : {}) };
      area.replaceChildren(
        h('p', null, h('strong', null, 'AI proposal (' + Math.round(proposal.confidence * 100) + '% sure): '), 'use "' + (locator.label || locator.group || locator.candidates[0].value) + '"' + (locator.section ? ' in "' + locator.section + '"' : '') + ' as ' + proposal.kind + (proposal.format ? ', format ' + proposal.format : '') + '.'),
        h('p', { className: 'muted small' }, proposal.reason),
        h(
          'div',
          { className: 'row' },
          h('button', { type: 'button', id: 'fill-ai-approve', onclick: () => approve(step, patch, proposal) }, 'Approve and retry'),
          h('button', { type: 'button', className: 'quiet', onclick: () => area.replaceChildren(h('p', { className: 'muted' }, 'Proposal rejected.')) }, 'Reject'),
        ),
        h('button', { type: 'button', className: 'small quiet', onclick: () => P.send({ type: 'oak-filing:highlight-locator', locator }) }, 'Show me that field'),
      );
    } catch (error) {
      area.replaceChildren(h('p', { className: 'bad' }, error.message));
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function approve(step, patch, proposal) {
    const map = B.updateStep(P.currentMap(), run.path, step.id, patch, {
      source: 'ai-approved',
      summary: 'AI repair approved for ' + P.stepLabel(step) + ': ' + proposal.reason,
    });
    await P.setMap(map);
    run.log.push({ stepId: step.id, event: 'ai-repair-approved', mapVersion: map.version });
    if (run.decide) run.decide('retry');
  }

  // ---- The run ------------------------------------------------------------------------------

  async function applyCorrections(step, result) {
    if (!result.corrections || !result.corrections.length) return [];
    const summaries = result.corrections.map((correction) => correction.summary);
    if (!P.state.settings.autoCorrect) return summaries.map((text) => 'Not saved (automatic corrections are off): ' + text);
    const patch = Object.assign({}, ...result.corrections.map((correction) => correction.patch));
    const map = B.updateStep(P.currentMap(), run.path, step.id, patch, { source: 'auto-correction', summary: P.stepLabel(step) + ': ' + summaries.join(' ') });
    await P.setMap(map);
    return summaries;
  }

  async function start() {
    P.$('fill-summary').replaceChildren();
    try {
      await P.refreshTarget();
      const page = await P.send({ type: 'oak-filing:page-info' });
      const map = P.currentMap();
      const screen = B.findScreen(map, page.path);
      if (!screen) {
        P.say('fill-status', 'Nothing learned for this Bizfile page (' + page.path + '). Use the Learn tab first.', 'bad');
        return;
      }
      const details = P.currentDetails();
      if (!Object.keys(details).length) {
        P.say('fill-status', 'Enter the filing details first (Details tab).', 'bad');
        return;
      }
      run = {
        id: crypto.randomUUID(),
        startedAt: new Date().toISOString(),
        path: page.path,
        mapVersionAtStart: map.version,
        paused: false,
        stopped: false,
        finished: false,
        rows: screen.steps.map((step) => ({ stepId: step.id, label: P.stepLabel(step), status: 'pending' })),
        log: [],
      };
      setButtons();
      renderSteps();
      P.say('fill-status', 'Running… Click or type on the Bizfile page at any time to pause.');
      await P.send({ type: 'oak-filing:run-begin' });

      for (let index = 0; index < run.rows.length && !run.stopped; index++) {
        await waitWhilePaused();
        if (run.stopped) break;
        const row = run.rows[index];
        const step = B.findScreen(P.currentMap(), run.path).steps.find((item) => item.id === row.stepId);
        if (!step) continue;
        row.status = 'running';
        renderSteps();
        let result;
        try {
          ({ result } = await P.send({ type: 'oak-filing:run-step', step, payload: P.currentDetails() }));
        } catch (error) {
          result = { status: 'failed', message: error.message };
        }
        row.status = result.status;
        row.message = result.message;
        row.corrections = await applyCorrections(step, result);
        run.log.push({ stepId: step.id, key: step.key || null, status: result.status, reason: result.reason || null, method: result.method || null, format: result.format || null, corrections: row.corrections });
        renderSteps();

        if (result.status === 'failed' || result.status === 'blocked') {
          run.paused = true;
          setButtons();
          P.say('fill-status', 'Paused at "' + row.label + '".', 'warn');
          const choice = await decide(row, step, result);
          run.paused = false;
          setButtons();
          if (choice === 'retry') {
            row.status = 'pending';
            row.message = '';
            index--;
          } else if (choice === 'skip') {
            row.status = 'skipped';
            row.message = 'Skipped by staff. ' + (result.message || '');
          } else {
            run.stopped = true;
          }
          renderSteps();
          P.say('fill-status', run.stopped ? 'Stopped.' : 'Running…');
        } else if (P.$('fill-step-mode').checked && index < run.rows.length - 1) {
          pause('Paused after "' + row.label + '". Check it on Bizfile, then press Resume.');
        }
      }
      await finish();
    } catch (error) {
      P.say('fill-status', error.message, 'bad');
      if (run) await finish();
    }
  }

  async function finish() {
    run.finished = true;
    setButtons();
    let drift = null;
    try {
      const end = await P.send({ type: 'oak-filing:run-end' });
      const screen = B.findScreen(P.currentMap(), run.path);
      drift = globalThis.OakSnapshot.compare(screen && screen.fingerprint, end.fingerprint);
      // An explored map knows fields from every option; only fields it never saw count as changes.
      if (drift && screen.fingerprint && screen.fingerprint.explored) {
        drift = { ...drift, removed: [], changed: drift.pathChanged || drift.added.length > 0 };
      }
    } catch {
      // The page may have gone; the run log still records the steps.
    }
    const counts = run.rows.reduce((totals, row) => ({ ...totals, [row.status]: (totals[row.status] || 0) + 1 }), {});
    const filled = (counts.done || 0) + (counts.skipped || 0);
    const outcome = run.stopped ? 'stopped' : counts.failed || counts.blocked ? 'incomplete' : 'completed';
    P.say(
      'fill-status',
      run.stopped
        ? 'Stopped. Nothing further will be filled.'
        : 'Finished: ' + (counts.done || 0) + ' filled, ' + (counts.skipped || 0) + ' skipped. Check every value on the Bizfile screen, then review and submit it yourself. The assistant never submits.',
      run.stopped ? 'warn' : 'good',
    );
    const summary = [];
    if (drift && drift.changed) {
      summary.push(
        h(
          'div',
          { className: 'notice' },
          h('strong', null, 'This Bizfile screen has changed since it was learned. '),
          drift.added.length ? 'New: ' + drift.added.join(', ') + '. ' : '',
          drift.removed.length ? 'Gone: ' + drift.removed.join(', ') + '. ' : '',
          'Check the new fields yourself, and re-learn the screen (Learn tab) when convenient.',
        ),
      );
    }
    P.$('fill-summary').replaceChildren(...summary);
    await P.addRun({
      id: run.id,
      at: run.startedAt,
      endedAt: new Date().toISOString(),
      transaction: P.state.transaction,
      path: run.path,
      mapVersionAtStart: run.mapVersionAtStart,
      mapVersionAtEnd: P.currentMap().version,
      outcome,
      filled,
      steps: run.log,
      drift,
    });
    describeMapStatus();
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message && message.type === 'oak-filing:user-activity' && run && !run.finished && !run.decide) {
      pause('Paused because you used the Bizfile page. Press Resume when you are ready.');
    }
  });

  P.on('ready', () => {
    describeMapStatus();
    P.$('fill-start').addEventListener('click', start);
    P.$('fill-pause').addEventListener('click', () => (run && run.paused ? resume() : pause('Paused. Press Resume to continue.')));
    P.$('fill-stop').addEventListener('click', stop);
    P.$('fill-pause').disabled = true;
    P.$('fill-stop').disabled = true;
  });
  P.on('maps-changed', describeMapStatus);
})();
