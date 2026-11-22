#!/usr/bin/env node
/**
 * Says whether this Remotion project can render on this machine. The worker reports `remotion-2d` only when the
 * quick probe passes.
 *
 *   node scripts/probe.mjs          quick (about a second): packages installed, versions match, and a full probe
 *                                   passed for exactly these template files. Prints JSON, exits 0 when usable.
 *   node scripts/probe.mjs --full   renders one still of every composition with the sample props through the
 *                                   Remotion CLI and its browser, then records the result in .venstudio-probe.json.
 *                                   install.sh --with-remotion and CI run this once after installing.
 *
 * The compositions come from the installed style packs: src/packs/packs.json lists each pack's id, version and
 * composition (the portal's bundle builder writes it). Both outputs name them, so the worker reports
 * pack:<id>@<version> only for a pack whose composition this exact project rendered.
 *
 * Plain JavaScript and Node built-ins only, so it runs before anything is built.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MARKER = path.join(DIR, ".venstudio-probe.json");
/** The installed packs, from src/packs/packs.json: [{ id, version, composition }]. */
const PACKS_FILE = path.join(DIR, "src", "packs", "packs.json");

function fail(reason) {
  console.log(JSON.stringify({ ok: false, reason }));
  process.exit(1);
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

/** Hash of every template source file, so a probe result belongs to exactly the files it rendered. */
export function sourceHash(dir = DIR) {
  const hash = createHash("sha256");
  const walk = (d) => {
    for (const name of readdirSync(d).sort()) {
      const p = path.join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else {
        hash.update(path.relative(dir, p));
        hash.update(readFileSync(p));
      }
    }
  };
  walk(path.join(dir, "src"));
  hash.update(readFileSync(path.join(dir, "package.json")));
  return hash.digest("hex");
}

/** Path of the Remotion CLI's entry script, from its package.json. */
export function cliEntry(dir = DIR) {
  const pkgFile = path.join(dir, "node_modules", "@remotion", "cli", "package.json");
  const pkg = readJson(pkgFile);
  if (!pkg) return null;
  const bin = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.remotion;
  if (!bin) return null;
  const entry = path.join(path.dirname(pkgFile), bin);
  return existsSync(entry) ? entry : null;
}

/** The installed packs, or a failure naming why there are none. */
export function installedPacks(file = PACKS_FILE) {
  const list = readJson(file);
  if (!Array.isArray(list) || list.length === 0) return null;
  const ok = list.every((p) => p && typeof p.id === "string" && typeof p.version === "string" && typeof p.composition === "string");
  return ok ? list.map((p) => ({ id: p.id, version: p.version, composition: p.composition })) : null;
}

function packsOrFail() {
  const packs = installedPacks();
  if (!packs) fail(`no style pack compositions in ${PACKS_FILE} (reinstall the renderer from the portal: install.sh --with-remotion)`);
  return packs;
}

function installed() {
  const cli = readJson(path.join(DIR, "node_modules", "@remotion", "cli", "package.json"));
  const core = readJson(path.join(DIR, "node_modules", "remotion", "package.json"));
  if (!cli || !core) fail(`the Remotion packages are not installed in ${DIR} (run npm install there)`);
  if (cli.version !== core.version) fail(`remotion ${core.version} and @remotion/cli ${cli.version} differ; reinstall`);
  const entry = cliEntry();
  if (!entry) fail("the Remotion CLI entry script is missing; reinstall");
  return { version: core.version, entry };
}

function quick() {
  const { version } = installed();
  const marker = readJson(MARKER);
  if (!marker) fail(`no full probe has passed here yet (run: node ${path.join(DIR, "scripts", "probe.mjs")} --full)`);
  if (marker.ok !== true) fail(`the last full probe failed: ${String(marker.reason ?? "unknown")}`);
  if (marker.remotion !== version) fail(`the last full probe was for Remotion ${marker.remotion}, but ${version} is installed; run the full probe again`);
  if (marker.sourceHash !== sourceHash()) fail("the templates changed since the last full probe; run the full probe again");
  const packs = packsOrFail();
  if (!Array.isArray(marker.packs)) fail("the last full probe predates style packs; run the full probe again");
  console.log(JSON.stringify({ ok: true, remotion: version, compositions: marker.compositions, packs, probedAt: marker.probedAt }));
}

function full() {
  const { version, entry } = installed();
  const packs = packsOrFail();
  const COMPOSITIONS = packs.map((p) => p.composition);
  const out = mkdtempSync(path.join(os.tmpdir(), "vs-remotion-probe-"));
  const started = Date.now();
  try {
    for (const id of COMPOSITIONS) {
      const png = path.join(out, `${id}.png`);
      const r = spawnSync(
        process.execPath,
        [entry, "still", path.join(DIR, "src", "index.ts"), id, png, "--frame=45", "--gl=swangle", "--timeout=120000", "--log=info"],
        { cwd: DIR, encoding: "utf8", timeout: 10 * 60_000, maxBuffer: 32 * 1024 * 1024 },
      );
      if (r.status !== 0 || !existsSync(png) || statSync(png).size === 0) {
        const reason = `rendering a still of ${id} failed: ${(r.stderr || r.stdout || String(r.error ?? "")).trim().slice(-600)}`;
        writeFileSync(MARKER, JSON.stringify({ ok: false, reason, remotion: version, probedAt: new Date().toISOString() }, null, 2));
        fail(reason);
      }
    }
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
  const marker = { ok: true, remotion: version, compositions: COMPOSITIONS, packs, sourceHash: sourceHash(), seconds: Math.round((Date.now() - started) / 100) / 10, probedAt: new Date().toISOString() };
  writeFileSync(MARKER, JSON.stringify(marker, null, 2));
  console.log(JSON.stringify(marker));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--full")) full();
  else quick();
}
