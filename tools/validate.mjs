#!/usr/bin/env node
/**
 * Style pack validator, format 1. Zero dependencies (Node built-ins only), so it runs in this repo's CI, in
 * venstudio's CI and on a laptop without `npm install`.
 *
 *   node tools/validate.mjs [root]      validates every pack under <root>/packs (default: this repo), prints the
 *                                       problems and exits 1 when there is any
 *
 * This file is the source of truth. venstudio vendors an exact copy into styles/tools/validate.mjs with
 * scripts/sync-styles.mjs; never edit the vendored copy. The format is described in FORMAT.md and, for editors,
 * in schema/style.schema.json. The schema documents the shape; this validator is what decides.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const FORMAT_VERSION = 1;

/** Lifecycle, in order. Retired is a side exit kept so old runs stay explainable. */
export const STATUSES = ["draft", "lab", "trial", "proven", "listed", "retired"];
/** Statuses only an owner-approved PR may set: they need an owner-review curation entry that approved. */
export const OWNER_STATUSES = ["proven", "listed"];
/** Statuses that claim the pack renders: they need a passing ci-render curation entry. */
export const RENDERED_STATUSES = ["lab", "trial", "proven", "listed"];

/** Renderer engines, the keys of ENGINES in venstudio apps/portal/lib/studio/catalog.ts (a venstudio test checks). */
export const ENGINES = ["ffmpeg-stills", "remotion-2d", "html-capture", "hermes", "sprite-rig", "manim", "godot-2d", "remotion-3d", "godot-3d", "blender-cycles", "provider-video"];
/** Engines VenStudio can run today (hermes by the portal, the rest by a worker). A pack for any other engine stays draft (or retired). */
export const RUNNABLE_ENGINES = ["ffmpeg-stills", "remotion-2d", "html-capture", "hermes"];
/** Engines whose packs carry a render project in render/. */
export const PROJECT_ENGINES = ["remotion-2d", "html-capture"];
/** Engines whose render project is a Remotion composition named in renderer.composition. */
export const COMPOSITION_ENGINES = ["remotion-2d"];
/**
 * Research-only engines (owner decision): Hermes renders with its own tools. Never above trial, never rendered in CI
 * (there is no Hermes there), so lab and trial do not need a ci-render entry.
 */
