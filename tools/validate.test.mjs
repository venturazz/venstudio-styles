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
    "animated-line-graph",
    "documentary-stills",
    "explainer-flat-vector",
    "hermes-breakdown",
    "hermes-dan-koe",
    "hermes-graph",
    "hermes-kurzgesagt",
    "hermes-low-poly",
    "hermes-map-route",
    "hermes-minecraft",
    "hermes-minimalistic-graphics",
    "hermes-research-explainer",
    "hermes-stick-figure",
    "hermes-zach-d-films",
    "horror-story",
    "minimal-line-art",
    "mystery-narration",
    "probe-line-graph",
    "story-read-aloud",
    "travel-documentary",
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
  assert.ok(has(V.validateStyle({ ...clone(load("documentary-stills")), renderer: { ...load("documentary-stills").renderer, drawsCaptions: true } }), /only for html-capture/));

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
  const h = load("hermes-research-explainer");
  assert.deepEqual(V.validateStyle(h, { dirName: "hermes-research-explainer" }), []);
  for (const status of ["proven", "listed"]) {
    const s = { ...clone(h), status, curation: [{ date: "2026-11-21", kind: "owner-review", ref: "PR", result: "approved", notes: "" }, { date: "2026-11-21", kind: "trial-run", ref: "run", result: "pass", notes: "" }] };
    assert.ok(has(V.validateStyle(s), /research only \(owner decision\): the pack can be at most trial, never/), status);
  }
  assert.deepEqual(V.validateStyle({ ...clone(h), status: "lab" }), [], "lab without a ci-render entry: there is no Hermes in CI");
  assert.ok(has(V.validateStyle({ ...clone(load("probe-line-graph")), curation: [] }), /needs a passing ci-render entry/), "html-capture still needs its CI render");
});

const RESEARCH = { date: "2026-11-22", kind: "research-source", ref: "https://github.com/artemnovitckii/claude-animation-skills@86f7010 (skills/graph); owner report: works in Hermes", result: "pass", notes: "" };

test("research-source: accepted for a hermes pack at lab or trial, required there, never for other engines, never above trial", () => {
  const g = load("hermes-graph");
  assert.deepEqual(V.validateStyle(g, { dirName: "hermes-graph" }), []);
  for (const status of ["lab", "trial"]) {
    assert.deepEqual(V.validateStyle({ ...clone(g), status, curation: [RESEARCH] }), [], status);
    assert.ok(has(V.validateStyle({ ...clone(g), status, curation: [] }), /hermes pack needs a research-source entry with result "pass"/), `${status} without evidence`);
    assert.ok(has(V.validateStyle({ ...clone(g), status, curation: [{ ...RESEARCH, result: "note" }] }), /needs a research-source entry/), `${status} with a note only`);
  }
  assert.deepEqual(V.validateStyle({ ...clone(g), status: "draft", curation: [] }), [], "a hermes draft needs no evidence");
  // Never above trial, research-source or not.
  for (const status of ["proven", "listed"]) {
    const curation = [RESEARCH, { date: "2026-11-22", kind: "owner-review", ref: "PR", result: "approved", notes: "" }, { date: "2026-11-22", kind: "trial-run", ref: "run", result: "pass", notes: "" }];
    assert.ok(has(V.validateStyle({ ...clone(g), status, curation }), /can be at most trial, never/), status);
  }
  // Another engine: research-source is refused, and it never stands in for the CI render.
  const html = load("animated-line-graph");
  const asHtml = { ...clone(html), status: "trial", curation: [RESEARCH] };
  assert.ok(has(V.validateStyle(asHtml), /needs a passing ci-render entry/), "html-capture at trial with only research-source");
  assert.ok(has(V.validateStyle(asHtml), /research-source is evidence for hermes packs only/));
  assert.ok(has(V.validateStyle({ ...clone(load("documentary-stills")), curation: [...load("documentary-stills").curation, RESEARCH] }), /research-source is evidence for hermes packs only/), "even beside a real ci-render");
  assert.ok(has(V.validateStyle({ ...clone(html), status: "draft", curation: [RESEARCH] }), /research-source is evidence for hermes packs only/), "even on a draft");
});

