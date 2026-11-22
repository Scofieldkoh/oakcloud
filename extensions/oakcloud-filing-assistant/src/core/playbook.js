/*
 * OakCloud Filing Assistant: screen maps. One map per transaction holds what the assistant has
 * learned about each Bizfile screen: how to recognise it and the ordered steps that fill it. Every
 * change makes a new version with a history entry saying what changed, why and on whose authority.
 * Pure functions; maps are plain JSON. Defines globalThis.OakPlaybook.
 */
(function (root) {
  'use strict';

  const SCHEMA_VERSION = 1;
  const MAX_HISTORY = 200;

  /** Who may change a map, and how: corrections without AI apply themselves; AI needs approval. */
  const SOURCES = {
    demonstration: 'Learned by watching staff',
    exploration: 'Learned by exploring, mapped by staff',
    'ai-approved': 'AI proposal approved by staff',
    'auto-correction': 'Verified automatic correction',
    staff: 'Edited by staff',
    import: 'Imported',
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function create(transaction) {
    return { schemaVersion: SCHEMA_VERSION, transaction, version: 0, updatedAt: null, history: [], screens: [] };
  }

  /** Returns a new map with the change applied, the version bumped and the change recorded. */
  function change(map, mutate, { source, summary, details }) {
    if (!SOURCES[source]) throw new Error('Unknown change source: ' + source);
    const next = clone(map);
    mutate(next);
    next.version = (map.version || 0) + 1;
    next.updatedAt = new Date().toISOString();
    next.history = [...(map.history || []), { version: next.version, at: next.updatedAt, source, summary, ...(details ? { details } : {}) }].slice(-MAX_HISTORY);
    return next;
  }

  /** The screen for a path; maps learned on the same path share one screen. */
  function findScreen(map, path) {
    return (map && map.screens.find((screen) => screen.path === path)) || null;
  }

  function stepIdFor(step) {
    if (step.type === 'action') return 'a-' + String(step.label || 'action').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return 's-' + step.key;
  }

  function withIds(steps) {
    const used = new Set();
    return steps.map((step) => {
      let id = step.id || stepIdFor(step);
      let suffix = 2;
      while (used.has(id)) id = stepIdFor(step) + '-' + suffix++;
      used.add(id);
      return { ...step, id };
    });
  }

  function stepKey(step) {
    return step.type === 'action' ? 'action:' + String(step.label || '').toLowerCase() : 'fill:' + step.key;
  }

  /**
   * Merges newly learned steps into a screen's existing ones: a step for the same key (or the same
   * button) is replaced where it stands, new reveal buttons go first, other new steps go last, and
   * everything not re-learned is kept. Re-learning one field therefore never loses the others.
   */
  function mergeSteps(existing, learned) {
    const learnedByKey = new Map(learned.map((step) => [stepKey(step), step]));
    const used = new Set();
    const merged = (existing || []).map((step) => {
      const replacement = learnedByKey.get(stepKey(step));
      if (!replacement) return step;
      used.add(stepKey(step));
      return { ...replacement, id: step.id };
    });
    const fresh = learned.filter((step) => !used.has(stepKey(step)));
    return [...fresh.filter((step) => step.type === 'action'), ...merged, ...fresh.filter((step) => step.type !== 'action')];
  }

  /** Replaces (or adds) the screen learned for a path. */
  function putScreen(map, screen, meta) {
    return change(
      map,
      (next) => {
        const prepared = { ...screen, steps: withIds(screen.steps) };
        const index = next.screens.findIndex((item) => item.path === screen.path);
        if (index >= 0) next.screens[index] = prepared;
        else next.screens.push(prepared);
      },
      meta,
    );
  }

  function updateStep(map, path, stepId, patch, meta) {
    return change(
      map,
      (next) => {
        const screen = findScreen(next, path);
        const step = screen && screen.steps.find((item) => item.id === stepId);
        if (!step) throw new Error('No step ' + stepId + ' on ' + path);
        Object.assign(step, patch);
      },
      meta,
    );
  }

  function removeStep(map, path, stepId, meta) {
    return change(
      map,
      (next) => {
        const screen = findScreen(next, path);
        if (screen) screen.steps = screen.steps.filter((item) => item.id !== stepId);
      },
      meta,
    );
  }

  const KINDS = ['text', 'date', 'native-select', 'combobox', 'typeahead', 'radio', 'checkbox'];

  /** Problems that make a map unusable; an empty list means it is fine. */
  function validate(map) {
    const errors = [];
    if (!map || typeof map !== 'object') return ['Not a screen map.'];
    if (map.schemaVersion !== SCHEMA_VERSION) errors.push('Unsupported screen map version ' + map.schemaVersion + '.');
    if (typeof map.transaction !== 'string' || !map.transaction) errors.push('The map names no transaction.');
    if (!Array.isArray(map.screens)) return [...errors, 'The map has no screens list.'];
    map.screens.forEach((screen, screenIndex) => {
      const where = 'Screen ' + (screenIndex + 1);
      if (typeof screen.path !== 'string' || !screen.path.startsWith('/')) errors.push(where + ' has no page path.');
      if (!Array.isArray(screen.steps)) {
        errors.push(where + ' has no steps.');
        return;
      }
      screen.steps.forEach((step, stepIndex) => {
        const at = where + ', step ' + (stepIndex + 1);
        if (step.type !== 'fill' && step.type !== 'action') errors.push(at + ': unknown step type.');
        if (!step.locator || !Array.isArray(step.locator.candidates) || !step.locator.candidates.length) errors.push(at + ': no way to find its element.');
        if (step.type === 'fill' && !step.key) errors.push(at + ': no filing-details key.');
        if (step.type === 'fill' && !KINDS.includes(step.kind)) errors.push(at + ': unknown control type ' + step.kind + '.');
        if (step.type === 'action' && !step.label) errors.push(at + ': the button has no name.');
      });
    });
    return errors;
  }

  root.OakPlaybook = { SCHEMA_VERSION, SOURCES, create, change, findScreen, putScreen, updateStep, removeStep, validate, withIds, mergeSteps };
})(globalThis);
