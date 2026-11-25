/*
 * Jane page capture, for mapping selectors on day 2 (gaps G-04, G-06).
 *
 * Paste into Chrome DevTools' console on a TEST patient's chart page (and again on the
 * schedule page). It copies to the clipboard:
 *   - a de-identified skeleton of the page: every letter becomes "x" and every digit "0",
 *     attribute values that aren't simple tokens are dropped, links and images emptied;
 *   - candidate selectors for each editable field, with its label (labels over 40
 *     characters are dropped);
 *   - elements whose attributes contain the patient ID from the URL (for patientIdElement);
 *   - repeated blocks that contain dates (likely the previous-notes list).
 * Review the output before saving it anywhere. It is meant to contain no patient data,
 * but you are the check. Save it as packages/extension/src/content/__fixtures__/.
 */
(() => {
  const SAFE_ATTR = /^(id|class|name|type|role|for|contenteditable|aria-multiline|data-[\w-]+)$/;
  const TOKEN = /^[A-Za-z_][\w -]{0,60}$/;
  const redactText = (t) => t.replace(/[A-Za-z]/g, "x").replace(/\d/g, "0");
  const urlIds = (location.pathname + location.hash).match(/\d{2,}/g) || [];

  const cssPath = (el) => {
    if (el.id && !/\d{3,}/.test(el.id) && document.querySelectorAll(`#${CSS.escape(el.id)}`).length === 1) return `#${CSS.escape(el.id)}`;
    for (const a of el.getAttributeNames()) {
      if (/^(name|data-[\w-]+|aria-label)$/.test(a)) {
        const v = el.getAttribute(a);
        const sel = `${el.tagName.toLowerCase()}[${a}="${CSS.escape(v)}"]`;
        if (v && TOKEN.test(v) && document.querySelectorAll(sel).length === 1) return sel;
      }
    }
    const parts = [];
    for (let n = el; n && n !== document.body && parts.length < 6; n = n.parentElement) {
      const same = n.parentElement ? [...n.parentElement.children].filter((c) => c.tagName === n.tagName) : [];
      const cls = [...n.classList].filter((c) => TOKEN.test(c) && !/\d{3,}/.test(c)).slice(0, 2).map((c) => `.${CSS.escape(c)}`).join("");
      parts.unshift(`${n.tagName.toLowerCase()}${cls}${same.length > 1 ? `:nth-of-type(${same.indexOf(n) + 1})` : ""}`);
    }
    return parts.join(" > ");
  };

  const labelFor = (el) => {
    const byFor = el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    const text =
      (byFor && byFor.textContent) ||
      el.getAttribute("aria-label") ||
      el.getAttribute("placeholder") ||
      (el.closest("label") && el.closest("label").textContent) ||
      (el.previousElementSibling && el.previousElementSibling.textContent) ||
      "";
    const t = text.replace(/\s+/g, " ").trim();
    return t.length <= 40 ? t : "(label too long, dropped)";
  };

  const fields = [...document.querySelectorAll('textarea, input[type="text"], input:not([type]), [contenteditable="true"], [contenteditable=""]')]
    .filter((el) => el.offsetParent !== null)
    .map((el) => {
      const label = labelFor(el);
      const soap = (label.match(/\b(subjective|objective|assessment|plan)\b/i) || [])[1];
      return { selector: cssPath(el), tag: el.tagName.toLowerCase(), editable: el.isContentEditable ? "contenteditable" : "value", label, guess: soap ? soap.toLowerCase() : null };
    });

  const idCarriers = urlIds.length
    ? [...document.querySelectorAll("*")]
        .flatMap((el) => el.getAttributeNames().filter((a) => urlIds.includes(el.getAttribute(a))).map((a) => ({ selector: cssPath(el), attribute: a })))
        .slice(0, 20)
    : [];

  const DATE = /(?<!\d)(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}|(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* \d{1,2},? \d{4})(?!\d)/i;
  const groups = new Map();
  for (const el of document.querySelectorAll("body *")) {
    if (el.children.length === 0 || !DATE.test(el.textContent || "") || (el.textContent || "").length > 5000) continue;
    const key = `${el.tagName}.${[...el.classList].join(".")}`;
    groups.set(key, [...(groups.get(key) || []), el]);
  }
  const noteLists = [...groups.entries()]
    .filter(([, els]) => els.length >= 2)
    .map(([, els]) => ({ itemSelector: cssPath(els[0]).replace(/:nth-of-type\(\d+\)$/, ""), count: els.length }))
    .slice(0, 10);

  const clone = document.body.cloneNode(true);
  clone.querySelectorAll("script, style, noscript, svg, img, iframe, canvas, video").forEach((n) => n.remove());
  const walk = (n) => {
    if (n.nodeType === Node.TEXT_NODE) n.textContent = redactText(n.textContent);
    if (n.nodeType !== Node.ELEMENT_NODE) return;
    for (const a of [...n.getAttributeNames()]) {
      const v = n.getAttribute(a);
      if (!SAFE_ATTR.test(a)) n.removeAttribute(a);
      else if (!TOKEN.test(v || "x")) n.setAttribute(a, redactText(v));
      else if (/\d/.test(v)) n.setAttribute(a, v.replace(/\d/g, "0"));
    }
    if (n instanceof HTMLTextAreaElement || n instanceof HTMLInputElement) n.value = "";
    n.childNodes.forEach(walk);
  };
  walk(clone);

  const out = {
    capturedAt: new Date().toISOString().slice(0, 10),
    page: (location.pathname + location.hash).replace(/\d+/g, ":id"),
    fields,
    patientIdCarriers: idCarriers,
    previousNoteListCandidates: noteLists,
    skeleton: clone.outerHTML.replace(/\s{2,}/g, " "),
  };
  const json = JSON.stringify(out, null, 2);
  try {
    copy(json); // DevTools console helper
    console.log(`Jane capture copied to clipboard (${json.length} characters). Review it before saving.`);
  } catch {
    console.log(json);
  }
  return out;
})();
