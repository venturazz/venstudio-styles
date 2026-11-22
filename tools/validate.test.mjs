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
  assert.deepEqual(packs.map((p) => p.id), ["ambient-loop", "documentary-stills", "explainer-flat-vector", "horror-story", "mystery-narration", "story-read-aloud", "travel-documentary"]);
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
});

test("the assembler's generated files are stable", () => {
  const packs = [{ id: "b-pack", version: "1.0.0", composition: "b" }, { id: "a-pack", version: "2.0.0", composition: "a" }];
  assert.match(packIndexSource(packs), /import \{ composition as pack0 \} from "\.\/a-pack\/index\.tsx";\nimport \{ composition as pack1 \} from "\.\/b-pack\/index\.tsx";/);
  assert.equal(JSON.parse(packListJson(packs))[0].id, "a-pack");
});
