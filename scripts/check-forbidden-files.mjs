// Fails if anything that must never be public is tracked by git:
// audio recordings, practice data folders, or real env files.
import { execSync } from "node:child_process";

const tracked = execSync("git ls-files", { encoding: "utf8" }).split("\n").filter(Boolean);

const rules = [
  { test: (f) => /\.(m4a|mp3|wav|webm|ogg)$/i.test(f), why: "audio file" },
  { test: (f) => /(^|\/)practice\//.test(f), why: "practice data folder" },
  { test: (f) => /(^|\/)fixtures\/private\//.test(f), why: "private fixtures" },
  { test: (f) => /(^|\/)\.env(\..+)?$/.test(f) && !f.endsWith(".env.example"), why: "env file" },
];

const hits = tracked.flatMap((f) => rules.filter((r) => r.test(f)).map((r) => `${f} (${r.why})`));

if (hits.length > 0) {
  console.error("Forbidden files are tracked:\n  " + hits.join("\n  "));
  process.exit(1);
}
console.log(`check-forbidden-files: ${tracked.length} tracked files, none forbidden.`);
