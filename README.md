# VenStudio styles

Curated video style packs for VenStudio. This repo is the source of truth: packs are authored and curated here
(Hermes and Kiro open PRs, the owner merges), and venturazz/venstudio vendors a pinned version of them
(`styles/` and `styles/lock.json`, written by its `scripts/sync-styles.mjs`). The portal never reads this repo
at runtime and needs no GitHub token. Plan: venstudio `docs/plans/style-system.md`.

| Path | What |
| --- | --- |
| `packs/<id>/` | One style pack: `style.json`, `README.md`, `fixtures/`, and `render/` when the engine has a render project. |
| `skills/curated/<id>/`, `skills/candidate/<id>/` | The agent skills the styles are made with: curated (approved by the owner or Hermes) and not yet curated. Each holds `skill.json` and the skill's files. See `skills/README.md`. |
| `skills/kits/<id>/` | Shared files several skills use (claude-animation-skills' `kit/`). |
| `tools/skills.mjs` | Validates `skills/` and its links to the packs. |
| `FORMAT.md` | The pack format, version 1. |
| `schema/style.schema.json` | JSON Schema of `style.json`, for editors. |
| `tools/validate.mjs` | The validator (zero dependencies). Vendored into venstudio; edit it only here. |
| `tools/assemble-remotion.mjs` | Builds a Remotion project from the runtime and the Remotion packs, as workers get it. |
| `runtime/remotion/` | Copy of venstudio's Remotion runtime (`apps/render-remotion`), so CI can render the compositions here. |
| `CONTRIBUTING.md` | The lifecycle, who may change status, and how a change reaches the studio. |
| `docs/skills-triage.md` | Which Hermes video skills can reach a worker, what each should become, and in which order. |
| `docs/style-naming.md` | What a style may be called: the rules, the current catalogue, and the names reserved for skills that are not packs yet. |

## Packs

The picker shows `name`; `id` is the name the repo, the lockfile and old runs use. The naming rules and the names
reserved for skills that are not packs yet are in [docs/style-naming.md](docs/style-naming.md).

| Pack | Name | Family | Renderer | Status |
| --- | --- | --- | --- | --- |
| `designed-explainer` | Designed Explainer | explainer | html-capture | trial |
| `explainer-flat-vector` | Flat Vector Explainer | explainer | remotion-2d (`flat-vector-explainer`) | trial |
| `research-render` | Research Render | explainer | hermes (research only) | retired |
| `documentary` | Documentary | documentary | ffmpeg-stills | trial |
| `travel-documentary` | Travel Documentary | documentary | ffmpeg-stills | trial |
| `full-frame` | Full-Frame Story | narrative | command | lab |
| `horror-narration` | Horror Narration | narrative | ffmpeg-stills | trial |
| `mystery-narration` | Mystery Narration | narrative | ffmpeg-stills | trial |
| `story-read-aloud` | Story Read-Aloud | narrative | ffmpeg-stills | trial |
| `flat-space` | Kurzgesagt Flat | animation-2d | hermes (skill `/kurzgesagt`, research only) | trial |
| `stick-figure` | Stick Figure | animation-2d | hermes (skill `/stick-figure`, research only) | trial |
| `exploded-view` | Exploded View | animation-3d | hermes (skill `/breakdown`, research only) | trial |
| `low-poly-shapes` | Low-Poly Shapes | animation-3d | command | draft |
| `map-route` | Map Route | animation-3d | hermes (skill `/map-route`, research only) | trial |
| `ps1-low-poly` | PS1 Low-Poly | animation-3d | hermes (skill `/low-poly`, research only) | trial |
| `what-if-3d` | Zach 3D What-If | animation-3d | hermes (skill `/zach-d-films`, research only) | trial |
| `line-graph` | Animated Line Graph | motion-graphics | html-capture | trial |
| `branching-lines` | Dan Koe Lines | motion-graphics | hermes (skill `/dan-koe`, research only) | trial |
| `probe-line-graph` | Line Graph (Probe) | motion-graphics | html-capture | lab |
| `line-graph-skill` | Line Graph (Skill) | motion-graphics | hermes (skill `/graph`, research only) | retired |
| `minimal-line-art` | Minimal Line Art | motion-graphics | html-capture | trial |
| `step-line-art-skill` | Step Line Art (Skill) | motion-graphics | hermes (skill `/minimalistic-graphics`, research only) | retired |
| `voxel-build` | Minecraft Voxel | game-style | hermes (skill `/minecraft`, research only) | trial |
| `ambient-loop` | Ambient Loop | ambient | ffmpeg-stills | trial |

The first seven were migrated from the portal's catalogue with their parameters unchanged. `line-graph` and
`minimal-line-art` adapt two quick skills of https://github.com/artemnovitckii/claude-animation-skills (MIT, fonts
OFL); their READMEs credit the author and say what was adapted and what changed. The Hermes packs (`exploded-view`,
`branching-lines`, `designed-explainer`, `flat-space`, `ps1-low-poly`, `map-route`, `voxel-build`, `stick-figure`,
`what-if-3d`) are one research pack per skill of that repository: Hermes, which has the repository installed, renders
them with the skill itself, so they carry a contract and the mapping to the skill's input but no code; they are
research only and never published. Three packs are retired: `line-graph-skill` and `step-line-art-skill` show the same
look as a worker pack that needs no licence decision, and `research-render` was never a look (it rendered the whole
video with Hermes). The other catalogue styles are not packs yet; the portal lists them as Planned, and their names
are reserved in docs/style-naming.md so a conversion does not invent a second one.

## Checks

```
node tools/validate.mjs
node tools/skills.mjs
node --test "tools/*.test.mjs"   # includes html-pages.test.mjs: every html-capture page run in a stand-in DOM
```

CI (`.github/workflows/ci.yml`) runs both, then assembles the Remotion project, typechecks it, runs the renderer's
full probe (a still of every composition) and renders a 3 second clip of each composition. The full render of each
pack's fixture through the real worker, with the QC gate, runs in venstudio's CI after a sync.
