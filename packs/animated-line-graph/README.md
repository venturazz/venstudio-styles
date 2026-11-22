# Animated line graph (`animated-line-graph`)

A minimal growth graphic for a short: on white, a smooth black line draws itself through the data points while one
big number counts up with the tip of the line and lands on the final value, then a soft ring and a dotted drop mark
the landing. The `dim` token gives the dark variant (white line on black).

**Credit.** This pack adapts the `graph` skill of [claude-animation-skills](https://github.com/artemnovitckii/claude-animation-skills)
by Artem Novitckii, at commit `86f70106c9aeae1334184467da5776c533ada3bc`. MIT licence, Copyright (c) 2026 Artem
Novitckii: the full notice is in `render/LICENSE`. The fonts (Inter 500, Inter Tight 700) come from the same
repository's `kit/fonts` and are under the SIL Open Font License 1.1 (`render/fonts/OFL-inter.txt`,
`render/fonts/OFL-intertight.txt`).

## Contract (from the skill's SKILL.md)

| | |
| --- | --- |
| Renderer | `html-capture`, worker 0.10.0 or later; the page does not draw captions (`drawsCaptions: false`), so the worker burns them with the job's caption style below the graph |
| Formats | short (1080x1920, the skill's frame). Long is **not** supported: the layout was measured on a portrait frame; a landscape job is scaled to fit with bars at the sides, which is not a designed look |
| Shot length | 3 to 6 s per scene, hard cuts. The skill's animation is 4 s; a shorter scene plays it faster, a longer one holds the landed number |
| On screen | a plain label, one big number, three gridlines, one line. Read from the scene's elements: a `bar` or `counter` with a `series` (2 or more values, all 0 or above) is the line; the element's `value`, when present, is the number the count lands on (the skill's `final`), otherwise the last point |
| No data | a counter, gauge, tally or bar with only a `value` counts up over the axes, with no line. A scene with neither draws the axes under its heading and **no number** |
| Taste | one number, one line; the label is a plain noun; no callouts, growth chips or marketing words (`portal.cautions`) |
| Captions | required (caption-spec-v1, 8% safe area), burned by the worker |
| Audio | narrated, -14 LUFS; music self-made or licensed. The skill itself has no audio |
| Assets | the shot pictures are planned like any plates-and-diagrams style but **not drawn**: the look is plain white or black |

## Render project

`render/index.html`, `render/graph.js`, `render/graph.css`, `render/motion.js`, `render/fonts/fonts.css` (the two
fonts as `data:` URLs, because an html-capture pack carries text files only), the OFL texts and the MIT licence.

**Plain JavaScript, not GSAP.** The skill drives a paused GSAP timeline. This pack replaces it with `motion.js`, a
small frame-driven timeline with GSAP's ease curves, because (1) the timeline has a dozen tweens on a handful of
values, so a pure function of the frame number is simple and repeatable, (2) GSAP's "Standard No-Charge License" is
not MIT and forbids use in no-code visual animation builders that compete with Webflow, which the owner should
review before any pack ships GSAP (https://gsap.com/community/standard-license/), and (3) a page without a library
can be checked without a browser (`tools/html-pages.test.mjs`). Nothing is loaded from the network; HyperFrames is
not used.

## Fixture

`fixtures/payload.json` is a 12 s portrait job of three 4 s scenes written for this pack: a six-point series landing
on a value, a counter, and a heading-only scene (neutral, dark). `fixtures/expect.json` says it must measure
1080x1920 at 30 fps for 12 s (360 frames) and pass G-technical. None of the skill's example data or labels is used.

## Provenance

- **repo**: https://github.com/artemnovitckii/claude-animation-skills at `86f70106c9ae`, `skills/graph`
  (SKILL.md, template.html, build.py). Licence: MIT (Copyright (c) 2026 Artem Novitckii); fonts SIL OFL 1.1.
  Adapted: layout, line, count rule, landing, timings, eases, colours, fonts. Changed: data from the render payload,
  neutral scenes without numbers, one animation per scene, no GSAP, embedded fonts. Not copied: the example spec,
  labels or demo output.
- **owner-note**: venturazz/venstudio `docs/plans/style-system.md`, Phase 3. Licence: owner.

## Status

`draft`: written and checked by the validator and the stand-in DOM test, not yet rendered by CI. When this repo's CI
and venstudio's CI have rendered the fixture, a PR adds the `ci-render` entry to `curation` and sets `trial`.
