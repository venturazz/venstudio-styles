# Style names

Every skill becomes a style. A style is picked by name in the portal's New Video list, and the same name is what the
owner manages here, in venstudio's `styles/lock.json` and in every old run. So: **one look, one style, one name** —
and the name says what the film looks like, not which tool renders it.

## Rules

1. **`id` is the look.** Lowercase letters, digits and dashes, at most 24 characters. No engine (`three-`, `command-`),
   no repo (`hermes-`), no status (`probe-`), no medium (`-stills`), no brand.
2. **`name` is the picker label.** One to three Title Case words. No parentheses, no engine, no library, no status, no
   brand. It should read like a look a person would choose: *Exploded View*, *Voxel Build*, *Full-Frame Story*.
3. **`family` is the group** in the picker (explainer, documentary, narrative, animation-2d, animation-2.5d,
   animation-3d, motion-graphics, game-style, data-list, ambient). One look belongs to exactly one family, and the id
   does not repeat it.
4. **Several skills or engines, one style.** When two skills show the same look, they share the style: the engine is an
   implementation detail in `renderer`, not part of the name. Three Roblox kits are one style (`blocky-story`), not
   three.
5. **`name` may carry the reference; `id` may not.** These packs are research and template work, never published, so a
   familiar reference in the label is allowed and helps a person pick: *Minecraft*, *Kurzgesagt*. The source
   is credited in `provenance` and the pack README, and nothing may claim the author's endorsement. The `id` stays a
   descriptive slug (`voxel-build`), because the id is what the lockfile and old runs pin — a reference in the label can
   change, an id cannot.
6. **A merged name is permanent.** Renaming an id is a breaking change: `styles/lock.json`, old runs in the portal, and
   any fixture or page that carries the id all have to move together. Improve the look with a new `version` of the same
   id, not with a new name.
7. **Reserve before you build.** A skill that is not a pack yet keeps the name it will get (table below). Do not reuse
   a reserved name for something else.

## The packs

Generated from `packs/*/style.json`; `node tools/validate.mjs` is the authority if they ever disagree.

| id | name | family | engine | status |
| --- | --- | --- | --- | --- |
| `ambient-loop` | Ambient Loop | ambient | ffmpeg-stills | trial |
| `blocky-story` | Roblox | game-style | html-capture | lab |
| `branching-lines` | Dan Koe | motion-graphics | hermes (research) | trial |
| `designed-explainer` | Designed Explainer | explainer | html-capture | trial |
| `documentary` | Documentary | documentary | ffmpeg-stills | trial |
| `explainer-flat-vector` | Flat Vector | explainer | remotion-2d | trial |
| `exploded-view` | Exploded View | animation-3d | hermes (research) | trial |
| `flat-space` | Kurzgesagt | animation-2d | hermes (research) | trial |
| `full-frame` | Puppet | narrative | command | lab |
| `horror-narration` | Horror Story | narrative | ffmpeg-stills | trial |
| `line-graph-skill` | Line Graph (Skill) | motion-graphics | hermes (research) | retired |
| `line-graph` | Line Graph | motion-graphics | html-capture | trial |
| `low-poly-shapes` | Low-Poly 3D | animation-3d | command | draft |
| `map-route` | Map Route | animation-3d | hermes (research) | trial |
| `minimal-line-art` | Line Art | motion-graphics | html-capture | trial |
| `mystery-narration` | Mystery Story | narrative | ffmpeg-stills | trial |
| `probe-line-graph` | Line Graph (Probe) | motion-graphics | html-capture | lab |
| `ps1-low-poly` | PS1 Retro | animation-3d | hermes (research) | trial |
| `research-render` | Research Render | explainer | hermes (research) | retired |
| `step-line-art-skill` | Step Line Art (Skill) | motion-graphics | hermes (research) | retired |
| `stick-figure` | Stick Figure | animation-2d | hermes (research) | trial |
| `story-read-aloud` | Read-Aloud | narrative | ffmpeg-stills | trial |
| `travel-documentary` | Travel Doc | documentary | ffmpeg-stills | trial |
| `voxel-build-skill` | Minecraft (skill) | game-style | hermes (research) | retired |
| `voxel-build` | Minecraft | game-style | html-capture | lab |
| `what-if-3d` | Zach 3D Films | animation-3d | hermes (research) | trial |

