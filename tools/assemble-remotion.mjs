#!/usr/bin/env node
/**
 * Builds a Remotion project from the vendored runtime (runtime/remotion) and every remotion-2d pack's render/, laid
 * out exactly like the bundle venstudio's portal serves to workers (apps/portal/lib/install-bundle.ts):
 *
 *   <out>/package.json, tsconfig.json, scripts/probe.mjs, src/{index.ts,Root.tsx,compositions.ts,props.ts}
 *   <out>/src/packs/<pack id>/...       the pack's render/ files
 *   <out>/src/packs/index.ts            generated: imports each pack's `composition`
 *   <out>/src/packs/packs.json          generated: [{ id, version, composition }]
 *   <out>/html/<pack id>/...            every html-capture pack's render/ files (the page and its vendored files)
 *   <out>/html/packs.json               generated: [{ id, version, drawsCaptions, sha256 }] (sha256: renderDigest)
 *
 *   node tools/assemble-remotion.mjs <out dir> [--status trial,proven,listed]
 *
 * Zero dependencies. venstudio's tests check that the two generated files have the same text as its bundle builder.
 */
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { packFiles, renderDigest } from "./validate.mjs";

export const RUNTIME_FILES = ["package.json", "tsconfig.json", "scripts/probe.mjs", "src/index.ts", "src/Root.tsx", "src/compositions.ts", "src/props.ts"];

const byId = (xs) => [...xs].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

export function packIndexSource(packs) {
  const sorted = byId(packs);
  return [
    "// Generated from the installed style packs. Do not edit: the bundle builder writes it.",
    'import type { PackComposition } from "../compositions.ts";',
    ...sorted.map((p, i) => `import { composition as pack${i} } from "./${p.id}/index.tsx";`),
    "",
    `export const PACK_COMPOSITIONS: readonly PackComposition[] = [${sorted.map((_, i) => `pack${i}`).join(", ")}];`,
    "",
  ].join("\n");
}

export function packListJson(packs) {
  return `${JSON.stringify(byId(packs).map((p) => ({ id: p.id, version: p.version, composition: p.composition })), null, 2)}\n`;
}

/** The remotion-2d packs under <root>/packs, optionally only those with one of `statuses`. */
export function remotionPacks(root, statuses = null) {
  const dir = path.join(root, "packs");
  const out = [];
  for (const id of readdirSync(dir).sort()) {
    const file = path.join(dir, id, "style.json");
    let s;
    try {
      s = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      continue;
    }
    if (s?.renderer?.engine !== "remotion-2d") continue;
    if (statuses && !statuses.includes(s.status)) continue;
    out.push({ id: s.id, version: s.version, composition: s.renderer.composition, dir: path.join(dir, id, "render") });
  }
  return out;
}

/** html/packs.json: the html-capture packs a worker serves pages from. Same text as venstudio's bundle builder. */
export function htmlPackListJson(packs) {
  return `${JSON.stringify(byId(packs).map((p) => ({ id: p.id, version: p.version, drawsCaptions: p.drawsCaptions === true, sha256: p.sha256 })), null, 2)}\n`;
}

/** The html-capture packs under <root>/packs, optionally only those with one of `statuses`, with their renderDigest. */
export function htmlPacks(root, statuses = null) {
  const dir = path.join(root, "packs");
  const out = [];
  for (const id of readdirSync(dir).sort()) {
    let s;
    try {
      s = JSON.parse(readFileSync(path.join(dir, id, "style.json"), "utf8"));
    } catch {
      continue;
    }
    if (s?.renderer?.engine !== "html-capture") continue;
    if (statuses && !statuses.includes(s.status)) continue;
    out.push({ id: s.id, version: s.version, drawsCaptions: s.renderer.drawsCaptions === true, sha256: renderDigest(packFiles(path.join(dir, id))), dir: path.join(dir, id, "render") });
  }
  return out;
}

export function assemble(root, out, statuses = null) {
  const runtime = path.join(root, "runtime", "remotion");
  rmSync(path.join(out, "src"), { recursive: true, force: true });
  rmSync(path.join(out, "scripts"), { recursive: true, force: true });
  for (const rel of RUNTIME_FILES) {
    mkdirSync(path.dirname(path.join(out, rel)), { recursive: true });
    writeFileSync(path.join(out, rel), readFileSync(path.join(runtime, rel)));
  }
  const packs = remotionPacks(root, statuses);
  for (const p of packs) {
    if (!statSync(p.dir).isDirectory()) throw new Error(`${p.id} has no render/ directory`);
    cpSync(p.dir, path.join(out, "src", "packs", p.id), { recursive: true });
  }
  writeFileSync(path.join(out, "src", "packs", "index.ts"), packIndexSource(packs));
  writeFileSync(path.join(out, "src", "packs", "packs.json"), packListJson(packs));
  rmSync(path.join(out, "html"), { recursive: true, force: true });
  const html = htmlPacks(root, statuses);
  for (const p of html) cpSync(p.dir, path.join(out, "html", p.id), { recursive: true });
  mkdirSync(path.join(out, "html"), { recursive: true });
  writeFileSync(path.join(out, "html", "packs.json"), htmlPackListJson(html));
  return { remotion: packs, html };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = process.argv[2];
  if (!out) {
    console.error("usage: node tools/assemble-remotion.mjs <out dir> [--status a,b]");
    process.exit(2);
  }
  const at = process.argv.indexOf("--status");
  const statuses = at > 0 ? process.argv[at + 1].split(",") : null;
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  mkdirSync(out, { recursive: true });
  const { remotion, html } = assemble(root, path.resolve(out), statuses);
  const names = [...remotion.map((p) => `${p.id}@${p.version} (${p.composition})`), ...html.map((p) => `${p.id}@${p.version} (html-capture)`)];
  console.log(`assembled ${names.join(", ") || "no packs"} into ${out}`);
}
