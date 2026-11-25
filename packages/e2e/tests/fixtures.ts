import { test as base, chromium, expect, type BrowserContext, type Page } from "@playwright/test";
import { resolve } from "node:path";

const EXTENSION = resolve(import.meta.dirname, "../../extension/dist-demo");
export const API = "http://localhost:4100";
export const JANE = "http://localhost:4101";
export const TOKEN = "demo-token-not-a-secret";

type Fixtures = { context: BrowserContext; extensionId: string; jane: Page; panel: Page };

/**
 * Chrome's real side panel can't be driven by Playwright, so the panel page is opened in
 * its own tab and its "active tab" lookup is pointed at the Jane tab. Everything else is
 * the real extension: content script, messaging, API calls.
 */
export const test = base.extend<Fixtures>({
  context: async ({}, use) => {
    await fetch(`${API}/demo/reset`, { method: "POST", redirect: "manual" });
    const context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      headless: true,
      ...(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}),
      args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
    await use(new URL(sw.url()).host);
  },
  jane: async ({ context }, use) => {
    const page = await context.newPage();
    await page.goto(`${JANE}/admin/schedule`);
    await use(page);
  },
  panel: async ({ context, extensionId, jane }, use) => {
    const options = await context.newPage();
    await options.goto(`chrome-extension://${extensionId}/options.html`);
    await options.fill("#token", TOKEN);
    await options.click("button[type=submit]");
    await expect(options.locator("#status")).toHaveText("Saved.");
    await options.close();

    void jane; // the Jane tab must exist first
    const panel = await context.newPage();
    await panel.addInitScript((janeOrigin: string) => {
      const query = chrome.tabs.query.bind(chrome.tabs);
      // Test harness only: point "the active tab" at the Jane tab.
      chrome.tabs.query = async (info: chrome.tabs.QueryInfo) =>
        info.active ? query({ url: `${janeOrigin}/*` }) : query(info);
    }, JANE);
    await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await use(panel);
  },
});

export { expect };

/** Simulates Pocket finishing a recording for a demo patient. */
export async function finishRecording(janePatientId: string) {
  const res = await fetch(`${API}/demo/record/${janePatientId}`, { method: "POST", headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`demo record failed: ${res.status}`);
}

/** Today tab: sync the schedule and confirm the suggested patient for each recording. */
export async function syncAndConfirm(panel: Page, jane: Page, names: string[]) {
  await jane.goto(`${JANE}/admin/schedule`);
  await panel.getByRole("button", { name: "Today", exact: true }).click();
  await panel.getByRole("button", { name: "Sync schedule" }).click();
  for (const name of names) {
    const card = panel.locator("li.card", { has: panel.locator("option:checked", { hasText: name }) });
    await card.getByRole("button", { name: "Confirm" }).click();
    await expect(panel.locator("li.card", { hasText: `Open ${name}'s chart` })).toBeVisible({ timeout: 15_000 });
  }
}

/** Every sentence currently in the Chart draft, in order. */
export const draftLines = (panel: Page) =>
  panel.locator(".sentence textarea").evaluateAll((els) => els.map((e) => (e as HTMLTextAreaElement).value));
