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
export const ENGINES = ["ffmpeg-stills", "remotion-2d", "html-capture", "hermes", "command", "sprite-rig", "manim", "godot-2d", "remotion-3d", "godot-3d", "blender-cycles", "provider-video"];
/** Engines VenStudio can run today (hermes by the portal, the rest by a worker). A pack for any other engine stays draft (or retired). */
export const RUNNABLE_ENGINES = ["ffmpeg-stills", "remotion-2d", "html-capture", "hermes", "command"];
/** Engines whose packs carry a render project in render/. */
export const PROJECT_ENGINES = ["remotion-2d", "html-capture", "command"];
/**
 * Engines whose packs must carry an `environment` (FORMAT.md "Environments"): engine command runs the pack's own render
 * argv with the tools its recipe installs (worker 0.12.0+). Other worker engines may declare one for extra tools.
 */
export const ENVIRONMENT_ENGINES = ["command"];
/** Engines whose render project is a Remotion composition named in renderer.composition. */
export const COMPOSITION_ENGINES = ["remotion-2d"];
/**
 * Research-only engines (owner decision): Hermes renders with its own tools. Never above trial and never rendered in
 * CI (there is no Hermes there), so lab and trial need a research-source entry instead of a ci-render one: the source
 * the look comes from and the report that it renders in Hermes. Nothing in CI pretends to have rendered it.
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
export const CURATION_KINDS = ["ci-render", "trial-run", "qc", "hermes-review", "owner-review", "research-source"];
/** How a Hermes skill is driven: a quick skill from a small JSON spec, or a full project with its own voice and timing. */
export const HERMES_MODES = ["spec", "project"];
export const CURATION_RESULTS = ["pass", "fail", "approved", "rejected", "note"];
/** Who voices a hermes-skill run: the run's own voice stage ("run"), or the skill with its own voice tools ("skill"). */
export const HERMES_VOICES = ["run", "skill"];

/**
 * Workflows (style.json `workflow`). A recipe is the ordered list of stage kinds a run of the pack goes through; the
 * venstudio run engine fixes a run's list when the run starts (apps/portal/lib/studio/recipes.ts mirrors this table and
 * a venstudio test checks they agree). Stage kinds are reusable steps the engine knows; a recipe made only of known
 * kinds needs no engine change. Recipes marked implemented: false are reserved names: the validator refuses them, so a
 * pack cannot ask for a workflow the studio does not run.
 */
export const STAGE_KINDS = ["idea", "research", "script", "storyboard", "scene-spec", "skill-brief", "html-design", "preview", "assets", "voice", "render", "qc"];
/** Stage kinds reserved for recipes that are not built yet. No pack may name them. */
export const RESERVED_STAGE_KINDS = ["project-build", "clips"];
export const RECIPES = {
  "image-sequence": {
    implemented: true,
    stages: ["idea", "research", "script", "storyboard", "assets", "voice", "render", "qc"],
    optional: [],
    summary: "A storyboard with an image prompt per shot, one picture per shot, then voice, render and quality check (the original pipeline).",
  },
  "scene-spec": {
    implemented: true,
    stages: ["idea", "research", "script", "scene-spec", "preview", "voice", "render", "qc"],
    optional: [],
    summary: "Data-driven: Hermes writes a scene spec (seconds, beat, on-screen elements with sourced numbers, motion tokens, captions) that the page renders directly, and the owner sees still frames of the page before the voice and the render. No pictures are generated.",
  },
  "hermes-skill": {
    implemented: true,
    stages: ["idea", "research", "script", "skill-brief", "voice", "render", "qc"],
    optional: ["voice"],
    summary: "Research only: Hermes turns the approved script into the input the pack's skill expects, then renders with that skill. No pictures are generated; the voice stage is left out when the skill makes its own voice (hermes.voice skill).",
  },
  "html-design": {
    implemented: true,
    stages: ["idea", "research", "script", "html-design", "preview", "voice", "render", "qc"],
    optional: [],
    summary: "Research only (owner decision): Hermes writes the HTML page for each video (one self-contained index.html, checked before anything runs), the owner approves still frames of it, then the worker captures it with html-capture. Always a trial, never published.",
  },
  "engine-project": {
    implemented: false,
    stages: ["idea", "research", "script", "project-build", "voice", "render", "qc"],
    optional: [],
    summary: "Reserved, not built: a render project for a scene engine (Godot, Manim, Blender) built per video.",
  },
  "clip-sequence": {
    implemented: false,
    stages: ["idea", "research", "script", "storyboard", "clips", "voice", "render", "qc"],
    optional: [],
    summary: "Reserved, not built: a video clip per shot instead of a picture.",
  },
};
export const RECIPE_IDS = Object.keys(RECIPES);
export const IMPLEMENTED_RECIPES = RECIPE_IDS.filter((r) => RECIPES[r].implemented);
/**
 * Research-only recipes (owner decision): html-design runs model-written page code, so a pack with it is at most trial,
 * runs only on engine html-capture, and its owner reviews the page and the still frames every time. Its lab and trial
 * evidence is a research-source entry (the research and the owner decision it is built from) or a real ci-render of its
 * reference page: Hermes writes the page per video, so no CI render stands for the pages runs will draw.
 */
export const RESEARCH_RECIPES = ["html-design"];
/** Stages an html-design pack's workflow.review must name: the owner checks the page and its still frames every time. */
export const HTML_DESIGN_REVIEW = ["html-design", "preview"];
const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

/**
 * The recipe of a pack: its `workflow.recipe`, or the one its engine and asset model imply when it has none (engine
 * hermes: hermes-skill; html-capture with plates and diagrams: scene-spec; anything else, remotion-2d included,
 * image-sequence). The portal infers the same way.
 */
export function recipeOf(style) {
  if (isRecord(style?.workflow) && typeof style.workflow.recipe === "string") return style.workflow.recipe;
  const engine = isRecord(style?.renderer) ? style.renderer.engine : undefined;
  const model = isRecord(style?.contract?.assets) ? style.contract.assets.model : undefined;
  if (RESEARCH_ENGINES.includes(engine)) return "hermes-skill";
  if (engine === "html-capture" && model !== "image-per-shot") return "scene-spec";
  return "image-sequence";
}

