# Style pack format, version 1

A style pack is one directory, `packs/<id>/`. `tools/validate.mjs` decides whether a pack is valid;
`schema/style.schema.json` describes the same shape for editors. Both are vendored into venstudio by
`scripts/sync-styles.mjs`, so this repo is the only place they are edited.

```
packs/<id>/
  style.json             the manifest (below)
  README.md              what the look is, with "## Provenance" and "## Status" sections
  fixtures/payload.json  a render-video payload for this look
  fixtures/expect.json   what its render must measure, and the QC gates it must pass
  render/                the render project, only for engines that have one (remotion-2d today)
    index.tsx            exports `composition: PackComposition` ({ id, component })
```

## style.json

| Field | Meaning |
| --- | --- |
| `format` | Always `1` for this format. |
| `id` | Lowercase, digits and dashes; equals the directory name. It is the style id the portal plans with and the template id in a scene plan. |
| `name`, `description` | What the owner sees on New Video and Styles. |
| `version` | Semver. Bump it whenever anything in the pack changes; workers report `pack:<id>@<version>` and the portal routes renders by it. |
| `status` | `draft`, `lab`, `trial`, `proven`, `listed` or `retired` (see CONTRIBUTING.md). |
| `family` | One of the portal's families (`explainer`, `documentary`, `narrative`, ...). |
| `formats` | `supported`: `short` and/or `long`. `naturalFrame`: the frame the art direction was measured on (`landscape`, `portrait`, `both`). |
| `renderer` | `engine` (a key of the portal's ENGINES, e.g. `ffmpeg-stills`, `remotion-2d`), `minWorkerVersion` (the worker that can report this pack, 0.9.0 or later), `composition` (the Remotion composition id; `null` for engines without a render project). |
| `contract.pacing` | `shotSeconds` [min, max], `hookWithinMs` (first cut of a short), `cutsPerMinute` [min, max], `transitionSec` (cross-fade). |
| `contract.onScreen` | `elements` allowed on screen (plate, heading, callout, counter, bar, gauge, arrow, tally, particles, diagram), `motionTokens` the renderer interprets, `elementAnimation` (false: only the camera moves). |
| `contract.captions` | `required`, `spec` (`caption-spec-v1`: geometry derived by the portal's caption-spec.ts), `safeAreaPct`. |
| `contract.audio` | `narrated`, `targetLufs`, `maxTruePeakDb`, `musicPolicy` (`none`, `self-generated`, `licensed`, `self-or-licensed`). |
| `contract.assets` | `model` (`image-per-shot` or `plates-and-diagrams`), `kinds`, `allowedSources`, `forbidKinds`. |
| `portal` | What else the portal uses today: `beatShape` (`ending-cta`, `ending-outro`, `single`), `qc` (`minPresentationScore`, `gates`), and the planner's `themes`, `keywords`, `cautions`, `sources`. |
| `fixture` | Always `{ "payload": "fixtures/payload.json", "expect": "fixtures/expect.json" }`. |
| `provenance` | Every source the look was learned from: `{ type, ref, licence, notes }`, type one of `upload`, `link`, `repo`, `skill`, `article`, `owner-note`. A licence is required; write `owner` for the owner's own material. Patterns only: no frames, audio or script from a source. |
| `curation` | The record: `{ date, kind, ref, result, notes }`, kind one of `ci-render`, `trial-run`, `qc`, `hermes-review`, `owner-review`; result one of `pass`, `fail`, `approved`, `rejected`, `note`. |

Rules the validator applies beyond the shape:

- `lab`, `trial`, `proven` and `listed` need a `ci-render` entry with result `pass`.
- `proven` and `listed` need an `owner-review` entry with result `approved` and `trial-run` entries with result
  `pass` (copied from the portal's Styles page).
- An engine no worker runs yet (anything but `ffmpeg-stills` and `remotion-2d`) keeps the pack at `draft` (or `retired`).
- `render/` exists exactly when the engine has a render project; it holds source only (`.ts`, `.tsx`, `.json`,
  `.css`, `.svg`), and `render/index.tsx` exports the composition named in `renderer.composition`.
- No two packs share an id or a composition.
- Size limits: 200 files, 1 MB a file, 5 MB a pack (the worker's bundle limits).

## fixtures/expect.json

`{ format, width, height, fps, durationSec, durationToleranceSec, qc }`, plus optionally `payloadSha256` and
`sameAs` when the payload is a copy of a golden file elsewhere (the explainer pack carries venstudio's
`fixtures/render/explainer-payload.json` byte for byte).

Payloads use readable placeholder asset ids (`asset-shot-01`); renderers in CI replace them with UUIDs and
generate the pictures and narration.

## Remotion render projects

The runtime (`runtime/remotion`, a copy of venstudio's `apps/render-remotion`) has no look of its own. A pack's
`render/` is installed into the runtime as `src/packs/<id>/`, so it imports the runtime's shared helpers as
`../../props.ts` and `../../compositions.ts`. `tools/assemble-remotion.mjs` builds that project here, and
venstudio's portal builds the same layout into the bundle it serves to workers.

## Versioning the format

A change that an older validator would misread raises `format`. The portal and the worker read only formats they
know and refuse the rest by name.
