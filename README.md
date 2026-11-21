# VenStudio styles

Curated video style packs for VenStudio. This repo is the source of truth: packs are authored and curated here
(Hermes and Kiro open PRs, the owner merges), and venturazz/venstudio vendors a pinned version of them
(`styles/` and `styles/lock.json`, written by its `scripts/sync-styles.mjs`). The portal never reads this repo
at runtime and needs no GitHub token. Plan: venstudio `docs/plans/style-system.md`.

| Path | What |
| --- | --- |
| `packs/<id>/` | One style pack: `style.json`, `README.md`, `fixtures/`, and `render/` when the engine has a render project. |
| `FORMAT.md` | The pack format, version 1. |
| `schema/style.schema.json` | JSON Schema of `style.json`, for editors. |
| `tools/validate.mjs` | The validator (zero dependencies). Vendored into venstudio; edit it only here. |
| `tools/assemble-remotion.mjs` | Builds a Remotion project from the runtime and the Remotion packs, as workers get it. |
| `runtime/remotion/` | Copy of venstudio's Remotion runtime (`apps/render-remotion`), so CI can render the compositions here. |
| `CONTRIBUTING.md` | The lifecycle, who may change status, and how a change reaches the studio. |

## Packs

| Pack | Renderer | Status |
| --- | --- | --- |
| `explainer-flat-vector` | remotion-2d (`flat-vector-explainer`) | trial |
| `documentary-stills` | ffmpeg-stills | trial |
| `mystery-narration` | ffmpeg-stills | trial |
| `horror-story` | ffmpeg-stills | trial |
| `ambient-loop` | ffmpeg-stills | trial |
| `travel-documentary` | ffmpeg-stills | trial |
| `story-read-aloud` | ffmpeg-stills | trial |

All seven were migrated from the portal's catalogue with their parameters unchanged. The other catalogue styles are
not packs yet; the portal lists them as Planned.

## Checks

```
node tools/validate.mjs
node --test "tools/*.test.mjs"
```

CI (`.github/workflows/ci.yml`) runs both, then assembles the Remotion project, typechecks it, runs the renderer's
full probe (a still of every composition) and renders a 3 second clip of each composition. The full render of each
pack's fixture through the real worker, with the QC gate, runs in venstudio's CI after a sync.