Retired packs stay in the repo so old runs remain explainable, but they never appear in New Video. `line-graph-skill`
and `step-line-art-skill` show the same look as `line-graph` and `minimal-line-art`, which render it on a worker with no
licence decision to make; `research-render` was never a look (Hermes rendered the whole video itself).

## Reserved names

Skills from the Hermes library that are not worker packs yet. The name is taken now so the conversion does not invent a
second one; the id is not valid until `packs/<id>/` exists.

| Skill | Style id | Name | Family | Why not yet |
| --- | --- | --- | --- | --- |
| `pov-html-engine-capture` | `pov-short` | POV Short | narrative | page exists, needs `window.VENSTUDIO` + a fixture |
| `low-poly-station-short` | `transit-station` | Transit Station | animation-3d | 15 clips; page → `html-capture` |
| `threejs-3d-short` | `3d-film` | 3D Film | animation-3d | 13 clips; page → `html-capture` |
| `stickman-chikoomollian` | `stickman-story` | Stickman Story | animation-2d | 20+ episodes; needs only the `full-frame` environment |
| `ascii-video` | `ascii-short` | ASCII Short | motion-graphics | needs `numpy` in its environment recipe |
| `manim-video` | `math-motion` | Math Motion | explainer | needs cairo/pango, or scope it to text-only scenes |
| `godot-sprite-film` | `sprite-film` | Sprite Film | animation-2d | needs Godot linux-x64 + Xvfb + libGL in an environment; the runner is x64, this box is aarch64, so it cannot be proved here (owner decision) |
| `godot-toon-3d-short`, `sprite-video-production` | `toon-3d` | Toon 3D | animation-3d | same Godot requirement, and it renders 3D scenes: a bigger environment than the sprite film |
| `cartoon-3d-short` | `cartoon-3d` | Cartoon 3D | animation-3d | uses a paid image model |
| `agnes-character-video-shorts` | `character-short` | Character Short | narrative | paid model |
| `long-form-narrated-video` | `narrated-long` | Narrated Long | narrative | paid model |
| `ai-video-generation` | `generated-video` | Generated Video | animation-3d | paid provider |
| `real-voxel-game-assets` | `voxel-assets` | Minecraft Assets | game-style | an asset pipeline, not a look; feeds `voxel-build` |

Two of these reservations became packs on 25 November and are no longer in the table above: `voxel-build` (Minecraft,
`html-capture`, `lab`) and `blocky-story` (Roblox, `html-capture`, `draft`). The names did not change when they shipped,
which is the point of reserving them.

Not every skill is a look: `video-forensics`, `short-form-video-qa`, `video-continuity-rhythm`, `songsee` and
`viral-video-engagement` are analysis tools or writing rules. They get no style name.

## Renaming a pack (this is what the 0.2.0 names did)

1. `git mv packs/<old> packs/<new>`.
2. `style.json`: `id` and `name` (and `family` if the look moved group); bump `version`.
3. Any fixture that carries the id: `fixtures/payload.json` → `scenePlan.template` must equal the pack id.
   `tools/validate.mjs` fails if it does not.
4. `tools/validate.test.mjs` and the other `tools/*.test.mjs` hold hard-coded ids; they must follow.
5. A skill that made the pack names it in `skill.json` → `packs`; `node tools/skills.mjs` checks the link.
6. `README.md`, this file, and `docs/skills-triage.md`.

Then the venstudio side, which this repo cannot do alone:

- **`explainer-flat-vector` keeps its id** on purpose. venstudio's vendored html-capture worker maps pack id → Remotion
  composition (`runtime/html-capture/venstudio-worker.ts`, a byte-for-byte copy), so renaming it needs a coordinated
  venstudio change. Only its `name` changed here.
- **Old runs break on a rename.** The portal pins `pack:<id>@<version>`; after a sync, runs that used the old id have no
  pack to replay with. Keep the previous vendored bundle, or teach venstudio an alias map, before `scripts/sync-styles.mjs`
  is run against these names.