# Hermes-designed explainer page (`hermes-designed-explainer`)

**Research only.** A run of this pack follows the `html-design` workflow: Hermes writes the HTML page for each video
from the design brief in `style.json` (`design`), the portal checks the page before anything runs, the owner approves
still frames of it, and the worker captures it frame by frame with `html-capture`. Every run is a trial and is never
published (owner decision). The look is the calm flat-vector explainer: one idea per scene, a short heading and one
simple animated element, light and dark scenes in turn, captions burned by the worker at the bottom.

## Contract

| | |
| --- | --- |
| Renderer | `html-capture`, worker 0.11.0 or later (the first worker that renders a page uploaded with the job, under a strict Content-Security-Policy, and takes still frames with `preview-frames`). `drawsCaptions: false`: the worker burns the captions |
| Workflow | `html-design`: idea → research → script → HTML design → preview (still frames) → voice → render → quality check. `review: ["html-design", "preview"]`: the owner checks the page and its stills every time, whatever the autonomy level |
| Formats | short (1080x1920) |
| Shot length | 2 to 5 s per scene, hard cuts at the scene times Hermes returns; first point within 3 s |
| On screen | heading, callout, counter, bar, gauge, arrow, tally, diagram, over a plain plate the portal makes (no picture is generated) |
| Design brief | `design.brief`, `design.palette` (the explainer-flat-vector palettes), `design.typography` (Inter Tight 700 and Inter 500, vendored in `render/fonts/`, or the run's font), `design.layout` (8% side margins, nothing below 70% of the height, where the captions go) |
| Captions | required (caption-spec-v1, 8% safe area), burned by the worker |
| Audio | narrated, -14 LUFS; music self-made or licensed |

## What a page may do

The portal's validator (venstudio `apps/portal/lib/studio/html-design.ts`) refuses a page before anything runs when
it breaks a rule, and the issues go back to Hermes: one self-contained `index.html` with inline CSS and JS (plus at
most a few small JS, CSS or SVG files), 300 KB and 20 files at most, text only; no URL to another host anywhere
(`http(s)://`, `//host`, `@import` of a host, `<base>`); `data:` URLs only for images; no `<iframe>`,
`<object>`, `<embed>`, form actions, `<meta http-equiv>`, workers, service workers, `WebSocket`, `fetch`,
`XMLHttpRequest`, `EventSource`, `sendBeacon`, `import()`, `eval` or `new Function`; it defines
`window.VENSTUDIO = { init(props), renderFrame(frame) }`; fonts only from `../pack/fonts/` or the run's font; no GSAP.
At render the worker serves only the page's own files, this pack's `render/` files (as `../pack/`) and the run's
media (as `../in/`) from a loopback server with a strict Content-Security-Policy, blocks every other request, and
fails the job by name if the page throws or tries the network.

## Render project

`render/index.html` is the **reference page**: a page written by hand that follows every rule above, so the
validator, the worker's tests and this repo's CI have a known-good html-design page. CI renders it from
`fixtures/payload.json` (6 s, three 2 s scenes, 1080x1920 at 30 fps, 180 frames). `render/fonts/fonts.css` carries
the two fonts as `data:` URLs, with their OFL texts. Plain JavaScript: no library is vendored.

## Provenance

- **article**: venturazz/venstudio `docs/research/03-production-styles-and-muse-capabilities.md` (Explainer, flat
  vector). Licence: VenStudio research notes (owner). Used: the look (calm narrator, flat illustration, one argument
  built step by step).
- **owner-note**: the `explainer-flat-vector` pack in this repo: its palettes (`render/theme.ts`), pacing (2 to 4 s
  shots, 15 to 30 cuts a minute, measured 23.8 cuts a minute and a 2.27 s median shot on a reference), element kinds
  and caption safe area. Licence: owner. Numbers only, no frames or audio.
- **link**: https://www.revid.ai/blog/best-faceless-youtube-channels, read for patterns only.
- **repo**: https://github.com/artemnovitckii/claude-animation-skills at `86f70106c9ae`, `kit/fonts`: Inter 500 and
  Inter Tight 700, SIL Open Font License 1.1 (the same files as `animated-line-graph`). Nothing else is used.
- **owner-note**: the owner's decision to build `html-design`, research only, with a still-frame check before the
  full render.

## Status

`trial` 0.1.0, the most an html-design pack may be (the validator refuses `proven` and `listed`). The evidence is a
`research-source` entry: the research and the owner decision this brief is built from. Hermes writes each page per
video, so no CI render stands for the pages runs draw; CI renders the reference page as a check of the pack's files.
