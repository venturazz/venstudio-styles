#!/usr/bin/env node
/**
 * Skills: the agent skills a video style is made with, kept here so this repo is the source of truth for every video
 * style, the skill included (skills/README.md). Zero dependencies, like validate.mjs.
 *
 *   skills/curated/<id>/     a skill the owner or Hermes approved (a curation entry says who and why)
 *   skills/candidate/<id>/   a skill imported but not curated yet
 *   skills/kits/<id>/        a shared kit several skills use (the upstream repo's kit/ folder)
 *
 * Each skill and kit folder holds a manifest (skill.json or kit.json) and the files exactly as they are upstream, in
 * files/. The manifest pins the source (repository, commit, path, licence) and the sha256 of every file, so a change is
 * always visible in review.
 *
 *   node tools/skills.mjs                 validate skills/ against packs/
 *   node tools/skills.mjs --digest <dir>  print the files map of <dir>/files, to paste into its manifest
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, lstatSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SKILL_STATUSES = ["candidate", "curated"];
export const CURATION_BY = ["owner", "hermes"];
export const CURATION_RESULTS = ["approved", "rejected"];
const ID_RE = /^[a-z0-9][a-z0-9-]{1,62}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const COMMIT_RE = /^[0-9a-f]{40}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const REL_RE = /^[A-Za-z0-9._@+-]+(\/[A-Za-z0-9._@+-]+)*$/;
const REQUIRE_TOOLS = ["ffmpeg", "node", "npm", "python3", "chromium"];
/** A skill folder this large is a mistake (a render left in it); the largest today is about 2.3 MB. */
export const MAX_FOLDER_BYTES = 20 * 1024 * 1024;

const isRecord = (v) => typeof v === "object" && v !== null && !Array.isArray(v);

function checkKeys(obj, allowed, at, issues) {
  for (const k of Object.keys(obj)) if (!allowed.includes(k)) issues.push(`${at}: unknown key "${k}"`);
}

/** Every regular file under dir, relative, sorted, with its sha256. Links and odd names are reported. */
export function folderFiles(dir) {
  const files = {};
  const problems = [];
  let bytes = 0;
  const walk = (d, rel) => {
    for (const name of readdirSync(d).sort()) {
      const full = path.join(d, name);
      const r = rel ? `${rel}/${name}` : name;
      const info = lstatSync(full);
      if (info.isSymbolicLink()) problems.push(`${r} is a symbolic link; skills hold plain files only`);
      else if (info.isDirectory()) walk(full, r);
      else if (info.isFile()) {
        if (!REL_RE.test(r)) problems.push(`${r}: file names are letters, digits and . _ @ + - only`);
        const data = readFileSync(full);
        bytes += data.length;
        files[r] = createHash("sha256").update(data).digest("hex");
      } else problems.push(`${r} is not a regular file`);
    }
  };
  if (existsSync(dir)) walk(dir, "");
  return { files, bytes, problems };
}

