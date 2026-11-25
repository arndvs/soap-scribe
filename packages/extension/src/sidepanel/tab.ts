import type { ContentRequest, ResponseFor } from "../messages.js";

/** Sends a message to the content script on the active tab. Returns null off Jane pages. */
export async function askActiveTab<R extends ContentRequest>(msg: R): Promise<ResponseFor<R> | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return null;
  try {
    return (await chrome.tabs.sendMessage(tab.id, msg)) as ResponseFor<R>;
  } catch {
    return null; // no content script here: not a Jane page
  }
}

/** Calls `fn` whenever the active tab changes or navigates. Returns an unsubscribe. */
export function onActiveTabChange(fn: () => void): () => void {
  const onActivated = () => fn();
  const onUpdated = (_id: number, info: chrome.tabs.TabChangeInfo) => {
    if (info.status === "complete" || info.url) fn();
  };
  chrome.tabs.onActivated.addListener(onActivated);
  chrome.tabs.onUpdated.addListener(onUpdated);
  return () => {
    chrome.tabs.onActivated.removeListener(onActivated);
    chrome.tabs.onUpdated.removeListener(onUpdated);
  };
}
