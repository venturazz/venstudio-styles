import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync, symlinkSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as S from "./skills.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** A copy of skills/ and packs/ to break on purpose. */
function scratch(t) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "vs-skills-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  cpSync(path.join(ROOT, "skills"), path.join(dir, "skills"), { recursive: true });
  cpSync(path.join(ROOT, "packs"), path.join(dir, "packs"), { recursive: true });
  return dir;
}
const edit = (file, fn) => writeFileSync(file, JSON.stringify(fn(JSON.parse(readFileSync(file, "utf8"))), null, 2));
const has = (issues, re) => issues.some((i) => re.test(i));

test("every skill and kit in this repo is valid, and every hermes pack's skill is here", () => {
  const { skills, kits, issues } = S.validateSkills(ROOT);
  assert.deepEqual(issues, []);
  assert.deepEqual(kits.map((k) => k.id), ["claude-animation-skills"]);
  assert.deepEqual(
    skills.map((s) => `${s.status}/${s.id}`),
    ["breakdown", "dan-koe", "graph", "kurzgesagt", "low-poly", "map-route", "minecraft", "minimalistic-graphics", "stick-figure", "zach-3d-films", "zach-d-films"].map((id) => `candidate/${id}`),
  );
});

test("SKILL.md front matter name", () => {
  assert.equal(S.skillMdName("---\nname: stick-figure\ndescription: x\n---\n# hi"), "stick-figure");
  assert.equal(S.skillMdName('---\nname: "graph"\n---'), "graph");
  assert.equal(S.skillMdName("# no front matter"), null);
});

test("a changed, added or missing file is caught by its sha256", (t) => {
  const dir = scratch(t);
  const sf = path.join(dir, "skills/candidate/stick-figure");
  writeFileSync(path.join(sf, "files/engine/make.sh"), "#!/bin/sh\necho changed\n");
  writeFileSync(path.join(sf, "files/extra.txt"), "x");
  rmSync(path.join(sf, "files/engine/tools/align.py"));
  const { issues } = S.validateSkills(dir);
  assert.ok(has(issues, /files\/engine\/make\.sh does not match its sha256/));
  assert.ok(has(issues, /files\/extra\.txt is not listed/));
  assert.ok(has(issues, /engine\/tools\/align\.py"\] is listed but missing/));
});

test("links are refused", (t) => {
  const dir = scratch(t);
  symlinkSync("/etc/passwd", path.join(dir, "skills/candidate/graph/files/link"));
  assert.ok(has(S.validateSkills(dir).issues, /link is a symbolic link/));
});

test("the folder is the status: curated needs an approving entry for this version by owner or hermes", (t) => {
  const dir = scratch(t);
  mkdirSync(path.join(dir, "skills/curated"), { recursive: true });
  renameSync(path.join(dir, "skills/candidate/graph"), path.join(dir, "skills/curated/graph"));
  const file = path.join(dir, "skills/curated/graph/skill.json");
  assert.ok(has(S.validateSkills(dir).issues, /status "candidate" does not match its folder skills\/curated/));
  edit(file, (s) => ({ ...s, status: "curated" }));
  assert.ok(has(S.validateSkills(dir).issues, /a curated skill needs a last curation entry/));
  edit(file, (s) => ({ ...s, curation: [{ by: "kiro", result: "approved", date: "2026-11-23", version: "1.0.0", notes: "x" }] }));
  assert.ok(has(S.validateSkills(dir).issues, /by must be one of owner, hermes/));
  edit(file, (s) => ({ ...s, curation: [{ by: "hermes", result: "approved", date: "2026-11-23", version: "0.9.0", notes: "Rendered the fixture." }] }));
  assert.ok(has(S.validateSkills(dir).issues, /a curated skill needs a last curation entry/));
  edit(file, (s) => ({ ...s, curation: [{ by: "hermes", result: "approved", date: "2026-11-23", version: "1.0.0", notes: "Rendered three trials; the owner liked them." }] }));
  assert.deepEqual(S.validateSkills(dir).issues, []);
  // A later rejection takes it out of curated.
  edit(file, (s) => ({ ...s, curation: [...s.curation, { by: "owner", result: "rejected", date: "2026-11-24", version: "1.0.0", notes: "Captions unreadable." }] }));
  assert.ok(has(S.validateSkills(dir).issues, /a curated skill needs a last curation entry/));
});

test("a skill id may live in one folder only, and a pack must name a skill that is here", (t) => {
  const dir = scratch(t);
  mkdirSync(path.join(dir, "skills/curated"), { recursive: true });
  cpSync(path.join(dir, "skills/candidate/graph"), path.join(dir, "skills/curated/graph"), { recursive: true });
  assert.ok(has(S.validateSkills(dir).issues, /skill command \/graph is used by/));
  const dir2 = scratch(t);
  rmSync(path.join(dir2, "skills/candidate/minecraft"), { recursive: true });
  assert.ok(has(S.validateSkills(dir2).issues, /packs\/voxel-build-skill: hermes\.skill \/minecraft is not in skills\//));
});

test("a skill's packs must exist and name it; its kit must exist", (t) => {
  const dir = scratch(t);
  const file = path.join(dir, "skills/candidate/dan-koe/skill.json");
  edit(file, (s) => ({ ...s, packs: ["line-graph-skill", "no-such-pack"], kit: "nope" }));
  const { issues } = S.validateSkills(dir);
  assert.ok(has(issues, /packs names "line-graph-skill", but that pack's hermes\.skill is \/graph/));
  assert.ok(has(issues, /packs names "no-such-pack", which is not a hermes pack here/));
  assert.ok(has(issues, /kit "nope" is not in skills\/kits/));
});

test("unknown folders and keys are refused", (t) => {
  const dir = scratch(t);
  mkdirSync(path.join(dir, "skills/maybe"));
  edit(path.join(dir, "skills/candidate/graph/skill.json"), (s) => ({ ...s, run: "rm -rf /" }));
  const { issues } = S.validateSkills(dir);
  assert.ok(has(issues, /skills\/maybe\/ is not a known folder/));
  assert.ok(has(issues, /unknown key "run"/));
});
