// Environment recipes (FORMAT.md "Environments"): every rule the validator applies. node --test "tools/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as V from "./validate.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PACK = "low-poly-shapes";
const load = (id = PACK) => JSON.parse(readFileSync(path.join(ROOT, "packs", id, "style.json"), "utf8"));
const clone = (v) => JSON.parse(JSON.stringify(v));
const has = (issues, re) => issues.some((i) => re.test(i));
const lockFiles = () => ({
  "env/package.json": readFileSync(path.join(ROOT, "packs", PACK, "env/package.json"), "utf8"),
  "env/package-lock.json": readFileSync(path.join(ROOT, "packs", PACK, "env/package-lock.json"), "utf8"),
});
/** Issues of the proof pack's environment after `edit` changes a copy of it. */
function envIssues(edit, files = lockFiles()) {
  const env = clone(load().environment);
  edit(env);
  return V.validateEnvironment(env, { files });
}
const step = (env, kind) => env.steps.find((s) => s[kind])[kind];

test("the proof pack's environment is valid, and engine command needs one", () => {
  assert.deepEqual(envIssues(() => {}), []);
  const s = load();
  assert.deepEqual(V.validateStyle(s, { dirName: PACK, files: lockFiles() }), []);
  const { environment, ...bare } = s;
  void environment;
  assert.ok(has(V.validateStyle(bare), /engine command needs an environment/));
  assert.ok(has(V.validateStyle({ ...s, environment: { ...s.environment, render: undefined } }), /environment\.render is required for engine command/));
  assert.ok(has(V.validateStyle({ ...s, renderer: { ...s.renderer, minWorkerVersion: "0.11.0" } }), /0\.12\.0 or later for a pack with an environment/));
});

test("downloads: https only, an exact host from the list, no credentials or port", () => {
  assert.ok(has(envIssues((e) => (step(e, "download").url = "http://github.com/x.tar.gz")), /url must be https/));
  assert.ok(has(envIssues((e) => (step(e, "download").url = "https://evil.example.com/resvg.tar.gz")), /host evil\.example\.com is not in environment\.hosts/));
  assert.ok(has(envIssues((e) => (step(e, "download").url = "https://user:pw@github.com/x")), /must not carry credentials/));
  assert.ok(has(envIssues((e) => (step(e, "download").url = "https://github.com:8443/x")), /default https port/));
  assert.ok(has(envIssues((e) => (e.hosts = ["*.github.com"])), /exact host names/));
  assert.ok(has(envIssues((e) => (e.hosts = ["github.com", "github.com"])), /exact host names/));
});

test("downloads: sha256 and the exact size are required, within the caps", () => {
  assert.ok(has(envIssues((e) => delete step(e, "download").sha256), /sha256 is required/));
  assert.ok(has(envIssues((e) => (step(e, "download").sha256 = "ABC")), /sha256 is required/));
  assert.ok(has(envIssues((e) => (step(e, "download").sha256 = "0".repeat(63))), /sha256 is required/));
  assert.ok(has(envIssues((e) => delete step(e, "download").bytes), /exact size in bytes/));
  assert.ok(has(envIssues((e) => (step(e, "download").bytes = V.ENV_LIMITS.downloadBytes + 1)), /exact size in bytes/));
  const many = envIssues((e) => {
    const d = step(e, "download");
    e.steps = [0, 1, 2].map((i) => ({ download: { ...d, bytes: V.ENV_LIMITS.downloadBytes, to: `bin${i}` } }));
  });
  assert.ok(has(many, /downloads add up to/));
  assert.ok(has(envIssues((e) => (step(e, "download").extract = "rar")), /extract must be one of/));
  assert.ok(has(envIssues((e) => Object.assign(step(e, "download"), { extract: "none", stripComponents: 1, to: "bin/x" })), /stripComponents/));
  assert.ok(has(envIssues((e) => (step(e, "download").executable = true)), /executable is true or false, and only for extract none/));
});

