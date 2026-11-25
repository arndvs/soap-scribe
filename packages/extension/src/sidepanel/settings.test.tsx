// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Settings } from "./Settings.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("Settings view", () => {
  let root: Root;
  let container: HTMLDivElement;
  const calls: Array<{ method: string; path: string; body?: unknown }> = [];

  beforeEach(() => {
    calls.length = 0;
    (globalThis as unknown as { chrome: unknown }).chrome = {
      storage: { local: { get: async () => ({ token: "test-token-long-enough-1234" }) } },
      runtime: { openOptionsPage: () => {} },
    };
    globalThis.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const path = String(url).replace("http://localhost:8787", "");
      const method = init?.method ?? "GET";
      calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const json =
        path === "/settings" && method === "GET"
          ? { settings: null, template: null }
          : path.startsWith("/templates/")
            ? { template: { ...JSON.parse(String(init?.body)), id: "daily-visit", version: 1, updatedAt: "2026-12-01T00:00:00.000Z" } }
            : { settings: JSON.parse(String(init?.body ?? "{}")) };
      return new Response(JSON.stringify(json), { status: 200 });
    }) as typeof fetch;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

  it("starts a first setup with the four sections and saves version 1", async () => {
    await act(async () => root.render(<Settings onError={() => {}} />));
    await flush();
    expect(container.textContent).toContain("Not saved yet.");
    expect(container.querySelectorAll("select").length).toBe(4); // one carry rule per section

    const save = [...container.querySelectorAll("button")].find((b) => b.textContent === "Save template")!;
    await act(async () => save.click());
    await flush();

    const put = calls.find((c) => c.method === "PUT" && c.path === "/templates/daily-visit");
    expect(put?.body).toMatchObject({ name: "Daily visit" });
    expect(calls.some((c) => c.method === "PUT" && c.path === "/settings")).toBe(true);
    expect(container.textContent).toContain("Saved as version 1.");
  });
});