/** The stage list a run of this pack goes through: the recipe's, without the voice stage when a skill voices itself. */
export function workflowStages(style) {
  const recipe = RECIPES[recipeOf(style)];
  if (!recipe) return [];
  const skillVoice = recipeOf(style) === "hermes-skill" && isRecord(style?.hermes) && style.hermes.voice === "skill";
  return recipe.stages.filter((k) => !(skillVoice && k === "voice"));
}

export const LIMITS = { packFiles: 200, fileBytes: 1024 * 1024, packBytes: 5 * 1024 * 1024, text: 2000, list: 64 };

const ID_RE = /^[a-z0-9][a-z0-9-]{1,62}$/;
const SEMVER_RE = /^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/;
const WORKER_VERSION_RE = /^\d{1,6}(\.\d{1,6}){0,3}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PATH_RE = /^[A-Za-z0-9_][A-Za-z0-9._/-]{0,199}$/;
/** A Hermes skill as it is invoked, e.g. "/graph". */
const SKILL_RE = /^\/[a-z0-9][a-z0-9-]{0,62}$/;

const TOP_KEYS = ["format", "id", "name", "description", "version", "status", "family", "formats", "renderer", "contract", "portal", "fixture", "provenance", "curation", "hermes", "workflow", "design", "environment"];
/** Top-level fields a pack may leave out. */
export const OPTIONAL_TOP_KEYS = ["hermes", "workflow", "design", "environment"];
const DESIGN_KEYS = ["brief", "palette", "typography", "layout"];
const HERMES_KEYS = ["skill", "aliases", "mode", "voice", "input", "output", "variantOf"];
const WORKFLOW_KEYS = ["recipe", "review"];

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
export function validateStyle(style, { dirName, files } = {}) {
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
    if (RESEARCH_RECIPES.includes(recipeOf(style)) && STATUSES.includes(style.status) && !RESEARCH_MAX_STATUSES.includes(style.status)) {
      issues.push(`workflow.recipe ${recipeOf(style)} is research only (owner decision: Hermes writes the page): the pack can be at most trial, never ${style.status}`);
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

  if (style.hermes !== undefined) {
    const research = isRecord(style.renderer) && RESEARCH_ENGINES.includes(style.renderer.engine);
    if (!research) issues.push(`hermes names the Hermes skill of a ${RESEARCH_ENGINES.join(" or ")} pack; this pack renders with ${String(isRecord(style.renderer) ? style.renderer.engine : "?")}`);
    for (const m of validateHermesBlock(style.hermes)) issues.push(m);
  }

  if (style.workflow !== undefined) for (const m of validateWorkflow(style)) issues.push(m);

  const designed = RESEARCH_RECIPES.includes(recipeOf(style));
  if (style.design !== undefined) {
    if (!designed) issues.push(`design is the brief Hermes designs each page from; it is only for workflow.recipe ${RESEARCH_RECIPES.join(" or ")}`);
    for (const m of validateDesignBlock(style.design)) issues.push(m);
  } else if (designed) issues.push("an html-design pack needs a design block (brief, palette, typography, layout): it is what Hermes designs each page from");

  const engineName = isRecord(style.renderer) ? style.renderer.engine : undefined;
  if (style.environment !== undefined) {
    if (RESEARCH_ENGINES.includes(engineName)) {
      issues.push("environment is for packs a worker renders; a hermes pack renders in Hermes with Hermes's own tools and carries none (hand the style over as an engine command pack instead: docs/hermes-handover.md)");
    }
    if (designed) issues.push("environment is refused on an html-design pack: research only, its page runs in the worker's capture and nothing else");
    for (const m of validateEnvironment(style.environment, { files })) issues.push(m);
    const env = style.environment;
    if (isRecord(env) && ENVIRONMENT_ENGINES.includes(engineName) && env.render === undefined) issues.push("environment.render is required for engine command: the argv the worker runs to render");
    if (isRecord(env) && !ENVIRONMENT_ENGINES.includes(engineName) && env.render !== undefined) issues.push(`environment.render is only for engine command; ${String(engineName)} renders with its own renderer and uses the environment for extra tools`);
    const v = isRecord(style.renderer) ? style.renderer.minWorkerVersion : undefined;
    if (typeof v !== "string" || !WORKER_VERSION_RE.test(v) || compareVersions(v, ENV_MIN_WORKER) < 0) {
      issues.push(`renderer.minWorkerVersion must be ${ENV_MIN_WORKER} or later for a pack with an environment (the first worker that installs one; an older worker would report the pack without it)`);
    }
  } else if (ENVIRONMENT_ENGINES.includes(engineName)) {
    issues.push("engine command needs an environment: the recipe of the exact tools it renders with (FORMAT.md \"Environments\", docs/hermes-handover.md)");
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
    // An html-design pack: Hermes writes each page, so either evidence counts, a real ci-render of its reference page or
    // the research-source it is built from. Neither may be invented.
    if (RENDERED_STATUSES.includes(style.status) && designed && !has("ci-render", ["pass"]) && !has("research-source", ["pass"])) {
      issues.push(`status ${style.status} for an html-design pack needs a research-source entry (the research and the owner decision it is built from) or a real ci-render entry with result "pass" in curation`);
    }
    if (RENDERED_STATUSES.includes(style.status) && !research && !designed && !has("ci-render", ["pass"])) issues.push(`status ${style.status} needs a passing ci-render entry in curation`);
    // A hermes pack has no CI render (no Hermes in CI): lab and trial cite the source it comes from and the report that
    // it renders in Hermes. That evidence is for hermes packs only; a pack VenStudio renders itself needs a real ci-render.
    if (RENDERED_STATUSES.includes(style.status) && research && !has("research-source", ["pass"])) {
      issues.push(`status ${style.status} for a ${style.renderer.engine} pack needs a research-source entry with result "pass" in curation (the source and the report that it renders in Hermes); there is no CI render for it`);
    }
    if (!research && !designed && style.curation.some((e) => isRecord(e) && e.kind === "research-source")) {
      issues.push(`curation kind research-source is evidence for ${RESEARCH_ENGINES.join(" or ")} packs (and ${RESEARCH_RECIPES.join(", ")} packs) only; a pack VenStudio renders needs a passing ci-render`);
    }
    if (OWNER_STATUSES.includes(style.status) && !has("owner-review", ["approved"])) issues.push(`status ${style.status} can only be set by an owner-approved PR: add the owner-review entry with result "approved"`);
    if (OWNER_STATUSES.includes(style.status) && !has("trial-run", ["pass"])) issues.push(`status ${style.status} needs the trial-run entries copied from the portal's Styles page`);
  }
  return issues;
}

/**
 * Validates style.json `workflow`: a recipe VenStudio runs, compatible with the pack's engine and asset model, and
 * `review` (stages where the owner always reviews, whatever the autonomy level) naming stages of the pack's own list.
 */
export function validateWorkflow(style) {
  const issues = [];
  const w = style?.workflow;
  if (!isRecord(w)) return ['workflow must be an object naming a recipe, e.g. { "recipe": "image-sequence" }'];
  checkKeys(w, WORKFLOW_KEYS, "workflow", issues);
  const recipe = RECIPES[w.recipe];
  if (!recipe) return [...issues, `workflow.recipe must be one of ${RECIPE_IDS.join(", ")}`];
  if (!recipe.implemented) issues.push(`workflow.recipe ${w.recipe} is a reserved name: it is not built yet, so no pack can use it (${recipe.summary})`);
  const engine = isRecord(style.renderer) ? style.renderer.engine : undefined;
  const model = isRecord(style.contract?.assets) ? style.contract.assets.model : undefined;
  const animates = isRecord(style.contract?.onScreen) && style.contract.onScreen.elementAnimation === true;
  if (w.recipe === "image-sequence" && !["image-per-shot", "plates-and-diagrams"].includes(model)) {
    issues.push("workflow.recipe image-sequence needs contract.assets.model image-per-shot or plates-and-diagrams (it makes a picture per shot)");
  }
  if (w.recipe === "scene-spec" && !(engine === "html-capture" || (engine === "remotion-2d" && animates))) {
    issues.push(`workflow.recipe scene-spec needs engine html-capture, or remotion-2d with contract.onScreen.elementAnimation true (the page draws the spec); this pack renders with ${String(engine)}${engine === "remotion-2d" ? " without element animation" : ""}`);
  }
  if (w.recipe === "html-design" && engine !== "html-capture") {
    issues.push(`workflow.recipe html-design needs engine html-capture (the worker captures the page Hermes writes); this pack renders with ${String(engine)}`);
  }
  if (w.recipe === "html-design") {
    // Worker 0.11.0 is the first that renders an uploaded page (its CSP and guard) and takes stills; an older worker would
    // ignore the page and draw the pack's reference page instead, so it must never report such a pack.
    const v = isRecord(style.renderer) ? style.renderer.minWorkerVersion : undefined;
    if (typeof v !== "string" || !WORKER_VERSION_RE.test(v) || compareVersions(v, "0.11.0") < 0) {
      issues.push("renderer.minWorkerVersion must be 0.11.0 or later for html-design (the first worker that renders a page uploaded with the job and takes still frames)");
    }
    const review = Array.isArray(w.review) ? w.review : [];
    const missing = HTML_DESIGN_REVIEW.filter((k) => !review.includes(k));
    if (missing.length > 0) issues.push(`workflow.review of an html-design pack must name ${HTML_DESIGN_REVIEW.join(" and ")}: the owner checks the page and its still frames every time (missing ${missing.join(", ")})`);
  }
  if (w.recipe === "hermes-skill" && !RESEARCH_ENGINES.includes(engine)) {
    issues.push(`workflow.recipe hermes-skill needs engine ${RESEARCH_ENGINES.join(" or ")} (Hermes renders with the skill); this pack renders with ${String(engine)}`);
  }
  if (w.recipe !== "hermes-skill" && isRecord(style.hermes) && style.hermes.voice === "skill") {
    issues.push("hermes.voice skill only applies to the hermes-skill recipe");
  }
  if (w.review !== undefined) {
    if (!Array.isArray(w.review) || w.review.length > STAGE_KINDS.length) issues.push(`workflow.review must be a list of stage kinds (${STAGE_KINDS.join(", ")})`);
    else {
      const stages = workflowStages(style);
      const seen = new Set();
      for (const k of w.review) {
        if (!STAGE_KINDS.includes(k)) issues.push(`workflow.review: ${JSON.stringify(k)} is not a stage kind (${STAGE_KINDS.join(", ")})`);
        else if (!stages.includes(k)) issues.push(`workflow.review: ${k} is not a stage of this pack's workflow (${stages.join(", ")})`);
        if (seen.has(k)) issues.push(`workflow.review: ${JSON.stringify(k)} is listed twice`);
        seen.add(k);
      }
    }
  }
  return issues;
}

/** Validates the design block of an html-design pack: the brief, colours, type and layout Hermes designs each page from. */
export function validateDesignBlock(d) {
  const issues = [];
  if (!isRecord(d)) return ["design must be an object (brief, palette, typography, layout)"];
  checkKeys(d, DESIGN_KEYS, "design", issues);
  if (!isText(d.brief)) issues.push(`design.brief must say what the page is for and how it moves (up to ${LIMITS.text} characters)`);
  if (!Array.isArray(d.palette) || d.palette.length < 2 || d.palette.length > 12 || !d.palette.every((c) => typeof c === "string" && HEX_RE.test(c))) {
    issues.push('design.palette must be 2 to 12 colours written "#RRGGBB"');
  }
  if (!isText(d.typography, 600)) issues.push("design.typography must name the type to use (the pack's vendored fonts or the run's font) in up to 600 characters");
  if (!isText(d.layout, 1000)) issues.push("design.layout must give the safe areas and layout rules in up to 1000 characters");
  return issues;
}

/** Validates the hermes block of a research pack: the Hermes skill to use and how the studio's plan maps to its input. */
export function validateHermesBlock(h) {
  const issues = [];
  if (!isRecord(h)) return ["hermes must be an object naming the Hermes skill"];
  checkKeys(h, HERMES_KEYS, "hermes", issues);
  if (typeof h.skill !== "string" || !SKILL_RE.test(h.skill)) issues.push('hermes.skill must be a Hermes skill as invoked, e.g. "/graph"');
  if (h.aliases !== undefined) {
    if (!Array.isArray(h.aliases) || h.aliases.length > 8 || !h.aliases.every((a) => typeof a === "string" && SKILL_RE.test(a))) issues.push('hermes.aliases must be a list of up to 8 skill names like "/zach-3d-films"');
    else if (h.aliases.includes(h.skill) || new Set(h.aliases).size !== h.aliases.length) issues.push("hermes.aliases must not repeat the skill or each other");
  }
  if (!HERMES_MODES.includes(h.mode)) issues.push(`hermes.mode must be one of ${HERMES_MODES.join(", ")} (spec: a quick skill from a small JSON spec; project: a full project with its own voice and timing)`);
  if (!isText(h.input)) issues.push("hermes.input must say how the studio's storyboard and brief map to the skill's input");
  if (!isText(h.output)) issues.push("hermes.output must say what Hermes hands back");
  if (h.mode === "project" && isText(h.input) && !/narration/i.test(h.input)) issues.push("hermes.input for a project skill must say how the run's narration and captions are used");
  if (h.voice !== undefined && !HERMES_VOICES.includes(h.voice)) issues.push(`hermes.voice must be one of ${HERMES_VOICES.join(", ")} (run: the run's voice stage records the narration; skill: the skill makes its own voice)`);
  if (h.voice === "skill" && h.mode !== "project") issues.push("hermes.voice skill needs mode project: only a full-project skill records its own voice");
  if (h.variantOf !== undefined) {
    if (!Array.isArray(h.variantOf) || h.variantOf.length > 8 || !h.variantOf.every((v) => typeof v === "string" && ID_RE.test(v))) issues.push("hermes.variantOf must be a list of pack ids this pack is the Hermes research variant of");
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Environments (FORMAT.md "Environments"): the exact tools a pack needs, as a declarative recipe a worker (0.12.0+)
// installs by itself into <home>/envs/<id>@<version>/. There is no free shell anywhere in it: a step is a download
// pinned by sha256, an npm install from a lockfile shipped in the pack, a pip install with --require-hashes, or a
// PATH-like variable; the probe and the render are fixed argv arrays with placeholders from a closed set. The worker
// parses the recipe again with its own reader (venstudio-worker.ts parseEnvironment) and refuses what this refuses.

/** Platforms a recipe may name. A worker installs a recipe only on a platform it lists. */
export const ENV_PLATFORMS = ["linux-x64", "linux-arm64"];
/** Archive kinds a download may be; "none" keeps the file as downloaded. */
export const ENV_EXTRACTS = ["tar.gz", "tar.xz", "zip", "none"];
/** Things a recipe may require of the machine. They are checked, never installed. */
export const ENV_REQUIRE_TOOLS = ["node", "npm", "python3", "ffmpeg", "glibc", "lib"];
/** Variables an env step may extend, with directories inside the environment (prepended). */
export const ENV_PATH_VARS = ["PATH", "LD_LIBRARY_PATH", "PYTHONPATH", "NODE_PATH"];
/** Every placeholder a render argv may hold. */
export const ENV_PLACEHOLDERS = ["props", "out", "width", "height", "fps", "frames", "packDir", "envDir", "inDir", "workDir"];
/** The placeholders a probe may hold (it runs at install time, with no job). */
export const ENV_PROBE_PLACEHOLDERS = ["packDir", "envDir", "workDir"];
/** What argv[0] may be: the worker's own node, the environment's venv python, the worker's ffmpeg, or {envDir}/<file>. */
export const ENV_PROGRAMS = ["node", "python", "ffmpeg"];
export const ENV_OUTPUTS = ["mp4-muted", "png-frames"];
export const ENV_CAPTIONS = ["worker", "renderer"];
/** The narration and the audio mix are always the worker's shared steps. */
export const ENV_AUDIO = ["worker"];
export const ENV_LIMITS = {
  steps: 16,
  hosts: 16,
  downloadBytes: 512 * 1024 * 1024,
  totalDownloadBytes: 1024 * 1024 * 1024,
  argv: 64,
  arg: 400,
  probeTimeoutSec: 300,
  secondsPerVideoSecond: 600,
  stripComponents: 8,
  requirements: 400,
  npmPackages: 2000,
};
/** The hosts pip reaches: the index and the files host. */
export const PIP_HOSTS = ["pypi.org", "files.pythonhosted.org"];
/** The first worker that installs environments and runs engine command. */
export const ENV_MIN_WORKER = "0.12.0";
/** Files a command render project may hold: text only, because the worker bundle carries text. */
export const COMMAND_RENDER_FILE_RE = /\.(mjs|cjs|js|json|py|txt|md|svg|css|html|glsl|gd|tscn|tres|toml|ya?ml)$|(^|\/)LICEN[CS]E[^/]*$|(^|\/)NOTICE[^/]*$/;
/** Files env/ may hold: the lockfiles the recipe names, and licences. */
export const ENV_FILE_RE = /^env\/([A-Za-z0-9_-]+\/)?(package\.json|package-lock\.json|requirements[A-Za-z0-9_.-]*\.txt|LICEN[CS]E[^/]*|NOTICE[^/]*|README\.md)$/;

const HOST_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const MIN_VERSION_RE = /^\d{1,4}(\.\d{1,4}){0,2}$/;
const SONAME_RE = /^lib[A-Za-z0-9_.+-]{1,80}\.so(\.\d{1,4}){0,3}$/;
const NPM_NAME_RE = /^(@[a-z0-9][a-z0-9._-]{0,100}\/)?[a-z0-9][a-z0-9._-]{0,213}$/;
const PLACEHOLDER_RE = /\{([^{}]*)\}/g;
/** Programs that would raise privileges or open a shell; refused anywhere in an argv, not only as argv[0]. */
const FORBIDDEN_PROGRAMS = ["sudo", "su", "doas", "pkexec", "sh", "bash", "dash", "zsh", "env", "chroot", "setpriv", "unshare", "nsenter", "runuser"];
/** Inline-code flags: code lives in files of the pack, where review and CI see it. */
const INLINE_CODE_FLAGS = { node: ["-e", "--eval", "-p", "--print", "-r", "--require", "--import", "--loader", "--experimental-loader"], python: ["-c"] };

/**
 * A path inside the pack or the environment: relative, plain characters, no "." or ".." segments, no backslash.
 * Absolute paths, "~" and anything that could leave the directory are refused.
 */
export function isSafeRelPath(p, { allowDot = false } = {}) {
  if (typeof p !== "string") return false;
  if (allowDot && p === ".") return true;
  if (!PATH_RE.test(p) || p.length > 200 || p.endsWith("/")) return false;
  return p.split("/").every((s) => s !== "" && s !== "." && s !== "..");
}

/** Placeholders an argv element names (without braces), and whether its braces are all well formed. */
export function argPlaceholders(arg) {
  const names = [];
  for (const m of String(arg).matchAll(PLACEHOLDER_RE)) names.push(m[1]);
  const rest = String(arg).replace(PLACEHOLDER_RE, "");
  return { names, stray: rest.includes("{") || rest.includes("}") };
}

/** Checks one fixed argv: a known program, placeholders from `allowed` only, no shell, no privilege change. */
export function validateArgv(argv, at, { allowed = ENV_PLACEHOLDERS, hasVenv = false } = {}) {
  const issues = [];
  if (!Array.isArray(argv) || argv.length < 1 || argv.length > ENV_LIMITS.argv) return [`${at} must be an argv array of 1..${ENV_LIMITS.argv} strings (a fixed command, not a shell string)`];
  argv.forEach((a, i) => {
    if (typeof a !== "string" || a.length === 0 || a.length > ENV_LIMITS.arg || /[\0\n\r]/.test(a)) {
      issues.push(`${at}[${i}] must be a non-empty string of up to ${ENV_LIMITS.arg} characters on one line`);
      return;
    }
    const { names, stray } = argPlaceholders(a);
    if (stray) issues.push(`${at}[${i}] has a brace that is not a placeholder; placeholders are ${allowed.map((n) => `{${n}}`).join(", ")}`);
    for (const n of names) if (!allowed.includes(n)) issues.push(`${at}[${i}]: {${n}} is not a placeholder here (allowed: ${allowed.map((x) => `{${x}}`).join(", ")})`);
    const base = a.split("/").pop();
    if (FORBIDDEN_PROGRAMS.includes(a) || (i === 0 && FORBIDDEN_PROGRAMS.includes(base))) issues.push(`${at}[${i}]: ${a} is refused (no shell, no sudo or root, no namespace tricks: the worker runs the argv as its own user)`);
  });
  const prog = argv[0];
  if (typeof prog === "string") {
    if (prog.startsWith("{envDir}/")) {
      if (!isSafeRelPath(prog.slice("{envDir}/".length))) issues.push(`${at}[0] must be {envDir}/<a relative path inside the environment>`);
    } else if (!ENV_PROGRAMS.includes(prog)) {
      issues.push(`${at}[0] must be ${ENV_PROGRAMS.join(", ")} or {envDir}/<file> (got ${JSON.stringify(prog)}); a program on the machine's PATH is not part of the recipe`);
    }
    if (prog === "python" && !hasVenv) issues.push(`${at}[0] python needs a pip step: it is the environment's own venv python`);
    const inline = INLINE_CODE_FLAGS[prog] ?? [];
    for (const a of argv.slice(1)) if (inline.includes(a)) issues.push(`${at}: ${prog} ${a} runs inline code; put the code in a file of the pack and pass its path`);
  }
  return issues;
}

/**
 * Validates style.json `environment`. `files` (pack-relative path -> text) lets it check the lockfiles the steps
 * name; without it only the shape is checked. Returns plain-text problems.
 */
export function validateEnvironment(env, { files } = {}) {
  const issues = [];
  if (!isRecord(env)) return ["environment must be an object (id, version, platforms, hosts, requires, steps, probe, licences)"];
  checkKeys(env, ["id", "version", "platforms", "hosts", "requires", "steps", "probe", "render", "licences"], "environment", issues);
  if (typeof env.id !== "string" || !ID_RE.test(env.id)) issues.push("environment.id must be lowercase letters, digits and dashes (2..63 characters)");
  if (typeof env.version !== "string" || !SEMVER_RE.test(env.version)) issues.push("environment.version must be semver MAJOR.MINOR.PATCH (bump it whenever a step changes)");
  if (!Array.isArray(env.platforms) || env.platforms.length < 1 || !env.platforms.every((p) => ENV_PLATFORMS.includes(p)) || new Set(env.platforms).size !== env.platforms.length) {
    issues.push(`environment.platforms must list ${ENV_PLATFORMS.join(" and/or ")} (no repeats)`);
  } else if (!env.platforms.includes("linux-x64")) issues.push("environment.platforms must include linux-x64 (the platform of Muse and of CI)");
  const hosts = Array.isArray(env.hosts) ? env.hosts : [];
  if (!Array.isArray(env.hosts) || env.hosts.length > ENV_LIMITS.hosts || !env.hosts.every((h) => typeof h === "string" && HOST_RE.test(h)) || new Set(env.hosts).size !== env.hosts.length) {
    issues.push(`environment.hosts must list up to ${ENV_LIMITS.hosts} exact host names (lowercase, no scheme, no port, no wildcard): every host the install may reach, redirects included`);
  }

  const requires = Array.isArray(env.requires) ? env.requires : [];
  if (!Array.isArray(env.requires) || env.requires.length > 16) issues.push("environment.requires must be a list (up to 16) of things the machine must already have");
  requires.forEach((r, i) => {
    const at = `environment.requires[${i}]`;
    if (!isRecord(r)) return issues.push(`${at} must be an object { tool, min?, name? }`);
    checkKeys(r, ["tool", "min", "name"], at, issues);
    if (!ENV_REQUIRE_TOOLS.includes(r.tool)) issues.push(`${at}.tool must be one of ${ENV_REQUIRE_TOOLS.join(", ")} (checked, never installed)`);
    if (r.min !== undefined && (typeof r.min !== "string" || !MIN_VERSION_RE.test(r.min))) issues.push(`${at}.min must be a version like 3.10`);
    if (r.tool === "lib" && (typeof r.name !== "string" || !SONAME_RE.test(r.name))) issues.push(`${at}.name must be a shared library file name like libcairo.so.2`);
    if (r.tool !== "lib" && r.name !== undefined) issues.push(`${at}.name is only for tool lib`);
    if (r.tool === "lib" && r.min !== undefined) issues.push(`${at}.min is not checked for a library; name the soname instead`);
  });
  const needs = (tool) => requires.some((r) => isRecord(r) && r.tool === tool);

  const steps = Array.isArray(env.steps) ? env.steps : [];
  if (!Array.isArray(env.steps) || env.steps.length < 1 || env.steps.length > ENV_LIMITS.steps) issues.push(`environment.steps must list 1..${ENV_LIMITS.steps} steps`);
  let total = 0;
  let venv = false;
  const targets = new Set();
  steps.forEach((s, i) => {
    const at = `environment.steps[${i}]`;
    if (!isRecord(s) || Object.keys(s).length !== 1) return issues.push(`${at} must be exactly one of { download }, { npm }, { pip }, { env } (there is no shell step)`);
    const [kind] = Object.keys(s);
    const v = s[kind];
    if (!["download", "npm", "pip", "env"].includes(kind)) return issues.push(`${at}: "${kind}" is not a step; the steps are download, npm, pip and env (there is no shell, script or sudo step)`);
    if (!isRecord(v)) return issues.push(`${at}.${kind} must be an object`);
    const sat = `${at}.${kind}`;
    if (kind === "download") {
      checkKeys(v, ["url", "sha256", "bytes", "extract", "stripComponents", "to", "executable", "platform"], sat, issues);
      let url = null;
      try {
        url = new URL(String(v.url));
      } catch {}
      if (!url || typeof v.url !== "string" || v.url.length > 1000) issues.push(`${sat}.url must be a URL`);
      else {
        if (url.protocol !== "https:") issues.push(`${sat}.url must be https`);
        if (url.username || url.password) issues.push(`${sat}.url must not carry credentials`);
        if (url.port) issues.push(`${sat}.url must use the default https port`);
        if (!hosts.includes(url.hostname)) issues.push(`${sat}.url host ${url.hostname} is not in environment.hosts`);
      }
      if (typeof v.sha256 !== "string" || !SHA256_RE.test(v.sha256)) issues.push(`${sat}.sha256 is required: the lowercase hex sha256 of the exact file (never invented; see docs/hermes-handover.md)`);
      if (!Number.isInteger(v.bytes) || v.bytes < 1 || v.bytes > ENV_LIMITS.downloadBytes) issues.push(`${sat}.bytes must be the exact size in bytes, 1..${ENV_LIMITS.downloadBytes}`);
      else total += v.bytes;
      if (!ENV_EXTRACTS.includes(v.extract)) issues.push(`${sat}.extract must be one of ${ENV_EXTRACTS.join(", ")}`);
      if (v.stripComponents !== undefined && (!Number.isInteger(v.stripComponents) || v.stripComponents < 0 || v.stripComponents > ENV_LIMITS.stripComponents || v.extract === "none")) {
        issues.push(`${sat}.stripComponents must be 0..${ENV_LIMITS.stripComponents}, and only for an archive`);
      }
      if (!isSafeRelPath(v.to, { allowDot: v.extract !== "none" })) issues.push(`${sat}.to must be a relative path inside the environment (no absolute path, no ".."): a directory for an archive, a file for extract none`);
      else if (targets.has(v.to)) issues.push(`${sat}.to ${v.to} is the target of another step`);
      else targets.add(v.to);
      if (v.executable !== undefined && (typeof v.executable !== "boolean" || v.extract !== "none")) issues.push(`${sat}.executable is true or false, and only for extract none (an archive keeps its own modes)`);
      if (v.platform !== undefined && !(Array.isArray(env.platforms) && env.platforms.includes(v.platform))) issues.push(`${sat}.platform must be one of environment.platforms`);
    } else if (kind === "npm") {
      checkKeys(v, ["lockfile", "to", "allowScripts"], sat, issues);
      if (!isSafeRelPath(v.lockfile) || !/^env\/(.+\/)?package-lock\.json$/.test(v.lockfile)) issues.push(`${sat}.lockfile must name env/[<dir>/]package-lock.json in the pack (package.json beside it)`);
      if (!isSafeRelPath(v.to)) issues.push(`${sat}.to must be a relative directory inside the environment`);
      else if (targets.has(v.to)) issues.push(`${sat}.to ${v.to} is the target of another step`);
      else targets.add(v.to);
      if (v.allowScripts !== undefined && (!Array.isArray(v.allowScripts) || v.allowScripts.length > 8 || !v.allowScripts.every((n) => typeof n === "string" && NPM_NAME_RE.test(n)))) {
        issues.push(`${sat}.allowScripts must list up to 8 npm package names whose install scripts truly must run (everything else installs with --ignore-scripts)`);
      }
      if (!needs("npm")) issues.push(`${sat} needs { "tool": "npm" } in environment.requires`);
      if (files && typeof v.lockfile === "string") for (const m of validateNpmLock(files, v.lockfile, hosts, v.allowScripts ?? [])) issues.push(`${sat}: ${m}`);
    } else if (kind === "pip") {
      checkKeys(v, ["requirements", "python", "to"], sat, issues);
      if (!isSafeRelPath(v.requirements) || !/^env\/(.+\/)?requirements[A-Za-z0-9_.-]*\.txt$/.test(v.requirements)) issues.push(`${sat}.requirements must name env/[<dir>/]requirements*.txt in the pack`);
      if (typeof v.python !== "string" || !MIN_VERSION_RE.test(v.python)) issues.push(`${sat}.python must be the lowest python3 version it needs, like 3.10`);
      if (!isSafeRelPath(v.to)) issues.push(`${sat}.to must be a relative directory inside the environment (the venv)`);
      else if (targets.has(v.to)) issues.push(`${sat}.to ${v.to} is the target of another step`);
      else targets.add(v.to);
      if (venv) issues.push(`${sat}: one pip step per environment (one venv)`);
      venv = true;
      if (!needs("python3")) issues.push(`${sat} needs { "tool": "python3", "min": "${typeof v.python === "string" ? v.python : "3.10"}" } in environment.requires`);
      for (const h of PIP_HOSTS) if (!hosts.includes(h)) issues.push(`${sat} needs ${h} in environment.hosts (pip downloads from PyPI)`);
      if (files && typeof v.requirements === "string") for (const m of validateRequirements(files[v.requirements])) issues.push(`${sat}: ${v.requirements}: ${m}`);
    } else {
      const names = Object.keys(v);
      if (names.length < 1 || names.length > ENV_PATH_VARS.length) issues.push(`${sat} must set 1..${ENV_PATH_VARS.length} of ${ENV_PATH_VARS.join(", ")}`);
      for (const n of names) {
        if (!ENV_PATH_VARS.includes(n)) {
          issues.push(`${sat}: ${n} is not one of ${ENV_PATH_VARS.join(", ")} (only PATH-like additions inside the environment; LD_PRELOAD, NODE_OPTIONS and the like are refused)`);
          continue;
        }
        const list = Array.isArray(v[n]) ? v[n] : [v[n]];
        if (list.length < 1 || list.length > 8 || !list.every((x) => isSafeRelPath(x, { allowDot: true }))) issues.push(`${sat}.${n} must be one or a list of up to 8 relative directories inside the environment`);
      }
    }
  });
  if (total > ENV_LIMITS.totalDownloadBytes) issues.push(`environment downloads add up to ${total} bytes; the limit is ${ENV_LIMITS.totalDownloadBytes}`);
  if (steps.some((s) => isRecord(s) && isRecord(s.download)) && hosts.length === 0) issues.push("environment.hosts must list the hosts the downloads come from");

  const p = env.probe;
  if (!isRecord(p)) issues.push("environment.probe must be an object { argv, timeoutSec, exitCode, stdout? }: the worker reports the environment only after it passes");
  else {
    checkKeys(p, ["argv", "timeoutSec", "exitCode", "stdout"], "environment.probe", issues);
    for (const m of validateArgv(p.argv, "environment.probe.argv", { allowed: ENV_PROBE_PLACEHOLDERS, hasVenv: venv })) issues.push(m);
    if (!Number.isInteger(p.timeoutSec) || p.timeoutSec < 1 || p.timeoutSec > ENV_LIMITS.probeTimeoutSec) issues.push(`environment.probe.timeoutSec must be 1..${ENV_LIMITS.probeTimeoutSec}`);
    if (!Number.isInteger(p.exitCode) || p.exitCode < 0 || p.exitCode > 255) issues.push("environment.probe.exitCode must be the expected exit code, 0..255");
    if (p.stdout !== undefined) {
      let ok = typeof p.stdout === "string" && p.stdout.length > 0 && p.stdout.length <= 200;
      if (ok) {
        try {
          new RegExp(p.stdout);
        } catch {
          ok = false;
        }
      }
      if (!ok) issues.push("environment.probe.stdout must be a regular expression of up to 200 characters that the probe's output must match");
    }
  }

  if (env.render !== undefined) {
    const r = env.render;
    if (!isRecord(r)) issues.push("environment.render must be an object { argv, secondsPerVideoSecond, output, captions, audio }");
    else {
      checkKeys(r, ["argv", "secondsPerVideoSecond", "output", "captions", "audio"], "environment.render", issues);
      for (const m of validateArgv(r.argv, "environment.render.argv", { allowed: ENV_PLACEHOLDERS, hasVenv: venv })) issues.push(m);
      const outs = Array.isArray(r.argv) ? r.argv.filter((a) => typeof a === "string" && a.includes("{out}")).length : 0;
      if (outs === 0) issues.push("environment.render.argv must pass {out}: where the render writes its video or frames");
      if (!isNum(r.secondsPerVideoSecond) || r.secondsPerVideoSecond < 1 || r.secondsPerVideoSecond > ENV_LIMITS.secondsPerVideoSecond) issues.push(`environment.render.secondsPerVideoSecond must be 1..${ENV_LIMITS.secondsPerVideoSecond} (the render's time limit per second of video)`);
      if (!ENV_OUTPUTS.includes(r.output)) issues.push(`environment.render.output must be ${ENV_OUTPUTS.join(" or ")} (png-frames: <out>/000000.png and on, encoded by the worker)`);
      if (!ENV_CAPTIONS.includes(r.captions)) issues.push(`environment.render.captions must be ${ENV_CAPTIONS.join(" or ")} (worker: the worker burns the job's captions afterwards)`);
      if (!ENV_AUDIO.includes(r.audio)) issues.push('environment.render.audio must be "worker": the narration and the audio mix are always the worker\'s shared steps');
    }
  }

  if (!Array.isArray(env.licences) || env.licences.length < 1 || env.licences.length > 32) issues.push("environment.licences must list every tool the recipe installs, with its licence (1..32 entries)");
  else {
    env.licences.forEach((l, i) => {
      const at = `environment.licences[${i}]`;
      if (!isRecord(l)) return issues.push(`${at} must be an object { tool, version, licence, source, notes? }`);
      checkKeys(l, ["tool", "version", "licence", "source", "notes"], at, issues);
      if (!isText(l.tool, 80)) issues.push(`${at}.tool must name the tool`);
      if (!isText(l.version, 40)) issues.push(`${at}.version must be the exact version installed`);
      if (!isText(l.licence, 200)) issues.push(`${at}.licence must record the tool's licence (SPDX id or the terms)`);
      if (typeof l.source !== "string" || !/^https:\/\/[^\s]{4,400}$/.test(l.source)) issues.push(`${at}.source must be the https URL of the tool's source or release`);
      if (l.notes !== undefined && (typeof l.notes !== "string" || l.notes.length > LIMITS.text)) issues.push(`${at}.notes must be a text`);
    });
  }
  return issues;
}

/** An npm lockfile shipped in the pack: v2 or v3, every package pinned to an https tarball on a listed host with an sha512 integrity. */
export function validateNpmLock(files, lockfile, hosts, allowScripts = []) {
  const issues = [];
  const dir = lockfile.slice(0, -"package-lock.json".length);
  const pkgText = files[`${dir}package.json`];
  const lockText = files[lockfile];
  if (typeof pkgText !== "string") issues.push(`${dir}package.json is missing beside the lockfile`);
  if (typeof lockText !== "string") return [...issues, `${lockfile} is missing from the pack`];
  let lock;
  try {
    lock = JSON.parse(lockText);
  } catch (err) {
    return [...issues, `${lockfile} is not JSON: ${err.message}`];
  }
  if (!isRecord(lock) || ![2, 3].includes(lock.lockfileVersion) || !isRecord(lock.packages)) return [...issues, `${lockfile} must be an npm lockfile v2 or v3 with "packages"`];
  const entries = Object.entries(lock.packages).filter(([k]) => k !== "");
  if (entries.length === 0) issues.push(`${lockfile} installs no package`);
  if (entries.length > ENV_LIMITS.npmPackages) issues.push(`${lockfile} lists more than ${ENV_LIMITS.npmPackages} packages`);
  for (const [k, e] of entries) {
    if (!k.startsWith("node_modules/") || k.split("/").some((s) => s === ".." || s === ".")) {
      issues.push(`${lockfile}: "${k}" is not a node_modules package (workspaces and local paths are refused)`);
      continue;
    }
    if (!isRecord(e)) continue;
    if (e.link === true) issues.push(`${lockfile}: ${k} is a link to a local path; refused`);
    let url = null;
    try {
      url = new URL(String(e.resolved));
    } catch {}
    if (!url || url.protocol !== "https:") issues.push(`${lockfile}: ${k} must be resolved to an https tarball`);
    else if (!hosts.includes(url.hostname)) issues.push(`${lockfile}: ${k} comes from ${url.hostname}, which is not in environment.hosts`);
    if (typeof e.integrity !== "string" || !/^sha512-[A-Za-z0-9+/]{86}==$/.test(e.integrity)) issues.push(`${lockfile}: ${k} has no sha512 integrity (npm checks every tarball against it)`);
  }
  // A package with an install script installs without it (--ignore-scripts) unless allowScripts names it; a name there
  // that the lockfile does not have is a mistake.
  const names = new Set(entries.map(([k]) => k.slice(k.lastIndexOf("node_modules/") + "node_modules/".length)));
  for (const n of allowScripts) if (!names.has(n)) issues.push(`allowScripts names ${n}, which ${lockfile} does not install`);
  if (typeof pkgText === "string") {
    try {
      const pkg = JSON.parse(pkgText);
      if (isRecord(pkg.scripts) && Object.keys(pkg.scripts).some((s) => /^(pre|post)?(install|prepare|preinstall|postinstall)$/.test(s))) {
        issues.push(`${dir}package.json must not have install or prepare scripts (they would run code at install)`);
      }
    } catch (err) {
      issues.push(`${dir}package.json is not JSON: ${err.message}`);
    }
  }
  return issues;
}

/**
 * A pip requirements file for `pip install --require-hashes --only-binary=:all: --no-deps`: every requirement pinned
 * with == and at least one --hash=sha256:, no options (no other index, no URL, no editable install).
 */
export function validateRequirements(text) {
  if (typeof text !== "string") return ["the requirements file is missing from the pack"];
  const issues = [];
  const joined = text.replace(/\\\r?\n/g, " ");
  let count = 0;
  for (const raw of joined.split(/\r?\n/)) {
    const line = raw.replace(/(^|\s)#.*$/, "").trim();
    if (!line) continue;
    count++;
    if (/^-/.test(line)) {
      issues.push(`"${line.slice(0, 60)}": options are refused (no -i, --index-url, --extra-index-url, -f, -e, -r); pip runs with PyPI and --require-hashes only`);
      continue;
    }
    const m = /^([A-Za-z0-9][A-Za-z0-9._-]*)(\[[A-Za-z0-9,._-]+\])?==([A-Za-z0-9.!+_-]+)(\s*;[^-]*)?((\s+--hash=sha256:[0-9a-f]{64})+)\s*$/.exec(line);
    if (!m) issues.push(`"${line.slice(0, 80)}" must be name==version followed by --hash=sha256:<64 hex> (pip --require-hashes)`);
  }
  if (count === 0) issues.push("it lists no requirement");
  if (count > ENV_LIMITS.requirements) issues.push(`it lists more than ${ENV_LIMITS.requirements} requirements`);
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
  const envTexts = {};
  for (const rel of names) if (rel.startsWith("env/")) envTexts[rel] = read(rel);
  if (style) for (const m of validateStyle(style, { dirName, files: envTexts })) issues.push(at(m));
  const envFiles = names.filter((n) => n.startsWith("env/"));
  if (envFiles.length > 0 && style?.environment === undefined) issues.push(at("env/ holds the lockfiles of an environment; this pack has none"));
  for (const rel of envFiles) if (!ENV_FILE_RE.test(rel)) issues.push(at(`${rel}: env/ holds only package.json, package-lock.json, requirements*.txt, LICENSE, NOTICE and README.md (one level of subdirectory)`));

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
    // GSAP's licence is not approved by the owner, so a page Hermes writes may not reach for it (current packs use plain JS).
    if (style && RESEARCH_RECIPES.includes(recipeOf(style))) {
      for (const v of vendors) if (/gsap/i.test(v)) issues.push(at(`render/vendor/${v}/: GSAP is not available to html-design pages until the owner approves its licence; use plain JavaScript`));
    }
    for (const v of vendors) {
      if (!renderFiles.some((r) => r.startsWith(`render/vendor/${v}/`) && /(^|\/)LICEN[CS]E[^/]*$/.test(r))) {
        issues.push(at(`render/vendor/${v}/ has no LICENSE file: a vendored library carries its licence`));
      }
    }
  } else if (engine === "command") {
    if (renderFiles.length === 0) issues.push(at("render/ is missing: a command pack carries the files its render argv runs (scripts, scenes) in render/"));
    for (const rel of renderFiles) {
      if (!COMMAND_RENDER_FILE_RE.test(rel)) issues.push(at(`${rel}: a command render project holds text files only (scripts, scenes, .json, .svg, LICENSE, NOTICE); binaries come from the environment's downloads`));
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
  const ids = new Set(packs.map((p) => p.id));
  dirs.forEach((d) => {
    const h = readHermes(path.join(packsDir, d));
    for (const v of Array.isArray(h?.variantOf) ? h.variantOf : []) {
      if (typeof v === "string" && !ids.has(v)) issues.push(`packs/${d}: hermes.variantOf names "${v}", which is not a pack here`);
      if (v === d) issues.push(`packs/${d}: hermes.variantOf names the pack itself`);
    }
  });
  for (const p of packs) issues.push(...p.issues);
  return { packs, issues };
}

function readHermes(dir) {
  try {
    const s = JSON.parse(readFileSync(path.join(dir, "style.json"), "utf8"));
    return isRecord(s.hermes) ? s.hermes : null;
  } catch {
    return null;
  }
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