test("the hermes block: only on hermes packs, a skill name, a mode, how the plan maps to the input; project skills say how the narration is used", (t) => {
  const g = load("hermes-graph");
  assert.equal(g.hermes.skill, "/graph");
  assert.ok(has(V.validateStyle({ ...clone(load("animated-line-graph")), hermes: clone(g.hermes) }), /hermes names the Hermes skill of a hermes pack/));
  assert.ok(has(V.validateStyle({ ...clone(g), hermes: { ...g.hermes, skill: "graph" } }), /hermes.skill must be a Hermes skill as invoked/));
  assert.ok(has(V.validateStyle({ ...clone(g), hermes: { ...g.hermes, mode: "quick" } }), /hermes.mode must be one of spec, project/));
  assert.ok(has(V.validateStyle({ ...clone(g), hermes: { ...g.hermes, input: "" } }), /hermes.input must say/));
  assert.ok(has(V.validateStyle({ ...clone(g), hermes: { ...g.hermes, colour: 1 } }), /hermes: unknown field "colour"/));
  assert.ok(has(V.validateStyle({ ...clone(g), hermes: { ...g.hermes, aliases: ["/graph"] } }), /must not repeat the skill/));
  const z = load("hermes-zach-d-films");
  assert.deepEqual([z.hermes.skill, z.hermes.aliases, z.hermes.mode], ["/zach-d-films", ["/zach-3d-films"], "project"]);
  assert.ok(has(V.validateStyle({ ...clone(z), hermes: { ...z.hermes, input: "Make the reel from the storyboard." } }), /project skill must say how the run's narration and captions are used/));
  assert.deepEqual(V.validateStyle({ ...clone(load("hermes-research-explainer")) }), [], "the block is optional: the generic Hermes render names no skill");
  // variantOf must name a pack in the repo.
  const dir = scratch(t, ["hermes-graph"]);
  assert.ok(has(V.validateRepo(dir).issues, /hermes.variantOf names "animated-line-graph", which is not a pack here/));
  assert.deepEqual(V.validateRepo(scratch(t, ["hermes-graph", "animated-line-graph"])).issues, []);
});

test("one research pack per claude-animation-skills skill, pinned, credited and licensed; the alias is the same pack", () => {
  const SKILLS = ["breakdown", "dan-koe", "graph", "kurzgesagt", "low-poly", "map-route", "minecraft", "minimalistic-graphics", "stick-figure", "zach-d-films"];
  for (const skill of SKILLS) {
    const id = `hermes-${skill}`;
    const s = load(id);
    assert.deepEqual([s.status, s.renderer.engine, s.hermes.skill], ["trial", "hermes", `/${skill}`], id);
    assert.equal(s.hermes.mode, skill === "stick-figure" || skill === "zach-d-films" ? "project" : "spec", id);
    const src = s.provenance.find((p) => p.type === "skill");
    assert.ok(src && src.ref.startsWith("https://github.com/artemnovitckii/claude-animation-skills@86f70106c9aeae1334184467da5776c533ada3bc"), id);
    assert.match(src.licence, /^MIT, Copyright \(c\) 2026 Artem Novitckii.*SIL Open Font License/, id);
    assert.ok(s.curation.some((e) => e.kind === "research-source" && e.result === "pass" && /owner report: installed in Hermes and working/.test(e.ref)), id);
    assert.ok(!s.curation.some((e) => e.kind === "ci-render"), `${id} claims no CI render`);
    assert.match(readFileSync(path.join(ROOT, "packs", id, "README.md"), "utf8"), /by\n?\s*\[Artem Novitckii\]/, `${id} credits the author`);
  }
  assert.ok(!SKILLS.includes("zach-3d-films"));
  assert.deepEqual(load("hermes-zach-d-films").hermes.aliases, ["/zach-3d-films"]);
  assert.deepEqual(load("hermes-graph").hermes.variantOf, ["animated-line-graph"]);
  assert.deepEqual(load("hermes-minimalistic-graphics").hermes.variantOf, ["minimal-line-art"]);
});

test("renderDigest is packDigest over render/ without the prefix, as a worker hashes html/<id>/", () => {
  const files = { "style.json": "a".repeat(64), "render/index.html": "b".repeat(64), "render/vendor/x/LICENSE": "c".repeat(64) };
  assert.equal(V.renderDigest(files), V.packDigest({ "index.html": "b".repeat(64), "vendor/x/LICENSE": "c".repeat(64) }));
  assert.equal(V.compareVersions("0.10.0", "0.9.0"), 1);
  assert.equal(V.compareVersions("0.9", "0.9.0"), 0);
});

test("a valid pack has no issues, and so does its copy in a fresh repo", (t) => {
  assert.deepEqual(V.validateStyle(load("documentary-stills"), { dirName: "documentary-stills" }), []);
  const dir = scratch(t, ["explainer-flat-vector"]);
  assert.deepEqual(V.validateRepo(dir).issues, []);
});

test("every required top-level field is required", () => {
  const good = load("explainer-flat-vector");
  for (const k of Object.keys(good)) {
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
  const s = load("horror-story");
  assert.ok(has(V.validateStyle({ ...s, status: "beta" }), /status must be one of/));
  assert.ok(has(V.validateStyle({ ...s, version: "1.0" }), /semver/));
  assert.ok(has(V.validateStyle(s, { dirName: "other" }), /must equal the pack directory name/));
});

test("bad renderer: unknown engine, missing or stray composition, an engine no worker runs past draft", () => {
  const stills = load("documentary-stills");
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
  const dir = scratch(t, ["documentary-stills", "horror-story"], { "horror-story": { dir: "horror-copy", style: (s) => ({ ...s, id: "documentary-stills" }) } });
  const { issues } = V.validateRepo(dir);
  assert.ok(has(issues, /duplicate pack id "documentary-stills"/), issues.join("\n"));
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
  assert.deepEqual(schema.required.sort(), Object.keys(load("documentary-stills")).sort());
  assert.deepEqual(p.hermes.properties.mode.enum, V.HERMES_MODES);
});

test("the assembler's generated files are stable", () => {
  const packs = [{ id: "b-pack", version: "1.0.0", composition: "b" }, { id: "a-pack", version: "2.0.0", composition: "a" }];
  assert.match(packIndexSource(packs), /import \{ composition as pack0 \} from "\.\/a-pack\/index\.tsx";\nimport \{ composition as pack1 \} from "\.\/b-pack\/index\.tsx";/);
  assert.equal(JSON.parse(packListJson(packs))[0].id, "a-pack");
});
