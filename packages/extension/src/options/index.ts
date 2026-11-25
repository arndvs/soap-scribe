export {};
// Options page: the clinician pastes her access token once. It's kept in
// chrome.storage.local, never in page context and never in the bundle.
const input = document.querySelector<HTMLInputElement>("#token")!;
const statusEl = document.querySelector<HTMLParagraphElement>("#status")!;

void chrome.storage.local.get("token").then(({ token }) => {
  if (token) statusEl.textContent = "A token is saved. Paste a new one to replace it.";
});

document.querySelector<HTMLFormElement>("#form")!.addEventListener("submit", async (e) => {
  e.preventDefault();
  const token = input.value.trim();
  if (token.length < 20) {
    statusEl.textContent = "That doesn't look like a full token.";
    return;
  }
  await chrome.storage.local.set({ token });
  input.value = "";
  statusEl.textContent = "Saved.";
});

document.querySelector<HTMLButtonElement>("#clear")!.addEventListener("click", async () => {
  await chrome.storage.local.remove("token");
  statusEl.textContent = "Token removed.";
});
