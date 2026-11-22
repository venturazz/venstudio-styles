# Probe: line graph (`probe-line-graph`)

A short animated line graph with a heading and a counter, drawn in HTML and SVG. It exists to prove the
`html-capture` renderer end to end (venstudio worker 0.10.0): a page that defines
`window.VENSTUDIO = { init(props), renderFrame(frame) }`, captured frame by frame in headless Chromium and encoded by
ffmpeg, with the narration and the captions added by the worker's shared mix and caption burn. It is not a look to
publish and stays in `lab`.

Each scene is the shot picture as a dimmed plate (slow zoom when the scene has a camera move), plus one element: a
heading that pops in, a line graph whose line draws itself with its points popping as the line reaches them, or a
counter that counts up. Every value on screen is a function of the frame number, so a render is repeatable.

## Contract

| | |
| --- | --- |
| Renderer | `html-capture`, worker 0.10.0 or later; the template does not draw captions (`drawsCaptions: false`), so ffmpeg burns them with the job's caption style |
| Formats | short; natural frame portrait |
| Shot length | 2 to 4 s, hard cuts |
| On screen | plate, heading, bar (drawn as a line graph from `series`), counter |
| Captions | required (caption-spec-v1, 8% safe area), burned by the worker |
| Audio | narrated, -14 LUFS, no music |

## Render project

`render/index.html`, `render/graph.css` and `render/graph.js`: original code, no vendored library. A pack that needs
GSAP or three.js vendors the file under `render/vendor/<name>/` with its licence file (FORMAT.md).

## Workflow

`scene-spec` (style.json `workflow`, with `review: ["scene-spec"]`, so the owner always checks the spec): idea → research (the real numbers and facts the spec needs, each with its source) → script → scene spec → voice → render → quality check. Hermes writes the scene spec through the Hermes gate as checked JSON: per scene its seconds, beat, the on-screen elements this contract allows (plate, heading, bar, counter) with their value, series and labels, motion tokens from this contract (draw, pop, counter) and the caption. Every number cites the research note it comes from; a spec with a number no sourced note contains fails its check, by name (the skill's rule: never invent data). No pictures are generated: the page draws the spec, and the worker gets one plain-colour plate the portal makes, because the render contract carries a picture per shot. Version 0.1.1 adds the workflow; render/ is unchanged.

## Fixture

`fixtures/payload.json` is a 6 s portrait job of three scenes; `fixtures/expect.json` says it must measure
1080x1920 at 30 fps for 6 s and pass G-technical. CI renders it with `node runtime/html-capture/venstudio-worker.ts
capture-html` and Chrome Headless Shell; venstudio's CI renders it through the real `render-video` path.

## Provenance

- **repo**: https://github.com/artemnovitckii/claude-animation-skills. Licence: MIT. Only the approach (a page with a
  deterministic `renderFrame(frame)` captured in headless Chromium and piped into ffmpeg). No file, template or code
  was copied.
- **owner-note**: venturazz/venstudio `docs/plans/style-system.md`, Phase 2. Licence: owner.

## Status

`lab`: renders in CI from its fixture. It is never offered on New Video (only Listed and Trial packs are).
