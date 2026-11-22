/*
 * OakCloud Filing Assistant: bridge to OakCloud. Registered at run time only for the OakCloud address
 * staff enter in Settings (after Chrome asks them for permission to that site).
 *
 * It forwards the side panel's requests to OakCloud's /api/filing-assistant/ endpoints from inside
 * the signed-in OakCloud tab, so OakCloud's own session, permission checks and CSRF origin check
 * apply exactly as they do for the OakCloud web app. The extension holds no OakCloud credentials and
 * no AI keys. Only messages from this extension are accepted, and only these paths.
 */
(function () {
  'use strict';
  if (globalThis.__oakFilingBridge) return;
  globalThis.__oakFilingBridge = true;

  const ALLOWED_PATH = /^\/api\/filing-assistant\/[a-z-]+$/;
  const MAX_BODY_CHARACTERS = 400000;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.type !== 'oak-filing:api') return false;
    if (sender.id !== chrome.runtime.id) return false;
    if (typeof message.path !== 'string' || !ALLOWED_PATH.test(message.path)) {
      sendResponse({ ok: false, status: 0, error: 'That OakCloud path is not allowed.' });
      return false;
    }
    const method = message.method === 'GET' ? 'GET' : 'POST';
    const body = method === 'POST' ? JSON.stringify(message.body || {}) : undefined;
    if (body && body.length > MAX_BODY_CHARACTERS) {
      sendResponse({ ok: false, status: 0, error: 'The request is too large.' });
      return false;
    }
    fetch(message.path, {
      method,
      credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body,
    })
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        sendResponse({ ok: response.ok, status: response.status, data });
      })
      .catch((error) => sendResponse({ ok: false, status: 0, error: String((error && error.message) || error).slice(0, 200) }));
    return true;
  });
})();
