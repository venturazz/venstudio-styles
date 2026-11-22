# Flat-vector explainer (`explainer-flat-vector`)

A calm narrator over flat illustrated scenes that build one argument step by step.

A calm narrator over flat illustrated scenes. Each scene is a flat palette with a heading or callout, the shot picture as a plate where the scene has one, and data elements (counter, bars, gauge, tally, arrow, diagram) drawn and animated in code. Motion tokens per scene decide what moves. The art direction was measured at 1920x1080, so a portrait job is laid out from that measurement.

The Remotion composition `flat-vector-explainer` lives in `render/`. It moved here unchanged from `apps/render-remotion/src` in venstudio; only its imports of the runtime's shared helpers changed (`../../props.ts`, the path inside an installed project).

## Contract

| | |
| --- | --- |
| Renderer | `remotion-2d`, composition `flat-vector-explainer`, worker 0.9.0 or later |
| Formats | short, long; natural frame landscape |
| Shot length | 2 to 4 s, 15 to 30 cuts a minute |
| Hook | first cut within 3 s |
| Transition | 0.5 s cross-fade |
| On screen | plate, heading, callout, counter, bar, gauge, arrow, tally, particles, diagram; elements animate |
| Captions | required (caption-spec-v1, 8% safe area) |
| Audio | narrated, -14 LUFS, true peak -1 dBTP, music self-or-licensed |
| Assets | plates-and-diagrams; image |

The `portal` block of `style.json` holds the values the VenStudio portal used for this style before packs existed
(catalog, seed template and render parameters). venstudio's tests check they still match, so migrating the style
into a pack changed nothing about how it is planned or rendered.

## Fixture

`fixtures/payload.json` is a render-video payload for this look; `fixtures/expect.json` says what the render must
measure (a short video at the stated size and length) and that it must pass G-technical.
The payload is a byte-for-byte copy of venstudio's golden fixture (checked by sha256). This repo's CI typechecks the composition with the vendored runtime and renders stills and a short clip of it; venstudio's CI renders the full fixture through the real worker.

## Provenance

- **article**: venturazz/venstudio docs/research/03-production-styles-and-muse-capabilities.md. Licence: VenStudio research notes (owner). Where the style was first described: niche, engine, Muse placement and cautions.
- **article**: venturazz/venstudio docs/research/04-autonomous-studio-workflow.md. Licence: VenStudio research notes (owner). Template lifecycle, QC gates and the copyright checklist this pack's portal parameters come from.
- **link**: https://www.revid.ai/blog/best-faceless-youtube-channels. Licence: public web page; read for patterns only, nothing copied. Cited in the catalog as research for this niche.
- **skill**: Hermes skill flat-vector-explainer-video (described in venturazz/venstudio docs/plans/2026-11-20-render-templates-from-skills.md). Licence: not recorded in the studio; the skill lives in the owner's Hermes install, only its parameters are used. Per-beat motion grammar, the motion tokens, SVG diagrams drawn in code and the variation rule.
- **owner-note**: venturazz/venstudio apps/portal/lib/studio/catalog.ts (explainer-flat-vector comment). Licence: owner. Pacing measured on a reference: 196 cuts in 8:14, 23.8 cuts a minute, 2.27 s median shot. Numbers only, no frames or audio kept.

## Status

`trial`: used for trial videos that are not published, while QC results and verdicts are collected. The portal
records each trial run; its Styles page shows the counts against the promotion rule and, once they pass, the curation
record to copy into `style.json` in a PR. Only an owner-approved PR may set `proven` or `listed` (CONTRIBUTING.md).

## Curation

- 2026-11-21 ci-render (pass): venturazz/venstudio CI, PR #15 (f712dcf): Remotion renderer step renders fixtures/render/explainer-payload.json and qc-video measures it. 1080x1920, 24 s, G-technical passed. The render this pack starts from; it moved into the pack unchanged.
