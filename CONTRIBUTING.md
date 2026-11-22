# Contributing a style pack

Hermes and Kiro work here through pull requests. The owner merges. Nothing reaches `main` without the owner.

## The flow: learn → draft → CI → trial → proven → listed

1. **Learn.** Hermes (or Kiro) studies a source: an owner upload, a public link (YouTube included: watched, never
   downloaded), a public repository, a Hermes skill, an article, or the owner's Review notes. Only patterns are
   kept (pacing, structure, element types), never frames, audio or script.
2. **Draft.** A PR adds `packs/<id>/` with `style.json` at `status: "draft"`, a README, a fixture, a render project
   if the engine needs one, every source in `provenance` with its licence, and the `workflow` its runs follow
   (FORMAT.md, Workflows: `image-sequence` for a picture per shot, `scene-spec` for a page drawn from data,
   `hermes-skill` for a Hermes skill, `html-design` for a page Hermes writes per video, research only). A reserved
   recipe (`engine-project`, `clip-sequence`) is not built and is refused.
3. **CI → lab.** This repo's CI validates the pack and renders what it can (the Remotion compositions, every
   html-capture fixture and every command fixture after installing its environment, checked for size, fps, duration
   and frame count; stills packs are parameters only; hermes packs are never rendered here). Once the fixture renders in venstudio's CI too (after a sync, below), a PR sets
   `status: "lab"` and adds the `ci-render` entry to `curation`.
4. **Trial.** A PR sets `status: "trial"`. After venstudio vendors it, the pack appears on New Video under "Trial
   styles (research only, not for publishing)". Every trial run is recorded by the portal: QC result, the owner's
   final decision, the video and the pack version.
5. **Proven.** When the portal's Styles page says "Ready to promote", it shows a JSON block with the trial record.
   A PR pastes it into `curation`, adds the owner's `owner-review` entry with result `approved`, and sets
   `status: "proven"`.
6. **Listed.** A PR sets `status: "listed"`. Only Listed packs appear in the main New Video list.

A `hermes` pack (Hermes renders with its own tools) is research only, by owner decision: it may go up to `trial` and
no further, and the portal treats every run of it as a trial. The validator refuses anything above `trial`.

