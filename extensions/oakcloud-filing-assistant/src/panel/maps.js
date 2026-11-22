/* Side panel: the Screen maps tab. What has been learned, its history, export and import, and runs. */
(function () {
  'use strict';
  const P = globalThis.Panel;
  const h = P.h;
  const B = globalThis.OakPlaybook;

  function firstWay(locator) {
    const candidate = locator.candidates[0];
    return candidate ? candidate.by + ' "' + candidate.value + '"' : 'none';
  }

  async function removeStep(path, step) {
    if (!window.confirm('Remove "' + P.stepLabel(step) + '" from the screen map?')) return;
    await P.setMap(B.removeStep(P.currentMap(), path, step.id, { source: 'staff', summary: 'Removed ' + P.stepLabel(step) + ' from ' + path + '.' }));
  }

  function render() {
    const map = P.currentMap();
    const box = P.$('maps-content');
    if (!map.version) {
      box.replaceChildren(h('p', { className: 'muted' }, 'Nothing learned yet for this transaction.'));
    } else {
      box.replaceChildren(
        P.facts([
          ['Version', String(map.version)],
          ['Updated', map.updatedAt ? new Date(map.updatedAt).toLocaleString() : ''],
          ['Screens', String(map.screens.length)],
        ]),
        ...map.screens.map((screen) =>
          h(
            'details',
            { open: true },
            h('summary', null, screen.path + ' (' + screen.steps.length + ' steps)'),
            h(
              'ol',
              { className: 'plain' },
              screen.steps.map((step) =>
                h(
                  'li',
                  null,
                  h('strong', null, P.stepLabel(step)),
                  h('p', { className: 'muted small' }, step.type === 'action' ? 'Reveal button, found by ' + firstWay(step.locator) : step.kind + ', ' + step.method + (step.format ? ', ' + step.format : '') + '; found by ' + firstWay(step.locator) + ' (' + step.locator.candidates.length + (step.locator.candidates.length === 1 ? ' way)' : ' ways)')),
                  h(
                    'div',
                    { className: 'row' },
                    h('button', { type: 'button', className: 'small quiet', onclick: () => P.send({ type: 'oak-filing:highlight-locator', locator: step.locator }).catch((error) => window.alert(error.message)) }, 'Show'),
                    h('button', { type: 'button', className: 'small quiet', onclick: () => removeStep(screen.path, step) }, 'Remove'),
                  ),
                ),
              ),
            ),
          ),
        ),
        h(
          'details',
          null,
          h('summary', null, 'History (' + map.history.length + ' changes)'),
          h(
            'ol',
            { className: 'plain', reversed: true },
            map.history
              .slice()
              .reverse()
              .slice(0, 40)
              .map((entry) => h('li', { className: 'small' }, 'v' + entry.version + ' · ' + new Date(entry.at).toLocaleString() + ' · ' + (B.SOURCES[entry.source] || entry.source) + ': ' + entry.summary)),
          ),
        ),
      );
    }
    const runs = P.state.runs.filter((item) => item.transaction === P.state.transaction).slice(0, 10);
    P.$('maps-runs').replaceChildren(
      ...(runs.length
        ? runs.map((item) =>
            h('li', { className: 'small' }, new Date(item.at).toLocaleString() + ' · ' + item.outcome + ' · ' + item.filled + ' of ' + item.steps.length + ' steps · map v' + item.mapVersionAtStart + (item.mapVersionAtEnd !== item.mapVersionAtStart ? ' → v' + item.mapVersionAtEnd : '')),
          )
        : [h('li', { className: 'muted small' }, 'No runs yet.')]),
    );
  }

  function download(name, data) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const anchor = h('a', { href: url, download: name });
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportMap() {
    const map = P.currentMap();
    download('screen-map-' + map.transaction + '-v' + map.version + '.json', map);
  }

  async function importMap(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;
    let map;
    try {
      map = JSON.parse(await file.text());
    } catch {
      P.say('maps-status', 'That file is not JSON.', 'bad');
      return;
    }
    const errors = B.validate(map);
    if (errors.length) {
      P.say('maps-status', 'Not imported: ' + errors.slice(0, 3).join(' '), 'bad');
      return;
    }
    if (map.transaction !== P.state.transaction) {
      P.say('maps-status', 'That map is for ' + map.transaction + ', not this transaction.', 'bad');
      return;
    }
    if (!window.confirm('Replace the current screen map (v' + P.currentMap().version + ') with the imported v' + map.version + '?')) return;
    const current = P.currentMap();
    const imported = B.change(current, (next) => (next.screens = map.screens), { source: 'import', summary: 'Imported ' + file.name + ' (its version ' + map.version + ').' });
    await P.setMap(imported);
    P.say('maps-status', 'Imported as version ' + imported.version + '.', 'good');
  }

  async function deleteMap() {
    if (!window.confirm('Delete everything learned for this transaction? Export it first if you may need it.')) return;
    await P.deleteMap(P.state.transaction);
    P.say('maps-status', 'Deleted.');
  }

  function exportRuns() {
    download('filing-assistant-runs.json', P.state.runs);
  }

  P.on('ready', () => {
    render();
    P.$('maps-export').addEventListener('click', exportMap);
    P.$('maps-import').addEventListener('change', importMap);
    P.$('maps-delete').addEventListener('click', deleteMap);
    P.$('maps-export-runs').addEventListener('click', exportRuns);
  });
  P.on('maps-changed', render);
  P.on('runs-changed', render);
})();