test("paths: relative, inside the environment, no absolute path, no .., no repeats", () => {
  for (const bad of ["/usr/local/bin", "../bin", "bin/../../x", "~/bin", "bin\\x", "bin/", ""]) {
    assert.ok(has(envIssues((e) => (step(e, "download").to = bad)), /relative path inside the environment/), bad);
  }
  assert.ok(has(envIssues((e) => (step(e, "npm").to = "bin")), /target of another step/));
  assert.ok(has(envIssues((e) => (step(e, "env").PATH = "/usr/bin")), /relative directories inside the environment/));
  assert.ok(has(envIssues((e) => (step(e, "env").PATH = ["bin", "../x"])), /relative directories inside the environment/));
  assert.ok(has(envIssues((e) => (step(e, "env").LD_PRELOAD = "bin/evil.so")), /LD_PRELOAD is not one of/));
  assert.ok(has(envIssues((e) => (step(e, "env").NODE_OPTIONS = "x")), /NODE_OPTIONS is not one of/));
  assert.equal(V.isSafeRelPath("."), false);
  assert.equal(V.isSafeRelPath(".", { allowDot: true }), true);
});

test("steps are download, npm, pip or env: no shell, script or sudo step", () => {
  assert.ok(has(envIssues((e) => e.steps.push({ shell: "curl x | sh" })), /"shell" is not a step/));
  assert.ok(has(envIssues((e) => e.steps.push({ sudo: { argv: ["apt-get", "install", "x"] } })), /"sudo" is not a step/));
  assert.ok(has(envIssues((e) => e.steps.push({ run: ["make"] })), /"run" is not a step/));
  assert.ok(has(envIssues((e) => e.steps.push({ env: { PATH: "x" }, npm: {} })), /exactly one of/));
  assert.ok(has(envIssues((e) => (e.steps = [])), /1\.\.16 steps/));
});

