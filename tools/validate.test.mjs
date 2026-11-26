// node --test tools/   (zero dependencies)
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as V from "./validate.mjs";
import { packIndexSource, packListJson, remotionPacks } from "./assemble-remotion.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const load = (id) => JSON.parse(readFileSync(path.join(ROOT, "packs", id, "style.json"), "utf8"));
const clone = (v) => JSON.parse(JSON.stringify(v));
const has = (issues, re) => issues.some((i) => re.test(i));

/** A scratch repo with copies of the given packs; `edit` changes a pack's style.json before validating. */
function scratch(t, ids, edit = {}) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "vs-styles-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const id of ids) {
    cpSync(path.join(ROOT, "packs", id), path.join(dir, "packs", edit[id]?.dir ?? id), { recursive: true });
    if (edit[id]?.style) {
      const file = path.join(dir, "packs", edit[id]?.dir ?? id, "style.json");
      writeFileSync(file, JSON.stringify(edit[id].style(JSON.parse(readFileSync(file, "utf8"))), null, 2));
    }
  }
  return dir;
}

test("every pack in this repo is valid", () => {
  const { packs, issues } = V.validateRepo(ROOT);
  assert.deepEqual(issues, []);
  assert.deepEqual(packs.map((p) => p.id), [
    "ambient-loop",
    "blocky-story",
    "branching-lines",
    "designed-explainer",
    "documentary",
    "explainer-flat-vector",
    "exploded-view",
    "flat-space",
    "full-frame",
    "horror-narration",
    "line-graph",
    "line-graph-skill",
    "low-poly-shapes",
    "map-route",
    "minimal-line-art",
    "mystery-narration",
    "probe-line-graph",
    "ps1-low-poly",
    "research-render",
    "step-line-art-skill",
    "stick-figure",
    "story-read-aloud",
    "travel-documentary",
    "voxel-build",
    "voxel-build-skill",
    "what-if-3d",
  ]);
});

test("html-capture packs: index.html, text files only, no remote references, licences beside vendored libraries, drawsCaptions declared", (t) => {
  assert.deepEqual(V.validateRepo(scratch(t, ["probe-line-graph"])).issues, []);
  const noDraws = V.validateStyle({ ...clone(load("probe-line-graph")), renderer: { engine: "html-capture", minWorkerVersion: "0.10.0", composition: null } });
  assert.ok(has(noDraws, /drawsCaptions must be true/));
  const old = V.validateStyle({ ...clone(load("probe-line-graph")), renderer: { engine: "html-capture", minWorkerVersion: "0.9.0", composition: null, drawsCaptions: false } });
  assert.ok(has(old, /0\.10\.0 or later for html-capture/));
  const comp = V.validateStyle({ ...clone(load("probe-line-graph")), renderer: { engine: "html-capture", minWorkerVersion: "0.10.0", composition: "x-y", drawsCaptions: false } });
  assert.ok(has(comp, /composition must be null for html-capture/));
  assert.ok(has(V.validateStyle({ ...clone(load("documentary")), renderer: { ...load("documentary").renderer, drawsCaptions: true } }), /only for html-capture/));

  const dir = scratch(t, ["probe-line-graph"]);
  const render = path.join(dir, "packs", "probe-line-graph", "render");
  writeFileSync(path.join(render, "index.html"), '<!doctype html><script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script>');
  writeFileSync(path.join(render, "style.css"), "body { background: url(//example.com/x.png) }");
  writeFileSync(path.join(render, "photo.png"), "not text");
  mkdirSync(path.join(render, "vendor", "gsap"), { recursive: true });
  writeFileSync(path.join(render, "vendor", "gsap", "gsap.min.js"), "/* https://gsap.com in a comment is fine */");
  const issues = V.validateRepo(dir).issues;
  assert.ok(has(issues, /index\.html loads something from the network/));
  assert.ok(has(issues, /style\.css loads something from the network/));
  assert.ok(has(issues, /photo\.png: an html-capture project holds text files only/));
  assert.ok(has(issues, /render\/vendor\/gsap\/ has no LICENSE file/));
  assert.ok(!has(issues, /gsap\.min\.js loads/), "a URL inside a vendored script is not a request");
  writeFileSync(path.join(render, "vendor", "gsap", "LICENSE.md"), "Standard license\n");
  assert.ok(!has(V.validateRepo(dir).issues, /has no LICENSE file/));

  const missing = scratch(t, ["probe-line-graph"]);
  rmSync(path.join(missing, "packs", "probe-line-graph", "render", "index.html"));
  assert.ok(has(V.validateRepo(missing).issues, /render\/index\.html is missing/));
});

