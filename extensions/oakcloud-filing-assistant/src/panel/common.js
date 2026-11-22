/*
 * OakCloud Filing Assistant side panel: shared state, storage, the Bizfile tab and helpers.
 * Defines globalThis.Panel; the tab scripts add to it.
 *
 * Storage:
 *   chrome.storage.local:   maps (screen maps per transaction), runs (run logs, no filing values),
 *                           settings
 *   chrome.storage.session: details (filing details, cleared when the browser closes), probe
 */
(function (root) {
  'use strict';

  const BIZFILE_URL = /^https:\/\/([a-z0-9-]+\.)*bizfile\.gov\.sg\//i;
  const MAX_RUNS = 50;
  const DEFAULT_SETTINGS = { oakcloudOrigin: '', autoAskAi: true, autoCorrect: true };

  const listeners = {};

  const Panel = {
    state: {
      transaction: 'appoint-position-holder',
      target: null,
      settings: { ...DEFAULT_SETTINGS },
      maps: {},
      details: {},
      runs: [],
    },

    $(id) {
      return document.getElementById(id);
    },

    h(tag, attributes, ...children) {
      const el = document.createElement(tag);
      Object.entries(attributes || {}).forEach(([key, value]) => {
        if (value === undefined || value === null || value === false) return;
        if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
        else if (key === 'className') el.className = value;
        else if (key === 'value') el.value = value;
        else if (key === 'checked') el.checked = Boolean(value);
        else el.setAttribute(key, value === true ? '' : value);
      });
      children.flat().forEach((child) => {
        if (child !== null && child !== undefined && child !== false) el.append(child instanceof Node ? child : String(child));
      });
      return el;
    },

    facts(pairs) {
      const h = Panel.h;
      return h('dl', null, pairs.filter(([, value]) => value !== '' && value !== null && value !== undefined).flatMap(([term, value]) => [h('dt', null, term), h('dd', null, value)]));
    },

    say(id, text, tone) {
      const el = Panel.$(id);
      if (!el) return;
      el.textContent = text || '';
      el.dataset.tone = tone || '';
    },

    on(event, handler) {
      (listeners[event] = listeners[event] || []).push(handler);
    },

    emit(event, data) {
      (listeners[event] || []).forEach((handler) => handler(data));
    },

    hostPath(url) {
      try {
        const parsed = new URL(url);
        return parsed.host + parsed.pathname;
      } catch {
        return 'Bizfile';
      }
    },

    // ---- Storage ----------------------------------------------------------------------------

    async load() {
      const local = await chrome.storage.local.get(['maps', 'runs', 'settings']);
      const session = await chrome.storage.session.get(['details']);
      Panel.state.maps = local.maps || {};
      Panel.state.runs = local.runs || [];
      Panel.state.settings = { ...DEFAULT_SETTINGS, ...(local.settings || {}) };
      Panel.state.details = session.details || {};
    },

    currentMap() {
      const tx = Panel.state.transaction;
      return Panel.state.maps[tx] || globalThis.OakPlaybook.create(tx);
    },

    async setMap(map) {
      Panel.state.maps = { ...Panel.state.maps, [map.transaction]: map };
      await chrome.storage.local.set({ maps: Panel.state.maps });
      Panel.emit('maps-changed', map);
    },

    async deleteMap(transaction) {
      const maps = { ...Panel.state.maps };
      delete maps[transaction];
      Panel.state.maps = maps;
      await chrome.storage.local.set({ maps });
      Panel.emit('maps-changed', null);
    },

    currentDetails() {
      return Panel.state.details[Panel.state.transaction] || {};
    },

    async setDetails(values) {
      Panel.state.details = { ...Panel.state.details, [Panel.state.transaction]: values };
      await chrome.storage.session.set({ details: Panel.state.details });
      Panel.emit('details-changed', values);
    },

    async saveSettings(patch) {
      Panel.state.settings = { ...Panel.state.settings, ...patch };
      await chrome.storage.local.set({ settings: Panel.state.settings });
      Panel.emit('settings-changed', Panel.state.settings);
    },

    async addRun(run) {
      Panel.state.runs = [run, ...Panel.state.runs.filter((item) => item.id !== run.id)].slice(0, MAX_RUNS);
      await chrome.storage.local.set({ runs: Panel.state.runs });
      Panel.emit('runs-changed', Panel.state.runs);
    },

    // ---- The Bizfile tab --------------------------------------------------------------------

    async findTarget() {
      const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (active && active.url && BIZFILE_URL.test(active.url)) return active;
      const tabs = await chrome.tabs.query({ url: ['https://*.bizfile.gov.sg/*'] });
      tabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
      return tabs[0] || null;
    },

    async refreshTarget() {
      const tab = await Panel.findTarget();
      Panel.state.target = tab ? { tabId: tab.id, url: tab.url } : null;
      Panel.say('target', tab ? 'Bizfile tab: ' + Panel.hostPath(tab.url) : 'Open Bizfile (bizfile.gov.sg) in a tab to start.');
      Panel.emit('target-changed', Panel.state.target);
      return Panel.state.target;
    },

    /** Sends a message to the Bizfile tab's main page; throws a readable error when it cannot. */
    async send(message) {
      const target = Panel.state.target || (await Panel.refreshTarget());
      if (!target) throw new Error('Open Bizfile in a tab first.');
      let response;
      try {
        response = await chrome.tabs.sendMessage(target.tabId, message, { frameId: 0 });
      } catch {
        throw new Error('The assistant is not loaded in the Bizfile tab. Reload that tab and try again.');
      }
      if (!response) throw new Error('The Bizfile tab did not answer. Reload it and try again.');
      if (response.ok === false) throw new Error(response.error || 'The Bizfile tab could not do that.');
      return response;
    },

    stepLabel(step) {
      if (step.type === 'action') return 'Click "' + step.label + '"';
      const field = globalThis.OakSchemas.field(Panel.state.transaction, step.key);
      return field ? field.label : step.key;
    },
  };

  root.Panel = Panel;
})(globalThis);
