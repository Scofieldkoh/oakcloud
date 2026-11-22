// Opens the probe's side panel when the toolbar button is clicked. Nothing else runs in the background.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
