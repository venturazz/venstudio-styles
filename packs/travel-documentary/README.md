# Travel documentary (own or generated scenery) (`travel-documentary`)

Narrated journey through places, using your photos or licensed generated scenery.

A narrated journey through places, over the owner's photos or licensed generated scenery, with slow camera moves.

## Contract

| | |
| --- | --- |
| Renderer | `ffmpeg-stills` (parameters only, no render project), worker 0.9.0 or later |
| Formats | short, long; natural frame both |
| Shot length | 4 to 8 s, 7 to 15 cuts a minute |
| Hook | first cut within 3 s |
| Transition | 0.5 s cross-fade |
| On screen | plate; only the camera moves |
| Captions | required (caption-spec-v1, 8% safe area) |
| Audio | narrated, -14 LUFS, true peak -1 dBTP, music self-or-licensed |
| Assets | image-per-shot; image, audio |

The `portal` block of `style.json` holds the values the VenStudio portal used for this style before packs existed
(catalog, seed template and render parameters). venstudio's tests check they still match, so migrating the style
into a pack changed nothing about how it is planned or rendered.

## Workflow

`image-sequence` (style.json `workflow`): idea → research → script → storyboard (an image prompt per shot) → assets (a picture per shot) → voice → render → quality check. This is the studio's original pipeline; runs of this pack behave exactly as before workflows existed. Version 1.0.1 only adds the `workflow` field.

## Fixture

`fixtures/payload.json` is a render-video payload for this look; `fixtures/expect.json` says what the render must
measure (a short video at the stated size and length) and that it must pass G-technical.
Stills packs have no render project, so this repo's CI validates the fixture; venstudio's CI renders it through the real worker and runs the technical gate.

## Provenance

- **article**: venturazz/venstudio docs/research/03-production-styles-and-muse-capabilities.md. Licence: VenStudio research notes (owner). Where the style was first described: niche, engine, Muse placement and cautions.
- **article**: venturazz/venstudio docs/research/04-autonomous-studio-workflow.md. Licence: VenStudio research notes (owner). Template lifecycle, QC gates and the copyright checklist this pack's portal parameters come from.
- **link**: https://clippie.ai/blog/best-short-form-video-formats-monetization-2026. Licence: public web page; read for patterns only, nothing copied. Cited in the catalog as research for this niche.
- **skill**: Hermes skill narrated-video-from-images (described in venturazz/venstudio docs/plans/2026-11-20-render-templates-from-skills.md). Licence: not recorded in the studio; the skill lives in the owner's Hermes install, only its parameters are used. Stills with camera moves and xfade transitions between shots.

## Status

`trial`: used for trial videos that are not published, while QC results and verdicts are collected. The portal
records each trial run; its Styles page shows the counts against the promotion rule and, once they pass, the curation
record to copy into `style.json` in a PR. Only an owner-approved PR may set `proven` or `listed` (CONTRIBUTING.md).

## Curation

- 2026-11-21 ci-render (pass): venturazz/venstudio CI, PR #15 (f712dcf): scripts/e2e.sh render-video with generated stills, then qc-video. The stills engine this pack's parameters drive. The pack's own fixture is rendered by the styles repo CI.
