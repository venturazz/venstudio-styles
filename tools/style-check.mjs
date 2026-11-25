#!/usr/bin/env node
/**
 * A style, or a script?
 *
 * A style describes how a video of *this kind* looks: palette, type, camera grammar, pacing ranges, the elements it
 * may put on screen. A script describes the one video it was written for: these three shots, this copy, this long.
 * The worker can only adapt to a video request when the pack is a style, so this tool asks each pack the questions
 * that separate the two, and says which packs still behave like a script.
 *
 *   node tools/style-check.mjs            # the table
 *   node tools/style-check.mjs --json     # for CI or another tool
 *   node tools/style-check.mjs <id>...    # a few packs
 *
 * Exit code 1 when a pack fails. Zero dependencies, like tools/validate.mjs.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const SOURCE_EXT = new Set([".py", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".html", ".css"]);
const SKIP_DIRS = new Set(["node_modules", ".git", "fonts", "vendor"]);

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (!SKIP_DIRS.has(name)) walk(p, out);
    } else out.push(p);
  }
  return out;
}

const read = (p) => readFileSync(p, "utf8");

/** Every string in a payload that a person would read on screen: the copy a script would hard-code. */
function copyStrings(node, out = []) {
  if (typeof node === "string") {
    const s = node.trim();
    // Long enough to be copy rather than a key, a colour or a mode; words, not an id.
    if (s.length >= 24 && /\s/.test(s) && /[a-z]/i.test(s) && !/^#[0-9a-f]{3,8}$/i.test(s)) out.push(s);
  } else if (Array.isArray(node)) node.forEach((n) => copyStrings(n, out));
  else if (node && typeof node === "object") Object.values(node).forEach((n) => copyStrings(n, out));
  return out;
}

function payloadFiles(dir) {
  const f = join(dir, "fixtures");
  if (!existsSync(f)) return [];
  return readdirSync(f)
    .filter((n) => n.endsWith(".json") && !n.startsWith("expect"))
    .map((n) => join(f, n));
}

/**
 * The checks. `fail` means the pack cannot be shown to follow a request; `warn` means it may be pinned to one shape
 * and a person should look.
 */
export function checkPack(dir) {
  const issues = [];
  const id = JSON.parse(read(join(dir, "style.json"))).id;
  const style = JSON.parse(read(join(dir, "style.json")));
  const hasRender = existsSync(join(dir, "render"));
  const sources = hasRender ? walk(join(dir, "render")).filter((p) => SOURCE_EXT.has(extname(p))) : [];
  const code = sources.map(read).join("\n");

  // 1. The payload has to be input. If the copy the fixture carries also sits in the code, the pack renders its
  //    fixture, not the request.
  for (const payload of payloadFiles(dir)) {
    for (const text of copyStrings(JSON.parse(read(payload)))) {
      if (code.includes(text)) {
        issues.push({ level: "fail", code: "copy-in-code",
          msg: `render/ carries the fixture's own copy (${
            text.length > 60 ? text.slice(0, 57) + "..." : text
          }) — that line is not read from the request` });
      }
    }
  }

  // 2. Nothing to read the request with: no props, no argv, no payload.
  if (hasRender && sources.length && !/\bprops\b|process\.argv|sys\.argv|globalThis\.__PAYLOAD__/.test(code)) {
    issues.push({ level: "fail", code: "no-input",
      msg: "render/ never reads the payload (props, argv or __PAYLOAD__): it can only draw what it was written for" });
  }

  // 3. A fixed shot count or a fixed length. Legitimate for a kernel count, a colour ramp... hence a warning.
  const pinCount = [...code.matchAll(/range\(\s*(\d+)\s*\)|i\s*<\s*(\d+)\s*;|\.slice\(\s*0\s*,\s*(\d+)\s*\)|Array\(\s*(\d+)\s*\)/g)]
    .map((m) => Number(m[1] ?? m[2] ?? m[3] ?? m[4]))
    .filter((n) => n >= 2 && n <= 40);
  if (pinCount.length) {
    issues.push({ level: "warn", code: "pinned-count",
      msg: `render/ loops over a literal count (${[...new Set(pinCount)].join(", ")}): confirm the shot count comes from the payload, not from here` });
  }
  const pinLength = code.match(/totalFrames\s*=\s*\d+|durationSec\s*[=:]\s*\d+(\s*\*|,|\s*$)/m);
  if (pinLength) {
    issues.push({ level: "warn", code: "pinned-length", msg: `render/ pins a length (${pinLength[0].trim()}): confirm it comes from the payload` });
  }

  // 4. One fixture shows one request. A style has to be shown with a second, different one or nobody knows it adapts.
  const payloads = payloadFiles(dir);
  if (payloads.length < 2) {
    issues.push({ level: "fail", code: "one-fixture",
      msg: "only one fixture: nothing here shows the pack renders a second, different request" });
  } else {
    const shapes = payloads.map((p) => {
      const j = JSON.parse(read(p));
      const scenes = (j.scenes ?? j.scenePlan?.scenes ?? []).length;
      return `${scenes}/${j.durationSec ?? "?"}`;
    });
    if (new Set(shapes).size === 1) {
      issues.push({ level: "fail", code: "same-shape",
        msg: `both fixtures have the same shape (${shapes[0]}): a second request with another shot count and length is what proves it adapts` });
    }
  }

  // 5. A contract with a single value everywhere is a script wearing a contract's clothes.
  const p = style.contract?.pacing ?? {};
  if (Array.isArray(p.shotSeconds) && p.shotSeconds[0] === p.shotSeconds[1]) {
    issues.push({ level: "fail", code: "pinned-shot-seconds",
      msg: `contract.pacing.shotSeconds is one value (${p.shotSeconds[0]}): the engine has no room to fit the request` });
  }
  if (Array.isArray(p.cutsPerMinute) && p.cutsPerMinute[0] === p.cutsPerMinute[1]) {
    issues.push({ level: "warn", code: "pinned-cuts", msg: "contract.pacing.cutsPerMinute is one value" });
  }

  // 6. A Hermes pack has no render of its own: the skill is the engine, so the brief is where a style can become a
  //    script. It must name the fields the request fills.
  if (style.renderer?.engine === "hermes") {
    const input = style.hermes?.input;
    if (input && !/request|topic|beat|script|scene|brief/i.test(JSON.stringify(input))) {
      issues.push({ level: "warn", code: "brief-unbound",
        msg: "hermes.input does not name any field the request fills: the skill will write its own example" });
    }
  }

  return { id, issues };
}

export function checkAll(root = ROOT) {
  const packsDir = join(root, "packs");
  return readdirSync(packsDir)
    .filter((n) => existsSync(join(packsDir, n, "style.json")))
    .map((n) => checkPack(join(packsDir, n)))
    .filter((r) => JSON.parse(read(join(packsDir, r.id, "style.json"))).status !== "retired");
}

function main() {
  const argv = process.argv.slice(2);
  const only = argv.filter((a) => !a.startsWith("--"));
  const results = only.length ? only.map((id) => checkPack(join(ROOT, "packs", id))) : checkAll();
  const failAll = results.filter((r) => r.issues.some((i) => i.level === "fail"));
  // Two different failure: the pack is pinned to one video (a script), or nothing here proves it is not.
  const scripted = results.filter((r) => r.issues.some((i) => i.level === "fail" && i.code !== "one-fixture"));
  const unproven = results.filter((r) => !scripted.includes(r) && r.issues.some((i) => i.code === "one-fixture"));
  const warns = results.filter((r) => !failAll.includes(r) && r.issues.some((i) => i.level === "warn"));

  if (argv.includes("--json")) {
    console.log(JSON.stringify({ results, scripted: scripted.length, unproven: unproven.length, warns: warns.length }, null, 2));
  } else {
    for (const r of results) {
      const hard = r.issues.some((i) => i.level === "fail" && i.code !== "one-fixture");
      const mark = hard ? "FAIL" : r.issues.some((i) => i.code === "one-fixture") ? "?   " : r.issues.length ? "warn" : "ok  ";
      console.log(`${mark} ${r.id}`);
      for (const i of r.issues) console.log(`       ${i.level} ${i.code}: ${i.msg}`);
    }
    console.log(`\n${results.length} pack(s): ${results.length - failAll.length} style, ${unproven.length} unproven (one fixture), ${scripted.length} scripted, ${warns.length} to check`);
  }
  process.exit(scripted.length ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