A `hermes` pack has no CI render, because there is no Hermes in CI; do not invent one. To move it to `lab` or `trial`,
add a `curation` entry of kind `research-source` with result `pass` that cites the source (for a skill: the repository
URL at its commit and the skill's path) and the report that it renders in Hermes (for claude-animation-skills: the
owner's report that the repository is installed in Hermes and works). The validator accepts `research-source` only for
`hermes` packs; every other pack still needs a passing `ci-render` to leave `draft`. Name the skill in the pack's
`hermes` block so the portal's render request carries it.

An `html-design` pack (Hermes writes the page for each video; the owner approved building it for research only) is
research only in the same way: engine `html-capture`, at most `trial`, every run a trial, never published. It carries a
`design` block (the brief, palette, typography and layout Hermes designs from, with its sources in `provenance`),
`workflow.review: ["html-design", "preview"]`, and a reference page in `render/index.html` that follows the page rules
(FORMAT.md, "Pages Hermes writes"); fonts and libraries a page may use are vendored in `render/` and referenced as
`../pack/<path>`. Do not vendor GSAP: its licence is not approved by the owner. For `lab` or `trial`, add a
`research-source` entry with result `pass` (the research and the owner decision the brief is built from), or a
`ci-render` entry only for a real CI run; never invent one.

`retired` takes a pack out of New Video; it stays in the repo so old runs remain explainable.

## Handover from Hermes: a style with its own tools

When a style works in Hermes with Hermes's own tools (three.js, Godot, Manim, Blender, Python libraries, ...) and the
owner liked a trial of it, Hermes hands it over so Muse workers render it themselves: a PR adds the pack as engine
`command` with an `environment` (FORMAT.md "Environments") that records exactly what Hermes used, pinned by version
and sha256. Nothing is pre-built by guess: a tool reaches workers only this way.

1. **Hermes opens the PR** (docs/hermes-handover.md is written for Hermes, with a checklist in
   docs/hermes-handover-checklist.md): the contract, the render project in `render/`, the environment recipe captured
   from what it actually ran, `env/` lockfiles, the fixture, `expect.json`, provenance and every tool's licence. At
   `status: "draft"` (or `lab` once a real CI run passed; never invented).
2. **CI proves the recipe without Hermes** (job `environments`): on a clean runner, as a non-root user, the vendored
   worker installs exactly the recipe with its own installer, runs the probe, renders the fixture with its command
   renderer, and `tools/check-video.mjs` checks it. A recipe that fails cannot pass; the log says why.
3. **The owner merges.** That is the one control point. venstudio then vendors the commit (`scripts/sync-styles.mjs`),
   its own CI renders the pack again through the real worker, and the owner merges that too.
4. **Workers update themselves**: the portal serves the pack's files in `env-packs.json` through the signed update
   manifest (Phase 0); each worker 0.12.0+ installs the environment between jobs, runs the probe, and only then reports
   `env:<id>@<version>` and `pack:<id>@<version>`. A failed install shows on the Workers page with its reason and is
   tried again with backoff; it never blocks other jobs.
5. The pack goes through the same lifecycle as any other: `lab` with the `ci-render` entry of a real CI run, then
   `trial`, then the owner decides on `proven` and `listed`.

What review checks in such a PR: every download is https from a listed host with its sha256 and size; npm installs
from the lockfile in the pack with `--ignore-scripts` (an `allowScripts` entry needs a reason in the PR); pip has
`--require-hashes` lines only; the probe and render are fixed argv arrays; nothing needs root; no credentials, tokens,
private URLs or private data anywhere in the pack; each tool's licence is recorded.

## Who may change status

- Anyone (Hermes, Kiro, the owner) may open a PR that adds a draft or moves a pack to `lab` or `trial`, with the
  evidence in `curation`.
- **Only an owner-approved PR may set `proven` or `listed`.** The validator refuses either status without an
  `owner-review` entry whose result is `approved`, and `.github/CODEOWNERS` makes the owner's review required once
  branch protection asks for code owner reviews (Settings → Branches → `main` → "Require review from Code Owners").
  An agent never writes that entry for the owner.
- Retiring a pack also needs the owner's merge, like every change.

## The promotion rule

The portal's rule (venstudio `apps/portal/lib/studio/templates.ts`): at least 5 trial runs, every one passing the
technical gate, a mean presentation score of at least 80 (the owner scores each trial video on its Review card), no asset or compliance failures, no open claims, and the
owner's copyright checklist signed. The Styles page shows the counts for the pack's current version.

## Versions

Bump `version` (semver) in every PR that changes a pack. Workers report `pack:<id>@<version>` once they installed and
probed exactly that version, and the portal only routes a render to a worker that reports it. A changed pack goes
back through the steps its change affects: a new look is a new draft; a fix to a trial pack stays in trial.

## How venstudio picks a change up

venstudio vendors a pinned copy. After a merge here, a venstudio PR runs

```
node scripts/sync-styles.mjs --from ../venstudio-styles --commit <commit>
```

which copies `packs/`, `tools/`, `schema/` and `FORMAT.md` at exactly that commit, validates them and rewrites
`styles/lock.json` (commit, per-pack version and sha256). venstudio's CI must pass, including the real renders, before
the owner merges "bump styles to <commit>". The portal then serves the packs to workers, signed with its update
key; workers install them without a worker version bump.

## Before you open a PR

```
node tools/validate.mjs
node --test "tools/*.test.mjs"
node tools/assemble-remotion.mjs /tmp/remotion   # Remotion packs: then npm install and npx tsc there
# packs with an environment (as a non-root user; needs node, npm and ffmpeg):
node runtime/html-capture/venstudio-worker.ts env-install --pack packs/<id> --envs /tmp/envs --cache /tmp/env-cache
node runtime/html-capture/venstudio-worker.ts render-command --pack packs/<id> --envs /tmp/envs --out /tmp/<id>.mp4 --font <a .ttf>
node tools/check-video.mjs /tmp/<id>.mp4 packs/<id>/fixtures/expect.json
# html-capture packs, once that project has its browser (npx remotion browser ensure):
node runtime/html-capture/venstudio-worker.ts capture-html --pack packs/<id> --out /tmp/<id>.mp4 --remotion /tmp/remotion --font <a .ttf>
node tools/check-video.mjs /tmp/<id>.mp4 packs/<id>/fixtures/expect.json
```

Fill in the README's "Provenance" and "Status" sections. Record licences honestly; "not recorded" is acceptable for
a source whose licence nobody wrote down, a guess is not.