test("hermes packs are research only: never above trial, no render project, a research-source entry instead of a CI render", () => {
  const h = load("research-render");
  assert.deepEqual(V.validateStyle(h, { dirName: "research-render" }), []);
  for (const status of ["proven", "listed"]) {
    const s = { ...clone(h), status, curation: [{ date: "2026-11-21", kind: "owner-review", ref: "PR", result: "approved", notes: "" }, { date: "2026-11-21", kind: "trial-run", ref: "run", result: "pass", notes: "" }] };
    assert.ok(has(V.validateStyle(s), /research only \(owner decision\): the pack can be at most trial, never/), status);
  }
  assert.deepEqual(V.validateStyle({ ...clone(h), status: "lab" }), [], "lab without a ci-render entry: there is no Hermes in CI");
  assert.ok(has(V.validateStyle({ ...clone(load("probe-line-graph")), curation: [] }), /needs a passing ci-render entry/), "html-capture still needs its CI render");
});

const RESEARCH = { date: "2026-11-22", kind: "research-source", ref: "https://github.com/artemnovitckii/claude-animation-skills@86f7010 (skills/graph); owner report: works in Hermes", result: "pass", notes: "" };

test("research-source: accepted for a hermes pack at lab or trial, required there, never for other engines, never above trial", () => {
  const g = load("line-graph-skill");
  assert.deepEqual(V.validateStyle(g, { dirName: "line-graph-skill" }), []);
  // Retired is what lets it name its replacement: changing its status drops upgradedTo, the alias stays.
  const base = clone(g);
  delete base.upgradedTo;
  for (const status of ["lab", "trial"]) {
    assert.deepEqual(V.validateStyle({ ...clone(base), status, curation: [RESEARCH] }), [], status);
    assert.ok(has(V.validateStyle({ ...clone(base), status, curation: [] }), /hermes pack needs a research-source entry with result "pass"/), `${status} without evidence`);
    assert.ok(has(V.validateStyle({ ...clone(base), status, curation: [{ ...RESEARCH, result: "note" }] }), /needs a research-source entry/), `${status} with a note only`);
  }
  assert.deepEqual(V.validateStyle({ ...clone(base), status: "draft", curation: [] }), [], "a hermes draft needs no evidence");
  // Never above trial, research-source or not.
  for (const status of ["proven", "listed"]) {
    const curation = [RESEARCH, { date: "2026-11-22", kind: "owner-review", ref: "PR", result: "approved", notes: "" }, { date: "2026-11-22", kind: "trial-run", ref: "run", result: "pass", notes: "" }];
    assert.ok(has(V.validateStyle({ ...clone(base), status, curation }), /can be at most trial, never/), status);
  }
  // Another engine: research-source is refused, and it never stands in for the CI render.
  const html = load("line-graph");
  const asHtml = { ...clone(html), status: "trial", curation: [RESEARCH] };
  assert.ok(has(V.validateStyle(asHtml), /needs a passing ci-render entry/), "html-capture at trial with only research-source");
  assert.ok(has(V.validateStyle(asHtml), /research-source is evidence for hermes packs \(and html-design packs\) only/));
  assert.ok(has(V.validateStyle({ ...clone(load("documentary")), curation: [...load("documentary").curation, RESEARCH] }), /research-source is evidence for hermes packs \(and html-design packs\) only/), "even beside a real ci-render");
  assert.ok(has(V.validateStyle({ ...clone(html), status: "draft", curation: [RESEARCH] }), /research-source is evidence for hermes packs \(and html-design packs\) only/), "even on a draft");
});

