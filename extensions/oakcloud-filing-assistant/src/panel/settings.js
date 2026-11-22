/* Side panel: the Settings tab. OakCloud connection (for AI) and self-correction behaviour. */
(function () {
  'use strict';
  const P = globalThis.Panel;

  function render() {
    const settings = P.state.settings;
    P.$('settings-origin').value = settings.oakcloudOrigin || '';
    P.$('settings-auto-ai').checked = settings.autoAskAi;
    P.$('settings-auto-correct').checked = settings.autoCorrect;
    P.$('settings-test-phone').value = settings.testPhone || '';
    P.$('settings-test-postal').value = settings.testPostalCode || '';
    P.say('settings-status', settings.oakcloudOrigin ? 'OakCloud: ' + settings.oakcloudOrigin + '. Press Check to test the connection.' : 'Not connected. Learning by watching and filling work without OakCloud; AI does not.');
  }

  async function connect() {
    try {
      const origin = await P.ai.connect(P.$('settings-origin').value);
      P.say('settings-status', 'Connected to ' + origin + '. Checking…');
      await check();
    } catch (error) {
      P.say('settings-status', error.message, 'bad');
    }
  }

  async function check() {
    try {
      const status = await P.ai.status();
      P.say('settings-status', 'Connected as ' + status.user + '. AI ' + (status.aiAvailable ? 'is available.' : 'is not configured in OakCloud (Connectors).'), status.aiAvailable ? 'good' : 'warn');
    } catch (error) {
      P.say('settings-status', error.message, 'bad');
    }
  }

  P.on('ready', () => {
    render();
    P.$('settings-connect').addEventListener('click', connect);
    P.$('settings-check').addEventListener('click', check);
    P.$('settings-auto-ai').addEventListener('change', (event) => P.saveSettings({ autoAskAi: event.target.checked }));
    P.$('settings-auto-correct').addEventListener('change', (event) => P.saveSettings({ autoCorrect: event.target.checked }));
    P.$('settings-test-phone').addEventListener('change', (event) => P.saveSettings({ testPhone: event.target.value.trim() }));
    P.$('settings-test-postal').addEventListener('change', (event) => P.saveSettings({ testPostalCode: event.target.value.trim() }));
  });
})();
