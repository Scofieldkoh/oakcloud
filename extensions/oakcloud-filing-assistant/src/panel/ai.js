/*
 * Side panel: OakCloud and its AI. Requests go through the bridge content script in the signed-in
 * OakCloud tab, so OakCloud's session and permission checks apply. Only value-free snapshots and
 * filing-details keys are sent; filing values never are.
 */
(function () {
  'use strict';
  const P = globalThis.Panel;

  const BRIDGE_ID = 'oakcloud-bridge';
  const BRIDGE_FILE = 'src/bridge/oakcloud-bridge.js';

  function originOf(input) {
    let url;
    try {
      url = new URL(String(input).trim());
    } catch {
      throw new Error('Enter the full OakCloud address, for example https://oakcloud.example.com');
    }
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) throw new Error('The OakCloud address must start with https://');
    return url.origin;
  }

  async function oakcloudTabs() {
    const origin = P.state.settings.oakcloudOrigin;
    if (!origin) throw new Error('Set the OakCloud address in Settings first.');
    const tabs = await chrome.tabs.query({ url: origin + '/*' });
    tabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
    return tabs;
  }

  async function injectBridge(tabId) {
    await chrome.scripting.executeScript({ target: { tabId }, files: [BRIDGE_FILE] });
  }

  /** Calls an OakCloud /api/filing-assistant/ endpoint through a signed-in OakCloud tab. */
  async function request(path, body, method = 'POST') {
    const tabs = await oakcloudTabs();
    if (!tabs.length) throw new Error('Open OakCloud (' + P.state.settings.oakcloudOrigin + ') in a tab and sign in, then try again.');
    const message = { type: 'oak-filing:api', path, method, body };
    let response = null;
    try {
      response = await chrome.tabs.sendMessage(tabs[0].id, message);
    } catch {
      // The tab was open before the bridge was registered: add it now and retry once.
      await injectBridge(tabs[0].id);
      response = await chrome.tabs.sendMessage(tabs[0].id, message);
    }
    if (!response) throw new Error('OakCloud did not answer.');
    if (response.status === 401) throw new Error('Sign in to OakCloud, then try again.');
    if (response.status === 404) {
      throw new Error('This OakCloud (' + P.state.settings.oakcloudOrigin + ') does not have the Filing Assistant endpoints yet. Deploy an OakCloud version that includes them. Learning by watching and filling still work without OakCloud.');
    }
    if (response.status === 403) throw new Error((response.data && (response.data.message || response.data.error)) || 'OakCloud refused: you may not have permission.');
    if (!response.ok) throw new Error((response.data && (response.data.message || response.data.error)) || response.error || 'OakCloud returned ' + response.status + '.');
    return response.data;
  }

  /** Asks Chrome for access to the OakCloud site and registers the bridge for it. Call from a click. */
  async function connect(input) {
    const origin = originOf(input);
    const granted = await chrome.permissions.request({ origins: [origin + '/*'] });
    if (!granted) throw new Error('Chrome did not grant access to ' + origin + '.');
    await chrome.scripting.unregisterContentScripts({ ids: [BRIDGE_ID] }).catch(() => {});
    await chrome.scripting.registerContentScripts([{ id: BRIDGE_ID, matches: [origin + '/*'], js: [BRIDGE_FILE], runAt: 'document_idle', persistAcrossSessions: true }]);
    await P.saveSettings({ oakcloudOrigin: origin });
    for (const tab of await chrome.tabs.query({ url: origin + '/*' })) await injectBridge(tab.id).catch(() => {});
    return origin;
  }

  /**
   * Masks any filing-details value that appears in text sent to OakCloud (a Bizfile message may
   * echo what was typed). OakCloud also masks capitalised names before the AI sees anything.
   */
  function redactDetails(value) {
    // Choice values (Individual, Director, ...) are screen options the AI must see; personal values are not.
    const personal = new Set(['text', 'email', 'phone']);
    const details = P.currentDetails();
    const secrets = globalThis.OakSchemas.get(P.state.transaction)
      .fields.filter((field) => personal.has(field.type))
      .map((field) => String(details[field.key] || '').trim())
      .filter((item) => item.length >= 3)
      .sort((a, b) => b.length - a.length)
      .map((item) => new RegExp(item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'));
    // Bizfile shows existing officers' and companies' names in capitals; mask anything like one too.
    const likelyName = /\b[A-Z][A-Z'.-]+(?:\s+[A-Z][A-Z'.-]+)+\b/g;
    // Identifiers and date formats ("DD MMM YYYY") are capitalised too, and are not names.
    const notAName = (match) => /^(NRIC|FIN|UEN|SSIC|ACRA|CPF|IRAS)\b/.test(match) || /^(D{1,2}|M{2,4}|Y{2,4})(\s+(D{1,2}|M{2,4}|Y{2,4}))+$/.test(match);
    const maskNames = (text) => text.replace(likelyName, (match) => (notAName(match) ? match : '[name]'));
    const scrub = (text) => maskNames(secrets.reduce((result, pattern) => result.replace(pattern, '[detail]'), text));
    const walk = (item) => {
      if (typeof item === 'string') return scrub(item);
      if (Array.isArray(item)) return item.map(walk);
      if (item && typeof item === 'object') return Object.fromEntries(Object.entries(item).map(([key, inner]) => [key, walk(inner)]));
      return item;
    };
    return walk(value);
  }

  async function status() {
    return request('/api/filing-assistant/status', null, 'GET');
  }

  function configured() {
    return Boolean(P.state.settings.oakcloudOrigin);
  }

  async function proposeMap(snapshot) {
    const data = await request('/api/filing-assistant/ai-proposals', {
      task: 'map-screen',
      transaction: P.state.transaction,
      snapshot: redactDetails(snapshot),
      targets: globalThis.OakSchemas.targets(P.state.transaction),
    });
    return data.proposal;
  }

  async function proposeRepair(snapshot, step, result) {
    const target = globalThis.OakSchemas.targets(P.state.transaction).find((item) => item.key === step.key);
    const data = await request('/api/filing-assistant/ai-proposals', {
      task: 'repair-step',
      transaction: P.state.transaction,
      snapshot: redactDetails(snapshot),
      target,
      step: redactDetails({
        key: step.key,
        kind: step.kind,
        label: step.locator.label || '',
        group: step.locator.group || '',
        section: step.locator.section || '',
        method: step.method,
        format: step.format || null,
        failure: result.reason || 'not-found',
        errorText: result.errorText || '',
        options: result.options || [],
      }),
    });
    return data.proposal;
  }

  P.ai = { request, connect, status, configured, proposeMap, proposeRepair, originOf, redactDetails };
})();
