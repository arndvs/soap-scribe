import { build } from "esbuild";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Builds the extension into dist/. Only an allowlist of NON-SECRET values is injected
 * (API_URL, JANE_HOST). Never inject process.env wholesale: it would copy the build
 * machine's entire environment, secrets included, into the bundle.
 */
const ALLOWLIST = ["API_URL", "JANE_HOST"] as const;

function readEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
  );
}

const fileEnv = readEnvFile(resolve(import.meta.dirname, "../../.env"));
const cfg = Object.fromEntries(ALLOWLIST.map((k) => [k, process.env[k] ?? fileEnv[k] ?? ""])) as Record<(typeof ALLOWLIST)[number], string>;
if (!cfg.API_URL || !cfg.JANE_HOST) throw new Error("Set API_URL and JANE_HOST (see .env.example)");
const apiOrigin = new URL(cfg.API_URL).origin;

const out = resolve(import.meta.dirname, process.env.OUT_DIR ?? "dist");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

await build({
  entryPoints: {
    background: "src/background/index.ts",
    content: "src/content/index.ts",
    sidepanel: "src/sidepanel/App.tsx",
    options: "src/options/index.ts",
  },
  outdir: out,
  bundle: true,
  format: "iife",
  target: "chrome120",
  minify: true,
  sourcemap: false,
  jsx: "automatic",
  define: { __API_URL__: JSON.stringify(cfg.API_URL), "process.env.NODE_ENV": '"production"' },
  logLevel: "info",
});

cpSync(resolve(import.meta.dirname, "public"), out, { recursive: true });

// Plain http only for the local demo's fake Jane; real Jane is always https.
const janeScheme = /^localhost(:\d+)?$/.test(cfg.JANE_HOST) ? "http" : "https";
const janeOrigin = `${janeScheme}://${cfg.JANE_HOST}/*`;
const manifest = {
  manifest_version: 3,
  name: "SOAP Scribe",
  version: "0.1.0",
  description: "Drafts SOAP notes from recorded visits; the clinician reviews, inserts and signs.",
  permissions: ["sidePanel", "storage", "tabs"],
  host_permissions: [janeOrigin, `${apiOrigin}/*`],
  background: { service_worker: "background.js" },
  side_panel: { default_path: "sidepanel.html" },
  options_page: "options.html",
  action: { default_title: "SOAP Scribe" },
  content_scripts: [{ matches: [janeOrigin], js: ["content.js"], run_at: "document_idle" }],
};
writeFileSync(resolve(out, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`Built to ${out} for ${cfg.JANE_HOST}, API ${apiOrigin}`);