/** The YAML front matter `name:` of a SKILL.md, or null. */
export function skillMdName(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return null;
  const line = m[1].split(/\r?\n/).find((l) => /^name:\s*/.test(l));
  return line ? line.replace(/^name:\s*/, "").trim().replace(/^["']|["']$/g, "") : null;
}

function validateSource(s, at, issues) {
  if (!isRecord(s)) return issues.push(`${at}.source must be an object { repo, commit, path, licence, copyright }`);
  checkKeys(s, ["repo", "commit", "path", "licence", "copyright"], `${at}.source`, issues);
  if (typeof s.repo !== "string" || !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(s.repo)) issues.push(`${at}.source.repo must be https://github.com/<owner>/<repo>`);
  if (typeof s.commit !== "string" || !COMMIT_RE.test(s.commit)) issues.push(`${at}.source.commit must be the full 40-character commit the files come from`);
  if (typeof s.path !== "string" || !REL_RE.test(s.path)) issues.push(`${at}.source.path must be the folder's path in that repository`);
  if (typeof s.licence !== "string" || !s.licence.trim()) issues.push(`${at}.source.licence is required (for example MIT)`);
  if (typeof s.copyright !== "string" || !s.copyright.trim()) issues.push(`${at}.source.copyright is required (the line from the upstream LICENSE)`);
}

function validateFilesMap(manifest, dir, at, issues) {
  const actual = folderFiles(path.join(dir, "files"));
  for (const p of actual.problems) issues.push(`${at}/files/${p}`);
  if (actual.bytes > MAX_FOLDER_BYTES) issues.push(`${at}/files holds ${actual.bytes} bytes; the limit is ${MAX_FOLDER_BYTES}`);
  if (!isRecord(manifest.files)) {
    issues.push(`${at}: "files" must map every file in files/ to its sha256 (node tools/skills.mjs --digest ${at})`);
    return actual;
  }
  for (const [rel, sum] of Object.entries(manifest.files)) {
    if (typeof sum !== "string" || !SHA256_RE.test(sum)) issues.push(`${at}: files["${rel}"] must be a lowercase sha256`);
    else if (!(rel in actual.files)) issues.push(`${at}: files["${rel}"] is listed but missing from files/`);
    else if (actual.files[rel] !== sum) issues.push(`${at}: files/${rel} does not match its sha256 in the manifest (a changed file needs its new hash, and a version bump)`);
  }
  for (const rel of Object.keys(actual.files)) if (!(rel in manifest.files)) issues.push(`${at}: files/${rel} is not listed in the manifest`);
  return actual;
}

/** Validates skills/kits/<dir>. */
export function validateKitDir(dir) {
  const id = path.basename(dir);
  const at = `skills/kits/${id}`;
  const issues = [];
  let kit;
  try {
    kit = JSON.parse(readFileSync(path.join(dir, "kit.json"), "utf8"));
  } catch (err) {
    return { id, issues: [`${at}/kit.json is missing or not JSON (${err.message})`] };
  }
  if (!isRecord(kit)) return { id, issues: [`${at}/kit.json must be an object`] };
  checkKeys(kit, ["format", "id", "version", "description", "source", "requires", "setup", "files"], at, issues);
  if (kit.format !== 1) issues.push(`${at}: format must be 1`);
  if (kit.id !== id) issues.push(`${at}: id must be the folder name "${id}"`);
  if (typeof kit.version !== "string" || !/^\d+\.\d+\.\d+$/.test(kit.version)) issues.push(`${at}: version must be semver`);
  if (typeof kit.description !== "string" || !kit.description.trim()) issues.push(`${at}: description is required`);
  validateSource(kit.source, at, issues);
  validateRequires(kit.requires, at, issues);
  if (!isRecord(kit.setup)) issues.push(`${at}: setup must describe what the kit installs { notes, downloads }`);
  validateFilesMap(kit, dir, at, issues);
  if (!existsSync(path.join(dir, "LICENSE"))) issues.push(`${at}: LICENSE (the upstream licence text) is missing`);
  return { id, version: kit.version, issues };
}

function validateRequires(r, at, issues) {
  if (!Array.isArray(r)) return issues.push(`${at}: requires must list what the machine needs (${REQUIRE_TOOLS.join(", ")})`);
  for (const t of r) if (!REQUIRE_TOOLS.includes(t)) issues.push(`${at}: requires names "${t}"; known tools are ${REQUIRE_TOOLS.join(", ")}`);
}

/** Validates skills/<status>/<dir>. `kits` are the kit ids that exist. */
export function validateSkillDir(dir, { status, kits = new Set() } = {}) {
  const id = path.basename(dir);
  const at = `skills/${status}/${id}`;
  const issues = [];
  let skill;
  try {
    skill = JSON.parse(readFileSync(path.join(dir, "skill.json"), "utf8"));
  } catch (err) {
    return { id, aliases: [], issues: [`${at}/skill.json is missing or not JSON (${err.message})`] };
  }
  if (!isRecord(skill)) return { id, aliases: [], issues: [`${at}/skill.json must be an object`] };
  checkKeys(skill, ["format", "id", "name", "version", "status", "aliases", "description", "source", "kit", "entry", "requires", "packs", "curation", "notes", "files"], at, issues);
  if (skill.format !== 1) issues.push(`${at}: format must be 1`);
  if (skill.id !== id || !ID_RE.test(id)) issues.push(`${at}: id must be the folder name "${id}" (lowercase letters, digits, dashes)`);
  if (skill.name !== `/${id}`) issues.push(`${at}: name must be "/${id}", the command the agent runs`);
  if (typeof skill.version !== "string" || !/^\d+\.\d+\.\d+$/.test(skill.version)) issues.push(`${at}: version must be semver (bump it with every change)`);
  if (skill.status !== status) issues.push(`${at}: status "${skill.status}" does not match its folder skills/${status}/ (move the folder to change the status)`);
  const aliases = Array.isArray(skill.aliases) ? skill.aliases : [];
  if (skill.aliases !== undefined && (!Array.isArray(skill.aliases) || !aliases.every((a) => typeof a === "string" && /^\/[a-z0-9][a-z0-9-]{1,62}$/.test(a)))) issues.push(`${at}: aliases must be a list of "/name" commands`);
  if (typeof skill.description !== "string" || !skill.description.trim()) issues.push(`${at}: description is required`);
  validateSource(skill.source, at, issues);
  if (skill.kit !== undefined && skill.kit !== null && !kits.has(skill.kit)) issues.push(`${at}: kit "${skill.kit}" is not in skills/kits/`);
  if (skill.entry !== "SKILL.md") issues.push(`${at}: entry must be "SKILL.md"`);
  validateRequires(skill.requires, at, issues);
  if (!Array.isArray(skill.packs) || !skill.packs.every((p) => typeof p === "string" && ID_RE.test(p))) issues.push(`${at}: packs must list the pack ids made with this skill (may be empty)`);
  const curation = Array.isArray(skill.curation) ? skill.curation : [];
  if (!Array.isArray(skill.curation)) issues.push(`${at}: curation must be a list (empty for a candidate)`);
  curation.forEach((c, i) => {
    const cat = `${at}: curation[${i}]`;
    if (!isRecord(c)) return issues.push(`${cat} must be an object { by, result, date, notes }`);
    checkKeys(c, ["by", "result", "date", "version", "notes"], cat, issues);
    if (!CURATION_BY.includes(c.by)) issues.push(`${cat}.by must be one of ${CURATION_BY.join(", ")}`);
    if (!CURATION_RESULTS.includes(c.result)) issues.push(`${cat}.result must be one of ${CURATION_RESULTS.join(", ")}`);
    if (typeof c.date !== "string" || !DATE_RE.test(c.date)) issues.push(`${cat}.date must be YYYY-MM-DD`);
    if (typeof c.notes !== "string" || !c.notes.trim()) issues.push(`${cat}.notes must say what was checked`);
  });
  // The newest decision decides: a curated skill's last entry approves the version in this folder.
  const last = curation[curation.length - 1];
  if (status === "curated" && !(isRecord(last) && last.result === "approved" && last.version === skill.version)) {
    issues.push(`${at}: a curated skill needs a last curation entry by owner or hermes with result "approved" and version "${skill.version}"`);
  }
  const files = validateFilesMap(skill, dir, at, issues);
  const md = path.join(dir, "files", "SKILL.md");
  if (!existsSync(md)) issues.push(`${at}: files/SKILL.md is missing`);
  else {
    const name = skillMdName(readFileSync(md, "utf8"));
    if (name !== id) issues.push(`${at}: files/SKILL.md front matter says name "${name ?? "(none)"}"; expected "${id}"`);
  }
  return { id, version: skill.version, status, aliases, packs: Array.isArray(skill.packs) ? skill.packs : [], files: files.files, issues };
}

function subdirs(d) {
  return existsSync(d)
    ? readdirSync(d)
        .filter((n) => !n.startsWith(".") && statSync(path.join(d, n)).isDirectory())
        .sort()
    : [];
}

/**
 * Validates skills/ and its links to packs/: every hermes pack names a skill (or an alias) that is here, every pack a
 * skill lists exists and names that skill, and no skill id or alias is used twice.
 */
export function validateSkills(root) {
  const issues = [];
  const base = path.join(root, "skills");
  if (!existsSync(base)) return { skills: [], kits: [], issues: ["skills/ is missing"] };
  for (const n of subdirs(base)) if (![...SKILL_STATUSES, "kits"].includes(n)) issues.push(`skills/${n}/ is not a known folder (curated, candidate, kits)`);
  const kits = subdirs(path.join(base, "kits")).map((d) => validateKitDir(path.join(base, "kits", d)));
  const kitIds = new Set(kits.map((k) => k.id));
  const skills = SKILL_STATUSES.flatMap((status) => subdirs(path.join(base, status)).map((d) => validateSkillDir(path.join(base, status, d), { status, kits: kitIds })));
  for (const k of kits) issues.push(...k.issues);
  for (const s of skills) issues.push(...s.issues);
  const names = new Map();
  for (const s of skills) {
    for (const n of [`/${s.id}`, ...s.aliases]) {
      if (names.has(n)) issues.push(`skill command ${n} is used by ${names.get(n)} and skills/${s.status}/${s.id}`);
      else names.set(n, `skills/${s.status}/${s.id}`);
    }
  }
  const packsDir = path.join(root, "packs");
  const packSkill = new Map();
  for (const d of subdirs(packsDir)) {
    try {
      const style = JSON.parse(readFileSync(path.join(packsDir, d, "style.json"), "utf8"));
      if (isRecord(style.hermes) && typeof style.hermes.skill === "string") {
        packSkill.set(d, [style.hermes.skill, ...(Array.isArray(style.hermes.aliases) ? style.hermes.aliases : [])]);
      }
    } catch {
      // validate.mjs reports an unreadable style.json.
    }
  }
  for (const [pack, cmds] of packSkill) {
    if (!names.has(cmds[0])) issues.push(`packs/${pack}: hermes.skill ${cmds[0]} is not in skills/ (import it as a candidate first)`);
  }
  for (const s of skills) {
    for (const p of s.packs ?? []) {
      const cmds = packSkill.get(p);
      if (!cmds) issues.push(`skills/${s.status}/${s.id}: packs names "${p}", which is not a hermes pack here`);
      else if (!cmds.includes(`/${s.id}`) && !s.aliases.some((a) => cmds.includes(a))) issues.push(`skills/${s.status}/${s.id}: packs names "${p}", but that pack's hermes.skill is ${cmds[0]}`);
    }
  }
  return { skills, kits, issues };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args[0] === "--digest") {
    const { files, problems } = folderFiles(path.join(path.resolve(args[1] ?? "."), "files"));
    for (const p of problems) console.error(`- ${p}`);
    console.log(JSON.stringify(files, null, 2));
    process.exit(problems.length > 0 ? 1 : 0);
  }
  const root = path.resolve(args[0] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
  const { skills, kits, issues } = validateSkills(root);
  for (const k of kits) console.log(`${k.issues.length === 0 ? "ok  " : "FAIL"} kit ${k.id}@${k.version ?? "?"}`);
  for (const s of skills) console.log(`${s.issues.length === 0 ? "ok  " : "FAIL"} ${s.status} /${s.id}@${s.version ?? "?"} (${Object.keys(s.files ?? {}).length} files)`);
  if (issues.length > 0) {
    for (const i of issues) console.error(`- ${i}`);
    process.exit(1);
  }
}