export const RESEARCH_ENGINES = ["hermes"];
export const RESEARCH_MAX_STATUSES = ["draft", "lab", "trial", "retired"];
/** Files an html-capture render project may hold: text only, because the worker bundle carries text. */
export const HTML_RENDER_FILE_RE = /\.(html|js|mjs|css|json|svg|txt|md)$|(^|\/)LICEN[CS]E[^/]*$|(^|\/)NOTICE[^/]*$/;
/** A remote reference in a page or a style sheet: the page could not render it, because html-capture blocks the network. */
const REMOTE_REF_RE = /(?:\bsrc|\bhref|@import|url\()\s*=?\s*["']?\s*(?:https?:)?\/\/[^"')\s]/i;

export const FAMILIES = ["explainer", "documentary", "narrative", "animation-2d", "animation-2.5d", "animation-3d", "motion-graphics", "game-style", "data-list", "ambient"];
export const FORMATS = ["short", "long"];
export const FRAMES = ["landscape", "portrait", "both"];
export const ELEMENT_KINDS = ["plate", "heading", "callout", "counter", "bar", "gauge", "arrow", "tally", "particles", "diagram"];
export const MOTION_TOKENS = ["draw", "pop", "gauge", "counter", "bar", "arrow", "tally", "particles", "pull", "push", "whip", "shake", "drift", "parallax", "scribble", "blot", "flicker", "morph", "dim"];
export const ASSET_MODELS = ["image-per-shot", "plates-and-diagrams"];
export const ASSET_KINDS = ["video", "reference-video", "image", "audio", "font", "sprite-sheet", "model-3d", "script", "other"];
export const ASSET_SOURCES = ["upload", "hermes", "muse", "worker", "licensed", "generated"];
export const MUSIC_POLICIES = ["none", "self-generated", "licensed", "self-or-licensed"];
export const BEAT_SHAPES = ["ending-cta", "ending-outro", "single"];
/** Caption geometry the portal derives (venstudio apps/portal/lib/studio/caption-spec.ts). */
export const CAPTION_SPECS = ["caption-spec-v1"];
export const QC_GATES = ["G-script", "G-storyboard", "G-assets", "G-voice", "G-technical", "G-presentation", "G-compliance", "G-claims"];
export const PROVENANCE_TYPES = ["upload", "link", "repo", "skill", "article", "owner-note"];
export const CURATION_KINDS = ["ci-render", "trial-run", "qc", "hermes-review", "owner-review"];
export const CURATION_RESULTS = ["pass", "fail", "approved", "rejected", "note"];

export const LIMITS = { packFiles: 200, fileBytes: 1024 * 1024, packBytes: 5 * 1024 * 1024, text: 2000, list: 64 };

const ID_RE = /^[a-z0-9][a-z0-9-]{1,62}$/;
const SEMVER_RE = /^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/;
const WORKER_VERSION_RE = /^\d{1,6}(\.\d{1,6}){0,3}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PATH_RE = /^[A-Za-z0-9_][A-Za-z0-9._/-]{0,199}$/;

const TOP_KEYS = ["format", "id", "name", "description", "version", "status", "family", "formats", "renderer", "contract", "portal", "fixture", "provenance", "curation"];

const isRecord = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
const isText = (v, max = LIMITS.text) => typeof v === "string" && v.trim().length > 0 && v.length <= max;
const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/** Compares dotted versions numerically (0.10.0 > 0.9.0). */
export function compareVersions(a, b) {
  const pa = String(a).split(".").map(Number);
  const pb = String(b).split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

/**
 * Digest of an html-capture pack's render project as a worker installs it (html/<id>/): packDigest over the render/
 * files with the "render/" prefix removed. venstudio's bundle builder and worker compute the same.
 */
export function renderDigest(files) {
  const inner = {};
  for (const [p, sha] of Object.entries(files)) if (p.startsWith("render/")) inner[p.slice("render/".length)] = sha;
  return packDigest(inner);
}

export function sha256Hex(data) {
  return createHash("sha256").update(data).digest("hex");
}

/** One hash for a pack: the sorted list of "path NUL sha256" lines. Changes when any file is added, removed or edited. */
export function packDigest(files) {
  const lines = Object.keys(files)
    .sort()
    .map((p) => `${p}\0${files[p]}\n`)
    .join("");
  return sha256Hex(lines);
}

/** Every file of a pack directory, relative, sorted, with its sha256. Dot files and node_modules are not part of a pack. */
export function packFiles(dir) {
  const out = {};
  const walk = (d, prefix) => {
    for (const name of readdirSync(d).sort()) {
      if (name.startsWith(".") || name === "node_modules") continue;
      const p = path.join(d, name);
      const rel = prefix ? `${prefix}/${name}` : name;
      const st = statSync(p);
      if (st.isDirectory()) walk(p, rel);
      else if (st.isFile()) out[rel] = sha256Hex(readFileSync(p));
    }
  };
  walk(dir, "");
  return out;
}

function checkKeys(obj, allowed, at, issues) {
  for (const k of Object.keys(obj)) if (!allowed.includes(k)) issues.push(`${at}: unknown field "${k}"`);
}

function checkList(v, allowed, at, issues, { min = 1 } = {}) {
  if (!Array.isArray(v) || v.length < min || v.length > LIMITS.list) {
    issues.push(`${at} must be a list of ${min}..${LIMITS.list} entries`);
    return;
  }
  const seen = new Set();
  for (const x of v) {
    if (allowed ? !allowed.includes(x) : !isText(x, 400)) issues.push(`${at}: ${JSON.stringify(x)} is not ${allowed ? `one of ${allowed.join(", ")}` : "a short text"}`);
    if (seen.has(x)) issues.push(`${at}: ${JSON.stringify(x)} is listed twice`);
    seen.add(x);
  }
}

function checkRange(v, at, issues, { min = 0, integer = false } = {}) {
  if (!Array.isArray(v) || v.length !== 2 || !v.every(isNum) || v[0] < min || v[0] > v[1] || (integer && !v.every(Number.isInteger))) {
    issues.push(`${at} must be [low, high] with ${min} <= low <= high${integer ? ", whole numbers" : ""}`);
  }
}

/**
 * Validates a parsed style.json. `dirName` is the pack's directory name (the id must match it). Returns plain-text
 * problems; an empty list means valid. Never throws on bad input.
 */
export function validateStyle(style, { dirName } = {}) {
  const issues = [];
  if (!isRecord(style)) return ["style.json must be a JSON object"];
  checkKeys(style, TOP_KEYS, "style.json", issues);
  if (style.format !== FORMAT_VERSION) issues.push(`format must be ${FORMAT_VERSION}`);
  if (typeof style.id !== "string" || !ID_RE.test(style.id)) issues.push("id must be lowercase letters, digits and dashes (2..63 characters)");
  else if (dirName !== undefined && style.id !== dirName) issues.push(`id "${style.id}" must equal the pack directory name "${dirName}"`);
  if (!isText(style.name, 80)) issues.push("name must be a short text (up to 80 characters)");
  if (!isText(style.description, 240)) issues.push("description must be a short text (up to 240 characters)");
  if (typeof style.version !== "string" || !SEMVER_RE.test(style.version)) issues.push("version must be semver MAJOR.MINOR.PATCH");
  if (!STATUSES.includes(style.status)) issues.push(`status must be one of ${STATUSES.join(", ")}`);
  if (!FAMILIES.includes(style.family)) issues.push(`family must be one of ${FAMILIES.join(", ")}`);

  if (!isRecord(style.formats)) issues.push("formats must be an object");
  else {
    checkKeys(style.formats, ["supported", "naturalFrame"], "formats", issues);
    checkList(style.formats.supported, FORMATS, "formats.supported", issues);
    if (!FRAMES.includes(style.formats.naturalFrame)) issues.push(`formats.naturalFrame must be one of ${FRAMES.join(", ")}`);
  }

  const r = style.renderer;
  if (!isRecord(r)) issues.push("renderer must be an object");
  else {
    checkKeys(r, ["engine", "minWorkerVersion", "composition", "drawsCaptions"], "renderer", issues);
    if (!ENGINES.includes(r.engine)) issues.push(`renderer.engine must be one of ${ENGINES.join(", ")}`);
    if (typeof r.minWorkerVersion !== "string" || !WORKER_VERSION_RE.test(r.minWorkerVersion)) issues.push("renderer.minWorkerVersion must be a dotted version like 0.9.0");
    if (COMPOSITION_ENGINES.includes(r.engine)) {
      if (typeof r.composition !== "string" || !ID_RE.test(r.composition)) issues.push(`renderer.composition must name the ${r.engine} composition (lowercase, dashes)`);
    } else if (r.composition !== null) issues.push(`renderer.composition must be null for ${String(r.engine)} (it has no Remotion composition)`);
    if (r.engine === "html-capture") {
      if (typeof r.drawsCaptions !== "boolean") issues.push("renderer.drawsCaptions must be true (the template draws the captions it is given) or false (the worker burns them)");
      if (typeof r.minWorkerVersion === "string" && WORKER_VERSION_RE.test(r.minWorkerVersion) && compareVersions(r.minWorkerVersion, "0.10.0") < 0) {
        issues.push("renderer.minWorkerVersion must be 0.10.0 or later for html-capture (the first worker with the renderer)");
      }
    } else if (r.drawsCaptions !== undefined) issues.push("renderer.drawsCaptions is only for html-capture");
    if (ENGINES.includes(r.engine) && !RUNNABLE_ENGINES.includes(r.engine) && !["draft", "retired"].includes(style.status)) {
      issues.push(`no worker can run ${r.engine} yet, so the pack can only be draft (or retired)`);
    }
    if (RESEARCH_ENGINES.includes(r.engine) && STATUSES.includes(style.status) && !RESEARCH_MAX_STATUSES.includes(style.status)) {
      issues.push(`${r.engine} renders are research only (owner decision): the pack can be at most trial, never ${style.status}`);
    }
  }

  const c = style.contract;
  if (!isRecord(c)) issues.push("contract must be an object");
  else {
    checkKeys(c, ["pacing", "onScreen", "captions", "audio", "assets"], "contract", issues);
    const p = c.pacing;
    if (!isRecord(p)) issues.push("contract.pacing must be an object");
    else {
      checkKeys(p, ["shotSeconds", "hookWithinMs", "cutsPerMinute", "transitionSec"], "contract.pacing", issues);
      checkRange(p.shotSeconds, "contract.pacing.shotSeconds", issues, { min: 0.5 });
      if (!Number.isInteger(p.hookWithinMs) || p.hookWithinMs < 500 || p.hookWithinMs > 60000) issues.push("contract.pacing.hookWithinMs must be whole milliseconds, 500..60000");
      checkRange(p.cutsPerMinute, "contract.pacing.cutsPerMinute", issues, { min: 1, integer: true });
      if (!isNum(p.transitionSec) || p.transitionSec < 0 || p.transitionSec > 2) issues.push("contract.pacing.transitionSec must be 0..2 seconds");
    }
    const o = c.onScreen;
    if (!isRecord(o)) issues.push("contract.onScreen must be an object");
    else {
      checkKeys(o, ["elements", "motionTokens", "elementAnimation"], "contract.onScreen", issues);
      checkList(o.elements, ELEMENT_KINDS, "contract.onScreen.elements", issues);
      checkList(o.motionTokens, MOTION_TOKENS, "contract.onScreen.motionTokens", issues, { min: 0 });
      if (typeof o.elementAnimation !== "boolean") issues.push("contract.onScreen.elementAnimation must be true or false");
    }
    const cap = c.captions;
    if (!isRecord(cap)) issues.push("contract.captions must be an object");
    else {
      checkKeys(cap, ["required", "spec", "safeAreaPct"], "contract.captions", issues);
      if (typeof cap.required !== "boolean") issues.push("contract.captions.required must be true or false");
      if (!CAPTION_SPECS.includes(cap.spec)) issues.push(`contract.captions.spec must be one of ${CAPTION_SPECS.join(", ")}`);
      if (!isNum(cap.safeAreaPct) || cap.safeAreaPct < 0 || cap.safeAreaPct > 25) issues.push("contract.captions.safeAreaPct must be 0..25");
    }
    const a = c.audio;
    if (!isRecord(a)) issues.push("contract.audio must be an object");
    else {
      checkKeys(a, ["narrated", "targetLufs", "maxTruePeakDb", "musicPolicy"], "contract.audio", issues);
      if (typeof a.narrated !== "boolean") issues.push("contract.audio.narrated must be true or false");
      if (!isNum(a.targetLufs) || a.targetLufs < -40 || a.targetLufs > -5) issues.push("contract.audio.targetLufs must be -40..-5");
      if (!isNum(a.maxTruePeakDb) || a.maxTruePeakDb < -10 || a.maxTruePeakDb > 0) issues.push("contract.audio.maxTruePeakDb must be -10..0");
      if (!MUSIC_POLICIES.includes(a.musicPolicy)) issues.push(`contract.audio.musicPolicy must be one of ${MUSIC_POLICIES.join(", ")}`);
    }
    const as = c.assets;
    if (!isRecord(as)) issues.push("contract.assets must be an object");
    else {
      checkKeys(as, ["model", "kinds", "allowedSources", "forbidKinds"], "contract.assets", issues);
      if (!ASSET_MODELS.includes(as.model)) issues.push(`contract.assets.model must be one of ${ASSET_MODELS.join(", ")}`);
      checkList(as.kinds, ASSET_KINDS, "contract.assets.kinds", issues);
      checkList(as.allowedSources, ASSET_SOURCES, "contract.assets.allowedSources", issues);
      checkList(as.forbidKinds, ASSET_KINDS, "contract.assets.forbidKinds", issues, { min: 0 });
    }
  }

  const pt = style.portal;
  if (!isRecord(pt)) issues.push("portal must be an object");
  else {
    checkKeys(pt, ["beatShape", "qc", "themes", "keywords", "cautions", "sources"], "portal", issues);
    if (!BEAT_SHAPES.includes(pt.beatShape)) issues.push(`portal.beatShape must be one of ${BEAT_SHAPES.join(", ")}`);
    if (!isRecord(pt.qc)) issues.push("portal.qc must be an object");
    else {
      checkKeys(pt.qc, ["minPresentationScore", "gates"], "portal.qc", issues);
      if (!Number.isInteger(pt.qc.minPresentationScore) || pt.qc.minPresentationScore < 0 || pt.qc.minPresentationScore > 100) issues.push("portal.qc.minPresentationScore must be a whole number 0..100");
      checkList(pt.qc.gates, QC_GATES, "portal.qc.gates", issues);
      if (Array.isArray(pt.qc.gates) && !pt.qc.gates.includes("G-technical")) issues.push("portal.qc.gates must include G-technical");
    }
    checkList(pt.themes, null, "portal.themes", issues, { min: 0 });
    checkList(pt.keywords, null, "portal.keywords", issues);
    checkList(pt.cautions, null, "portal.cautions", issues, { min: 0 });
    checkList(pt.sources, null, "portal.sources", issues, { min: 0 });
  }

  const fx = style.fixture;
  if (!isRecord(fx)) issues.push("fixture must be an object naming fixtures/payload.json and fixtures/expect.json");
  else {
    checkKeys(fx, ["payload", "expect"], "fixture", issues);
    if (fx.payload !== "fixtures/payload.json") issues.push('fixture.payload must be "fixtures/payload.json"');
    if (fx.expect !== "fixtures/expect.json") issues.push('fixture.expect must be "fixtures/expect.json"');
  }

  if (!Array.isArray(style.provenance) || style.provenance.length === 0) issues.push("provenance must list at least one source the look was learned from");
  else {
    style.provenance.forEach((s, i) => {
      const at = `provenance[${i}]`;
      if (!isRecord(s)) return issues.push(`${at} must be an object`);
      checkKeys(s, ["type", "ref", "licence", "notes"], at, issues);
      if (!PROVENANCE_TYPES.includes(s.type)) issues.push(`${at}.type must be one of ${PROVENANCE_TYPES.join(", ")}`);
      if (!isText(s.ref, 400)) issues.push(`${at}.ref must say where the source is`);
      if (!isText(s.licence, 200)) issues.push(`${at}.licence must record the source's licence or terms (write "owner" for the owner's own material)`);
      if (typeof s.notes !== "string" || s.notes.length > LIMITS.text) issues.push(`${at}.notes must be a text (may be empty) of up to ${LIMITS.text} characters`);
    });
  }

  if (!Array.isArray(style.curation)) issues.push("curation must be a list (empty for a fresh draft)");
  else {
    style.curation.forEach((e, i) => {
      const at = `curation[${i}]`;
      if (!isRecord(e)) return issues.push(`${at} must be an object`);
      checkKeys(e, ["date", "kind", "ref", "result", "notes"], at, issues);
      if (typeof e.date !== "string" || !DATE_RE.test(e.date) || Number.isNaN(Date.parse(e.date))) issues.push(`${at}.date must be YYYY-MM-DD`);
      if (!CURATION_KINDS.includes(e.kind)) issues.push(`${at}.kind must be one of ${CURATION_KINDS.join(", ")}`);
      if (!isText(e.ref, 400)) issues.push(`${at}.ref must point at the evidence (CI run, video, report)`);
      if (!CURATION_RESULTS.includes(e.result)) issues.push(`${at}.result must be one of ${CURATION_RESULTS.join(", ")}`);
      if (typeof e.notes !== "string" || e.notes.length > LIMITS.text) issues.push(`${at}.notes must be a text (may be empty)`);
    });
    const has = (kind, results) => style.curation.some((e) => isRecord(e) && e.kind === kind && results.includes(e.result));
    const research = isRecord(style.renderer) && RESEARCH_ENGINES.includes(style.renderer.engine);
    if (RENDERED_STATUSES.includes(style.status) && !research && !has("ci-render", ["pass"])) issues.push(`status ${style.status} needs a passing ci-render entry in curation`);
    if (OWNER_STATUSES.includes(style.status) && !has("owner-review", ["approved"])) issues.push(`status ${style.status} can only be set by an owner-approved PR: add the owner-review entry with result "approved"`);
    if (OWNER_STATUSES.includes(style.status) && !has("trial-run", ["pass"])) issues.push(`status ${style.status} needs the trial-run entries copied from the portal's Styles page`);
  }
  return issues;
}

/** Validates fixtures/expect.json. */
export function validateExpect(expect, payloadText) {
  const issues = [];
  if (!isRecord(expect)) return ["fixtures/expect.json must be a JSON object"];
  checkKeys(expect, ["format", "width", "height", "fps", "durationSec", "durationToleranceSec", "qc", "payloadSha256", "sameAs"], "fixtures/expect.json", issues);
  if (!FORMATS.includes(expect.format)) issues.push("fixtures/expect.json format must be short or long");
  for (const k of ["width", "height", "fps"]) if (!Number.isInteger(expect[k]) || expect[k] < 1 || expect[k] > 4096) issues.push(`fixtures/expect.json ${k} must be a whole number`);
  if (!isNum(expect.durationSec) || expect.durationSec <= 0) issues.push("fixtures/expect.json durationSec must be positive");
  if (!isNum(expect.durationToleranceSec) || expect.durationToleranceSec < 0 || expect.durationToleranceSec > 5) issues.push("fixtures/expect.json durationToleranceSec must be 0..5");
  if (!Array.isArray(expect.qc) || !expect.qc.includes("G-technical") || !expect.qc.every((g) => QC_GATES.includes(g))) issues.push("fixtures/expect.json qc must list the gates the render must pass, including G-technical");
  if (expect.payloadSha256 !== undefined) {
    if (typeof expect.payloadSha256 !== "string" || !/^[0-9a-f]{64}$/.test(expect.payloadSha256)) issues.push("fixtures/expect.json payloadSha256 must be a sha256");
    else if (payloadText !== undefined && sha256Hex(payloadText) !== expect.payloadSha256) issues.push("fixtures/payload.json does not match payloadSha256 in fixtures/expect.json (the golden copy changed)");
  }
  if (expect.sameAs !== undefined && !isText(expect.sameAs, 200)) issues.push("fixtures/expect.json sameAs must name the golden file this payload copies");
  return issues;
}

/** Checks a render-video payload's shape enough to know the fixture can be rendered by the pack's engine. */
export function validatePayload(payload, style) {
  const issues = [];
  if (!isRecord(payload)) return ["fixtures/payload.json must be a JSON object"];
  const engine = isRecord(style?.renderer) ? style.renderer.engine : undefined;
  const pe = typeof payload.engine === "string" ? payload.engine : "ffmpeg-stills";
  if (engine && pe !== engine) issues.push(`fixtures/payload.json renders with "${pe}", the pack says "${engine}"`);
  if (!Array.isArray(payload.shots) || payload.shots.length === 0) issues.push("fixtures/payload.json has no shots");
  if (PROJECT_ENGINES.includes(engine)) {
    const t = isRecord(payload.scenePlan) ? payload.scenePlan.template : undefined;
    if (t !== style.id) issues.push(`fixtures/payload.json scenePlan.template must be "${style.id}"`);
  }
  return issues;
}

/**
 * Validates one pack directory: style.json, README.md, fixtures, and the render project when the engine has one.
 * Returns { id, version, status, engine, files, issues }.
 */
export function validatePackDir(dir) {
  const dirName = path.basename(dir);
  const issues = [];
  const at = (m) => `packs/${dirName}: ${m}`;
  let style = null;
  const files = existsSync(dir) ? packFiles(dir) : {};
  const names = Object.keys(files);
  if (names.length > LIMITS.packFiles) issues.push(at(`has ${names.length} files; the limit is ${LIMITS.packFiles}`));
  let total = 0;
  for (const rel of names) {
    if (!PATH_RE.test(rel) || rel.split("/").some((s) => s === "." || s === "..")) issues.push(at(`${rel} has an unsafe file name`));
    const bytes = statSync(path.join(dir, rel)).size;
    total += bytes;
    if (bytes > LIMITS.fileBytes) issues.push(at(`${rel} is larger than ${LIMITS.fileBytes} bytes`));
  }
  if (total > LIMITS.packBytes) issues.push(at(`is larger than ${LIMITS.packBytes} bytes`));
  const read = (rel) => (existsSync(path.join(dir, rel)) ? readFileSync(path.join(dir, rel), "utf8") : null);

  const styleText = read("style.json");
  if (styleText === null) issues.push(at("style.json is missing"));
  else {
    try {
      style = JSON.parse(styleText);
    } catch (err) {
      issues.push(at(`style.json is not JSON: ${err.message}`));
    }
  }
  if (style) for (const m of validateStyle(style, { dirName })) issues.push(at(m));

  const readme = read("README.md");
  if (readme === null) issues.push(at("README.md is missing"));
  else {
    if (readme.trim().length < 200) issues.push(at("README.md is too short to explain the look (at least 200 characters)"));
    for (const h of ["## Provenance", "## Status"]) if (!readme.includes(h)) issues.push(at(`README.md needs a "${h}" section`));
  }

  const payloadText = read("fixtures/payload.json");
  const expectText = read("fixtures/expect.json");
  if (payloadText === null) issues.push(at("fixtures/payload.json is missing"));
  if (expectText === null) issues.push(at("fixtures/expect.json is missing"));
  if (payloadText !== null) {
    try {
      for (const m of validatePayload(JSON.parse(payloadText), style)) issues.push(at(m));
    } catch (err) {
      issues.push(at(`fixtures/payload.json is not JSON: ${err.message}`));
    }
  }
  if (expectText !== null) {
    try {
      for (const m of validateExpect(JSON.parse(expectText), payloadText ?? undefined)) issues.push(at(m));
    } catch (err) {
      issues.push(at(`fixtures/expect.json is not JSON: ${err.message}`));
    }
  }

  const engine = isRecord(style?.renderer) ? style.renderer.engine : undefined;
  const renderFiles = names.filter((n) => n.startsWith("render/"));
  if (engine === "html-capture") {
    if (read("render/index.html") === null) issues.push(at("render/index.html is missing (the page that defines window.VENSTUDIO)"));
    for (const rel of renderFiles) {
      if (!HTML_RENDER_FILE_RE.test(rel)) issues.push(at(`${rel}: an html-capture project holds text files only (.html, .js, .mjs, .css, .json, .svg, .txt, .md, LICENSE, NOTICE)`));
      if (/\.(html|css)$/.test(rel) && REMOTE_REF_RE.test(read(rel) ?? "")) {
        issues.push(at(`${rel} loads something from the network; html-capture pages render offline, so vendor the file into render/`));
      }
    }
    // A vendored library sits in render/vendor/<name>/ with its licence beside it.
    const vendors = new Set(renderFiles.filter((r) => r.startsWith("render/vendor/")).map((r) => r.split("/")[2]));
    for (const v of vendors) {
      if (!renderFiles.some((r) => r.startsWith(`render/vendor/${v}/`) && /(^|\/)LICEN[CS]E[^/]*$/.test(r))) {
        issues.push(at(`render/vendor/${v}/ has no LICENSE file: a vendored library carries its licence`));
      }
    }
  } else if (PROJECT_ENGINES.includes(engine)) {
    const index = read("render/index.tsx");
    if (index === null) issues.push(at("render/index.tsx is missing (it exports the composition)"));
    else if (typeof style.renderer.composition === "string" && !index.includes(`id: "${style.renderer.composition}"`)) {
      issues.push(at(`render/index.tsx must export composition with id: "${style.renderer.composition}"`));
    }
    for (const rel of renderFiles) {
      if (!/\.(tsx?|json|css|svg)$/.test(rel)) issues.push(at(`${rel}: a render project holds source only (.ts, .tsx, .json, .css, .svg)`));
    }
  } else if (renderFiles.length > 0) {
    issues.push(at(`render/ is only for engines with a render project (${PROJECT_ENGINES.join(", ")}); ${String(engine)} takes parameters only`));
  }
  return {
    id: style?.id ?? dirName,
    version: style?.version ?? null,
    status: style?.status ?? null,
    engine: engine ?? null,
    files,
    issues,
  };
}

/** Validates every pack under <root>/packs, plus what only a whole repo can get wrong (duplicate ids and compositions). */
export function validateRepo(root) {
  const packsDir = path.join(root, "packs");
  const issues = [];
  if (!existsSync(packsDir)) return { packs: [], issues: ["packs/ is missing"] };
  const dirs = readdirSync(packsDir)
    .filter((n) => !n.startsWith(".") && statSync(path.join(packsDir, n)).isDirectory())
    .sort();
  const packs = dirs.map((d) => validatePackDir(path.join(packsDir, d)));
  issues.push(...findDuplicates(packs.map((p, i) => ({ id: p.id, composition: readComposition(path.join(packsDir, dirs[i])) }))));
  for (const p of packs) issues.push(...p.issues);
  return { packs, issues };
}

function readComposition(dir) {
  try {
    const s = JSON.parse(readFileSync(path.join(dir, "style.json"), "utf8"));
    return isRecord(s.renderer) && typeof s.renderer.composition === "string" ? s.renderer.composition : null;
  } catch {
    return null;
  }
}

/** Two packs with one id, or two Remotion packs with one composition id, would shadow each other on a worker. */
export function findDuplicates(entries) {
  const issues = [];
  const ids = new Map();
  const comps = new Map();
  for (const e of entries) {
    if (ids.has(e.id)) issues.push(`duplicate pack id "${e.id}"`);
    ids.set(e.id, true);
    if (e.composition) {
      if (comps.has(e.composition)) issues.push(`composition "${e.composition}" is used by "${comps.get(e.composition)}" and "${e.id}"`);
      comps.set(e.composition, e.id);
    }
  }
  return issues;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
  const { packs, issues } = validateRepo(root);
  for (const p of packs) console.log(`${p.issues.length === 0 ? "ok  " : "FAIL"} ${p.id}@${p.version ?? "?"} (${p.status ?? "?"}, ${p.engine ?? "?"}, ${Object.keys(p.files).length} files)`);
  if (issues.length > 0) {
    for (const i of issues) console.error(`- ${i}`);
    console.error(`${issues.length} problem(s)`);
    process.exit(1);
  }
  console.log(`${packs.length} pack(s) valid`);
}
