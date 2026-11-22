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
  render/                the render project, only for engines that have one
    index.tsx            remotion-2d: exports `composition: PackComposition` ({ id, component })
    index.html           html-capture: the page that defines window.VENSTUDIO (below)
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
| `renderer` | `engine` (a key of the portal's ENGINES: `ffmpeg-stills`, `remotion-2d`, `html-capture`, `hermes`, ...), `minWorkerVersion` (the worker that can report this pack: 0.9.0 or later, 0.10.0 or later for html-capture), `composition` (the Remotion composition id; `null` for every other engine), `drawsCaptions` (html-capture only, required there: `true` when the page draws the captions it is given, `false` when the worker burns them with the job's caption style). |
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
- An engine VenStudio does not run yet (anything but `ffmpeg-stills`, `remotion-2d`, `html-capture` and `hermes`)
  keeps the pack at `draft` (or `retired`).
- `hermes` is research only (owner decision): such a pack is at most `trial`, never `proven` or `listed`. It has no
  render project and no `ci-render` entry (there is no Hermes in CI).
- `render/` exists exactly when the engine has a render project (`remotion-2d`, `html-capture`).
  - remotion-2d: source only (`.ts`, `.tsx`, `.json`, `.css`, `.svg`); `render/index.tsx` exports the composition
    named in `renderer.composition`.
  - html-capture: text files only (`.html`, `.js`, `.mjs`, `.css`, `.json`, `.svg`, `.txt`, `.md`, `LICENSE`,
    `NOTICE`), because the worker bundle carries text; `render/index.html` is the page; no page or style sheet may
    reference another host (`src="https://..."`, `url(//...)`, `@import`); a library is vendored under
    `render/vendor/<name>/` with its licence file beside it.
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

## html-capture render projects

The worker (0.10.0+) serves `render/` (installed as `html/<id>/` in the worker's Remotion project) from a loopback
server and opens `index.html` in the headless Chromium the Remotion renderer installed, at the job's size and device
scale 1. The page defines:

```js
window.VENSTUDIO = {
  async init(props) { /* build the DOM, load pictures and fonts */ return { totalFrames, fps, width, height }; },
  renderFrame(frame) { /* draw frame `frame` (0-based); may return a promise */ },
};
```

- `props` is what the worker plans from the job: `width`, `height`, `fps`, `durationSec`, `totalFrames`,
  `transitionSec`, `shots` (`{ shotRef, seconds, image }`, `image` a URL relative to the page such as
  `../in/<file>`), the same `timeline` and `scenes` a Remotion template gets, `captions` (only when the pack draws
  them), `drawsCaptions`, `captionStyle` and `font` (a relative URL or null). `init` must answer the job's size, fps
  and frame count.
- **Time is virtual.** A script that runs before the page's own replaces `Date`, `performance.now`,
  `requestAnimationFrame`, `setTimeout`/`setInterval` and `Math.random`; the clock moves by exactly one frame before
  each `renderFrame`, and CSS and Web Animations are held to it. A page that draws each frame from the frame number
  (or seeks a paused GSAP timeline to `frame / fps`) renders the same pixels every time.
- **No network.** Only the page's own files and the job's inputs load. Any other request (fetch, an image or
  script from another host, WebSocket, EventSource, WebRTC, sendBeacon) fails the render, by name.
- Captions are drawn by the page when `drawsCaptions` is true; otherwise ffmpeg burns them with the job's caption
  style. The narration and the audio mix are always added by the worker afterwards.
- Muse limits apply: one page, 30 s at most per frame, a time limit scaled to the video's duration.

CI renders every html-capture pack's fixture with `runtime/html-capture/venstudio-worker.ts capture-html` and
`tools/check-video.mjs` checks the result against `fixtures/expect.json` (size, fps, duration, exact frame count).

## Hermes packs (research only)

Engine `hermes` packs have no render project: the venstudio portal sends the storyboard, the scene plan, the
pictures' URLs on Hermes's media host and the pack's contract to Hermes, which renders with its own tools and replies
with a `/clip/` URL. The video goes through the same QC and Review as any render, always as a trial.

## Versioning the format

A change that an older validator would misread raises `format`. The portal and the worker read only formats they
know and refuse the rest by name.