test("argv: a known program, placeholders from the closed set, no shell, no root, no inline code", () => {
  const argv = (a, where = "render") => envIssues((e) => (e[where].argv = a));
  assert.deepEqual(argv(["node", "{packDir}/render/render.mjs", "--out={out}", "{width}x{height}@{fps}:{frames}", "{props}", "{envDir}", "{inDir}", "{workDir}"]), []);
  assert.ok(has(argv(["node", "{packDir}/r.mjs", "{out}", "{home}"]), /\{home\} is not a placeholder here/));
  assert.ok(has(argv(["node", "{packDir}/r.mjs", "{out}", "{out"]), /brace that is not a placeholder/));
  assert.ok(has(argv("node render.mjs {out}"), /argv array/));
  assert.ok(has(argv(["bash", "-c", "node r.mjs {out}"]), /refused \(no shell, no sudo/));
  assert.ok(has(argv(["sudo", "node", "{out}"]), /refused/));
  assert.ok(has(argv(["node", "{out}", "sudo"]), /sudo is refused/));
  assert.ok(has(argv(["/usr/bin/node", "{out}"]), /argv\[0\] must be node, python, ffmpeg or \{envDir\}/));
  assert.ok(has(argv(["{envDir}/../bin/x", "{out}"]), /\{envDir\}\/<a relative path/));
  assert.deepEqual(argv(["{envDir}/bin/resvg", "{out}"]), []);
  assert.ok(has(argv(["{envDir}/bin/sh", "{out}"]), /refused/));
  assert.ok(has(argv(["node", "-e", "require('x')", "{out}"]), /runs inline code/));
  assert.ok(has(argv(["python", "{packDir}/r.py", "{out}"]), /python needs a pip step/));
  assert.ok(has(argv(["node", "{packDir}/r.mjs"]), /must pass \{out\}/));
  assert.ok(has(argv(["node", "{packDir}/p.mjs", "{props}"], "probe"), /\{props\} is not a placeholder here/));
  assert.ok(has(argv(["node", "a\nb"], "probe"), /on one line/));
});

test("probe and render fields", () => {
  assert.ok(has(envIssues((e) => delete e.probe), /environment\.probe must be an object/));
  assert.ok(has(envIssues((e) => (e.probe.timeoutSec = 0)), /timeoutSec must be 1\.\.300/));
  assert.ok(has(envIssues((e) => (e.probe.exitCode = -1)), /exitCode must be/));
  assert.ok(has(envIssues((e) => (e.probe.stdout = "(")), /regular expression/));
  assert.ok(has(envIssues((e) => (e.render.output = "webm")), /output must be mp4-muted or png-frames/));
  assert.ok(has(envIssues((e) => (e.render.audio = "renderer")), /audio must be "worker"/));
  assert.ok(has(envIssues((e) => (e.render.captions = "both")), /captions must be worker or renderer/));
  assert.ok(has(envIssues((e) => (e.render.secondsPerVideoSecond = 0)), /secondsPerVideoSecond/));
});

test("npm: a lockfile shipped in the pack, every package an https tarball on a listed host with sha512 integrity", () => {
  const files = lockFiles();
  const lock = JSON.parse(files["env/package-lock.json"]);
  const withLock = (edit) => {
    const l = clone(lock);
    edit(l);
    return envIssues(() => {}, { ...files, "env/package-lock.json": JSON.stringify(l) });
  };
  assert.ok(has(envIssues((e) => (step(e, "npm").lockfile = "env/yarn.lock")), /env\/\[<dir>\/\]package-lock\.json/));
  assert.ok(has(envIssues(() => {}, { "env/package.json": files["env/package.json"] }), /package-lock\.json is missing from the pack/));
  assert.ok(has(envIssues(() => {}, { "env/package-lock.json": files["env/package-lock.json"] }), /package\.json is missing beside the lockfile/));
  assert.ok(has(withLock((l) => delete l.packages["node_modules/three"].integrity), /has no sha512 integrity/));
  assert.ok(has(withLock((l) => (l.packages["node_modules/three"].integrity = "sha1-abc")), /has no sha512 integrity/));
  assert.ok(has(withLock((l) => (l.packages["node_modules/three"].resolved = "http://registry.npmjs.org/three/-/three-0.183.2.tgz")), /https tarball/));
  assert.ok(has(withLock((l) => (l.packages["node_modules/three"].resolved = "https://npm.evil.example/three.tgz")), /not in environment\.hosts/));
  assert.ok(has(withLock((l) => (l.packages["../x"] = { link: true })), /not a node_modules package/));
  assert.ok(has(withLock((l) => (l.lockfileVersion = 1)), /lockfile v2 or v3/));
  const scripted = JSON.parse(files["env/package.json"]);
  scripted.scripts = { postinstall: "curl x | sh" };
  assert.ok(has(envIssues(() => {}, { ...files, "env/package.json": JSON.stringify(scripted) }), /must not have install or prepare scripts/));
  assert.ok(has(envIssues((e) => (step(e, "npm").allowScripts = ["left-pad"])), /allowScripts names left-pad/));
  assert.ok(has(envIssues((e) => (e.requires = e.requires.filter((r) => r.tool !== "npm"))), /needs \{ "tool": "npm" \}/));
});

test("pip: requirements pinned with == and --hash=sha256 (--require-hashes), no options, python3 required, PyPI hosts listed", () => {
  const H = "a".repeat(64);
  const ok = `numpy==2.1.3 \\\n    --hash=sha256:${H}\n# a comment\npillow==11.0.0 --hash=sha256:${H} --hash=sha256:${"b".repeat(64)}\n`;
  assert.deepEqual(V.validateRequirements(ok), []);
  assert.ok(has(V.validateRequirements("numpy==2.1.3\n"), /--hash=sha256/));
  assert.ok(has(V.validateRequirements(`numpy>=2 --hash=sha256:${H}\n`), /name==version/));
  assert.ok(has(V.validateRequirements(`--index-url https://evil.example/simple\nnumpy==2.1.3 --hash=sha256:${H}\n`), /options are refused/));
  assert.ok(has(V.validateRequirements(`-e git+https://github.com/x/y\n`), /options are refused/));
  assert.ok(has(V.validateRequirements(`https://evil.example/x.whl --hash=sha256:${H}\n`), /name==version/));
  assert.ok(has(V.validateRequirements(""), /lists no requirement/));
  const pip = { pip: { requirements: "env/requirements.txt", python: "3.10", to: "venv" } };
  const files = { ...lockFiles(), "env/requirements.txt": ok };
  const withPip = (edit = () => {}) =>
    envIssues((e) => {
      e.steps.push(clone(pip));
      e.requires.push({ tool: "python3", min: "3.10" });
      e.hosts.push(...V.PIP_HOSTS);
      e.render.argv = ["python", "{packDir}/render/r.py", "{out}"];
      edit(e);
    }, files);
  assert.deepEqual(withPip(), []);
  assert.ok(has(withPip((e) => (e.requires = e.requires.filter((r) => r.tool !== "python3"))), /needs \{ "tool": "python3"/));
  assert.ok(has(withPip((e) => (e.hosts = e.hosts.filter((h) => h !== "files.pythonhosted.org"))), /needs files\.pythonhosted\.org/));
  assert.ok(has(withPip((e) => e.steps.push({ pip: { ...pip.pip, to: "venv2" } })), /one pip step per environment/));
  assert.ok(has(withPip((e) => (e.render.argv = ["python", "-c", "import os", "{out}"])), /runs inline code/));
  assert.ok(
    has(
      envIssues((e) => {
        e.steps.push(clone(pip));
        e.requires.push({ tool: "python3" });
        e.hosts.push(...V.PIP_HOSTS);
      }, { ...lockFiles(), "env/requirements.txt": "numpy==2.1.3\n" }),
      /--require-hashes/,
    ),
  );
});

test("requires: checked tools only, versions and sonames well formed", () => {
  assert.ok(has(envIssues((e) => e.requires.push({ tool: "apt" })), /tool must be one of/));
  assert.ok(has(envIssues((e) => e.requires.push({ tool: "lib", name: "/usr/lib/libx.so" })), /shared library file name/));
  assert.deepEqual(envIssues((e) => e.requires.push({ tool: "lib", name: "libcairo.so.2" })), []);
  assert.ok(has(envIssues((e) => e.requires.push({ tool: "python3", min: "three" })), /version like 3\.10/));
  assert.ok(has(envIssues((e) => (e.platforms = ["linux-arm64"])), /must include linux-x64/));
  assert.ok(has(envIssues((e) => (e.platforms = ["windows-x64"])), /platforms must list/));
});

test("licences: every tool with its version, licence and https source", () => {
  assert.ok(has(envIssues((e) => (e.licences = [])), /licences must list every tool/));
  assert.ok(has(envIssues((e) => delete e.licences[0].licence), /licence must record/));
  assert.ok(has(envIssues((e) => (e.licences[0].source = "http://x")), /https URL/));
});

test("where an environment may be: not on hermes or html-design packs, render only for command, env/ only with an environment", (t) => {
  const env = load().environment;
  const hermes = { ...clone(load("line-graph-skill")), environment: clone(env) };
  assert.ok(has(V.validateStyle(hermes), /a hermes pack renders in Hermes/));
  const designed = { ...clone(load("designed-explainer")), environment: clone(env) };
  assert.ok(has(V.validateStyle(designed), /refused on an html-design pack/));
  const stills = clone(load("documentary"));
  const extra = { ...stills, renderer: { ...stills.renderer, minWorkerVersion: "0.12.0" }, environment: { ...clone(env), render: undefined } };
  delete extra.environment.render;
  assert.deepEqual(V.validateStyle(extra, { files: lockFiles() }), []);
  assert.ok(has(V.validateStyle({ ...extra, environment: clone(env) }, { files: lockFiles() }), /render is only for engine command/));

  const dir = mkdtempSync(path.join(os.tmpdir(), "vs-env-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  cpSync(path.join(ROOT, "packs", PACK), path.join(dir, "packs", PACK), { recursive: true });
  cpSync(path.join(ROOT, "packs", "documentary"), path.join(dir, "packs", "documentary"), { recursive: true });
  assert.deepEqual(V.validateRepo(dir).issues, []);
  mkdirSync(path.join(dir, "packs", "documentary", "env"));
  writeFileSync(path.join(dir, "packs", "documentary", "env", "package.json"), "{}");
  writeFileSync(path.join(dir, "packs", PACK, "env", "install.sh"), "curl x | sh");
  writeFileSync(path.join(dir, "packs", PACK, "render", "resvg.bin"), "binary");
  const issues = V.validateRepo(dir).issues;
  assert.ok(has(issues, /documentary: env\/ holds the lockfiles of an environment; this pack has none/));
  assert.ok(has(issues, /env\/install\.sh: env\/ holds only/));
  assert.ok(has(issues, /render\/resvg\.bin: a command render project holds text files only/));
  rmSync(path.join(dir, "packs", PACK, "render"), { recursive: true });
  assert.ok(has(V.validateRepo(dir).issues, /render\/ is missing: a command pack/));
});

test("the proof pack: pinned three.js and resvg, every download hashed, status draft until a real CI render", () => {
  const s = load();
  assert.equal(s.renderer.engine, "command");
  assert.equal(s.status, "draft");
  assert.equal(s.curation.some((c) => c.kind === "ci-render"), false);
  const d = step(s.environment, "download");
  assert.match(d.url, /^https:\/\/github\.com\/linebender\/resvg\/releases\/download\/v0\.44\.0\//);
  assert.equal(d.sha256, "450cfeaf8122f7389a8acf698888804e1ed46980b611d5253204049c51c87087");
  const lock = JSON.parse(lockFiles()["env/package-lock.json"]);
  assert.equal(lock.packages["node_modules/three"].version, "0.183.2");
  assert.deepEqual(s.environment.licences.map((l) => `${l.tool}@${l.version} ${l.licence}`), ["three@0.183.2 MIT", "resvg@0.44.0 MPL-2.0"]);
});
