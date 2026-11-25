// Service worker: opens the side panel from the toolbar button. It holds no state;
// Chrome can stop it at any time. The side panel talks to the API directly.
chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});