test("the hermes block: only on hermes packs, a skill name, a mode, how the plan maps to the input; project skills say how the narration is used", (t) => {
  const g = load("line-graph-skill");
  assert.equal(g.hermes.skill, "/graph");
  assert.ok(has(V.validateStyle({ ...clone(load("line-graph")), hermes: clone(g.hermes) }), /hermes names the Hermes skill of a hermes pack/));
  assert.ok(has(V.validateStyle({ ...clone(g), hermes: { ...g.hermes, skill: "graph" } }), /hermes.skill must be a Hermes skill as invoked/));
  assert.ok(has(V.validateStyle({ ...clone(g), hermes: { ...g.hermes, mode: "quick" } }), /hermes.mode must be one of spec, project/));
  assert.ok(has(V.validateStyle({ ...clone(g), hermes: { ...g.hermes, input: "" } }), /hermes.input must say/));
  assert.ok(has(V.validateStyle({ ...clone(g), hermes: { ...g.hermes, colour: 1 } }), /hermes: unknown field "colour"/));
  assert.ok(has(V.validateStyle({ ...clone(g), hermes: { ...g.hermes, aliases: ["/graph"] } }), /must not repeat the skill/));
  const z = load("what-if-3d");
  assert.deepEqual([z.hermes.skill, z.hermes.aliases, z.hermes.mode], ["/zach-d-films", ["/zach-3d-films"], "project"]);
  assert.ok(has(V.validateStyle({ ...clone(z), hermes: { ...z.hermes, input: "Make the reel from the storyboard." } }), /project skill must say how the run's narration and captions are used/));
  assert.deepEqual(V.validateStyle({ ...clone(load("research-render")) }), [], "the block is optional: the generic Hermes render names no skill");
  // variantOf must name a pack in the repo.
  const dir = scratch(t, ["line-graph-skill"]);
  assert.ok(has(V.validateRepo(dir).issues, /hermes.variantOf names "line-graph", which is not a pack here/));
  assert.deepEqual(V.validateRepo(scratch(t, ["line-graph-skill", "line-graph"])).issues, []);
});

test("one research pack per claude-animation-skills skill, pinned, credited and licensed; the alias is the same pack", () => {
  const PACKS = {
    breakdown: "exploded-view",
    "dan-koe": "branching-lines",
    graph: "line-graph-skill",
    kurzgesagt: "flat-space",
    "low-poly": "ps1-low-poly",
    "map-route": "map-route",
    minecraft: "voxel-build-skill",
    "minimalistic-graphics": "step-line-art-skill",
    "stick-figure": "stick-figure",
    "zach-d-films": "what-if-3d",
  };
  // Two of them are superseded by a worker pack that renders the same look, so they sit at retired. /minecraft stays a
  // live trial: the Muse pack draws a village of kit structures, not the cottage this skill builds, so it is a different
  // look rather than a replacement (the owner picks one or the other).
  const RETIRED = ["graph", "minimalistic-graphics"];
  for (const [skill, id] of Object.entries(PACKS)) {
    const s = load(id);
    const status = RETIRED.includes(skill) ? "retired" : "trial";
    assert.deepEqual([s.status, s.renderer.engine, s.hermes.skill], [status, "hermes", `/${skill}`], id);
    assert.equal(s.hermes.mode, skill === "stick-figure" || skill === "zach-d-films" ? "project" : "spec", id);
    const src = s.provenance.find((p) => p.type === "skill");
    assert.ok(src && src.ref.startsWith("https://github.com/artemnovitckii/claude-animation-skills@86f70106c9aeae1334184467da5776c533ada3bc"), id);
    assert.match(src.licence, /^MIT, Copyright \(c\) 2026 Artem Novitckii.*SIL Open Font License/, id);
    assert.ok(s.curation.some((e) => e.kind === "research-source" && e.result === "pass" && /owner report: installed in Hermes and working/.test(e.ref)), id);
    assert.ok(!s.curation.some((e) => e.kind === "ci-render"), `${id} claims no CI render`);
    assert.match(readFileSync(path.join(ROOT, "packs", id, "README.md"), "utf8"), /by\n?\s*\[Artem Novitckii\]/, `${id} credits the author`);
  }
  assert.ok(!Object.keys(PACKS).includes("zach-3d-films"));
  assert.deepEqual(load("what-if-3d").hermes.aliases, ["/zach-3d-films"]);
  assert.deepEqual(load("line-graph-skill").hermes.variantOf, ["line-graph"]);
  assert.deepEqual(load("step-line-art-skill").hermes.variantOf, ["minimal-line-art"]);
});

test("the two adaptations are at trial on real CI renders: this repo's and venstudio's", () => {
  for (const id of ["line-graph", "minimal-line-art"]) {
    const s = load(id);
    assert.deepEqual([s.status, s.version], ["trial", "0.1.2"], id);
    const refs = s.curation.filter((e) => e.kind === "ci-render" && e.result === "pass").map((e) => e.ref);
    assert.ok(refs.some((r) => r.includes("venturazz/venstudio/actions/runs/44981421800") && r.includes("055e029")), id);
    assert.ok(refs.some((r) => r.includes("venturazz/venstudio-styles/actions/runs/44980615532")), id);
  }
});

test("renderDigest is packDigest over render/ without the prefix, as a worker hashes html/<id>/", () => {
  const files = { "style.json": "a".repeat(64), "render/index.html": "b".repeat(64), "render/vendor/x/LICENSE": "c".repeat(64) };
  assert.equal(V.renderDigest(files), V.packDigest({ "index.html": "b".repeat(64), "vendor/x/LICENSE": "c".repeat(64) }));
  assert.equal(V.compareVersions("0.10.0", "0.9.0"), 1);
  assert.equal(V.compareVersions("0.9", "0.9.0"), 0);
});

test("a valid pack has no issues, and so does its copy in a fresh repo", (t) => {
  assert.deepEqual(V.validateStyle(load("documentary"), { dirName: "documentary" }), []);
  const dir = scratch(t, ["explainer-flat-vector"]);
  assert.deepEqual(V.validateRepo(dir).issues, []);
});

test("every required top-level field is required", () => {
  const good = load("explainer-flat-vector");
  for (const k of Object.keys(good).filter((k) => !V.OPTIONAL_TOP_KEYS.includes(k))) {
    const s = clone(good);
    delete s[k];
    assert.ok(V.validateStyle(s, { dirName: "explainer-flat-vector" }).length > 0, `missing ${k} was accepted`);
  }
  for (const [outer, inner] of [["renderer", "engine"], ["renderer", "minWorkerVersion"], ["formats", "supported"], ["contract", "pacing"], ["contract", "audio"], ["portal", "qc"], ["fixture", "payload"]]) {
    const s = clone(good);
    delete s[outer][inner];
    assert.ok(V.validateStyle(s).length > 0, `missing ${outer}.${inner} was accepted`);
  }
  const extra = { ...clone(good), colour: "red" };
  assert.ok(has(V.validateStyle(extra), /unknown field "colour"/));
});

test("bad status, bad version and an id that is not the directory are refused", () => {
  const s = load("horror-narration");
  assert.ok(has(V.validateStyle({ ...s, status: "beta" }), /status must be one of/));
  assert.ok(has(V.validateStyle({ ...s, version: "1.0" }), /semver/));
  assert.ok(has(V.validateStyle(s, { dirName: "other" }), /must equal the pack directory name/));
});

test("bad renderer: unknown engine, missing or stray composition, an engine no worker runs past draft", () => {
  const stills = load("documentary");
  const remotion = load("explainer-flat-vector");
  assert.ok(has(V.validateStyle({ ...stills, renderer: { ...stills.renderer, engine: "after-effects" } }), /renderer.engine must be one of/));
  assert.ok(has(V.validateStyle({ ...remotion, renderer: { ...remotion.renderer, composition: null } }), /renderer.composition must name/));
  assert.ok(has(V.validateStyle({ ...stills, renderer: { ...stills.renderer, composition: "x-y" } }), /must be null for ffmpeg-stills/));
  assert.ok(has(V.validateStyle({ ...stills, renderer: { ...stills.renderer, engine: "manim" } }), /no worker can run manim yet/));
  assert.deepEqual(V.validateStyle({ ...stills, status: "draft", curation: [], renderer: { ...stills.renderer, engine: "manim" } }), []);
  assert.ok(has(V.validateStyle({ ...stills, renderer: { ...stills.renderer, minWorkerVersion: "latest" } }), /minWorkerVersion/));
});

test("provenance: at least one source, and every source records its licence", () => {
  const s = load("mystery-narration");
  assert.ok(has(V.validateStyle({ ...s, provenance: [] }), /provenance must list/));
  const noLicence = clone(s);
  delete noLicence.provenance[0].licence;
  assert.ok(has(V.validateStyle(noLicence), /provenance\[0\]\.licence must record/));
  const blank = clone(s);
  blank.provenance[0].licence = "  ";
  assert.ok(has(V.validateStyle(blank), /licence/));
  const badType = clone(s);
  badType.provenance[0].type = "youtube-download";
  assert.ok(has(V.validateStyle(badType), /provenance\[0\]\.type must be one of/));
});

test("status needs evidence: lab and later need a passing CI render; proven and listed need the owner's approval", () => {
  const s = load("travel-documentary");
  assert.ok(has(V.validateStyle({ ...s, curation: [] }), /needs a passing ci-render/));
  assert.deepEqual(V.validateStyle({ ...s, status: "draft", curation: [] }), []);
  for (const status of ["proven", "listed"]) assert.ok(has(V.validateStyle({ ...s, status }), /owner-approved PR/), status);
  const approved = {
    ...s,
    status: "listed",
    curation: [
      ...s.curation,
      { date: "2026-12-01", kind: "trial-run", ref: "venstudio run 1", result: "pass", notes: "" },
      { date: "2026-12-02", kind: "owner-review", ref: "PR #9", result: "approved", notes: "" },
    ],
  };
  assert.deepEqual(V.validateStyle(approved), []);
  const badEntry = clone(s);
  badEntry.curation[0].date = "yesterday";
  assert.ok(has(V.validateStyle(badEntry), /curation\[0\]\.date/));
});

test("duplicate pack ids and duplicate compositions are refused", (t) => {
  assert.deepEqual(V.findDuplicates([{ id: "a" }, { id: "a" }]), ['duplicate pack id "a"']);
  assert.ok(has(V.findDuplicates([{ id: "a", composition: "c" }, { id: "b", composition: "c" }]), /composition "c" is used by "a" and "b"/));
  // A second directory whose style.json claims an existing id.
  const dir = scratch(t, ["documentary", "horror-narration"], { "horror-narration": { dir: "horror-copy", style: (s) => ({ ...s, id: "documentary" }) } });
  const { issues } = V.validateRepo(dir);
  assert.ok(has(issues, /duplicate pack id "documentary"/), issues.join("\n"));
});

test("README, fixtures and the render project are checked", (t) => {
  const dir = scratch(t, ["explainer-flat-vector", "ambient-loop"]);
  writeFileSync(path.join(dir, "packs/ambient-loop/README.md"), "# short\n");
  mkdirSync(path.join(dir, "packs/ambient-loop/render"));
  writeFileSync(path.join(dir, "packs/ambient-loop/render/x.tsx"), "export {};\n");
  writeFileSync(path.join(dir, "packs/explainer-flat-vector/fixtures/payload.json"), '{"engine":"remotion-2d","shots":[{}],"scenePlan":{"template":"explainer-flat-vector"}}');
  rmSync(path.join(dir, "packs/explainer-flat-vector/render/index.tsx"));
  const { issues } = V.validateRepo(dir);
  for (const re of [/ambient-loop: README.md is too short/, /ambient-loop: README.md needs a "## Provenance"/, /ambient-loop: render\/ is only for engines/, /explainer-flat-vector: fixtures\/payload.json does not match payloadSha256/, /explainer-flat-vector: render\/index.tsx is missing/]) {
    assert.ok(has(issues, re), `${re}\n${issues.join("\n")}`);
  }
});

test("the explainer fixture is the golden byte for byte, and its composition is what render/index.tsx exports", () => {
  const expect = JSON.parse(readFileSync(path.join(ROOT, "packs/explainer-flat-vector/fixtures/expect.json"), "utf8"));
  assert.equal(V.sha256Hex(readFileSync(path.join(ROOT, "packs/explainer-flat-vector/fixtures/payload.json"))), expect.payloadSha256);
  assert.deepEqual(remotionPacks(ROOT).map((p) => [p.id, p.composition]), [["explainer-flat-vector", "flat-vector-explainer"]]);
});

test("packDigest changes with any file and not with order", () => {
  const a = V.packDigest({ "a.json": "1", "b/c.ts": "2" });
  assert.equal(a, V.packDigest({ "b/c.ts": "2", "a.json": "1" }));
  assert.notEqual(a, V.packDigest({ "a.json": "1", "b/c.ts": "3" }));
  assert.notEqual(a, V.packDigest({ "a.json": "1" }));
});

test("the JSON schema's enums are the validator's", () => {
  const schema = JSON.parse(readFileSync(path.join(ROOT, "schema/style.schema.json"), "utf8"));
  const p = schema.properties;
  assert.deepEqual(p.status.enum, V.STATUSES);
  assert.deepEqual(p.family.enum, V.FAMILIES);
  assert.deepEqual(p.renderer.properties.engine.enum, V.ENGINES);
  assert.deepEqual(p.provenance.items.properties.type.enum, V.PROVENANCE_TYPES);
  assert.deepEqual(p.curation.items.properties.kind.enum, V.CURATION_KINDS);
  assert.deepEqual(p.contract.properties.onScreen.properties.motionTokens.items.enum, V.MOTION_TOKENS);
  assert.deepEqual(schema.required.sort(), Object.keys(load("documentary")).filter((k) => !V.OPTIONAL_TOP_KEYS.includes(k)).sort());
  assert.deepEqual(p.hermes.properties.mode.enum, V.HERMES_MODES);
  assert.deepEqual(p.hermes.properties.voice.enum, V.HERMES_VOICES);
  assert.deepEqual(p.workflow.properties.recipe.enum, V.RECIPE_IDS);
  assert.deepEqual(p.workflow.properties.review.items.enum, V.STAGE_KINDS);
});

test("the assembler's generated files are stable", () => {
  const packs = [{ id: "b-pack", version: "1.0.0", composition: "b" }, { id: "a-pack", version: "2.0.0", composition: "a" }];
  assert.match(packIndexSource(packs), /import \{ composition as pack0 \} from "\.\/a-pack\/index\.tsx";\nimport \{ composition as pack1 \} from "\.\/b-pack\/index\.tsx";/);
  assert.equal(JSON.parse(packListJson(packs))[0].id, "a-pack");
});

test("workflow: every pack names its recipe; stills and the explainer are image-sequence, data pages scene-spec, hermes packs hermes-skill", () => {
  const expected = {
    "ambient-loop": "image-sequence",
    "documentary": "image-sequence",
    "explainer-flat-vector": "image-sequence",
    "horror-narration": "image-sequence",
    "mystery-narration": "image-sequence",
    "story-read-aloud": "image-sequence",
    "travel-documentary": "image-sequence",
    "low-poly-shapes": "image-sequence",
    "full-frame": "image-sequence",
    "blocky-story": "scene-spec",
    "line-graph": "scene-spec",
    "minimal-line-art": "scene-spec",
    "probe-line-graph": "scene-spec",
    "voxel-build": "scene-spec",
  };
  const { packs } = V.validateRepo(ROOT);
  for (const { id } of packs) {
    const s = load(id);
    if (id === "designed-explainer") {
      // html-design is never inferred: a pack runs Hermes-written pages only when it says so.
      assert.equal(s.workflow?.recipe, "html-design", id);
      assert.equal(V.recipeOf({ ...clone(s), workflow: undefined }), "scene-spec", `${id} without workflow would be a plain scene-spec page`);
      continue;
    }
    const want = s.renderer.engine === "hermes" ? "hermes-skill" : expected[id];
    assert.equal(s.workflow?.recipe, want, id);
    // The recipe a pack names is the one its engine and asset model imply, so inference agrees for these packs.
    assert.equal(V.recipeOf({ ...clone(s), workflow: undefined }), want, `${id} inferred`);
  }
  // The two full-project skills make their own voice (their make.sh records with Kokoro and times every shot to it); the quick skills use the run's narration.
  for (const id of packs.map((p) => p.id).filter((i) => load(i).hermes)) {
    const voice = load(id).hermes.voice;
    assert.equal(voice, ["stick-figure", "what-if-3d"].includes(id) ? "skill" : "run", id);
    assert.deepEqual(V.workflowStages(load(id)), voice === "skill" ? ["idea", "research", "script", "skill-brief", "render", "qc"] : ["idea", "research", "script", "skill-brief", "voice", "render", "qc"], id);
  }
  assert.deepEqual(V.workflowStages(load("documentary")), ["idea", "research", "script", "storyboard", "assets", "voice", "render", "qc"]);
  // scene-spec runs see still frames of the page (the preview stage) before the voice and the render.
  assert.deepEqual(V.workflowStages(load("line-graph")), ["idea", "research", "script", "scene-spec", "preview", "voice", "render", "qc"]);
  assert.deepEqual(load("line-graph").workflow.review, ["scene-spec"]);
  assert.deepEqual(V.workflowStages(load("designed-explainer")), ["idea", "research", "script", "html-design", "preview", "voice", "render", "qc"]);
  // The owner checks the plan of a run without pictures every time: the scene spec, the skill brief, or the page and its stills.
  for (const { id } of packs) if (load(id).renderer.engine === "hermes") assert.deepEqual(load(id).workflow.review, id === "designed-explainer" ? ["html-design", "preview"] : ["skill-brief"], id);
});

test("workflow rules: a known, built recipe that fits the engine; review names stages of the pack's own list", () => {
  const stills = load("documentary");
  const graph = load("line-graph");
  const explainer = load("explainer-flat-vector");
  const hermes = load("line-graph-skill");
  const project = load("stick-figure");
  const w = (s, workflow) => ({ ...clone(s), workflow });
  assert.ok(has(V.validateStyle(w(stills, { recipe: "slideshow" })), /workflow.recipe must be one of image-sequence, scene-spec, hermes-skill, html-design, engine-project, clip-sequence/));
  for (const reserved of ["engine-project", "clip-sequence"]) {
    assert.ok(has(V.validateStyle(w(graph, { recipe: reserved })), new RegExp(`workflow.recipe ${reserved} is a reserved name: it is not built yet`)), reserved);
  }
  assert.ok(!has(V.validateStyle(w(graph, { recipe: "html-design", review: ["html-design", "preview"] })), /reserved name/), "html-design is built (owner decision)");
  // scene-spec needs a page that draws the spec: html-capture, or remotion-2d that animates elements.
  assert.ok(has(V.validateStyle(w(stills, { recipe: "scene-spec" })), /scene-spec needs engine html-capture, or remotion-2d with contract.onScreen.elementAnimation true.*; this pack renders with ffmpeg-stills/));
  assert.deepEqual(V.validateStyle(w(explainer, { recipe: "scene-spec" })), [], "remotion-2d with element animation may use scene-spec");
  const still = clone(explainer);
  still.contract.onScreen.elementAnimation = false;
  assert.ok(has(V.validateStyle(w(still, { recipe: "scene-spec" })), /this pack renders with remotion-2d without element animation/));
  // hermes-skill needs engine hermes, and a hermes pack may still run image-sequence (its pictures, as before).
  assert.ok(has(V.validateStyle(w(graph, { recipe: "hermes-skill" })), /hermes-skill needs engine hermes/));
  assert.deepEqual(V.validateStyle(w(load("research-render"), { recipe: "image-sequence" })), []);
  // image-sequence needs a picture-per-shot asset model.
  const noModel = clone(stills);
  noModel.contract.assets.model = "none";
  assert.ok(has(V.validateStyle(w(noModel, { recipe: "image-sequence" })), /image-sequence needs contract.assets.model image-per-shot or plates-and-diagrams/));
  // Overrides: only `review`, naming known stage kinds of this pack's list.
  assert.ok(has(V.validateStyle(w(stills, { recipe: "image-sequence", stages: ["idea"] })), /workflow: unknown field "stages"/));
  assert.ok(has(V.validateStyle(w(stills, { recipe: "image-sequence", review: ["approval"] })), /workflow.review: "approval" is not a stage kind/));
  assert.ok(has(V.validateStyle(w(stills, { recipe: "image-sequence", review: ["scene-spec"] })), /workflow.review: scene-spec is not a stage of this pack's workflow/));
  assert.ok(has(V.validateStyle(w(stills, { recipe: "image-sequence", review: ["assets", "assets"] })), /listed twice/));
  assert.deepEqual(V.validateStyle(w(stills, { recipe: "image-sequence", review: ["assets"] })), []);
  assert.ok(has(V.validateStyle(w(project, { recipe: "hermes-skill", review: ["voice"] })), /voice is not a stage of this pack's workflow/), "a skill that voices itself has no voice stage");
  assert.ok(has(V.validateStyle({ ...clone(stills), workflow: "image-sequence" }), /workflow must be an object naming a recipe/));
  // Without workflow the recipe is inferred, and the pack is still valid.
  const bare = clone(stills);
  delete bare.workflow;
  assert.deepEqual(V.validateStyle(bare), []);
  assert.equal(V.recipeOf(bare), "image-sequence");
  // hermes.voice: run or skill; skill only for a full-project skill.
  assert.ok(has(V.validateStyle({ ...clone(hermes), hermes: { ...hermes.hermes, voice: "skill" } }), /hermes.voice skill needs mode project/));
  assert.ok(has(V.validateStyle({ ...clone(hermes), hermes: { ...hermes.hermes, voice: "both" } }), /hermes.voice must be one of run, skill/));
  assert.ok(has(V.validateStyle({ ...clone(project), workflow: { recipe: "image-sequence" } }), /hermes.voice skill only applies to the hermes-skill recipe/));
  // The reserved recipes name stage kinds that are reserved too, never ones the engine runs.
  for (const id of V.RECIPE_IDS) {
    for (const k of V.RECIPES[id].stages) assert.ok(V.STAGE_KINDS.includes(k) || (!V.RECIPES[id].implemented && V.RESERVED_STAGE_KINDS.includes(k)), `${id}: ${k}`);
  }
  assert.deepEqual(V.IMPLEMENTED_RECIPES, ["image-sequence", "scene-spec", "hermes-skill", "html-design"]);
});

test("html-design: research only, html-capture only, at most trial, the owner reviews the page and its stills, a design brief, research-source or a real ci-render", (t) => {
  const d = load("designed-explainer");
  assert.deepEqual(V.validateStyle(d, { dirName: "designed-explainer" }), []);
  assert.deepEqual(V.validateRepo(scratch(t, ["designed-explainer"])).issues, []);
  assert.deepEqual([d.status, d.renderer.engine, d.renderer.drawsCaptions, d.renderer.minWorkerVersion], ["trial", "html-capture", false, "0.11.0"]);
  // Never above trial, whatever the evidence.
  for (const status of ["proven", "listed"]) {
    const curation = [...d.curation, { date: "2026-11-22", kind: "owner-review", ref: "PR", result: "approved", notes: "" }, { date: "2026-11-22", kind: "trial-run", ref: "run", result: "pass", notes: "" }];
    assert.ok(has(V.validateStyle({ ...clone(d), status, curation }), /workflow.recipe html-design is research only \(owner decision: Hermes writes the page\): the pack can be at most trial, never/), status);
  }
  // html-capture only.
  for (const engine of ["remotion-2d", "ffmpeg-stills", "hermes"]) {
    const s = clone(d);
    s.renderer = { engine, minWorkerVersion: "0.11.0", composition: engine === "remotion-2d" ? "x-y" : null };
    assert.ok(has(V.validateStyle(s), /workflow.recipe html-design needs engine html-capture/), engine);
  }
  // Worker 0.11.0 or later: an older worker would draw the reference page instead of the run's page.
  assert.ok(has(V.validateStyle({ ...clone(d), renderer: { ...d.renderer, minWorkerVersion: "0.10.0" } }), /minWorkerVersion must be 0\.11\.0 or later for html-design/));
  // The owner reviews the page and the stills every time.
  assert.ok(has(V.validateStyle({ ...clone(d), workflow: { recipe: "html-design" } }), /must name html-design and preview.*missing html-design, preview/));
  assert.ok(has(V.validateStyle({ ...clone(d), workflow: { recipe: "html-design", review: ["html-design"] } }), /missing preview/));
  // Evidence: research-source or a real ci-render; neither is refused, nothing is not enough.
  assert.ok(has(V.validateStyle({ ...clone(d), curation: [] }), /html-design pack needs a research-source entry .* or a real ci-render entry/));
  assert.deepEqual(V.validateStyle({ ...clone(d), curation: [{ date: "2026-11-22", kind: "ci-render", ref: "venstudio-styles CI run 1", result: "pass", notes: "" }] }), []);
  assert.deepEqual(V.validateStyle({ ...clone(d), status: "draft", curation: [] }), [], "a draft needs no evidence");
  // The design block: required for html-design, only for html-design, checked.
  const noDesign = clone(d);
  delete noDesign.design;
  assert.ok(has(V.validateStyle(noDesign), /an html-design pack needs a design block/));
  assert.ok(has(V.validateStyle({ ...clone(load("probe-line-graph")), design: clone(d.design) }), /design is the brief Hermes designs each page from; it is only for workflow.recipe html-design/));
  assert.ok(has(V.validateStyle({ ...clone(d), design: { ...d.design, palette: ["red", "#fff"] } }), /design.palette must be 2 to 12 colours/));
  assert.ok(has(V.validateStyle({ ...clone(d), design: { ...d.design, brief: "" } }), /design.brief must say/));
  assert.ok(has(V.validateStyle({ ...clone(d), design: { ...d.design, gsap: true } }), /design: unknown field "gsap"/));
  // GSAP is not vendored into an html-design pack until the owner approves its licence.
  const gsap = scratch(t, ["designed-explainer"], { "designed-explainer": { dir: "hde" } });
  const vendor = path.join(gsap, "packs", "hde", "render", "vendor", "gsap");
  mkdirSync(vendor, { recursive: true });
  writeFileSync(path.join(vendor, "gsap.min.js"), "/* gsap */");
  writeFileSync(path.join(vendor, "LICENSE"), "Standard No-Charge License");
  assert.ok(has(V.validateRepo(gsap).issues, /GSAP is not available to html-design pages until the owner approves its licence/));
  // research-source still never stands in for other packs' CI render.
  assert.ok(has(V.validateStyle({ ...clone(load("probe-line-graph")), curation: [{ date: "2026-11-22", kind: "research-source", ref: "x", result: "pass", notes: "" }] }), /research-source is evidence for hermes packs \(and html-design packs\) only/));
});

test("workflow.skip drops only a stage the recipe calls optional", () => {
  const voxel = load("voxel-build");
  // The 3D page costs seconds per frame to photograph, so this pack runs without the still-frame preview.
  assert.deepEqual(V.workflowStages(voxel), ["idea", "research", "script", "scene-spec", "voice", "render", "qc"]);
  assert.deepEqual(V.validateStyle(voxel), []);
  // A pack that skips a stage its recipe needs is refused by name.
  assert.ok(
    has(V.validateStyle({ ...clone(voxel), workflow: { recipe: "scene-spec", skip: ["qc"] } }), /workflow\.skip: qc is not optional in scene-spec/),
  );
  // Skipping and reviewing the same stage is a contradiction.
  assert.ok(
    has(
      V.validateStyle({ ...clone(voxel), workflow: { recipe: "scene-spec", review: ["preview"], skip: ["preview"] } }),
      /workflow\.skip: preview is also in workflow\.review/,
    ),
  );
  // The preview stays for every pack that does not ask to drop it.
  assert.ok(V.workflowStages(load("line-graph")).includes("preview"));
  assert.deepEqual(V.workflowStages({ ...clone(voxel), workflow: undefined, renderer: voxel.renderer }), [
    "idea",
    "research",
    "script",
    "scene-spec",
    "preview",
    "voice",
    "render",
    "qc",
  ]);
});
test("contract.story: the words a look understands, and only well-formed ones", () => {
  const voxel = load("voxel-build");
  // The shipped village: eight structures, three things a shot can do to one, two things the camera can hold.
  assert.deepEqual(Object.keys(voxel.contract.story), ["structure", "action", "focus"]);
  assert.deepEqual(voxel.contract.story.action, ["build", "damage", "idle"]);
  assert.deepEqual(V.validateStyle(voxel), []);
  const story = (v) => V.validateStyle({ ...clone(voxel), contract: { ...voxel.contract, story: v } });
  assert.ok(has(story({ structure: [] }), /contract\.story\.structure must be a list of 1\.\.24 values/));
  assert.ok(has(story({ structure: ["Church"] }), /contract\.story\.structure: "Church" is not a value/));
  assert.ok(has(story({ structure: ["church", "church"] }), /contract\.story\.structure: "church" is listed twice/));
  assert.ok(has(story({ Structure: ["church"] }), /contract\.story: "Structure" is not a slot name/));
  assert.ok(has(story({}), /contract\.story must declare 1\.\.12 slots, not 0/));
  assert.ok(has(story("church"), /contract\.story must be an object of slot -> list of values/));
  // A slot a pack invents is fine: that is the point of a vocabulary rather than a fixed schema.
  assert.deepEqual(story({ chart: ["line", "bar"], palette: ["warm", "cold"] }), []);
});
