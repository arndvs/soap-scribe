import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Bundles the API and worker (including @soap-scribe/shared) into dist/. npm dependencies
// stay external and are installed in the image with `pnpm deploy --prod`.
const pkg = JSON.parse(readFileSync(resolve(import.meta.dirname, "package.json"), "utf8")) as {
  dependencies: Record<string, string>;
};
const external = Object.keys(pkg.dependencies).filter((d) => !d.startsWith("@soap-scribe/"));

await build({
  entryPoints: { api: "src/api/main.ts", worker: "src/worker/main.ts" },
  outdir: resolve(import.meta.dirname, "dist"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: true,
  external: [...external, "@aws-sdk/*"],
  logLevel: "info",
});
