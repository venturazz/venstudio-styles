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
| `curation` | The record: `{ date, kind, ref, result, notes }`, kind one of `ci-render`, `trial-run`, `qc`, `hermes-review`, `owner-review`, `research-source`; result one of `pass`, `fail`, `approved`, `rejected`, `note`. |
| `hermes` | Engine `hermes` only, optional: the Hermes skill the portal names in the render request. `skill` (as invoked, `/graph`), `aliases` (other names of the same skill), `mode` (`spec`: a quick skill from a small JSON spec; `project`: a full project with its own voice and caption timing), `voice` (`run`, the default: the run's voice stage records the narration the skill uses; `skill`: the skill makes its own voice, `project` mode only, and the run has no voice stage), `input` (how the run's skill brief, narration and captions map to the skill's input; a `project` skill must say how the run's narration is used), `output` (what Hermes hands back), `variantOf` (packs in this repo this is the Hermes research variant of). |
| `workflow` | Optional: the workflow a run of this pack goes through (below). `recipe` (one of the recipes below) and `review` (stages of this pack's list where the owner always reviews, whatever the autonomy level). Without it the recipe is inferred. |
| `design` | `html-design` packs only, and required there: the brief Hermes designs each page from. `brief` (what the page is for and how it moves), `palette` (2 to 12 colours, `#RRGGBB`), `typography` (the pack's vendored fonts or the run's font), `layout` (safe areas and layout rules). |

Rules the validator applies beyond the shape:

- `lab`, `trial`, `proven` and `listed` need a `ci-render` entry with result `pass`, except engine `hermes` (below).
- Engine `hermes` at `lab` or `trial` needs a `research-source` entry with result `pass` instead: the source the look
  comes from (repository and commit, or the owner decision) and the report that it renders in Hermes. There is no
  Hermes in CI, so no CI render exists for such a pack and none may be claimed. `research-source` is refused on any
  other engine: a pack VenStudio renders itself still needs a real `ci-render` to leave `draft`.
- `proven` and `listed` need an `owner-review` entry with result `approved` and `trial-run` entries with result
  `pass` (copied from the portal's Styles page).
- An engine VenStudio does not run yet (anything but `ffmpeg-stills`, `remotion-2d`, `html-capture` and `hermes`)
  keeps the pack at `draft` (or `retired`).
- `hermes` is research only (owner decision): such a pack is at most `trial`, never `proven` or `listed`. It has no
  render project and no `ci-render` entry (there is no Hermes in CI).
- `workflow.recipe` `html-design` is research only too (owner decision: Hermes writes the page, the one place
  model-written code runs): engine `html-capture` only, `minWorkerVersion` 0.11.0 or later, at most `trial`, a `design` block, `workflow.review` naming
  `html-design` and `preview`, and for `lab` or `trial` a `research-source` entry (the research and the owner decision
  it is built from) or a real `ci-render` with result `pass`. No GSAP under `render/vendor/` until the owner approves
  its licence.
- `hermes` (the block) is only for engine `hermes`; `variantOf` must name packs in this repo.
- `render/` exists exactly when the engine has a render project (`remotion-2d`, `html-capture`).
  - remotion-2d: source only (`.ts`, `.tsx`, `.json`, `.css`, `.svg`); `render/index.tsx` exports the composition
    named in `renderer.composition`.
  - html-capture: text files only (`.html`, `.js`, `.mjs`, `.css`, `.json`, `.svg`, `.txt`, `.md`, `LICENSE`,
    `NOTICE`), because the worker bundle carries text; `render/index.html` is the page; no page or style sheet may
    reference another host (`src="https://..."`, `url(//...)`, `@import`); a library is vendored under
    `render/vendor/<name>/` with its licence file beside it.
- No two packs share an id or a composition.
- Size limits: 200 files, 1 MB a file, 5 MB a pack (the worker's bundle limits).

## Workflows

A run of a pack goes through the stages of its recipe, in order. The venstudio portal fixes a run's stage list when the
run starts and stores it with the run, so a later pack change never changes a run that is under way, and runs from
before workflows keep the original list. A stage kind is a reusable step the run engine knows; a recipe made only of
known kinds needs no engine change. The table is `RECIPES` in `tools/validate.mjs`; venstudio mirrors it
(`apps/portal/lib/studio/recipes.ts`) and a test there checks they agree.

| Recipe | Stages | For |
| --- | --- | --- |
| `image-sequence` | idea, research, script, storyboard, assets, voice, render, qc | Packs that need a picture per shot (`contract.assets.model` `image-per-shot` or `plates-and-diagrams`): the stills packs and `explainer-flat-vector`. The original pipeline: the storyboard writes an image prompt per shot and the assets stage makes one picture per shot. |
| `scene-spec` | idea, research, script, scene-spec, preview, voice, render, qc | Data-driven pages: engine `html-capture`, or `remotion-2d` with `contract.onScreen.elementAnimation` true. Research asks for the real numbers the spec needs, with sources. The scene-spec stage asks Hermes (through the gate, as checked JSON) for scenes with seconds, beat, on-screen elements (with value, series and labels), motion tokens and a caption, checked against this pack's contract (elements, motion tokens, pacing, narration coverage). Every number cites the research note it comes from, and a number no sourced note contains fails the check ("never invent data"). No picture is generated: the spec is the scene plan the page draws. The preview stage has a worker (0.11.0+, `preview-frames`) take still frames of the pack's page with the run's props; the owner approves the look or sends a note back to the scene spec. Without such a worker the card says so and the owner can continue from the spec text. |
| `hermes-skill` | idea, research, script, skill-brief, voice, render, qc | Engine `hermes` (research only); the packs here review the brief every time (`review: ["skill-brief"]`). The skill-brief stage has Hermes turn the approved script into the input the pack's skill expects (`hermes.input`): one JSON spec per shot for a `spec` skill, a text project brief for a `project` skill. The voice stage is left out when `hermes.voice` is `skill`; the video's provenance then records the voice backend Hermes names, and that backend's provider terms are checked like any voice. No picture is generated. |
| `html-design` | idea, research, script, html-design, preview, voice, render, qc | **Research only** (owner decision), engine `html-capture`. The html-design stage asks Hermes (through the gate, as checked JSON) for one self-contained `index.html` (inline CSS and JS, plus a few small JS, CSS or SVG files at most), a short design note and a scene list that maps the script's beats to times, from the pack's `design` brief and contract. The portal checks the page before anything runs (size, files, no network URL anywhere, no frames, forms, workers, `fetch`, `eval` and the like, the `window.VENSTUDIO` contract, fonts and libraries only from this pack's `render/` or the run's font, no GSAP) and sends the issues back to Hermes. The preview stage takes still frames of the page; the owner always reviews the page and the stills, then the worker captures the page under a strict Content-Security-Policy. Every run is a trial and is never published. |
| `engine-project` | reserved | A scene-engine project (Godot, Manim, Blender) built per video. Not built; refused. |
| `clip-sequence` | reserved | A video clip per shot instead of a picture. Not built; refused. |

Rules the validator applies:

- `workflow.recipe` is a known recipe, and a built one (the reserved names `engine-project` and `clip-sequence` are
  refused, by name).
- The recipe fits the pack: `image-sequence` needs `contract.assets.model` `image-per-shot` or `plates-and-diagrams`;
  `scene-spec` needs engine `html-capture`, or `remotion-2d` with element animation; `hermes-skill` needs engine
  `hermes`; `html-design` needs engine `html-capture`. `hermes.voice: "skill"` only goes with `hermes-skill` and
  `project` mode.
- `workflow.review` names known stage kinds of this pack's own list (no repeats). No other override exists.

Without `workflow`, the recipe is inferred from the engine and asset model: `hermes` gives `hermes-skill`,
`html-capture` with plates and diagrams gives `scene-spec`, anything else gives `image-sequence`. `html-design` is never
inferred: a pack runs Hermes-written pages only when it names the recipe. Every pack in this
repo names its recipe. Adding `workflow` did not raise `format`: an older validator refuses the field by name rather
than misreading it, and an older portal runs every pack with the original pipeline.

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

### Pages Hermes writes (html-design)

A run of an `html-design` pack uploads the page Hermes wrote as a job input. The worker (0.11.0+) serves it as
`page/index.html`, next to `../pack/` (this pack's `render/` files, as installed and digest-checked) and `../in/` (the
run's media: the plate, the font), and nothing else; every response carries
`Content-Security-Policy: default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:`
(plus `base-uri 'none'; form-action 'none'`). The browser profile is a fresh temporary folder with no extensions, each
frame has a time limit and the whole capture a frame budget, and a page that throws in `init` or `renderFrame`, or
tries the network in any way, fails the job by name. The pack's `render/index.html` is a reference page that follows
the same rules; CI renders it from the fixture like any html-capture page.

CI renders every html-capture pack's fixture with `runtime/html-capture/venstudio-worker.ts capture-html` and
`tools/check-video.mjs` checks the result against `fixtures/expect.json` (size, fps, duration, exact frame count).

## Hermes packs (research only)

Engine `hermes` packs have no render project: the venstudio portal sends the run's plan (with the `hermes-skill`
workflow, the skill brief; with `image-sequence`, the storyboard, the scene plan and the pictures' URLs on Hermes's
media host) and the pack's contract to Hermes, which renders with its own tools and replies with a `/clip/` URL. The
video goes through the same QC and Review as any render, always as a trial.

When the pack has a `hermes` block, the request names `hermes.skill` (and its aliases) and carries `hermes.input`,
`hermes.output` and the brief, so Hermes renders with that skill (for example `/graph`). With `hermes.voice: "run"`
the skill uses the run's narration and captions; with `"skill"` it records its own voice from the narration script
and names the voice backend in its reply; the result is a reel the studio QCs. The reply is checked exactly as without a skill (a `/clip/` URL on the media host, downloaded, sniffed, then
qc-video), and the video's provenance records the backend, the plugin and the skill.

## Versioning the format

A change that an older validator would misread raises `format`. The portal and the worker read only formats they
know and refuse the rest by name.
