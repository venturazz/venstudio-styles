# Contributing a style pack

Hermes and Kiro work here through pull requests. The owner merges. Nothing reaches `main` without the owner.

## The flow: learn → draft → CI → trial → proven → listed

1. **Learn.** Hermes (or Kiro) studies a source: an owner upload, a public link (YouTube included: watched, never
   downloaded), a public repository, a Hermes skill, an article, or the owner's Review notes. Only patterns are
   kept (pacing, structure, element types), never frames, audio or script.
2. **Draft.** A PR adds `packs/<id>/` with `style.json` at `status: "draft"`, a README, a fixture, a render project
   if the engine needs one, and every source in `provenance` with its licence.
3. **CI → lab.** This repo's CI validates the pack and renders what it can (the Remotion compositions, and every
   html-capture fixture, checked for size, fps, duration and frame count; stills packs are parameters only; hermes
   packs are never rendered here). Once the fixture renders in venstudio's CI too (after a sync, below), a PR sets
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

`retired` takes a pack out of New Video; it stays in the repo so old runs remain explainable.

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
# html-capture packs, once that project has its browser (npx remotion browser ensure):
node runtime/html-capture/venstudio-worker.ts capture-html --pack packs/<id> --out /tmp/<id>.mp4 --remotion /tmp/remotion --font <a .ttf>
node tools/check-video.mjs /tmp/<id>.mp4 packs/<id>/fixtures/expect.json
```

Fill in the README's "Provenance" and "Status" sections. Record licences honestly; "not recorded" is acceptable for
a source whose licence nobody wrote down, a guess is not.
