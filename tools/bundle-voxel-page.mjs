#!/usr/bin/env node
/**
 * Bundles the voxel page into the one classic script an html-capture pack is allowed to load.
 *
 * render/voxel.js is an ES module that imports three.js, the kit's builders and the inlined art. A pack page is captured by
 * a bare `<script src>`, and the repo's stand-in DOM test runs page scripts as classic scripts, so the module graph is
 * flattened here: page.js = voxel.js + three + mcvoxel + mcrig + assets/blob.js. The sources stay beside it as the
 * reviewable truth; only page.js is what the browser runs.
 *
 *   node tools/bundle-voxel-page.mjs          # write packs/voxel-build/render/page.js
 *   node tools/bundle-voxel-page.mjs --check  # fail if page.js is older than its sources
 */

import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PACK = path.join(ROOT, "packs", "voxel-build", "render");
const ENTRY = path.join(PACK, "voxel.js");
const OUT = path.join(PACK, "page.js");

/** Every file the bundle is built from, so --check can tell a stale page.js from a fresh one. */
function sources() {
  const files = [ENTRY, path.join(PACK, "assets", "mcvoxel.js"), path.join(PACK, "assets", "mcrig.js"), path.join(PACK, "assets", "blob.js")];
  for (const dir of [path.join(PACK, "assets", "vendor")]) {
    for (const name of readdirSync(dir)) if (name.endsWith(".js")) files.push(path.join(dir, name));
  }
  return files;
}

if (process.argv.includes("--check")) {
  const outAge = statSync(OUT).mtimeMs;
  const stale = sources().filter((f) => statSync(f).mtimeMs > outAge);
  if (stale.length > 0) {
    console.error(`page.js is older than ${stale.map((f) => path.relative(ROOT, f)).join(", ")} — run node tools/bundle-voxel-page.mjs`);
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