/* Side panel: tabs and start-up. Loaded last. */
(function () {
  'use strict';
  const P = globalThis.Panel;
  const TAB_KEY = 'oak-filing:tab';

  function showTab(name) {
    document.querySelectorAll('[role=tab]').forEach((tab) => {
      const selected = tab.dataset.tab === name;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    document.querySelectorAll('[role=tabpanel]').forEach((panel) => {
      panel.hidden = panel.id !== 'tab-' + name;
    });
    try {
      localStorage.setItem(TAB_KEY, name);
    } catch {
      // Remembering the tab is a convenience only.
    }
  }

  function savedTab() {
    try {
      return localStorage.getItem(TAB_KEY);
    } catch {
      return null;
    }
  }

  document.querySelectorAll('[role=tab]').forEach((tab) => {
    tab.addEventListener('click', () => showTab(tab.dataset.tab));
    tab.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      const tabs = Array.from(document.querySelectorAll('[role=tab]'));
      const next = tabs[(tabs.indexOf(tab) + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      next.focus();
      showTab(next.dataset.tab);
    });
  });

  chrome.tabs.onActivated.addListener(() => P.refreshTarget());
  chrome.tabs.onUpdated.addListener((_tabId, change) => {
    if (change.url || change.status === 'complete') P.refreshTarget();
  });

  (async () => {
    await P.load();
    const remembered = savedTab();
    showTab(remembered && document.getElementById('tab-' + remembered) ? remembered : P.currentMap().version ? 'fill' : 'details');
    P.emit('ready');
    await P.refreshTarget();
  })();
})();
