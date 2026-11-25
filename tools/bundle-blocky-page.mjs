#!/usr/bin/env node
/**
 * Bundles the blocky page into the one classic script an html-capture pack may load.
 *
 *   node tools/bundle-blocky-page.mjs          # write packs/blocky-story/render/page.js
 *   node tools/bundle-blocky-page.mjs --check  # fail if page.js is older than a source
 *
 * page.js = adapter.js + cast.js + the kit's engine + the face atlases + three.js. The sources stay beside it: the kit's
 * code is vendored unchanged apart from one hook in studio.load(), and that difference is the only thing this bundle hides.
 */

import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PACK = path.join(ROOT, "packs", "blocky-story", "render");
const ENTRY = path.join(PACK, "adapter.js");
const OUT = path.join(PACK, "page.js");

function sources() {
  const files = [ENTRY, path.join(PACK, "cast.js"), path.join(PACK, "assets", "vendor", "three.module.js")];
  for (const dir of [path.join(PACK, "assets", "engine"), path.join(PACK, "assets")]) {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isFile() && name.endsWith(".js")) files.push(full);
    }
  }
  return files;
}

if (process.argv.includes("--check")) {
  const outAge = statSync(OUT).mtimeMs;
  const stale = sources().filter((f) => statSync(f).mtimeMs > outAge);
  if (stale.length > 0) {
    console.error(`page.js is older than ${stale.map((f) => path.relative(ROOT, f)).join(", ")} — run node tools/bundle-blocky-page.mjs`);
    process.exit(1);
  }
  console.log("page.js is newer than every source");
  process.exit(0);
}

execFileSync(
  "npx",
  ["--yes", "esbuild@0.24.0", ENTRY, "--bundle", "--format=iife", "--minify", "--target=chrome120", `--outfile=${OUT}`, "--log-level=warning"],
  { stdio: "inherit", cwd: ROOT },
);
console.log(`bundled ${path.relative(ROOT, OUT)} (${(statSync(OUT).size / 1024).toFixed(0)} KB)`);